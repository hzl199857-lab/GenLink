import {
  executeCanvasTool,
  type CanvasToolAuthContext,
} from "../canvas/canvas-tool-gateway";
import {
  getGenLinkCanvasTool,
  isGenLinkCanvasToolName,
  listGenLinkCanvasTools,
} from "./genlink-canvas-tools";
import {
  MCP_PROTOCOL_VERSION,
  asObject,
  jsonRpcError,
  jsonRpcResult,
  textContent,
  type JsonObject,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpToolCallResult,
} from "./protocol";

export type GenLinkCanvasMcpInitializeResult = {
  protocolVersion: typeof MCP_PROTOCOL_VERSION;
  capabilities: {
    tools: Record<string, never>;
  };
  serverInfo: {
    name: "genlink-canvas";
    version: "0.1.0";
  };
};

export type GenLinkCanvasMcpToolListResult = {
  tools: ReturnType<typeof listGenLinkCanvasTools>;
};

export const GENLINK_CANVAS_MCP_SERVER_INFO = {
  name: "genlink-canvas",
  version: "0.1.0",
} as const;

function initializeResult(): GenLinkCanvasMcpInitializeResult {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: GENLINK_CANVAS_MCP_SERVER_INFO,
  };
}

function parseToolCallParams(params: unknown):
  | { ok: true; name: string; args: JsonObject }
  | { ok: false; message: string } {
  const object = asObject(params);

  if (!object) {
    return { ok: false, message: "tools/call params must be an object" };
  }

  if (typeof object.name !== "string" || !object.name.trim()) {
    return { ok: false, message: "tools/call params.name is required" };
  }

  const args = asObject(object.arguments);

  if (!args) {
    return { ok: false, message: "tools/call params.arguments must be an object" };
  }

  return {
    ok: true,
    name: object.name,
    args,
  };
}

function parseRequest(value: unknown): JsonRpcRequest | undefined {
  const object = asObject(value);

  if (
    !object ||
    object.jsonrpc !== "2.0" ||
    typeof object.method !== "string"
  ) {
    return undefined;
  }

  return object as JsonRpcRequest;
}

function resolveScopedAuth(
  auth: CanvasToolAuthContext,
  args: JsonObject,
): CanvasToolAuthContext {
  return {
    ...auth,
    projectId: typeof args.projectId === "string" && args.projectId.trim()
      ? args.projectId.trim()
      : auth.projectId,
    canvasId: typeof args.canvasId === "string" && args.canvasId.trim()
      ? args.canvasId.trim()
      : auth.canvasId,
  };
}

export async function callGenLinkCanvasMcpTool(
  name: string,
  args: JsonObject,
  auth: CanvasToolAuthContext,
): Promise<McpToolCallResult> {
  const contract = getGenLinkCanvasTool(name);

  if (!contract || !isGenLinkCanvasToolName(name)) {
    throw new Error(`unknown tool: ${name}`);
  }

  const result = await executeCanvasTool(name, args, resolveScopedAuth(auth, args));

  return {
    content: textContent(result),
    isError: !result.ok || undefined,
  };
}

export async function handleGenLinkCanvasMcpRequest(
  rawRequest: unknown,
  auth: CanvasToolAuthContext,
): Promise<JsonRpcResponse | undefined> {
  const request = parseRequest(rawRequest);

  if (!request) {
    return jsonRpcError(undefined, -32600, "Invalid JSON-RPC request");
  }

  const isNotification = request.id === undefined;

  try {
    if (request.method === "notifications/initialized") {
      return undefined;
    }

    if (request.method === "initialize") {
      return jsonRpcResult(request.id, initializeResult());
    }

    if (request.method === "tools/list") {
      return jsonRpcResult(request.id, {
        tools: listGenLinkCanvasTools(),
      } satisfies GenLinkCanvasMcpToolListResult);
    }

    if (request.method === "tools/call") {
      const parsed = parseToolCallParams(request.params);

      if (!parsed.ok) {
        return jsonRpcError(request.id, -32602, parsed.message);
      }

      if (!getGenLinkCanvasTool(parsed.name)) {
        return jsonRpcError(request.id, -32602, `unknown tool: ${parsed.name}`);
      }

      return jsonRpcResult(
        request.id,
        await callGenLinkCanvasMcpTool(parsed.name, parsed.args, auth),
      );
    }

    if (isNotification) {
      return undefined;
    }

    return jsonRpcError(request.id, -32601, `Method not found: ${request.method}`);
  } catch (error) {
    if (isNotification) {
      return undefined;
    }

    return jsonRpcError(
      request.id,
      -32000,
      error instanceof Error ? error.message : "Unknown MCP server error",
    );
  }
}
