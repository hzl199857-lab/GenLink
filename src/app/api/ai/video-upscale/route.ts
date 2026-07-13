import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import {
  getRunningHubVideoUpscaleTaskResult,
  submitRunningHubVideoUpscaleTask,
  type RunningHubInstanceType,
  type VideoUpscaleFps,
  type VideoUpscaleResolution,
} from "@/lib/video-upscale";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";
export const maxDuration = 60;

interface VideoUpscaleRequestBody {
  action?: unknown;
  apiKey?: unknown;
  taskId?: unknown;
  videoUrl?: unknown;
  fileName?: unknown;
  targetResolution?: unknown;
  targetFps?: unknown;
  instanceType?: unknown;
}

function parseAction(value: unknown): "submit" | "status" {
  return value === "status" ? "status" : "submit";
}

function parseResolution(value: unknown): VideoUpscaleResolution {
  switch (value) {
    case "720p":
    case "1080p":
    case "4k":
      return value;
    default:
      return "1080p";
  }
}

function parseFps(value: unknown): VideoUpscaleFps {
  return value === "60" ? "60" : "30";
}

function parseInstanceType(value: unknown): RunningHubInstanceType {
  return value === "plus" ? "plus" : "default";
}

function parseRequiredString(value: unknown, message: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    throw new VibeApiError(400, message);
  }

  return trimmed;
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as VideoUpscaleRequestBody;
    const action = parseAction(body.action);
    const apiKey = parseRequiredString(body.apiKey, "RunningHub workflow API key is required");

    if (action === "status") {
      const taskId = parseRequiredString(body.taskId, "Task id is required");
      const result = await getRunningHubVideoUpscaleTaskResult({ apiKey, taskId });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const videoUrl = parseRequiredString(body.videoUrl, "Source video URL is required");
    const result = await submitRunningHubVideoUpscaleTask({
      apiKey,
      videoUrl,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      targetResolution: parseResolution(body.targetResolution),
      targetFps: parseFps(body.targetFps),
      instanceType: parseInstanceType(body.instanceType),
    });

    return NextResponse.json({
      ok: true,
      status: "submitted",
      task: result,
    });
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
