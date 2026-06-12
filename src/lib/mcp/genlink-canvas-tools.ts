import type { CanvasAgentToolRisk } from "@/types/agent";

import type { McpJsonSchema, McpToolDefinition } from "./protocol";

export const GENLINK_CANVAS_TOOL_NAMES = [
  "genlink_canvas_get_snapshot",
  "genlink_canvas_get_node",
  "genlink_canvas_create_workflow",
  "genlink_canvas_create_node",
  "genlink_canvas_connect_nodes",
  "genlink_canvas_update_node_params",
  "genlink_canvas_run_node",
  "genlink_canvas_get_job_status",
] as const;

export type GenLinkCanvasToolName = (typeof GENLINK_CANVAS_TOOL_NAMES)[number];

export type GenLinkCanvasToolContract = McpToolDefinition & {
  name: GenLinkCanvasToolName;
  risk: CanvasAgentToolRisk;
  requiresConfirmation: boolean;
};

const projectCanvasProperties = {
  projectId: {
    type: "string",
    minLength: 1,
    description: "GenLink project id scoped to the authenticated user.",
  },
  canvasId: {
    type: "string",
    minLength: 1,
    description: "Canvas id inside the project. Use default for single-canvas projects.",
  },
} satisfies Record<string, unknown>;

function objectSchema(
  properties: Record<string, unknown>,
  required: string[],
): McpJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const workflowSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    version: { type: "string", const: "gl-workflow-v1" },
    source: {
      type: "string",
      enum: ["openclaw", "mcp", "planf", "manual"],
    },
    intent: { type: "object" },
    nodes: { type: "array" },
    edges: { type: "array" },
    meta: { type: "object" },
  },
  required: ["version", "source", "intent", "nodes", "edges", "meta"],
};

export const GENLINK_CANVAS_TOOL_CONTRACTS: GenLinkCanvasToolContract[] = [
  {
    name: "genlink_canvas_get_snapshot",
    description: "Read a GenLink canvas snapshot with nodes, edges, groups, and summary counts.",
    risk: "read",
    requiresConfirmation: false,
    annotations: {
      title: "Get Canvas Snapshot",
      readOnlyHint: true,
    },
    inputSchema: objectSchema(projectCanvasProperties, ["projectId", "canvasId"]),
  },
  {
    name: "genlink_canvas_get_node",
    description: "Read a single GenLink canvas node by id.",
    risk: "read",
    requiresConfirmation: false,
    annotations: {
      title: "Get Canvas Node",
      readOnlyHint: true,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        nodeId: { type: "string", minLength: 1 },
      },
      ["projectId", "canvasId", "nodeId"],
    ),
  },
  {
    name: "genlink_canvas_create_workflow",
    description: "Create a validated GL workflow on the GenLink canvas.",
    risk: "write",
    requiresConfirmation: false,
    annotations: {
      title: "Create Canvas Workflow",
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        workflow: workflowSchema,
        placement: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: {
              type: "string",
              enum: ["viewport_center_right", "origin", "manual"],
            },
          },
          required: ["mode"],
        },
        allowedExistingSourceIds: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "Existing GenLink canvas node ids that this confirmed workflow may reference as edge sources.",
        },
      },
      ["projectId", "canvasId", "workflow"],
    ),
  },
  {
    name: "genlink_canvas_create_node",
    description: "Create a single GenLink canvas node draft.",
    risk: "write",
    requiresConfirmation: true,
    annotations: {
      title: "Create Canvas Node",
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        node: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { type: "string" },
            position: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
              },
              required: ["x", "y"],
            },
            data: { type: "object" },
          },
          required: ["type", "position", "data"],
        },
      },
      ["projectId", "canvasId", "node"],
    ),
  },
  {
    name: "genlink_canvas_connect_nodes",
    description: "Connect two GenLink canvas nodes.",
    risk: "write",
    requiresConfirmation: true,
    annotations: {
      title: "Connect Canvas Nodes",
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        sourceNodeId: { type: "string", minLength: 1 },
        targetNodeId: { type: "string", minLength: 1 },
        sourceHandle: { type: "string" },
        targetHandle: { type: "string" },
      },
      ["projectId", "canvasId", "sourceNodeId", "targetNodeId"],
    ),
  },
  {
    name: "genlink_canvas_update_node_params",
    description: "Update non-creative parameters on a GenLink canvas node.",
    risk: "write",
    requiresConfirmation: true,
    annotations: {
      title: "Update Canvas Node Params",
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        nodeId: { type: "string", minLength: 1 },
        patch: { type: "object", additionalProperties: true },
      },
      ["projectId", "canvasId", "nodeId", "patch"],
    ),
  },
  {
    name: "genlink_canvas_run_node",
    description: "Run a GenLink generation node after explicit user confirmation.",
    risk: "generate",
    requiresConfirmation: true,
    annotations: {
      title: "Run Canvas Node",
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        nodeId: { type: "string", minLength: 1 },
      },
      ["projectId", "canvasId", "nodeId"],
    ),
  },
  {
    name: "genlink_canvas_get_job_status",
    description: "Read a GenLink generation job status for a canvas node.",
    risk: "read",
    requiresConfirmation: false,
    annotations: {
      title: "Get Canvas Job Status",
      readOnlyHint: true,
    },
    inputSchema: objectSchema(
      {
        ...projectCanvasProperties,
        nodeId: { type: "string", minLength: 1 },
        jobId: { type: "string", minLength: 1 },
      },
      ["projectId", "canvasId", "nodeId", "jobId"],
    ),
  },
];

export function listGenLinkCanvasTools(): GenLinkCanvasToolContract[] {
  return GENLINK_CANVAS_TOOL_CONTRACTS;
}

export function getGenLinkCanvasTool(
  name: string,
): GenLinkCanvasToolContract | undefined {
  return GENLINK_CANVAS_TOOL_CONTRACTS.find((tool) => tool.name === name);
}

export function isGenLinkCanvasToolName(
  name: string,
): name is GenLinkCanvasToolName {
  return GENLINK_CANVAS_TOOL_NAMES.includes(name as GenLinkCanvasToolName);
}
