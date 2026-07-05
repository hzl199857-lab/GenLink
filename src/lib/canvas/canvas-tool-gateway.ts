import { randomUUID } from "node:crypto";

import type { CanvasAgentAction } from "@/types/agent";
import type { CanvasEdge, CanvasNode, NodeGroup, NodeType } from "@/types/canvas";

import {
  validateAgentNodeTypeMatchesCanvasKind,
  validateCharacterAnchorContent,
} from "../agent-canvas-global-rules";
import type { GenLinkCanvasToolName } from "../mcp/genlink-canvas-tools";
import type { JsonObject } from "../mcp/protocol";
import type { GLWorkflow, GLWorkflowEdge, GLWorkflowNode } from "../planf-ecom";
import { glWorkflowToCanvasAgentActions } from "../planf-ecom";
export type {
  CanvasRuntimeNodeStatus,
  CanvasRuntimeSnapshot,
  CanvasRuntimeSnapshotNode,
} from "./runtime-snapshot";
export { buildCanvasRuntimeSnapshot } from "./runtime-snapshot";

export type CanvasToolAuthContext = {
  userId: string;
  projectId: string;
  canvasId: string;
  permissions: {
    read: boolean;
    write: boolean;
    generate: boolean;
  };
};

export type CanvasToolValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type CanvasToolResult = {
  ok: boolean;
  message: string;
  auditId?: string;
  createdNodeIds?: string[];
  createdEdgeIds?: string[];
  updatedNodeIds?: string[];
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  nodeIdMap?: Record<string, string>;
  edgeIdMap?: Record<string, string>;
  actions?: CanvasAgentAction[];
  data?: unknown;
  error?: string;
};

export type CanvasSnapshotForMcp = {
  projectId: string;
  canvasId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
  };
};

export type CanvasWorkflowMutationResult = {
  createdNodeIds: string[];
  createdEdgeIds: string[];
  actions: CanvasAgentAction[];
};

export type CanvasWorkflowMaterializeOptions = CanvasWorkflowValidationOptions & {
  startPosition?: { x: number; y: number };
  createNodeId?: (logicalId: string) => string;
  createEdgeId?: (logicalId: string) => string;
};

export type CanvasWorkflowMaterializeResult = CanvasWorkflowMutationResult & {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  nodeIdMap: Record<string, string>;
  edgeIdMap: Record<string, string>;
};

export type CanvasWorkflowValidationOptions = {
  allowedExistingSourceIds?: string[];
};

export type CanvasNodeDraft = {
  type: unknown;
  position: unknown;
  data: unknown;
};

const SUPPORTED_NODE_TYPES = new Set<NodeType>([
  "text",
  "image_generation",
  "video_generation",
  "video_upscale",
  "video",
  "ai_text_result",
  "image",
  "uploaded_image",
  "panorama-360",
]);

const CREATIVE_PATCH_KEYS = new Set([
  "prompt",
  "effectivePromptOverride",
  "text",
  "imageUrl",
  "videoUrl",
  "generatedImageUrl",
  "generatedVideoUrl",
]);

const DEFAULT_WORKFLOW_START_POSITION = { x: 0, y: 0 };
const WORKFLOW_TEXT_NODE_X_OFFSET = -680;
const WORKFLOW_NODE_ROW_SPACING = 360;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasPosition(value: unknown): value is { x: number; y: number } {
  return isObject(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y);
}

function makeAuditId(toolName: string): string {
  return `${toolName}-${randomUUID()}`;
}

function deny(message: string): CanvasToolResult {
  return {
    ok: false,
    message,
    error: message,
  };
}

function validateAuth(
  auth: CanvasToolAuthContext,
  permission: keyof CanvasToolAuthContext["permissions"],
): CanvasToolValidationResult {
  if (!auth.userId.trim()) {
    return { ok: false, error: "authenticated user is required" };
  }

  if (!auth.projectId.trim() || !auth.canvasId.trim()) {
    return { ok: false, error: "projectId and canvasId are required" };
  }

  if (!auth.permissions[permission]) {
    return { ok: false, error: `${permission} permission is required` };
  }

  return { ok: true };
}

