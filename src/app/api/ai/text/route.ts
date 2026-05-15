import { NextResponse } from "next/server";

import {
  VibeApiError,
  generateText,
  generateTextStream,
  type ImageApiProvider,
} from "@/lib/vibe";

export const runtime = "nodejs";

interface TextRequestBody {
  prompt?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  images?: unknown;
  stream?: unknown;
}

function parseProvider(value: unknown): ImageApiProvider | undefined {
  if (
    value === "vibe" ||
    value === "fucheers" ||
    value === "comfly" ||
    value === "zhenzhen"
  ) {
    return value;
  }

  return undefined;
}

export async function POST(request: Request) {
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
