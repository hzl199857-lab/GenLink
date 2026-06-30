import { NextResponse } from "next/server";

import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

const REMOTE_MEDIA_READ_TIMEOUT_MS = 5 * 60_000;

interface ReadMediaRequestBody {
  imageUrl?: unknown;
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_MEDIA_READ_TIMEOUT_MS);

  try {
    const body = (await request.json()) as ReadMediaRequestBody;

    if (typeof body.imageUrl !== "string" || !body.imageUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: "Media URL is required" },
        { status: 400 },
      );
    }

    const sourceUrl = body.imageUrl.trim().startsWith("/")
      ? new URL(body.imageUrl.trim(), request.url).toString()
      : body.imageUrl.trim();

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { ok: false, error: "Only HTTP media URLs can be read" },
        { status: 400 },
      );
    }

    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "image/*,video/*,audio/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new VibeApiError(response.status, `Failed to read media (${response.status})`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";

    if (
      !contentType.startsWith("image/") &&
      !contentType.startsWith("video/") &&
      !contentType.startsWith("audio/") &&
      contentType !== "application/octet-stream"
    ) {
      throw new VibeApiError(400, "URL did not return supported media");
    }

    const bytes = await response.arrayBuffer();

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
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
      { ok: false, error: `Failed to fetch media: ${message}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
