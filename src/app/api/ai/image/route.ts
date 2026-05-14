import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { saveImageDataUrl } from "@/lib/image-host";
import { getImageHistoryDisplayPrompt } from "@/lib/image-prompt";
import { prisma } from "@/lib/prisma";
import {
  getComflyImageTaskResult,
  submitComflyImageTask,
  VibeApiError,
  generateImage,
  type ImageApiProvider,
} from "@/lib/vibe";
import type { ImageGenerationNodeData } from "@/types/canvas";

export const runtime = "nodejs";

const IMAGE_JOB_RETENTION_MS = 60 * 60_000;
const COMFLY_IMAGE_JOB_TIMEOUT_MS = 45 * 60_000;
const COMFLY_IMAGE_JOB_POLL_INTERVAL_MS = 2_000;

type ImageJobStatus = "pending" | "completed" | "error";

type ImageJobResult = {
  model: string;
  images: Array<{
    imageUrl: string;
    hostedImageUrl?: string;
    model: string;
    width: number;
    height: number;
    format?: string;
    sizeBytes?: number;
  }>;
};

type GenerateImageOutput = Awaited<ReturnType<typeof generateImage>>;

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
  moderation?: unknown;
  n?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  images?: unknown;
  historyNodeData?: unknown;
}

interface ImageJobParams {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  moderation?: string;
  n?: number;
  provider?: ImageApiProvider;
  apiKey?: string;
  images?: Array<{
    url: string;
    fileName?: string;
  }>;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeImageGenerationNodeData(
  value: unknown,
  effectivePrompt: string,
): ImageGenerationNodeData | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const referenceImages = Array.isArray(record.referenceImages)
    ? record.referenceImages.flatMap((image, index) => {
        if (typeof image !== "object" || image === null) {
          return [];
        }

        const imageRecord = image as Record<string, unknown>;
        const imageUrl = normalizeString(imageRecord.imageUrl);

        if (!imageUrl) {
          return [];
        }

        return [{
          id: normalizeString(imageRecord.id) ?? `history-reference-${index + 1}`,
          imageUrl,
          hostedImageUrl: normalizeString(imageRecord.hostedImageUrl),
          fileName: normalizeString(imageRecord.fileName),
          width: normalizeNumber(imageRecord.width),
          height: normalizeNumber(imageRecord.height),
          sizeBytes: normalizeNumber(imageRecord.sizeBytes),
        }];
      })
    : undefined;

  return {
    title: normalizeString(record.title) ?? "Image",
    prompt: getImageHistoryDisplayPrompt(record) || effectivePrompt,
    effectivePromptOverride: undefined,
    model: normalizeString(record.model),
    aspectRatio: normalizeString(record.aspectRatio),
    quality: normalizeString(record.quality),
    detail: normalizeString(record.detail),
    outputFormat: normalizeString(record.outputFormat),
    moderation: normalizeString(record.moderation),
    parallelCount: record.parallelCount === 2 || record.parallelCount === 4
      ? record.parallelCount
      : 1,
    referenceImageUrl: normalizeString(record.referenceImageUrl),
    referenceImages,
    status: "idle",
  };
}

function parseProvider(value: unknown): ImageApiProvider | undefined {
  if (value === "vibe" || value === "comfly" || value === "zhenzhen") {
    return value;
  }

  return undefined;
}

function isTransientComflyStatusReadError(error: unknown): boolean {
  return (
    error instanceof VibeApiError &&
    (error.status === 504 ||
      (error.status === 502 && error.message.includes("returned invalid JSON")))
  );
}

