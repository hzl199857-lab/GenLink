import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import {
  VibeApiError,
  generateText,
  generateTextStream,
  type ImageApiProvider,
} from "@/lib/vibe";

export const runtime = "nodejs";
export const maxDuration = 300;

const VIDEO_TEXT_REQUEST_TIMEOUT_MS = 5 * 60_000;

interface TextRequestBody {
  prompt?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  images?: unknown;
  videos?: unknown;
  stream?: unknown;
}

function parseProvider(value: unknown): ImageApiProvider | undefined {
  if (
    value === "vibe" ||
    value === "fucheers" ||
    value === "comfly" ||
    value === "zhenzhen" ||
    value === "grsai"
  ) {
    return value;
  }

  return undefined;
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as TextRequestBody;

    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Prompt is required" },
        { status: 400 },
      );
    }

    const images = Array.isArray(body.images)
      ? body.images
          .filter(
            (image): image is { url: string } =>
              typeof image === "object" &&
              image !== null &&
              "url" in image &&
              typeof image.url === "string" &&
              image.url.trim() !== "",
          )
          .map((image) => ({
            url: image.url,
          }))
      : undefined;
    const videos = Array.isArray(body.videos)
      ? body.videos
          .filter(
            (video): video is { url: string } =>
              typeof video === "object" &&
              video !== null &&
              "url" in video &&
              typeof video.url === "string" &&
              video.url.trim() !== "",
          )
          .map((video) => ({
            url: video.url,
          }))
      : undefined;

    const params = {
      prompt: body.prompt,
      model: typeof body.model === "string" ? body.model : undefined,
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      temperature:
        typeof body.temperature === "number" ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      provider: parseProvider(body.provider),
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      images,
      videos,
      timeoutMs: videos?.length ? VIDEO_TEXT_REQUEST_TIMEOUT_MS : undefined,
    };

    if (body.stream === true) {
      const stream = await generateTextStream(params);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await generateText(params);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
