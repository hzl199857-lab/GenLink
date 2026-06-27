import { NextResponse } from "next/server";

export const runtime = "nodejs";

const WORKER_BASE_URL = process.env.MEDIA_WORKER_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const WORKER_TOKEN = process.env.MEDIA_WORKER_TOKEN?.trim() ?? "";

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!WORKER_BASE_URL) {
    return jsonError("MEDIA_WORKER_BASE_URL is not configured", 501);
  }

  const { jobId } = await context.params;
  const normalizedJobId = jobId.trim();

  if (!normalizedJobId || !/^[A-Za-z0-9_.:-]+$/.test(normalizedJobId)) {
    return jsonError("Invalid job id");
  }

  let response: Response;

  try {
    response = await fetch(
      `${WORKER_BASE_URL}/clip-jobs/${encodeURIComponent(normalizedJobId)}`,
      {
        headers: {
          ...(WORKER_TOKEN ? { Authorization: `Bearer ${WORKER_TOKEN}` } : {}),
        },
        cache: "no-store",
      },
    );
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
