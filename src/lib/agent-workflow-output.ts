import {
  validateAgentNodeTypeMatchesCanvasKind,
  validateCharacterAnchorContent,
  validateNoGenerationCompletionClaim,
} from "./agent-canvas-global-rules";
import type { AgentProvider, CanvasAgentAction } from "@/types/agent";

const NODE_TYPES = new Set(["rh-text", "rh-image", "rh-video"]);
const IMAGE_SUBTYPES = new Set(["text-image", "image-image"]);
const TEXT_SUBTYPES = new Set(["text-text", "image-text", "video-text"]);
const VIDEO_SUBTYPES = new Set([
  "text-video",
  "image-video",
  "multimodal-video",
  "video-edit",
  "video-hd",
  "start-end-video",
  "video-video",
]);
const EDGE_REQUIRED_SUBTYPES = new Set([
  "image-image",
  "image-video",
  "multimodal-video",
  "video-edit",
  "video-hd",
  "image-text",
  "video-text",
]);
const EDIT_ACTIONS = new Set(["redraw", "erase", "enhance", "expand", "cutout", "lighting", "multiangle"]);
const ASPECT_RATIOS = new Set(["auto", "1:1", "16:9", "9:16", "4:3", "3:4"]);
const FORBIDDEN_NODE_FIELDS = new Set([
  "toolsType",
  "modelCode",
  "resolution",
  "videoWithAudio",
  "negativePrompt",
  "seed",
  "cameraMovement",
  "motionScore",
  "qualitySuffix",
  "upscale",
  "position",
  "status",
]);

type RecordValue = Record<string, unknown>;

type AgentWorkflowNode = {
  id: string;
  type: "rh-text" | "rh-image" | "rh-video";
  subType: string;
  from: "agent";
  agentNodeType: string;
  title: string;
  content: string;
  aspectRatio: string | null;
  duration: string | null;
  sourceNodeId: string | null;
  editAction: string | null;
};

type AgentWorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

type AgentWorkflow = {
  name: string;
  nodes: AgentWorkflowNode[];
  edges: AgentWorkflowEdge[];
  autoRun: boolean;
};

export type AgentWorkflowOutput = {
  summary: string;
  workflow: AgentWorkflow;
};

export type MaterializeAgentWorkflowOutputParams = {
  output: unknown;
  provider?: AgentProvider;
  model?: string;
  allowedExistingSourceIds?: string[];
};

export type MaterializedAgentWorkflowOutput = {
  summary: string;
  workflow: AgentWorkflow;
  actions: CanvasAgentAction[];
  promptPreview?: string;
};

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fail(message: string): never {
  throw new Error(`Agent workflow validation failed: ${message}`);
}

function failValidation(message: string): never {
  fail(message);
}

function validateNodeSubType(node: AgentWorkflowNode): void {
  if (node.type === "rh-image" && !IMAGE_SUBTYPES.has(node.subType)) {
    fail(`node ${node.id} has invalid image subType ${node.subType}`);
  }

  if (node.type === "rh-text" && !TEXT_SUBTYPES.has(node.subType)) {
    fail(`node ${node.id} has invalid text subType ${node.subType}`);
  }

  if (node.type === "rh-video" && !VIDEO_SUBTYPES.has(node.subType)) {
    fail(`node ${node.id} has invalid video subType ${node.subType}`);
  }
}