export function validateCanvasNodeDraft(
  node: CanvasNodeDraft,
): CanvasToolValidationResult {
  if (!isObject(node)) {
    return { ok: false, error: "node must be an object" };
  }

  if (typeof node.type !== "string" || !SUPPORTED_NODE_TYPES.has(node.type as NodeType)) {
    return { ok: false, error: `unsupported node type: ${String(node.type)}` };
  }

  if (!hasPosition(node.position)) {
    return { ok: false, error: "node position must include finite x and y numbers" };
  }

  if (!isObject(node.data)) {
    return { ok: false, error: "node data must be an object" };
  }

  if ("toolsType" in node.data) {
    return { ok: false, error: "agent-created nodes must not include toolsType" };
  }

  return { ok: true };
}

function validateWorkflowNode(node: GLWorkflowNode): CanvasToolValidationResult {
  if (!node.id.trim()) {
    return { ok: false, error: "workflow node id is required" };
  }

  if (!SUPPORTED_NODE_TYPES.has(node.type as NodeType)) {
    return { ok: false, error: `unsupported node type: ${String(node.type)}` };
  }

  if (!isObject(node.data)) {
    return { ok: false, error: `workflow node ${node.id} data must be an object` };
  }

  if (node.data.from !== "agent") {
    return {
      ok: false,
      error: `workflow node ${node.id} must include from: "agent"`,
    };
  }

  if (typeof node.data.agentNodeType !== "string" || !node.data.agentNodeType.trim()) {
    return {
      ok: false,
      error: `workflow node ${node.id} must include agentNodeType`,
    };
  }

  const kindValidation = validateAgentNodeTypeMatchesCanvasKind({
    nodeId: node.id,
    type: node.type,
    agentNodeType: node.data.agentNodeType,
  });

  if (!kindValidation.ok) {
    return kindValidation;
  }

  if (node.data.subType === "text-image") {
    const characterValidation = validateCharacterAnchorContent({
      nodeId: node.id,
      agentNodeType: node.data.agentNodeType,
      content: typeof node.data.prompt === "string"
        ? node.data.prompt
        : typeof node.data.content === "string"
          ? node.data.content
          : typeof node.data.text === "string"
            ? node.data.text
            : "",
    });

    if (!characterValidation.ok) {
      return characterValidation;
    }
  }

  if ("toolsType" in node.data) {
    return {
      ok: false,
      error: `workflow node ${node.id} must not include toolsType`,
    };
  }

  if (node.data.subType === "image-image" && typeof node.data.editAction !== "string") {
    return {
      ok: false,
      error: `workflow node ${node.id} image-image must include editAction`,
    };
  }

  return { ok: true };
}

function validateWorkflowEdge(
  edge: GLWorkflowEdge,
  nodeIds: Set<string>,
  allowedExistingSourceIds: Set<string>,
): CanvasToolValidationResult {
  if (!edge.id.trim()) {
    return { ok: false, error: "workflow edge id is required" };
  }

  const sourceIsExistingCanvasNode = edge.source.startsWith("node-") || allowedExistingSourceIds.has(edge.source);

  if (!nodeIds.has(edge.source) && !sourceIsExistingCanvasNode) {
    return { ok: false, error: `workflow edge ${edge.id} has unknown source ${edge.source}` };
  }

  if (!nodeIds.has(edge.target)) {
    return { ok: false, error: `workflow edge ${edge.id} has unknown target ${edge.target}` };
  }

  return { ok: true };
}

