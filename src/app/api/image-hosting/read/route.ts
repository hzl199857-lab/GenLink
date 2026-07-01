import { NextResponse } from "next/server";

import { VibeApiError } from "@/lib/vibe";

export const runtime = "nodejs";

const REMOTE_MEDIA_READ_TIMEOUT_MS = 5 * 60_000;

interface ReadMediaRequestBody {
  imageUrl?: unknown;
}

function getSupportedMediaUrl(value: unknown, request: Request): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmedUrl = value.trim();
  return trimmedUrl.startsWith("/")
    ? new URL(trimmedUrl, request.url).toString()
    : trimmedUrl;
}

async function readRemoteMedia(sourceUrl: string, requestHeaders?: Headers): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_MEDIA_READ_TIMEOUT_MS);

  try {
    if (!/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { ok: false, error: "Only HTTP media URLs can be read" },
        { status: 400 },
      );
    }

    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "image/*,video/*,audio/*,*/*;q=0.8",
        ...(requestHeaders?.get("range")
          ? { Range: requestHeaders.get("range") as string }
          : {}),
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

    const responseHeaders = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    const contentLength = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");

    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    if (acceptRanges) {
      responseHeaders.set("Accept-Ranges", acceptRanges);
    }

    return new Response(response.body, {
      status: response.status === 206 ? 206 : 200,
      headers: responseHeaders,
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

export async function GET(request: Request) {
  const sourceUrl = getSupportedMediaUrl(new URL(request.url).searchParams.get("url"), request);

  if (!sourceUrl) {
    return NextResponse.json(
      { ok: false, error: "Media URL is required" },
      { status: 400 },
    );
  }

  return readRemoteMedia(sourceUrl, request.headers);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReadMediaRequestBody;
  const sourceUrl = getSupportedMediaUrl(body.imageUrl, request);

  if (!sourceUrl) {
    return NextResponse.json(
      { ok: false, error: "Media URL is required" },
      { status: 400 },
    );
  }

  return readRemoteMedia(sourceUrl);
}
