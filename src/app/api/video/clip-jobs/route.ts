import { NextResponse } from "next/server";

import type { CreateVideoClipJobRequest } from "@/lib/video/clip-types";

export const runtime = "nodejs";

const WORKER_BASE_URL = process.env.MEDIA_WORKER_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const WORKER_TOKEN = process.env.MEDIA_WORKER_TOKEN?.trim() ?? "";

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isAllowedFps(value: unknown): value is number {
  return value === 16 || value === 24 || value === 30;
}

function normalizeRequestBody(body: CreateVideoClipJobRequest): CreateVideoClipJobRequest | null {
  const kind = body.kind;
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";

  if (kind !== "cut" && kind !== "smart_clip") {
    return null;
  }

  if (!/^https:\/\//i.test(sourceUrl)) {
    return null;
  }

  if (kind === "cut") {
    const start = Number(body.start);
    const end = Number(body.end);

    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      return null;
    }

    return {
      kind,
      sourceUrl,
      start,
      end,
      fps: isAllowedFps(body.fps) ? body.fps : undefined,
    };
  }

  const options = body.options && typeof body.options === "object" ? body.options : {};
  const mode = options.mode === "balanced" || options.mode === "sensitive"
    ? options.mode
    : "stable";
  const maxSegmentsNumber = Math.round(Number(options.maxSegments));
  const maxSegments = Number.isFinite(maxSegmentsNumber)
    ? Math.min(25, Math.max(2, maxSegmentsNumber))
    : 20;

  return {
    kind,
    sourceUrl,
    options: {
      mode,
      maxSegments,
      fps: isAllowedFps(options.fps) ? options.fps : 24,
    },
  };
}

export async function POST(request: Request) {
  if (!WORKER_BASE_URL) {
    return jsonError("MEDIA_WORKER_BASE_URL is not configured", 501);
  }

  let body: CreateVideoClipJobRequest;

  try {
    body = (await request.json()) as CreateVideoClipJobRequest;
  } catch {
    return jsonError("Invalid JSON");
  }

  const normalized = normalizeRequestBody(body);

  if (!normalized) {
    return jsonError("Invalid video clip job request");
  }

  let response: Response;

  try {
    response = await fetch(`${WORKER_BASE_URL}/clip-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WORKER_TOKEN ? { Authorization: `Bearer ${WORKER_TOKEN}` } : {}),
      },
      body: JSON.stringify(normalized),
      cache: "no-store",
    });
  } catch (error) {
    return jsonError(
      `Media worker request failed: ${error instanceof Error ? error.message : "Failed to fetch"}`,
      502,
    );
  }

  const text = await response.text();

  if (!text.trim()) {
    return jsonError(`Media worker returned an empty response (${response.status})`, 502);
  }

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    },
  });
}