function parseNode(value: unknown): AgentWorkflowNode {
  if (!isRecord(value)) {
    fail("workflow nodes must be objects");
  }

  for (const field of FORBIDDEN_NODE_FIELDS) {
    if (field in value) {
      fail(`node must not include ${field}`);
    }
  }

  const id = getString(value.id);
  const type = getString(value.type);
  const subType = getString(value.subType);
  const from = getString(value.from);
  const agentNodeType = getString(value.agentNodeType);
  const title = getString(value.title);
  const content = getString(value.content);

  if (!id) {
    fail("node id is required");
  }

  if (!type || !NODE_TYPES.has(type)) {
    fail(`node ${id} has invalid type`);
  }

  if (!subType) {
    fail(`node ${id} subType is required`);
  }

  if (from !== "agent") {
    fail(`node ${id} must include from: "agent"`);
  }

  if (!agentNodeType) {
    fail(`node ${id} must include agentNodeType`);
  }

  if (!title) {
    fail(`node ${id} title is required`);
  }

  if (subType !== "video-hd" && !content) {
    fail(`node ${id} content is required`);
  }

  const aspectRatio = getNullableString(value.aspectRatio);

  if (aspectRatio && !ASPECT_RATIOS.has(aspectRatio)) {
    fail(`node ${id} aspectRatio must be one of auto, 1:1, 16:9, 9:16, 4:3, 3:4`);
  }

  const duration = getNullableString(value.duration);

  if (duration && !/^(?:[4-9]|1[0-5])s$/.test(duration)) {
    fail(`node ${id} duration must be 4s-15s`);
  }

  const editAction = getNullableString(value.editAction);

  if (subType === "image-image") {
    if (!editAction) {
      fail(`node ${id} image-image must include editAction`);
    }

    if (!EDIT_ACTIONS.has(editAction)) {
      fail(`node ${id} editAction is invalid`);
    }
  } else if (editAction) {
    fail(`node ${id} editAction is only allowed for image-image`);
  }

  const node: AgentWorkflowNode = {
    id,
    type: type as AgentWorkflowNode["type"],
    subType,
    from: "agent",
    agentNodeType,
    title,
    content: content ?? "",
    aspectRatio,
    duration,
    sourceNodeId: getNullableString(value.sourceNodeId),
    editAction,
  };

  validateNodeSubType(node);
  return node;
}

function parseEdge(value: unknown): AgentWorkflowEdge {
  if (!isRecord(value)) {
    fail("workflow edges must be objects");
  }

  const id = getString(value.id);
  const source = getString(value.source);
  const target = getString(value.target);

  if (!id || !source || !target) {
    fail("workflow edge must include id, source and target");
  }

  return { id, source, target };
}

function parseWorkflowOutput(output: unknown): AgentWorkflowOutput {
  if (!isRecord(output)) {
    fail("model output must be an object");
  }

  const summary = getString(output.summary);
  const workflowValue = output.workflow;

  if (!summary) {
    fail("summary is required");
  }

  const summaryValidation = validateNoGenerationCompletionClaim(summary);

  if (!summaryValidation.ok) {
    failValidation(summaryValidation.error);
  }

  if (!isRecord(workflowValue)) {
    fail("workflow must be an object");
  }

  const name = getString(workflowValue.name);
  const autoRun = workflowValue.autoRun;

  if (!name) {
    fail("workflow.name is required");
  }

  if (typeof autoRun !== "boolean") {
    fail("workflow.autoRun must be boolean");
  }

  if (!Array.isArray(workflowValue.nodes) || workflowValue.nodes.length === 0) {
    fail("workflow.nodes must contain at least one node");
  }

  if (!Array.isArray(workflowValue.edges)) {
    fail("workflow.edges must be an array");
  }

  return {
    summary,
    workflow: {
      name,
      autoRun,
      nodes: workflowValue.nodes.map(parseNode),
      edges: workflowValue.edges.map(parseEdge),
    },
  };
}

