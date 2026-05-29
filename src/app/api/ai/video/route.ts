import { NextResponse } from "next/server";

import {
  getComflyVideoTaskResult,
  submitComflyVideoTask,
  type GenerateVideoParams,
} from "@/lib/video";
import { VibeApiError } from "@/lib/vibe";
import type { VideoGenerationMode } from "@/types/canvas";

export const runtime = "nodejs";
export const maxDuration = 60;

interface VideoRequestBody {
  action?: unknown;
  apiKey?: unknown;
  taskId?: unknown;
  officialFormat?: unknown;
  model?: unknown;
  mode?: unknown;
  prompt?: unknown;
  ratio?: unknown;
  resolution?: unknown;
  duration?: unknown;
  seed?: unknown;
  camerafixed?: unknown;
  watermark?: unknown;
  returnLastFrame?: unknown;
  generateAudio?: unknown;
  images?: unknown;
  videos?: unknown;
  audio?: unknown;
}

function parseAction(value: unknown): "submit" | "status" {
  return value === "status" ? "status" : "submit";
}

function parseMode(value: unknown): VideoGenerationMode {
  switch (value) {
    case "text-to-video":
    case "image-to-video":
    case "all-reference":
    case "first-last-frame":
      return value;
    default:
      return "text-to-video";
  }
}

function parseReferences(value: unknown): Array<{ url: string; fileName?: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references = value.flatMap((item) => {
    if (typeof item === "string") {
      const url = item.trim();
      return url ? [{ url }] : [];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const url =
      typeof record.url === "string"
        ? record.url.trim()
        : typeof record.hostedUrl === "string"
          ? record.hostedUrl.trim()
          : "";

    if (!url) {
      return [];
    }

    return [{
      url,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
    }];
  });

  return references.length ? references : undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseDuration(value: unknown): number | undefined {
  const parsed = parseNumber(value);

  return typeof parsed === "number" && parsed >= 4 && parsed <= 15
    ? Math.round(parsed)
    : undefined;
}

function toParams(body: VideoRequestBody): GenerateVideoParams {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const mode = parseMode(body.mode);
  const images = parseReferences(body.images);
  const videos = parseReferences(body.videos);
  const audio = parseReferences(body.audio);

  if (!prompt) {
    throw new VibeApiError(400, "Prompt is required");
  }

  if (!apiKey) {
    throw new VibeApiError(401, "Comfly API key is required");
  }

  if (mode === "image-to-video" && !images?.length) {
    throw new VibeApiError(400, "Image to video requires at least one image");
  }

  if (mode === "first-last-frame" && images?.length !== 2) {
    throw new VibeApiError(400, "First-last-frame mode requires exactly two images");
  }

  const requestImages = mode === "image-to-video"
    ? images?.slice(0, 1)
    : images;

  return {
    apiKey,
    mode,
    prompt,
    model: typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : undefined,
    ratio: typeof body.ratio === "string" ? body.ratio : undefined,
    resolution: typeof body.resolution === "string" ? body.resolution : undefined,
    duration: parseDuration(body.duration),
    seed: parseNumber(body.seed),
    camerafixed: body.camerafixed === true,
    watermark: body.watermark === true,
    returnLastFrame: body.returnLastFrame === true,
    generateAudio: body.generateAudio === true,
    images: requestImages,
    videos,
    audio,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VideoRequestBody;
    const action = parseAction(body.action);

    if (action === "status") {
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
      const model = typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : undefined;

      if (!apiKey) {
        throw new VibeApiError(401, "Comfly API key is required");
      }

      if (!taskId) {
        throw new VibeApiError(400, "Task id is required");
      }

      const result = await getComflyVideoTaskResult({
        apiKey,
        taskId,
        model: model || "doubao-seedance-2-0-260128",
        officialFormat: body.officialFormat !== false,
      });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const result = await submitComflyVideoTask(toParams(body));

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
