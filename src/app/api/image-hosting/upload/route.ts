import { NextResponse } from "next/server";

import { saveImageDataUrl, saveRemoteImageUrl } from "@/lib/image-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

interface UploadImageRequestBody {
  dataUrl?: unknown;
  imageUrl?: unknown;
  fileName?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadImageRequestBody;

    const fileName = typeof body.fileName === "string" ? body.fileName : undefined;
    let imageUrl: string;

    if (typeof body.dataUrl === "string" && body.dataUrl.trim() !== "") {
      imageUrl = await saveImageDataUrl(body.dataUrl, fileName);
    } else if (typeof body.imageUrl === "string" && body.imageUrl.trim() !== "") {
      const sourceUrl = body.imageUrl.trim();
      imageUrl = await saveRemoteImageUrl(
        sourceUrl.startsWith("/") ? new URL(sourceUrl, request.url).toString() : sourceUrl,
        fileName,
      );
    } else {
      return NextResponse.json(
        { ok: false, error: "Image data URL or image URL is required" },
        { status: 400 },
      );
    }

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

    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
