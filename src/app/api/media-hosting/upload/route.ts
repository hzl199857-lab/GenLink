import { NextResponse } from "next/server";

import { uploadAliyunMediaObject } from "@/lib/media-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

function isAllowedMediaContentType(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const fileNameValue = formData.get("fileName");
    const folderValue = formData.get("folder");

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "Media file is required" },
        { status: 400 },
      );
    }

    const contentType = file.type || "application/octet-stream";

    if (!isAllowedMediaContentType(contentType)) {
      return NextResponse.json(
        { ok: false, error: "Only image, video, and audio uploads are allowed" },
        { status: 400 },
      );
    }

    const result = await uploadAliyunMediaObject({
      file,
      contentType,
      fileName: typeof fileNameValue === "string" ? fileNameValue : undefined,
      folder: typeof folderValue === "string" ? folderValue : undefined,
    });

    return NextResponse.json({
      ok: true,
      result: {
        mediaUrl: result.mediaUrl,
        objectKey: result.objectKey,
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