async function cleanupExpiredJobs() {
  await prisma.imageJob.deleteMany({
    where: {
      createdAt: {
        lt: new Date(Date.now() - IMAGE_JOB_RETENTION_MS),
      },
    },
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

function readUInt32BigEndian(buffer: Buffer, offset: number): number | undefined {
  if (offset + 4 > buffer.length) {
    return undefined;
  }

  return buffer.readUInt32BE(offset);
}

function readUInt16BigEndian(buffer: Buffer, offset: number): number | undefined {
  if (offset + 2 > buffer.length) {
    return undefined;
  }

  return buffer.readUInt16BE(offset);
}

function readUInt16LittleEndian(buffer: Buffer, offset: number): number | undefined {
  if (offset + 2 > buffer.length) {
    return undefined;
  }

  return buffer.readUInt16LE(offset);
}

function inferPngDimensions(buffer: Buffer):
  | { width: number; height: number }
  | undefined {
  const pngSignature = "89504e470d0a1a0a";

  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return undefined;
  }

  const width = readUInt32BigEndian(buffer, 16);
  const height = readUInt32BigEndian(buffer, 20);

  if (!width || !height) {
    return undefined;
  }

  return { width, height };
}

function inferGifDimensions(buffer: Buffer):
  | { width: number; height: number }
  | undefined {
  if (
    buffer.length < 10 ||
    (buffer.subarray(0, 6).toString("ascii") !== "GIF87a" &&
      buffer.subarray(0, 6).toString("ascii") !== "GIF89a")
  ) {
    return undefined;
  }

  const width = readUInt16LittleEndian(buffer, 6);
  const height = readUInt16LittleEndian(buffer, 8);

  if (!width || !height) {
    return undefined;
  }

  return { width, height };
}

function inferWebpDimensions(buffer: Buffer):
  | { width: number; height: number }
  | undefined {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return undefined;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    const width = readUInt16LittleEndian(buffer, 26);
    const height = readUInt16LittleEndian(buffer, 28);

    if (!width || !height) {
      return undefined;
    }

    return {
      width: width & 0x3fff,
      height: height & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return undefined;
}

function inferJpegDimensions(buffer: Buffer):
  | { width: number; height: number }
  | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = readUInt16BigEndian(buffer, offset + 2);

    if (!segmentLength || segmentLength < 2) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && offset + 9 <= buffer.length) {
      const height = readUInt16BigEndian(buffer, offset + 5);
      const width = readUInt16BigEndian(buffer, offset + 7);

      if (!width || !height) {
        return undefined;
      }

      return { width, height };
    }

    offset += 2 + segmentLength;
  }

  return undefined;
}

function inferImageDimensionsFromBuffer(buffer: Buffer):
  | { width: number; height: number }
  | undefined {
  return (
    inferPngDimensions(buffer) ||
    inferJpegDimensions(buffer) ||
    inferWebpDimensions(buffer) ||
    inferGifDimensions(buffer)
  );
}

function inferImageMetadata(imageUrl: string): {
  format?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
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
  const buffer = Buffer.from(base64Payload, "base64");
  const dimensions = inferImageDimensionsFromBuffer(buffer);

  return {
    format: match[1].toUpperCase(),
    sizeBytes: Math.max(
      0,
      Math.floor((base64Payload.length * 3) / 4) - paddingLength,
    ),
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

async function runImageJob(
  jobId: string,
  params: ImageJobParams,
) {
  try {
    const result = await generateImage(params);
    await completeImageJob(jobId, result);
  } catch (error) {
    const message =
      error instanceof VibeApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Internal error";

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: "error",
        error: message,
      },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistCompletedImageJob(
  jobId: string,
  result: ImageJobResult,
) {
  await prisma.imageJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: JSON.stringify(result),
      error: null,
    },
  });
}

async function persistImageHistoryItems(
  jobId: string,
  result: ImageJobResult,
) {
  const [job, existingCount] = await Promise.all([
    prisma.imageJob.findUnique({
      where: { id: jobId },
      select: { historyNodeData: true },
    }),
    prisma.imageHistoryItem.count({
      where: { imageJobId: jobId },
    }),
  ]);

  if (!job?.historyNodeData || existingCount > 0) {
    return;
  }

  let baseNodeData: ImageGenerationNodeData;

  try {
    baseNodeData = JSON.parse(job.historyNodeData) as ImageGenerationNodeData;
  } catch {
    return;
  }

  await Promise.all(
    result.images.map((image, index) => {
      const generatedAt = new Date();
      const nodeData: ImageGenerationNodeData = {
        ...baseNodeData,
        generatedImageUrl: image.imageUrl,
        generatedHostedImageUrl: image.hostedImageUrl,
        generatedImageWidth: image.width,
        generatedImageHeight: image.height,
        generatedImageFormat: image.format,
        generatedImageSizeBytes: image.sizeBytes,
        generatedModel: image.model,
        generatedAt: generatedAt.toISOString(),
        generationResults: [{
          status: "completed",
          imageUrl: image.imageUrl,
          hostedImageUrl: image.hostedImageUrl,
          model: image.model,
          width: image.width,
          height: image.height,
          format: image.format,
          sizeBytes: image.sizeBytes,
          generatedAt: generatedAt.toISOString(),
        }],
        status: "idle",
        errorMessage: undefined,
      };

      return prisma.imageHistoryItem.create({
        data: {
          imageJobId: jobId,
          resultIndex: index,
          imageUrl: image.imageUrl,
          hostedImageUrl: image.hostedImageUrl,
          model: image.model,
          width: image.width,
          height: image.height,
          format: image.format,
          sizeBytes: image.sizeBytes,
          generatedAt,
          nodeData: JSON.stringify(nodeData),
        },
      });
    }),
  );
}

