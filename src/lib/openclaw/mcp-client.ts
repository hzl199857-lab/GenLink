import type { CanvasToolAuthContext, CanvasToolResult } from "@/lib/canvas/canvas-tool-gateway";
import { callGenLinkCanvasMcpTool } from "@/lib/mcp/genlink-canvas-server";
import { listGenLinkCanvasTools, type GenLinkCanvasToolName } from "@/lib/mcp/genlink-canvas-tools";
import type { JsonObject, McpToolCallResult } from "@/lib/mcp/protocol";
import type { GLWorkflow } from "@/lib/planf-ecom";

export type OpenClawMcpClientContext = CanvasToolAuthContext;

export class OpenClawMcpClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawMcpClientError";
  }
}

function parseToolResult(result: McpToolCallResult): CanvasToolResult {
  const text = result.content.find((block) => block.type === "text")?.text;

  if (!text) {
    throw new OpenClawMcpClientError("MCP tool returned no text content");
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CanvasToolResult;
    }
  } catch {
    // Fall through to structured error below.
  }

  throw new OpenClawMcpClientError("MCP tool returned invalid JSON content");
}

function toOpenClawWorkflow(workflow: GLWorkflow): GLWorkflow {
  return {
    ...workflow,
    source: "openclaw",
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        from: "agent",
        agentNodeType: typeof node.data.agentNodeType === "string"
          ? node.data.agentNodeType
          : node.role,
      },
    })),
  };
}

export function createOpenClawMcpClient(auth: OpenClawMcpClientContext) {
  async function callTool(
    name: GenLinkCanvasToolName,
    args: JsonObject,
  ): Promise<CanvasToolResult> {
    const result = parseToolResult(await callGenLinkCanvasMcpTool(name, args, auth));

    if (!result.ok) {
      throw new OpenClawMcpClientError(result.error || result.message || `${name} failed`);
    }

    return result;
  }

  return {
    listTools() {
      return listGenLinkCanvasTools();
    },

    callTool,

    getCanvasSnapshot(projectId: string, canvasId: string) {
      return callTool("genlink_canvas_get_snapshot", {
        projectId,
        canvasId,
      });
    },

    createWorkflow(params: {
      projectId: string;
      canvasId: string;
      workflow: GLWorkflow;
      placement?: { mode: "viewport_center_right" | "origin" | "manual" };
      allowedExistingSourceIds?: string[];
    }) {
      return callTool("genlink_canvas_create_workflow", {
        projectId: params.projectId,
        canvasId: params.canvasId,
        workflow: toOpenClawWorkflow(params.workflow),
        placement: params.placement ?? { mode: "viewport_center_right" },
        allowedExistingSourceIds: params.allowedExistingSourceIds ?? [],
      });
    },
  };
}