function validateWorkflowTopology(
  workflow: AgentWorkflow,
  allowedExistingSourceIds: Set<string>,
): void {
  const nodeIds = new Set<string>();
  const hasCharacterNode = workflow.nodes.some((node) => node.agentNodeType === "character");
  const hasVideoClipNode = workflow.nodes.some((node) => node.agentNodeType === "video_clip");

  if (hasCharacterNode && hasVideoClipNode) {
    fail("character anchor nodes and video_clip nodes must not be created in the same workflow");
  }

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      fail(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    const kindValidation = validateAgentNodeTypeMatchesCanvasKind({
      nodeId: node.id,
      type: node.type,
      agentNodeType: node.agentNodeType,
    });

    if (!kindValidation.ok) {
      failValidation(kindValidation.error);
    }

    if (node.subType === "text-image") {
      const characterValidation = validateCharacterAnchorContent({
        nodeId: node.id,
        agentNodeType: node.agentNodeType,
        content: node.content,
      });

      if (!characterValidation.ok) {
        failValidation(characterValidation.error);
      }
    }
  }

  for (const edge of workflow.edges) {
    const sourceExists = nodeIds.has(edge.source) || allowedExistingSourceIds.has(edge.source);

    if (!sourceExists) {
      fail(`edge ${edge.id} source ${edge.source} is not a known workflow node or selected canvas source`);
    }

    if (!nodeIds.has(edge.target)) {
      fail(`edge ${edge.id} target ${edge.target} is not a workflow node`);
    }
  }

  for (const node of workflow.nodes) {
    if (!EDGE_REQUIRED_SUBTYPES.has(node.subType)) {
      continue;
    }

    const hasIncomingEdge = workflow.edges.some((edge) => edge.target === node.id);

    if (!hasIncomingEdge) {
      fail(`node ${node.id} ${node.subType} requires at least one input edge`);
    }

    if (node.sourceNodeId && !allowedExistingSourceIds.has(node.sourceNodeId) && !nodeIds.has(node.sourceNodeId)) {
      fail(`node ${node.id} sourceNodeId ${node.sourceNodeId} is not available`);
    }

    if (node.sourceNodeId && !workflow.edges.some((edge) => edge.target === node.id && edge.source === node.sourceNodeId)) {
      fail(`node ${node.id} sourceNodeId must match an incoming edge source`);
    }
  }
}

function workflowToActions(
  workflow: AgentWorkflow,
  provider?: AgentProvider,
  model?: string,
): CanvasAgentAction[] {
  const actions: CanvasAgentAction[] = [];
  const createdNodeIds = new Set<string>();

  for (const node of workflow.nodes) {
    if (node.type === "rh-text") {
      actions.push({
        type: "create_text_node",
        clientActionId: node.id,
        title: node.title,
        text: node.content,
      });
      createdNodeIds.add(node.id);
      continue;
    }

    if (node.type === "rh-image") {
      actions.push({
        type: "create_image_generation_node",
        clientActionId: node.id,
        prompt: node.content,
        options: {
          aspectRatio: node.aspectRatio ?? undefined,
          provider,
          model: model === "auto" ? undefined : model,
        },
      });
      createdNodeIds.add(node.id);
      continue;
    }

    fail(`node ${node.id} type ${node.type} is not supported by this Agent entry yet`);
  }

  for (const edge of workflow.edges) {
    if (!createdNodeIds.has(edge.target)) {
      continue;
    }

    actions.push({
      type: "connect_nodes",
      sourceRef: createdNodeIds.has(edge.source)
        ? { kind: "created", clientActionId: edge.source }
        : { kind: "existing", nodeId: edge.source },
      targetRef: { kind: "created", clientActionId: edge.target },
    });
  }

  return actions;
}

export function materializeAgentWorkflowOutput(
  params: MaterializeAgentWorkflowOutputParams,
): MaterializedAgentWorkflowOutput {
  const parsed = parseWorkflowOutput(params.output);
  const allowedExistingSourceIds = new Set(
    (params.allowedExistingSourceIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean),
  );

  validateWorkflowTopology(parsed.workflow, allowedExistingSourceIds);

  const actions = workflowToActions(parsed.workflow, params.provider, params.model);
  const promptPreview = actions.find((action) => action.type === "create_image_generation_node")?.prompt;

  return {
    ...parsed,
    actions,
    promptPreview,
  };
}