export function validateGLWorkflowForCanvas(
  workflow: unknown,
  options: CanvasWorkflowValidationOptions = {},
): CanvasToolValidationResult {
  if (!isObject(workflow)) {
    return { ok: false, error: "workflow must be an object" };
  }

  if (workflow.version !== "gl-workflow-v1") {
    return { ok: false, error: "workflow.version must be gl-workflow-v1" };
  }

  if (!Array.isArray(workflow.nodes)) {
    return { ok: false, error: "workflow.nodes must be an array" };
  }

  if (!Array.isArray(workflow.edges)) {
    return { ok: false, error: "workflow.edges must be an array" };
  }

  const nodeIds = new Set<string>();
  const allowedExistingSourceIds = new Set(
    (options.allowedExistingSourceIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean),
  );
  let hasCharacterNode = false;
  let hasVideoClipNode = false;

  for (const node of workflow.nodes as GLWorkflowNode[]) {
    if (!isObject(node)) {
      return { ok: false, error: "workflow nodes must be objects" };
    }

    if (nodeIds.has(node.id)) {
      return { ok: false, error: `duplicate workflow node id: ${node.id}` };
    }

    nodeIds.add(node.id);
    hasCharacterNode ||= node.data?.agentNodeType === "character";
    hasVideoClipNode ||= node.data?.agentNodeType === "video_clip";
    const nodeValidation = validateWorkflowNode(node);

    if (!nodeValidation.ok) {
      return nodeValidation;
    }
  }

  if (hasCharacterNode && hasVideoClipNode) {
    return {
      ok: false,
      error: "character anchor nodes and video_clip nodes must not be created in the same workflow",
    };
  }

  for (const edge of workflow.edges as GLWorkflowEdge[]) {
    if (!isObject(edge)) {
      return { ok: false, error: "workflow edges must be objects" };
    }

    const edgeValidation = validateWorkflowEdge(edge, nodeIds, allowedExistingSourceIds);

    if (!edgeValidation.ok) {
      return edgeValidation;
    }
  }

  return { ok: true };
}

function toPlanfCompatibleWorkflow(workflow: GLWorkflow): GLWorkflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        text: node.type === "text" && typeof node.data.text !== "string"
          ? workflow.intent.request
          : node.data.text,
        prompt: node.type === "image_generation" && typeof node.data.prompt !== "string"
          ? node.title
          : node.data.prompt,
      },
    })),
  };
}

export function mapWorkflowToCanvasMutations(
  workflow: GLWorkflow,
  options: CanvasWorkflowValidationOptions = {},
): CanvasWorkflowMutationResult {
  const validation = validateGLWorkflowForCanvas(workflow, options);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const actions = glWorkflowToCanvasAgentActions(toPlanfCompatibleWorkflow(workflow));
  const createdNodeIds = new Set(workflow.nodes.map((node) => node.id));
  const allowedExistingSourceIds = new Set(
    (options.allowedExistingSourceIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean),
  );
  const connectedActionKeys = new Set(actions.flatMap((action) => {
    if (action.type !== "connect_nodes" || action.sourceRef.kind !== "created" || action.targetRef.kind !== "created") {
      return [];
    }

    return [`${action.sourceRef.clientActionId}->${action.targetRef.clientActionId}`];
  }));

  for (const edge of workflow.edges) {
    const sourceIsExistingCanvasNode = edge.source.startsWith("node-") || allowedExistingSourceIds.has(edge.source);

    if (!sourceIsExistingCanvasNode || !createdNodeIds.has(edge.target)) {
      continue;
    }

    const key = `${edge.source}->${edge.target}`;
    if (connectedActionKeys.has(key)) {
      continue;
    }

    actions.push({
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: edge.source },
      targetRef: { kind: "created", clientActionId: edge.target },
    });
  }

  return {
    createdNodeIds: workflow.nodes.map((node) => node.id),
    createdEdgeIds: workflow.edges.map((edge) => edge.id),
    actions,
  };
}