async function readPersistedImageJobResult(
  jobId: string,
): Promise<ImageJobResult | undefined> {
  const job = await prisma.imageJob.findUnique({
    where: { id: jobId },
    select: { result: true },
  });

  if (!job?.result) {
    return undefined;
  }

  return parseImageJobResult(job.result);
}

function parseImageJobResult(result: string | null): ImageJobResult | undefined {
  if (!result) {
    return undefined;
  }

  try {
    return JSON.parse(result) as ImageJobResult;
  } catch {
    return undefined;
  }
}

function buildImageJobResult(
  result: GenerateImageOutput,
): ImageJobResult {
  return {
    model: result.model,
    images: result.images.map((image) => {
      const imageDataUrl = image.hostedImageUrl?.startsWith("data:")
        ? image.hostedImageUrl
        : image.imageUrl;
      const metadata = inferImageMetadata(imageDataUrl);

      return {
        imageUrl: image.imageUrl,
        hostedImageUrl: image.hostedImageUrl,
        model: image.model,
        width: metadata.width ?? image.width,
        height: metadata.height ?? image.height,
        format: metadata.format,
        sizeBytes: metadata.sizeBytes,
      };
    }),
  };
}

async function attachHostedImageUrlsToJob(
  jobId: string,
  result: ImageJobResult,
): Promise<ImageJobResult> {
  const images = await Promise.all(
    result.images.map(async (image, index) => {
      const imageDataUrl = image.hostedImageUrl?.startsWith("data:")
        ? image.hostedImageUrl
        : image.imageUrl;

      if (!imageDataUrl.startsWith("data:") || image.hostedImageUrl?.startsWith("/api/")) {
        return image;
      }

      const hostedImageUrl = await saveImageDataUrl(
        imageDataUrl,
        `generated-image-${jobId}-${index + 1}.png`,
      );

      return {
        ...image,
        hostedImageUrl,
      };
    }),
  );

  return {
    ...result,
    images,
  };
}

function hasUnhostedDataUrlImages(result: ImageJobResult): boolean {
  return result.images.some(
    (image) =>
      (image.imageUrl.startsWith("data:") || image.hostedImageUrl?.startsWith("data:")) &&
      !image.hostedImageUrl?.startsWith("/api/"),
  );
}

async function waitForHostedImageUrls(
  jobId: string,
  fallbackResult: ImageJobResult,
): Promise<ImageJobResult> {
  let latestResult = fallbackResult;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(150);

    const persistedResult = await readPersistedImageJobResult(jobId);

    if (!persistedResult) {
      continue;
    }

    latestResult = persistedResult;

    if (!hasUnhostedDataUrlImages(persistedResult)) {
      return persistedResult;
    }
  }

  return latestResult;
}

async function waitForPersistedHostedImageJobResult(
  jobId: string,
): Promise<ImageJobResult | undefined> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 60_000) {
    const persistedResult = await readPersistedImageJobResult(jobId);

    if (persistedResult && !hasUnhostedDataUrlImages(persistedResult)) {
      return persistedResult;
    }

    await sleep(500);
  }

  return undefined;
}

