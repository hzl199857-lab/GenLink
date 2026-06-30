import { NextResponse } from "next/server";

import {
  AudioSeparationApiError,
  getRunningHubAudioSeparationTaskResult,
  submitRunningHubAudioSeparationTask,
} from "@/lib/audio-separation";
import type { AudioGenerationInstanceType } from "@/types/canvas";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AudioSeparationRequestBody {
  action?: unknown;
  apiKey?: unknown;
  taskId?: unknown;
  audioUrl?: unknown;
  fileName?: unknown;
  instanceType?: unknown;
}

function parseAction(value: unknown): "submit" | "status" {
  return value === "status" ? "status" : "submit";
}

function parseInstanceType(value: unknown): AudioGenerationInstanceType {
  return value === "plus" ? "plus" : "default";
}

function parseRequiredString(value: unknown, message: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    throw new AudioSeparationApiError(400, message);
  }

  return trimmed;
}

function parseOptionalString(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AudioSeparationRequestBody;
    const action = parseAction(body.action);
    const apiKey = parseRequiredString(body.apiKey, "RunningHub workflow API key is required");

    if (action === "status") {
      const taskId = parseRequiredString(body.taskId, "Task id is required");
      const result = await getRunningHubAudioSeparationTaskResult({ apiKey, taskId });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const audioUrl = parseRequiredString(body.audioUrl, "Source audio URL is required");
    const task = await submitRunningHubAudioSeparationTask({
      apiKey,
      audioUrl,
      fileName: parseOptionalString(body.fileName),
      instanceType: parseInstanceType(body.instanceType),
    });

    return NextResponse.json({
      ok: true,
      status: "submitted",
      task,
    });
  } catch (error) {
    if (error instanceof AudioSeparationApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