function workflowNodeToCanvasNode(
  node: GLWorkflowNode,
  realNodeId: string,
  position: { x: number; y: number },
): CanvasNode {
  if (node.type === "text") {
    return {
      id: realNodeId,
      type: "text",
      position,
      data: {
        title: node.title || "Agent Prompt",
        text: typeof node.data.text === "string"
          ? node.data.text
          : typeof node.data.prompt === "string"
            ? node.data.prompt
            : "",
        status: "idle",
      },
    };
  }

  if (node.type === "image_generation") {
    const provider = node.data.provider;

    return {
      id: realNodeId,
      type: "image_generation",
      position,
      data: {
        title: node.title || "Agent Image",
        prompt: typeof node.data.prompt === "string"
          ? node.data.prompt
          : typeof node.data.effectivePromptOverride === "string"
            ? node.data.effectivePromptOverride
            : "",
        provider:
          provider === "vibe" ||
          provider === "fucheers" ||
          provider === "comfly" ||
          provider === "zhenzhen" ||
          provider === "runninghub" ||
          provider === "grsai"
            ? provider
            : undefined,
        model: typeof node.data.model === "string" ? node.data.model : undefined,
        runningHubChannel:
          node.data.runningHubChannel === "official" || node.data.runningHubChannel === "low-cost"
            ? node.data.runningHubChannel
            : undefined,
        aspectRatio: typeof node.data.aspectRatio === "string" ? node.data.aspectRatio : "auto",
        quality: typeof node.data.quality === "string" ? node.data.quality : "1K",
        detail: "medium",
        outputFormat: "png",
        moderation: "auto",
        parallelCount: 1,
        agentLogicalId: node.id,
        agentNodeType: typeof node.data.agentNodeType === "string" ? node.data.agentNodeType : undefined,
        agentWorkflowId: typeof node.data.agentWorkflowId === "string" ? node.data.agentWorkflowId : undefined,
        generationStatus: "pending",
        generationRetryable: true,
        generationUpdatedAt: new Date(0).toISOString(),
        status: "idle",
      },
    };
  }

  throw new Error(`workflow node ${node.id} cannot be materialized as ${node.type}`);
}

export function materializeWorkflowForCanvas(
  workflow: GLWorkflow,
  options: CanvasWorkflowMaterializeOptions = {},
): CanvasWorkflowMaterializeResult {
  const mutations = mapWorkflowToCanvasMutations(workflow, options);
  const startPosition = options.startPosition ?? DEFAULT_WORKFLOW_START_POSITION;
  const createNodeId = options.createNodeId ?? (() => `node-${randomUUID()}`);
  const createEdgeId = options.createEdgeId ?? (() => `edge-${randomUUID()}`);
  const nodes: CanvasNode[] = [];
  const logicalNodeIds = new Set(workflow.nodes.map((node) => node.id));
  const allowedExistingSourceIds = new Set(
    (options.allowedExistingSourceIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean),
  );
  const nodeIdMap: Record<string, string> = {};
  const edgeIdMap: Record<string, string> = {};
  let textIndex = 0;
  let generationIndex = 0;

  for (const node of workflow.nodes) {
    if (node.type !== "text" && node.type !== "image_generation") {
      throw new Error(`workflow node ${node.id} cannot be materialized as ${node.type}`);
    }

    nodeIdMap[node.id] = createNodeId(node.id);
  }

  for (const node of workflow.nodes) {
    const realNodeId = nodeIdMap[node.id];

    if (!realNodeId) {
      throw new Error(`workflow node ${node.id} did not receive a real canvas id`);
    }

    const position = node.type === "text"
      ? {
          x: startPosition.x + WORKFLOW_TEXT_NODE_X_OFFSET,
          y: startPosition.y + textIndex++ * WORKFLOW_NODE_ROW_SPACING,
        }
      : {
          x: startPosition.x,
          y: startPosition.y + generationIndex++ * WORKFLOW_NODE_ROW_SPACING,
        };

    nodes.push(workflowNodeToCanvasNode(node, realNodeId, position));
  }

  const edges: CanvasEdge[] = workflow.edges.flatMap((edge) => {
    const target = nodeIdMap[edge.target];

    if (!target) {
      return [];
    }

    const source = logicalNodeIds.has(edge.source)
      ? nodeIdMap[edge.source]
      : allowedExistingSourceIds.has(edge.source) || edge.source.startsWith("node-")
        ? edge.source
        : undefined;

    if (!source) {
      return [];
    }

    const edgeId = createEdgeId(edge.id);
    edgeIdMap[edge.id] = edgeId;

    return [{
      id: edgeId,
      source,
      target,
      sourceHandle: undefined,
      targetHandle: undefined,
    }];
  });

  return {
    ...mutations,
    createdNodeIds: workflow.nodes.map((node) => nodeIdMap[node.id]).filter((nodeId): nodeId is string => Boolean(nodeId)),
    createdEdgeIds: workflow.edges.map((edge) => edgeIdMap[edge.id]).filter((edgeId): edgeId is string => Boolean(edgeId)),
    nodes,
    edges,
    nodeIdMap,
    edgeIdMap,
  };
}