async function completeImageJob(
  jobId: string,
  result: GenerateImageOutput,
): Promise<ImageJobResult> {
  const baseResult = buildImageJobResult(result);
  const needsHostedImageUrl = hasUnhostedDataUrlImages(baseResult);

  if (needsHostedImageUrl) {
    const claimedJob = await prisma.imageJob.updateMany({
      where: {
        id: jobId,
        result: null,
        status: {
          not: "finalizing",
        },
      },
      data: {
        status: "finalizing",
        error: null,
      },
    });

    if (claimedJob.count === 0) {
      const persistedResult = await readPersistedImageJobResult(jobId);

      if (persistedResult) {
        const finalResult = hasUnhostedDataUrlImages(persistedResult)
          ? waitForHostedImageUrls(jobId, persistedResult)
          : persistedResult;

        await persistImageHistoryItems(jobId, await finalResult);
        return finalResult;
      }

      const finalizingResult = await waitForPersistedHostedImageJobResult(jobId);

      if (finalizingResult) {
        await persistImageHistoryItems(jobId, finalizingResult);
        return finalizingResult;
      }

      throw new VibeApiError(504, "Image result finalization timed out");
    }

    const enrichedResult = await attachHostedImageUrlsToJob(jobId, baseResult);
    await persistCompletedImageJob(jobId, enrichedResult);
    await persistImageHistoryItems(jobId, enrichedResult);

    return enrichedResult;
  }

  const claimedJob = await prisma.imageJob.updateMany({
    where: {
      id: jobId,
      result: null,
    },
    data: {
      status: "completed",
      result: JSON.stringify(baseResult),
      error: null,
    },
  });

  if (claimedJob.count === 0) {
    const persistedResult = await readPersistedImageJobResult(jobId);

    if (!persistedResult) {
      await persistCompletedImageJob(jobId, baseResult);
      await persistImageHistoryItems(jobId, baseResult);
      return baseResult;
    }

    const finalResult = hasUnhostedDataUrlImages(persistedResult)
      ? waitForHostedImageUrls(jobId, persistedResult)
      : persistedResult;

    await persistImageHistoryItems(jobId, await finalResult);
    return finalResult;
  }

  await persistImageHistoryItems(jobId, baseResult);
  return baseResult;
}

async function runComflyImageJob(jobId: string, params: ImageJobParams) {
  try {
    const provider = params.provider === "zhenzhen" ? "zhenzhen" : "comfly";
    const providerLabel = provider === "zhenzhen" ? "贞贞的AI工坊" : "Comfly";
    const submission = await submitComflyImageTask({
      ...params,
      provider,
    });

    await prisma.imageJob.update({
      where: { id: jobId },
      data: {
        provider,
        upstreamTaskId: submission.taskId,
      },
    });

    const startedAt = Date.now();

    while (Date.now() - startedAt < COMFLY_IMAGE_JOB_TIMEOUT_MS) {
      try {
        const task = await getComflyImageTaskResult({
          taskId: submission.taskId,
          apiKey: params.apiKey,
          model: params.model ?? submission.model,
          size: params.size,
          provider,
        });

        if (task.status === "completed") {
          await completeImageJob(jobId, task.result);
          return;
        }
      } catch (error) {
        if (!isTransientComflyStatusReadError(error)) {
          throw error;
        }
      }

      await sleep(COMFLY_IMAGE_JOB_POLL_INTERVAL_MS);
    }

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: "error",
        error: `${providerLabel} image generation timed out`,
      },
    });
  } catch (error) {
    const message =
      error instanceof VibeApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Internal error";

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: "error",
        error: message,
      },
    });
  }
}

async function tryResumePendingComflyJob(job: {
  id: string;
  provider: string | null;
  upstreamTaskId: string | null;
  result: string | null;
}, apiKey?: string): Promise<
  | { status: "pending" }
  | { status: "completed"; result: ImageJobResult }
  | { status: "error"; error: string }
