import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { createAliyunMediaUploadTarget } from "@/lib/media-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

interface CreateMediaUploadUrlRequestBody {
  contentType?: unknown;
  fileName?: unknown;
  folder?: unknown;
}

function isAllowedMediaContentType(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  );
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as CreateMediaUploadUrlRequestBody;
    const contentType =
      typeof body.contentType === "string" && body.contentType.trim()
        ? body.contentType.trim()
        : "application/octet-stream";

    if (!isAllowedMediaContentType(contentType)) {
      return NextResponse.json(
        { ok: false, error: "Only image, video, and audio uploads are allowed" },
        { status: 400 },
      );
    }

    const result = createAliyunMediaUploadTarget({
      contentType,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      folder: typeof body.folder === "string" ? body.folder : undefined,
    });

    return NextResponse.json({
      ok: true,
      result,
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
