import { NextResponse } from "next/server";

import { VibeApiError, generateText } from "@/lib/vibe";

export const runtime = "nodejs";

interface TextRequestBody {
  prompt?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
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

    const result = await generateText({
      prompt: body.prompt,
      model: typeof body.model === "string" ? body.model : undefined,
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      temperature:
        typeof body.temperature === "number" ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
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
