import { NextResponse } from "next/server";

import type { CanvasToolAuthContext } from "@/lib/canvas/canvas-tool-gateway";
import { getGenLinkCanvasTool } from "@/lib/mcp/genlink-canvas-tools";
import { handleGenLinkCanvasMcpRequest } from "@/lib/mcp/genlink-canvas-server";
import { asObject } from "@/lib/mcp/protocol";

export const runtime = "nodejs";

function readScopedValue(body: unknown, key: "projectId" | "canvasId"): string {
  const object = asObject(body);
  const params = asObject(object?.params);
  const args = asObject(params?.arguments);
  const value = args?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isWriteOrGenerateTool(body: unknown): boolean {
  const object = asObject(body);
  const params = asObject(object?.params);
  const name = typeof params?.name === "string" ? params.name : "";
  const tool = getGenLinkCanvasTool(name);

  return tool?.risk === "write" || tool?.risk === "generate";
}

function buildAuthContext(request: Request, body: unknown): CanvasToolAuthContext {
  const headerUserId = request.headers.get("x-genlink-user-id")?.trim() || "";
  const devUserId = process.env.NODE_ENV === "production" ? "" : "dev-user";
  const userId = headerUserId || devUserId;
  const projectId = readScopedValue(body, "projectId") || request.headers.get("x-genlink-project-id")?.trim() || "";
  const canvasId = readScopedValue(body, "canvasId") || request.headers.get("x-genlink-canvas-id")?.trim() || "default";
  const authenticated = Boolean(userId);

  return {
    userId,
    projectId,
    canvasId,
    permissions: {
      read: authenticated,
      write: authenticated,
      generate: authenticated && request.headers.get("x-genlink-confirm-generate") === "1",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const auth = buildAuthContext(request, body);

    if (isWriteOrGenerateTool(body) && !auth.userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: asObject(body)?.id,
          error: {
            code: -32001,
            message: "authenticated user is required for MCP write/generate tools",
          },
        },
        { status: 401 },
      );
    }

    return NextResponse.json(await handleGenLinkCanvasMcpRequest(body, auth));
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: undefined,
        error: {
          code: -32700,
          message: "Invalid MCP JSON-RPC request body",
        },
      },
      { status: 400 },
    );
  }
}
