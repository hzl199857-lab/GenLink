import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { isAgentTextProvider } from "@/lib/agent-provider-options";
import { decideAgentPhaseRoute } from "@/lib/openclaw/agent-phase-policy";
import { buildOpenClawAgentMessage, createAgentResultFromOpenClawText } from "@/lib/openclaw/agent-workflow";
import { mapAgentPanelModelToOpenClaw } from "@/lib/openclaw/model-mapping";
import {
  RealOpenClawRuntimeError,
  getPublicRealOpenClawRuntimeDiagnostic,
  runRealOpenClaw,
} from "@/lib/openclaw/real-runtime";
import type { AgentTaskAttachment, AgentTaskContext } from "@/types/agent";
import type { ImageApiProvider } from "@/lib/vibe";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENCLAW_AGENT_TIMEOUT_MS = 5 * 60_000;

type OpenClawAgentRunRequestBody = {
  message?: unknown;
  context?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

function parseProvider(value: unknown): ImageApiProvider | undefined {
  return isAgentTextProvider(value) ? value : undefined;
}

function parseAttachment(value: unknown): AgentTaskAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    record.kind !== "image" ||
    typeof record.name !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.imageUrl !== "string" ||
    typeof record.previewUrl !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    kind: "image",
    name: record.name,
    mimeType: record.mimeType,
    imageUrl: record.imageUrl,
    hostedImageUrl: typeof record.hostedImageUrl === "string" ? record.hostedImageUrl : undefined,
    originalImageUrl: typeof record.originalImageUrl === "string" ? record.originalImageUrl : undefined,
    previewUrl: record.previewUrl,
    thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : undefined,
    semanticImageUrl: typeof record.semanticImageUrl === "string" ? record.semanticImageUrl : undefined,
    width: typeof record.width === "number" ? record.width : undefined,
    height: typeof record.height === "number" ? record.height : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    status: record.status === "ready" ? "ready" : "attached",
    sourceNodeId: typeof record.sourceNodeId === "string" ? record.sourceNodeId : undefined,
  };
}

function parseContext(value: unknown): AgentTaskContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const input = record.input;

  if (!input || typeof input !== "object") {
    return null;
  }

  const inputRecord = input as Record<string, unknown>;
  const rawAttachments = Array.isArray(inputRecord.attachments)
    ? inputRecord.attachments
    : [];
  const attachments = rawAttachments.flatMap((attachment) => {
    const parsed = parseAttachment(attachment);

    return parsed ? [parsed] : [];
  });
  const canvasSummary =
    record.canvasSummary && typeof record.canvasSummary === "object"
      ? record.canvasSummary as Record<string, unknown>
      : undefined;

  return {
    project: {
      name: record.project && typeof record.project === "object"
        ? String((record.project as Record<string, unknown>).name ?? "Untitled")
        : "Untitled",
      id: record.project &&
        typeof record.project === "object" &&
        typeof (record.project as Record<string, unknown>).id === "string"
        ? (record.project as Record<string, unknown>).id as string
        : undefined,
    },
    input: {
      message: typeof inputRecord.message === "string" ? inputRecord.message : "",
      attachments,
      referencedAttachmentIds: Array.isArray(inputRecord.referencedAttachmentIds)
        ? inputRecord.referencedAttachmentIds.filter((id): id is string => typeof id === "string")
        : [],
    },
    executionTarget: {
      createOnCanvas: true,
      placement: "viewport_center_right",
      confirmationMode: "workflow_auto_apply",
    },
    canvasSummary: canvasSummary
      ? {
          nodeCount: typeof canvasSummary.nodeCount === "number" ? canvasSummary.nodeCount : 0,
          edgeCount: typeof canvasSummary.edgeCount === "number" ? canvasSummary.edgeCount : 0,
          groupCount: typeof canvasSummary.groupCount === "number" ? canvasSummary.groupCount : 0,
        }
      : undefined,
  };
}

function getSelectedAttachments(context: AgentTaskContext): AgentTaskAttachment[] {
  const referencedIds = new Set(context.input.referencedAttachmentIds);

  return referencedIds.size > 0
    ? context.input.attachments.filter((attachment) => referencedIds.has(attachment.id))
    : context.input.attachments;
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as OpenClawAgentRunRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const context = parseContext(body.context);

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message is required" },
        { status: 400 },
      );
    }

    if (!context) {
      return NextResponse.json(
        { ok: false, error: "AgentTaskContext is required" },
        { status: 400 },
      );
    }

    const provider = parseProvider(body.provider);
    const model = typeof body.model === "string" ? body.model : undefined;
    const selectedAttachments = getSelectedAttachments(context);
    const phaseDecision = decideAgentPhaseRoute({
      message,
      attachmentCount: selectedAttachments.length,
      routeMode: "auto",
    });
    const openclaw = await runRealOpenClaw({
      message: buildOpenClawAgentMessage({
        request: message,
        referenceImageCount: selectedAttachments.length,
        canvasSummary: context.canvasSummary,
        phaseDecision,
        attachments: selectedAttachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          sourceNodeId: attachment.sourceNodeId,
          semanticImageUrl: attachment.semanticImageUrl,
        })),
      }),
      sessionKey: `genlink-agent-${crypto.randomUUID()}`,
      timeoutMs: OPENCLAW_AGENT_TIMEOUT_MS,
      provider,
      model: mapAgentPanelModelToOpenClaw({ provider, model }),
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    });
    const result = createAgentResultFromOpenClawText({
      request: message,
      text: openclaw.text,
      model: openclaw.meta?.model as string | undefined,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    if (error instanceof RealOpenClawRuntimeError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.publicMessage ?? error.message,
          diagnostic: getPublicRealOpenClawRuntimeDiagnostic(error.diagnostic),
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid OpenClaw agent request" },
      { status: 400 },
    );
  }
}
