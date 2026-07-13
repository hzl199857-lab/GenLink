import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { saveImageDataUrl, saveRemoteImageUrl } from "@/lib/image-host";
import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

interface UploadImageRequestBody {
  dataUrl?: unknown;
  imageUrl?: unknown;
  fileName?: unknown;
  folder?: unknown;
  forceOss?: unknown;
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";

    if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
      return await handleMultipartUpload(request);
    }

    const body = (await request.json()) as UploadImageRequestBody;

    const fileName = typeof body.fileName === "string" ? body.fileName : undefined;
    const folder = typeof body.folder === "string" ? body.folder : undefined;
    const forceOss = body.forceOss === true;
    let imageUrl: string;

    if (typeof body.dataUrl === "string" && body.dataUrl.trim() !== "") {
      imageUrl = await saveImageDataUrl(body.dataUrl, fileName, folder, { forceOss });
    } else if (typeof body.imageUrl === "string" && body.imageUrl.trim() !== "") {
      const sourceUrl = body.imageUrl.trim();
      imageUrl = await saveRemoteImageUrl(
        sourceUrl.startsWith("/") ? new URL(sourceUrl, request.url).toString() : sourceUrl,
        fileName,
        folder,
        { forceOss },
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

async function handleMultipartUpload(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const fileNameValue = formData.get("fileName");
  const folderValue = formData.get("folder");
  const forceOssValue = formData.get("forceOss");
  const contentTypeValue = formData.get("contentType");

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Image file is required" },
      { status: 400 },
    );
  }

  const mimeType =
    typeof contentTypeValue === "string" && contentTypeValue.trim()
      ? contentTypeValue.trim()
      : file.type || "application/octet-stream";

  if (!mimeType.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "Only image uploads are allowed" },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  const imageUrl = await saveImageDataUrl(
    dataUrl,
    typeof fileNameValue === "string" ? fileNameValue : undefined,
    typeof folderValue === "string" ? folderValue : undefined,
    { forceOss: forceOssValue === "true" },
  );

  return NextResponse.json({
    ok: true,
    result: {
      imageUrl,
    },
  });
}
