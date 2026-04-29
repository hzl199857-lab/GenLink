import { NextResponse } from "next/server";

import { VibeApiError, generateImage } from "@/lib/vibe";

export const runtime = "nodejs";

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  n?: unknown;
  apiKey?: unknown;
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

    const result = await generateImage({
      prompt: body.prompt,
      model: typeof body.model === "string" ? body.model : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
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
