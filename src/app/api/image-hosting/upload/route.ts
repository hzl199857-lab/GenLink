import { NextResponse } from "next/server";

import { saveImageDataUrl } from "@/lib/image-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

interface UploadImageRequestBody {
  dataUrl?: unknown;
  fileName?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadImageRequestBody;

    if (typeof body.dataUrl !== "string" || body.dataUrl.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Image data URL is required" },
        { status: 400 },
      );
    }

    const imageUrl = await saveImageDataUrl(
      body.dataUrl,
      typeof body.fileName === "string" ? body.fileName : undefined,
    );

    return NextResponse.json({
      ok: true,
      result: {
        imageUrl,
      },
    });
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
