import { NextResponse } from "next/server";

import {
  AudioApiError,
  getSunoMusicTaskResult,
  submitSunoMusicTask,
} from "@/lib/audio";
import type {
  AudioGenerationMode,
  AudioGenerationProvider,
  AudioGenerationVocalGender,
} from "@/types/canvas";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AudioRequestBody {
  action?: unknown;
  apiKey?: unknown;
  provider?: unknown;
  taskId?: unknown;
  model?: unknown;
  mode?: unknown;
  prompt?: unknown;
  title?: unknown;
  style?: unknown;
  instrumental?: unknown;
  negativeTags?: unknown;
  vocalGender?: unknown;
}

function parseProvider(value: unknown): AudioGenerationProvider {
  return value === "zhenzhen" ? "zhenzhen" : "comfly";
}

function parseMode(value: unknown): AudioGenerationMode {
  return value === "custom" ? "custom" : "inspiration";
}

function parseVocalGender(value: unknown): AudioGenerationVocalGender {
  return value === "f" || value === "m" ? value : "auto";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AudioRequestBody;
    const action = body.action === "status" ? "status" : "submit";
    const provider = parseProvider(body.provider);
    const apiKey = stringValue(body.apiKey) ?? "";

    if (!apiKey) {
      throw new AudioApiError(401, "Audio API key is required");
    }

    if (action === "status") {
      const taskId = stringValue(body.taskId);

      if (!taskId) {
        throw new AudioApiError(400, "Task id is required");
      }

      const result = await getSunoMusicTaskResult({
        provider,
        apiKey,
        taskId,
        model: body.model === "suno-v5" || body.model === "chirp-crow"
          ? "chirp-crow"
          : body.model === "suno-v4.5-plus" || body.model === "chirp-bluejay"
            ? "chirp-bluejay"
            : "chirp-fenix",
      });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const prompt = stringValue(body.prompt);

    if (!prompt) {
      throw new AudioApiError(400, "Prompt is required");
    }

    const task = await submitSunoMusicTask({
      provider,
      apiKey,
      prompt,
      model: stringValue(body.model),
      mode: parseMode(body.mode),
      title: stringValue(body.title),
      style: stringValue(body.style),
      instrumental: body.instrumental === true,
      negativeTags: stringValue(body.negativeTags),
      vocalGender: parseVocalGender(body.vocalGender),
    });

    return NextResponse.json({
      ok: true,
      status: "submitted",
      task,
    });
  } catch (error) {
    if (error instanceof AudioApiError) {
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