> {
  if (job.result) {
    try {
      return {
        status: "completed",
        result: JSON.parse(job.result) as ImageJobResult,
      };
    } catch {
      return {
        status: "error",
        error: "Image job result is invalid",
      };
    }
  }

  if (!apiKey) {
    return { status: "pending" };
  }

  if (
    (job.provider !== "comfly" && job.provider !== "zhenzhen") ||
    !job.upstreamTaskId
  ) {
    return { status: "pending" };
  }

  try {
    const provider = job.provider;
    const task = await getComflyImageTaskResult({
      taskId: job.upstreamTaskId,
      apiKey,
      provider,
    });

    if (task.status === "pending") {
      return { status: "pending" };
    }

    const result = await completeImageJob(job.id, task.result);

    return {
      status: "completed",
      result,
    };
  } catch (error) {
    if (isTransientComflyStatusReadError(error)) {
      return { status: "pending" };
    }

    const message =
      error instanceof VibeApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Image generation failed";

    await prisma.imageJob.updateMany({
      where: { id: job.id, result: null },
      data: {
        status: "error",
        error: message,
      },
    });

    return {
      status: "error",
      error: message,
    };
  }
}

export async function POST(request: Request) {
  try {
    await cleanupExpiredJobs();

    const body = (await request.json()) as ImageRequestBody;

    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Prompt is required" },
        { status: 400 },
      );
    }

    const jobId = randomUUID();
    const provider = parseProvider(body.provider);
    const jobParams: ImageJobParams = {
      prompt: body.prompt.trim(),
      model: typeof body.model === "string" ? body.model : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      quality: typeof body.quality === "string" ? body.quality : undefined,
      outputFormat:
        typeof body.outputFormat === "string" ? body.outputFormat : undefined,
      moderation:
        typeof body.moderation === "string" ? body.moderation : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      provider,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      images: normalizeImages(body.images),
    };
    const historyNodeData = normalizeImageGenerationNodeData(
      body.historyNodeData,
      jobParams.prompt,
    );

    await prisma.imageJob.create({
      data: {
        id: jobId,
        status: "pending",
        provider: provider ?? null,
        historyNodeData: historyNodeData
          ? JSON.stringify(historyNodeData)
          : null,
      },
    });

    if (provider === "comfly" || provider === "zhenzhen") {
      void runComflyImageJob(jobId, jobParams);
    } else {
      void runImageJob(jobId, jobParams);
    }

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
  await cleanupExpiredJobs();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();
  const apiKey = searchParams.get("apiKey")?.trim() || undefined;

  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "jobId is required" },
      { status: 400 },
    );
  }

  const job = await prisma.imageJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Image job not found" },
      { status: 404 },
    );
  }

  const persistedResult = parseImageJobResult(job.result);

  if (persistedResult) {
    if (job.status !== "completed" || job.error) {
      await prisma.imageJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          error: null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status: "completed" satisfies ImageJobStatus,
      result: persistedResult,
    });
  }

  if (job.status === "pending") {
    const resumed = await tryResumePendingComflyJob(job, apiKey);

    if (resumed.status === "completed") {
      return NextResponse.json({
        ok: true,
        jobId,
        status: "completed" satisfies ImageJobStatus,
        result: resumed.result,
      });
    }

    if (resumed.status === "error") {
      return NextResponse.json({
        ok: true,
        jobId,
        status: "error" satisfies ImageJobStatus,
        error: resumed.error,
      });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  }

  if (job.status === "finalizing") {
    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  }

  if (job.status === "error") {
    if (
      !job.result &&
      (job.provider === "comfly" || job.provider === "zhenzhen") &&
      job.upstreamTaskId
    ) {
      const resumed = await tryResumePendingComflyJob(job, apiKey);

      if (resumed.status === "completed") {
        return NextResponse.json({
          ok: true,
          jobId,
          status: "completed" satisfies ImageJobStatus,
          result: resumed.result,
        });
      }

      if (resumed.status === "pending") {
        return NextResponse.json({
          ok: true,
          jobId,
          status: "pending" satisfies ImageJobStatus,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status: "error" satisfies ImageJobStatus,
      error: job.error || "Image generation failed",
    });
  }

  if (!job.result) {
    return NextResponse.json(
      { ok: false, error: "Image job result is missing" },
      { status: 500 },
    );
  }

  let result: ImageJobResult;

  try {
    result = JSON.parse(job.result) as ImageJobResult;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Image job result is invalid" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    jobId,
    status: "completed" satisfies ImageJobStatus,
    result,
  });
}
