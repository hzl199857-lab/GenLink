import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { saveImageDataUrl } from "@/lib/image-host";
import { VibeApiError, generateImage } from "@/lib/vibe";

export const runtime = "nodejs";

const IMAGE_JOB_RETENTION_MS = 30 * 60_000;

type ImageJobStatus = "pending" | "completed" | "error";

type ImageJobRecord =
  | {
      status: "pending";
      createdAt: number;
    }
  | {
      status: "completed";
      createdAt: number;
      result: {
        imageUrl: string;
        hostedImageUrl?: string;
        model: string;
        width: number;
        height: number;
        format?: string;
        sizeBytes?: number;
      };
    }
  | {
      status: "error";
      createdAt: number;
      error: string;
    };

const imageJobs = new Map<string, ImageJobRecord>();

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
  n?: unknown;
  apiKey?: unknown;
  images?: unknown;
}

function cleanupExpiredJobs() {
  const now = Date.now();

  imageJobs.forEach((job, jobId) => {
    if (now - job.createdAt > IMAGE_JOB_RETENTION_MS) {
      imageJobs.delete(jobId);
    }
  });
}

function normalizeImages(images: unknown):
  | Array<{
      url: string;
      fileName?: string;
    }>
  | undefined {
  if (!Array.isArray(images)) {
    return undefined;
  }

  return images
    .filter(
      (
        image,
      ): image is {
        url: string;
        fileName?: string;
      } =>
        typeof image === "object" &&
        image !== null &&
        "url" in image &&
        typeof image.url === "string" &&
        image.url.trim() !== "",
    )
    .map((image) => ({
      url: image.url,
      fileName:
        "fileName" in image && typeof image.fileName === "string"
          ? image.fileName
          : undefined,
    }));
}

function inferImageMetadata(imageUrl: string): {
  format?: string;
  sizeBytes?: number;
} {
  if (!imageUrl.startsWith("data:")) {
    return {};
  }

  const match = imageUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    return {};
  }

  const base64Payload = match[2];
  const paddingLength = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;

  return {
    format: match[1].toUpperCase(),
    sizeBytes: Math.max(
      0,
      Math.floor((base64Payload.length * 3) / 4) - paddingLength,
    ),
  };
}

async function runImageJob(
  jobId: string,
  params: {
    prompt: string;
    model?: string;
    size?: string;
    quality?: string;
    n?: number;
    apiKey?: string;
    images?: Array<{
      url: string;
      fileName?: string;
    }>;
  },
) {
  try {
    const result = await generateImage(params);
    const metadata = inferImageMetadata(result.imageUrl);
    const hostedImageUrl = result.imageUrl.startsWith("data:")
      ? await saveImageDataUrl(
          result.imageUrl,
          `${params.prompt || "generated-image"}.png`,
        )
      : undefined;

    imageJobs.set(jobId, {
      status: "completed",
      createdAt: Date.now(),
      result: {
        ...result,
        hostedImageUrl,
        format: metadata.format,
        sizeBytes: metadata.sizeBytes,
      },
    });
  } catch (error) {
    const message =
      error instanceof VibeApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Internal error";

    imageJobs.set(jobId, {
      status: "error",
      createdAt: Date.now(),
      error: message,
    });
  }
}

export async function POST(request: Request) {
  try {
    cleanupExpiredJobs();

    const body = (await request.json()) as ImageRequestBody;

    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Prompt is required" },
        { status: 400 },
      );
    }

    const jobId = randomUUID();

    imageJobs.set(jobId, {
      status: "pending",
      createdAt: Date.now(),
    });

    void runImageJob(jobId, {
      prompt: body.prompt.trim(),
      model: typeof body.model === "string" ? body.model : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      quality: typeof body.quality === "string" ? body.quality : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      images: normalizeImages(body.images),
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  cleanupExpiredJobs();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();

  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "jobId is required" },
      { status: 400 },
    );
  }

  const job = imageJobs.get(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Image job not found" },
      { status: 404 },
    );
  }

  if (job.status === "pending") {
    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  }

  if (job.status === "error") {
    return NextResponse.json({
      ok: true,
      jobId,
      status: "error" satisfies ImageJobStatus,
      error: job.error,
    });
  }

  return NextResponse.json({
    ok: true,
    jobId,
    status: "completed" satisfies ImageJobStatus,
    result: job.result,
  });
}
