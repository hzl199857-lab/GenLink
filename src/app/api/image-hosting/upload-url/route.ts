import { NextResponse } from "next/server";

import { createAliyunOssUploadTarget } from "@/lib/image-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

interface CreateUploadUrlRequestBody {
  contentType?: unknown;
  fileName?: unknown;
  folder?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateUploadUrlRequestBody;
    const contentType =
      typeof body.contentType === "string" && body.contentType.trim()
        ? body.contentType.trim()
        : "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Only image uploads are allowed" },
        { status: 400 },
      );
    }

    const result = createAliyunOssUploadTarget({
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
