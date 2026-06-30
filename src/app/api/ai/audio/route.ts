import { NextResponse } from "next/server";

import {
  AudioApiError,
  getRunningHubVoiceCloneTaskResult,
  getSunoMusicTaskResult,
  submitRunningHubVoiceCloneTask,
  submitSunoMusicTask,
} from "@/lib/audio";
import type {
  AudioGenerationInstanceType,
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
  sourceAudioUrl?: unknown;
  sourceAudioFileName?: unknown;
  instanceType?: unknown;
}

function parseProvider(value: unknown): AudioGenerationProvider {
  if (value === "runninghub") {
    return "runninghub";
  }

  return value === "zhenzhen" ? "zhenzhen" : "comfly";
}

function parseMode(value: unknown): AudioGenerationMode {
  return value === "custom" ? "custom" : "inspiration";
}

function parseVocalGender(value: unknown): AudioGenerationVocalGender {
  return value === "f" || value === "m" ? value : "auto";
}

function parseInstanceType(value: unknown): AudioGenerationInstanceType {
  return value === "plus" ? "plus" : "default";
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

      if (provider === "runninghub") {
        const result = await getRunningHubVoiceCloneTaskResult({
          apiKey,
          taskId,
        });

        return NextResponse.json({
          ok: true,
          ...result,
        });
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

    if (provider === "runninghub") {
      const sourceAudioUrl = stringValue(body.sourceAudioUrl);

      if (!sourceAudioUrl) {
        throw new AudioApiError(400, "Source audio URL is required");
      }

      const task = await submitRunningHubVoiceCloneTask({
        apiKey,
        audioUrl: sourceAudioUrl,
        fileName: stringValue(body.sourceAudioFileName),
        prompt,
        instanceType: parseInstanceType(body.instanceType),
        requestUrl: request.url,
      });

      return NextResponse.json({
        ok: true,
        status: "submitted",
        task,
      });
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
