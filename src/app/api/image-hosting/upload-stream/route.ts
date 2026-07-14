import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-guard";
import { createAliyunOssUploadTarget } from "@/lib/image-host";
import {
  forwardImageUploadRequest,
  ImageUploadStreamError,
} from "@/lib/image-upload-stream";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;

  try {
    const result = await forwardImageUploadRequest(request, {
      createUploadTarget: (input) => createAliyunOssUploadTarget(input),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ImageUploadStreamError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    console.error(
      "[GenLink image upload stream] unexpected failure",
      error instanceof Error ? error.name : "Unknown error",
    );

    return NextResponse.json(
      { ok: false, error: "图片上传服务暂时不可用" },
      { status: 500 },
    );
  }
}