function validatePatch(patch: unknown): CanvasToolValidationResult {
  if (!isObject(patch)) {
    return { ok: false, error: "patch must be an object" };
  }

  for (const key of Object.keys(patch)) {
    if (CREATIVE_PATCH_KEYS.has(key)) {
      return {
        ok: false,
        error: `creative field ${key} must create a new node instead of mutating an existing node`,
      };
    }
  }

  return { ok: true };
}

export async function executeCanvasTool(
  toolName: GenLinkCanvasToolName,
  input: JsonObject,
  auth: CanvasToolAuthContext,
): Promise<CanvasToolResult> {
  if (toolName === "genlink_canvas_get_snapshot") {
    const authValidation = validateAuth(auth, "read");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    const snapshot: CanvasSnapshotForMcp = {
      projectId: auth.projectId,
      canvasId: auth.canvasId,
      nodes: [],
      edges: [],
      groups: [],
      summary: {
        nodeCount: 0,
        edgeCount: 0,
        groupCount: 0,
      },
    };

    return {
      ok: true,
      message: "canvas snapshot returned from MCP gateway placeholder storage",
      data: snapshot,
    };
  }

  if (toolName === "genlink_canvas_get_node") {
    const authValidation = validateAuth(auth, "read");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    return deny("genlink_canvas_get_node is not implemented until server-side canvas persistence is available");
  }

  if (toolName === "genlink_canvas_create_workflow") {
    const authValidation = validateAuth(auth, "write");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    const workflow = input.workflow;
    const allowedExistingSourceIds = Array.isArray(input.allowedExistingSourceIds)
      ? input.allowedExistingSourceIds.filter((nodeId): nodeId is string => typeof nodeId === "string")
      : [];
    const validation = validateGLWorkflowForCanvas(workflow, { allowedExistingSourceIds });

    if (!validation.ok) {
      return deny(validation.error);
    }

    const mutations = materializeWorkflowForCanvas(workflow as GLWorkflow, { allowedExistingSourceIds });

    return {
      ok: true,
      message: "workflow validated and materialized to GenLink canvas nodes",
      auditId: makeAuditId(toolName),
      ...mutations,
      data: {
        persistence: "server-materialized-client-apply",
      },
    };
  }

  if (toolName === "genlink_canvas_create_node") {
    const authValidation = validateAuth(auth, "write");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    const validation = validateCanvasNodeDraft(input.node as CanvasNodeDraft);

    if (!validation.ok) {
      return deny(validation.error);
    }

    return deny("genlink_canvas_create_node is not implemented until server-side canvas persistence is available");
  }

  if (toolName === "genlink_canvas_connect_nodes") {
    const authValidation = validateAuth(auth, "write");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    return deny("genlink_canvas_connect_nodes is not implemented until server-side canvas persistence is available");
  }

  if (toolName === "genlink_canvas_update_node_params") {
    const authValidation = validateAuth(auth, "write");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    const patchValidation = validatePatch(input.patch);

    if (!patchValidation.ok) {
      return deny(patchValidation.error);
    }

    return deny("genlink_canvas_update_node_params is not implemented until server-side canvas persistence is available");
  }

  if (toolName === "genlink_canvas_run_node") {
    const authValidation = validateAuth(auth, "generate");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    return deny("genlink_canvas_run_node is not implemented until generation confirmation and execution wiring are available");
  }

  if (toolName === "genlink_canvas_get_job_status") {
    const authValidation = validateAuth(auth, "read");

    if (!authValidation.ok) {
      return deny(authValidation.error);
    }

    return deny("genlink_canvas_get_job_status is not implemented until generation job storage is available");
  }

  return deny(`unknown canvas tool: ${toolName}`);
}
