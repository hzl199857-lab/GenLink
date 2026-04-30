import { NextResponse } from "next/server";

import { VibeApiError, generateImage } from "@/lib/vibe";

export const runtime = "nodejs";

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
  n?: unknown;
  apiKey?: unknown;
  images?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImageRequestBody;

    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Prompt is required" },
        { status: 400 },
      );
    }

    const images = Array.isArray(body.images)
      ? body.images
          .filter(
            (
              image,
            ): image is {
              url: string;
              fileName?: string;
            } =>
              typeof image === "object" &&
              image !== null &&
              "url" in image &&
              typeof image.url === "string" &&
              image.url.trim() !== "",
          )
          .map((image) => ({
            url: image.url,
            fileName:
              "fileName" in image && typeof image.fileName === "string"
                ? image.fileName
                : undefined,
          }))
      : undefined;

    const result = await generateImage({
      prompt: body.prompt,
      model: typeof body.model === "string" ? body.model : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      quality: typeof body.quality === "string" ? body.quality : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      images,
    });

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
