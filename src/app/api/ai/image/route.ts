import { randomUUID } from "node:crypto";

import { after } from "next/server";
import { NextResponse } from "next/server";

import { saveImageDataUrl, saveRemoteImageUrl } from "@/lib/image-host";
import { getImageHistoryDisplayPrompt } from "@/lib/image-prompt";
import { prisma } from "@/lib/prisma";
import {
  getComflyImageTaskResult,
  getGrsaiImageTaskResult,
  getRunningHubImageTaskResult,
  submitComflyImageTask,
  submitGrsaiImageTask,
  submitRunningHubImageTask,
  VibeApiError,
  generateImage,
  type ImageApiProvider,
} from "@/lib/vibe";
import type { ImageGenerationNodeData } from "@/types/canvas";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_JOB_RETENTION_MS = 60 * 60_000;
const COMFLY_IMAGE_JOB_TIMEOUT_MS = 45 * 60_000;
const COMFLY_IMAGE_JOB_POLL_INTERVAL_MS = 1_000;
const IMAGE_TIMING_LOG_PREFIX = "[GenLink image timing]";
const NANO_IMAGE_SIZE_PRESETS = {
  "1K": {
    "1:1": "1024x1024",
    "1:4": "512x2064",
    "1:8": "352x2928",
    "2:3": "848x1264",
    "3:2": "1264x848",
    "3:4": "896x1200",
    "4:1": "2064x512",
    "4:3": "1200x896",
    "4:5": "928x1152",
    "5:4": "1152x928",
    "8:1": "2928x352",
    "9:16": "768x1376",
    "16:9": "1376x768",
    "21:9": "1584x672",
  },
  "2K": {
    "1:1": "2048x2048",
    "1:4": "1024x4128",
    "1:8": "704x5856",
    "2:3": "1696x2528",
    "3:2": "2528x1696",
    "3:4": "1792x2400",
    "4:1": "4128x1024",
    "4:3": "2400x1792",
    "4:5": "1856x2304",
    "5:4": "2304x1856",
    "8:1": "5856x704",
    "9:16": "1536x2752",
    "16:9": "2752x1536",
    "21:9": "3168x1344",
  },
  "4K": {
    "1:1": "4096x4096",
    "1:4": "2048x8256",
    "1:8": "1408x11712",
    "2:3": "3392x5056",
    "3:2": "5056x3392",
    "3:4": "3584x4800",
    "4:1": "8256x2048",
    "4:3": "4800x3584",
    "4:5": "3712x4608",
    "5:4": "4608x3712",
    "8:1": "11712x1408",
    "9:16": "3072x5504",
    "16:9": "5504x3072",
    "21:9": "6336x2688",
  },
} as const;

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

function logImageTiming(
  jobId: string,
  provider: ImageApiProvider | undefined,
  stage: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) {
  console.info(
    IMAGE_TIMING_LOG_PREFIX,
    JSON.stringify({
      jobId,
      provider: provider ?? "default",
      stage,
      durationMs: Date.now() - startedAt,
      ...(extra ?? {}),
    }),
  );
}

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
  moderation?: unknown;
  runningHubChannel?: unknown;
  runningHubWorkflowId?: unknown;
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
  runningHubChannel?: "official" | "low-cost";
  runningHubWorkflowId?: string;
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
          previewUrl: normalizeString(imageRecord.previewUrl),
          semanticImageUrl: normalizeString(imageRecord.semanticImageUrl),
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
    runningHubChannel:
      record.runningHubChannel === "low-cost" ? "low-cost" : "official",
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
  if (
    value === "vibe" ||
    value === "fucheers" ||
    value === "comfly" ||
    value === "zhenzhen" ||
    value === "runninghub" ||
    value === "grsai"
  ) {
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

function getImagesFromHistoryNodeData(
  historyNodeData: ImageGenerationNodeData | undefined,
): Array<{ url: string; fileName?: string }> | undefined {
  const images =
    historyNodeData?.referenceImages
      ?.map((image) => ({
        url: image.hostedImageUrl?.trim() || image.imageUrl.trim(),
        fileName: image.fileName,
      }))
      .filter((image) => image.url) ?? [];

  return images.length ? images : undefined;
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
  options: {
    cacheRemoteBeforeComplete?: boolean;
    deferHistoryPersistence?: boolean;
    finalizeDataUrlImages?: boolean;
  } = {},
) {
  try {
    const generateStartedAt = Date.now();
    const result = await generateImage(params);
    logImageTiming(jobId, params.provider, "generateImage", generateStartedAt, {
      images: result.images.length,
      hasDataUrl: result.images.some(
        (image) =>
          image.imageUrl.startsWith("data:") ||
          image.hostedImageUrl?.startsWith("data:"),
      ),
    });

    const completeStartedAt = Date.now();
    await completeImageJob(jobId, result, options);
    logImageTiming(jobId, params.provider, "completeImageJob", completeStartedAt);
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
  const startedAt = Date.now();
  await prisma.imageJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: JSON.stringify(result),
      error: null,
    },
  });
  logImageTiming(jobId, undefined, "persistCompletedImageJob", startedAt, {
    images: result.images.length,
  });
}

async function persistImageHistoryItems(
  jobId: string,
  result: ImageJobResult,
) {
  const startedAt = Date.now();
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

  logImageTiming(jobId, undefined, "persistImageHistoryItems", startedAt, {
    images: result.images.length,
  });
}

function persistImageHistoryItemsAfterResponse(
  jobId: string,
  result: ImageJobResult,
) {
  after(async () => {
    await persistImageHistoryItems(jobId, result);
  });
}

async function persistImageHistoryItemsForCompletion(
  jobId: string,
  result: ImageJobResult,
  defer: boolean,
) {
  if (defer) {
    persistImageHistoryItemsAfterResponse(jobId, result);
    return;
  }

  await persistImageHistoryItems(jobId, result);
}

async function cacheRemoteImageJobResult(
  jobId: string,
  result: ImageJobResult,
) {
  const cachedResult = await cacheRemoteImages(jobId, result);

  if (cachedResult === result) {
    return;
  }

  await persistCompletedImageJob(jobId, cachedResult);
  await persistImageHistoryItems(jobId, cachedResult);
}

function isAliyunOssUrl(value: string): boolean {
  try {
    return /\.aliyuncs\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

async function cacheRemoteImages(
  jobId: string,
  result: ImageJobResult,
): Promise<ImageJobResult> {
  const startedAt = Date.now();
  const remoteImages = result.images.filter(
    (image) => {
      const remoteUrl = image.hostedImageUrl || image.imageUrl;

      return (
        /^https?:\/\//i.test(remoteUrl) &&
        !remoteUrl.startsWith("/api/") &&
        !isAliyunOssUrl(remoteUrl)
      );
    },
  );

  if (remoteImages.length === 0) {
    logImageTiming(jobId, undefined, "cacheRemoteImages", startedAt, {
      remoteImages: 0,
    });
    return result;
  }

  const cachedImages = await Promise.all(
    result.images.map(async (image, index) => {
      const remoteUrl = image.hostedImageUrl || image.imageUrl;

      if (
        !/^https?:\/\//i.test(remoteUrl) ||
        remoteUrl.startsWith("/api/") ||
        isAliyunOssUrl(remoteUrl)
      ) {
        return image;
      }

      try {
        const hostedImageUrl = await saveRemoteImageUrl(
          remoteUrl,
          `generated-image-${jobId}-${index + 1}.png`,
          "generated",
        );

        return {
          ...image,
          hostedImageUrl,
        };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[GenLink image cache failed]",
            JSON.stringify({
              jobId,
              index: index + 1,
              host: new URL(remoteUrl).hostname,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown cache error",
            }),
          );
        }

        return image;
      }
    }),
  );

  const cachedResult: ImageJobResult = {
    ...result,
    images: cachedImages,
  };
  logImageTiming(jobId, undefined, "cacheRemoteImages", startedAt, {
    remoteImages: remoteImages.length,
    cachedImages: cachedImages.filter((image) => image.hostedImageUrl).length,
  });
  return cachedResult;
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

function parseImageJobHistoryNodeData(
  historyNodeData: string | null,
): ImageGenerationNodeData | undefined {
  if (!historyNodeData) {
    return undefined;
  }

  try {
    return JSON.parse(historyNodeData) as ImageGenerationNodeData;
  } catch {
    return undefined;
  }
}

function isGeminiImageModel(model?: string): boolean {
  return typeof model === "string" && /^nano-banana/i.test(model);
}

function shouldUseNanoImageSizePresets(
  provider: string | undefined,
  model?: string,
): boolean {
  if (provider === "runninghub") {
    return model === "nano-banana-pro" || model === "nano-banana-2";
  }

  return isGeminiImageModel(model);
}

function resolveNanoImageSizeFromHistory(
  quality: "1K" | "2K" | "4K",
  aspectRatio: string | undefined,
): string {
  const presets = NANO_IMAGE_SIZE_PRESETS[quality];

  if (
    aspectRatio &&
    Object.prototype.hasOwnProperty.call(presets, aspectRatio)
  ) {
    return presets[aspectRatio as keyof typeof presets];
  }

  return presets["1:1"];
}

function resolveImageJobSizeFromHistory(
  historyNodeData: ImageGenerationNodeData | undefined,
): string | undefined {
  const quality = historyNodeData?.quality;
  const aspectRatio = historyNodeData?.aspectRatio;
  const model = historyNodeData?.model;
  const provider = historyNodeData?.provider;
  const normalizedQuality = quality === "2K" || quality === "4K" ? quality : "1K";

  if (shouldUseNanoImageSizePresets(provider, model)) {
    return resolveNanoImageSizeFromHistory(
      normalizedQuality,
      aspectRatio,
    );
  }

  if (normalizedQuality === "4K") {
    if (aspectRatio === "16:9") return "3840x2160";
    if (aspectRatio === "9:16") return "2160x3840";
    if (aspectRatio === "4:3") return "3264x2448";
    if (aspectRatio === "3:4") return "2448x3264";
    if (aspectRatio === "3:2") return "3504x2336";
    if (aspectRatio === "2:3") return "2336x3504";
    if (aspectRatio === "5:4") return "3200x2560";
    if (aspectRatio === "4:5") return "2560x3200";
    if (aspectRatio === "2:1") return "3840x1920";
    if (aspectRatio === "21:9") return "3696x1584";
    if (aspectRatio === "9:21") return "1584x3696";
    return "2880x2880";
  }

  if (normalizedQuality === "2K") {
    if (aspectRatio === "16:9") return "2560x1440";
    if (aspectRatio === "9:16") return "1440x2560";
    if (aspectRatio === "4:3") return "2304x1728";
    if (aspectRatio === "3:4") return "1728x2304";
    if (aspectRatio === "3:2") return "2496x1664";
    if (aspectRatio === "2:3") return "1664x2496";
    if (aspectRatio === "5:4") return "2240x1792";
    if (aspectRatio === "4:5") return "1792x2240";
    if (aspectRatio === "2:1") return "2880x1440";
    if (aspectRatio === "21:9") return "3024x1296";
    if (aspectRatio === "9:21") return "1296x3024";
    return "2048x2048";
  }

  if (aspectRatio === "16:9") return "1280x720";
  if (aspectRatio === "9:16") return "720x1280";
  if (aspectRatio === "4:3") return "1152x864";
  if (aspectRatio === "3:4") return "864x1152";
  if (aspectRatio === "3:2") return "1248x832";
  if (aspectRatio === "2:3") return "832x1248";
  if (aspectRatio === "5:4") return "1120x896";
  if (aspectRatio === "4:5") return "896x1120";
  if (aspectRatio === "2:1") return "1440x720";
  if (aspectRatio === "21:9") return "1456x624";
  if (aspectRatio === "9:21") return "624x1456";

  return "1024x1024";
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
  options: {
    cacheRemoteBeforeComplete?: boolean;
    deferHistoryPersistence?: boolean;
    finalizeDataUrlImages?: boolean;
  } = {},
): Promise<ImageJobResult> {
  const initialResult = buildImageJobResult(result);
  const baseResult = options.cacheRemoteBeforeComplete
    ? await cacheRemoteImages(jobId, initialResult)
    : initialResult;
  const needsHostedImageUrl = hasUnhostedDataUrlImages(baseResult);

  if (needsHostedImageUrl && options.finalizeDataUrlImages !== false) {
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

        const resolvedFinalResult = await finalResult;
        await persistImageHistoryItemsForCompletion(
          jobId,
          resolvedFinalResult,
          Boolean(options.deferHistoryPersistence),
        );
        return resolvedFinalResult;
      }

      const finalizingResult = await waitForPersistedHostedImageJobResult(jobId);

      if (finalizingResult) {
        await persistImageHistoryItemsForCompletion(
          jobId,
          finalizingResult,
          Boolean(options.deferHistoryPersistence),
        );
        return finalizingResult;
      }

      throw new VibeApiError(504, "Image result finalization timed out");
    }

    const enrichedResult = await attachHostedImageUrlsToJob(jobId, baseResult);
    await persistCompletedImageJob(jobId, enrichedResult);
    await persistImageHistoryItemsForCompletion(
      jobId,
      enrichedResult,
      Boolean(options.deferHistoryPersistence),
    );

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
      await persistImageHistoryItemsForCompletion(
        jobId,
        baseResult,
        Boolean(options.deferHistoryPersistence),
      );
      after(async () => { await cacheRemoteImageJobResult(jobId, baseResult); });
      return baseResult;
    }

    const finalResult = hasUnhostedDataUrlImages(persistedResult)
      ? waitForHostedImageUrls(jobId, persistedResult)
      : persistedResult;

    const resolvedFinalResult = await finalResult;
    await persistImageHistoryItemsForCompletion(
      jobId,
      resolvedFinalResult,
      Boolean(options.deferHistoryPersistence),
    );
    return resolvedFinalResult;
  }

  await persistImageHistoryItemsForCompletion(
    jobId,
    baseResult,
    Boolean(options.deferHistoryPersistence),
  );
  after(async () => { await cacheRemoteImageJobResult(jobId, baseResult); });
  return baseResult;
}

async function submitComflyJob(jobId: string, params: ImageJobParams) {
  const provider: "comfly" | "zhenzhen" = params.provider === "zhenzhen" ? "zhenzhen" : "comfly";
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

  return { provider, taskId: submission.taskId, model: submission.model };
}

async function submitRunningHubJob(jobId: string, params: ImageJobParams) {
  const submission = await submitRunningHubImageTask({
    ...params,
    provider: "runninghub",
  });

  await prisma.imageJob.update({
    where: { id: jobId },
    data: {
      provider: "runninghub",
      upstreamTaskId: submission.taskId,
    },
  });

  return { taskId: submission.taskId, model: submission.model };
}

async function submitGrsaiJob(jobId: string, params: ImageJobParams) {
  const submission = await submitGrsaiImageTask({
    ...params,
    provider: "grsai",
  });

  await prisma.imageJob.update({
    where: { id: jobId },
    data: {
      provider: "grsai",
      upstreamTaskId: submission.taskId,
    },
  });

  return { taskId: submission.taskId, model: submission.model };
}

async function pollComflyImageJob(
  jobId: string,
  params: ImageJobParams,
  taskId: string,
  model: string,
  provider: "comfly" | "zhenzhen",
) {
  try {
    const providerLabel = provider === "zhenzhen" ? "贞贞的AI工坊" : "Comfly";
    const startedAt = Date.now();

    while (Date.now() - startedAt < COMFLY_IMAGE_JOB_TIMEOUT_MS) {
      try {
        const task = await getComflyImageTaskResult({
          taskId,
          apiKey: params.apiKey,
          model: params.model ?? model,
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

async function pollRunningHubImageJob(
  jobId: string,
  params: ImageJobParams,
  taskId: string,
  model: string,
) {
  try {
    const startedAt = Date.now();

    while (Date.now() - startedAt < COMFLY_IMAGE_JOB_TIMEOUT_MS) {
      const task = await getRunningHubImageTaskResult({
        taskId,
        apiKey: params.apiKey,
        model: params.model ?? model,
        size: params.size,
      });

      if (task.status === "completed") {
        await completeImageJob(jobId, task.result);
        return;
      }

      await sleep(COMFLY_IMAGE_JOB_POLL_INTERVAL_MS);
    }

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: "error",
        error: "RunningHub image generation timed out",
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

async function pollGrsaiImageJob(
  jobId: string,
  params: ImageJobParams,
  taskId: string,
  model: string,
) {
  try {
    const startedAt = Date.now();

    while (Date.now() - startedAt < COMFLY_IMAGE_JOB_TIMEOUT_MS) {
      const task = await getGrsaiImageTaskResult({
        taskId,
        apiKey: params.apiKey,
        model: params.model ?? model,
        size: params.size,
      });

      if (task.status === "completed") {
        await completeImageJob(jobId, task.result, {
          cacheRemoteBeforeComplete: true,
        });
        return;
      }

      await sleep(COMFLY_IMAGE_JOB_POLL_INTERVAL_MS);
    }

    await prisma.imageJob.updateMany({
      where: { id: jobId, result: null },
      data: {
        status: "error",
        error: "Grsai image generation timed out",
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
  historyNodeData: string | null;
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
    job.provider !== "comfly" &&
    job.provider !== "zhenzhen" &&
    job.provider !== "runninghub" &&
    job.provider !== "grsai"
  ) {
    return { status: "pending" };
  }

  if (!job.upstreamTaskId) {
    return { status: "pending" };
  }

  try {
    const historyNodeData = parseImageJobHistoryNodeData(job.historyNodeData);
    const size = resolveImageJobSizeFromHistory(historyNodeData);
    const task =
      job.provider === "runninghub"
        ? await getRunningHubImageTaskResult({
            taskId: job.upstreamTaskId,
            apiKey,
            model: historyNodeData?.model,
            size,
          })
        : job.provider === "grsai"
          ? await getGrsaiImageTaskResult({
              taskId: job.upstreamTaskId,
              apiKey,
              model: historyNodeData?.model,
              size,
            })
        : await getComflyImageTaskResult({
            taskId: job.upstreamTaskId,
            apiKey,
            model: historyNodeData?.model,
            size,
            provider: job.provider,
          });

    if (task.status === "pending") {
      return { status: "pending" };
    }

    const result = await completeImageJob(job.id, task.result, {
      cacheRemoteBeforeComplete: job.provider === "grsai",
    });

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
    const requestImages = normalizeImages(body.images);
    const historyNodeData = normalizeImageGenerationNodeData(
      body.historyNodeData,
      body.prompt.trim(),
    );
    const jobParams: ImageJobParams = {
      prompt: body.prompt.trim(),
      model: typeof body.model === "string" ? body.model : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      quality: typeof body.quality === "string" ? body.quality : undefined,
      outputFormat:
        typeof body.outputFormat === "string" ? body.outputFormat : undefined,
      moderation:
        typeof body.moderation === "string" ? body.moderation : undefined,
      runningHubChannel:
        body.runningHubChannel === "low-cost" ? "low-cost" : "official",
      runningHubWorkflowId:
        typeof body.runningHubWorkflowId === "string"
          ? body.runningHubWorkflowId.trim() || undefined
          : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      provider,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      images: requestImages ?? getImagesFromHistoryNodeData(historyNodeData),
    };

    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[GenLink image request]",
        JSON.stringify({
          provider,
          model: jobParams.model,
          images: jobParams.images?.length ?? 0,
          imageUrlTypes: jobParams.images?.map((image) => {
            const url = image.url.trim();

            if (url.startsWith("data:")) return "data";
            if (url.startsWith("/")) return "local";
            if (/^https?:\/\//i.test(url)) return new URL(url).hostname;
            return "other";
          }),
        }),
      );
    }

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

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[GenLink image] job=${jobId} provider=${provider ?? "default"} branch=${
          provider === "runninghub"
            ? "runninghub"
            : provider === "grsai"
              ? "grsai"
            : provider === "comfly" || provider === "zhenzhen"
              ? "comfly-compatible"
              : "vibe-compatible"
        }`,
      );
    }

    const isGeminiModel = jobParams.model && /^gemini-/i.test(jobParams.model);

    if (provider === "runninghub") {
      const submission = await submitRunningHubJob(jobId, jobParams);
      after(async () => {
        await pollRunningHubImageJob(
          jobId,
          jobParams,
          submission.taskId,
          submission.model,
        );
      });
    } else if (provider === "grsai") {
      const submission = await submitGrsaiJob(jobId, jobParams);
      after(async () => {
        await pollGrsaiImageJob(
          jobId,
          jobParams,
          submission.taskId,
          submission.model,
        );
      });
    } else if ((provider === "comfly" || provider === "zhenzhen") && !isGeminiModel) {
      const submission = await submitComflyJob(jobId, jobParams);
      after(async () => {
        await pollComflyImageJob(
          jobId,
          jobParams,
          submission.taskId,
          submission.model,
          submission.provider,
        );
      });
    } else {
      await runImageJob(jobId, jobParams, {
        cacheRemoteBeforeComplete: provider === "fucheers",
        deferHistoryPersistence: provider === "fucheers",
        finalizeDataUrlImages: provider !== "fucheers",
      });
      const completedJob = await prisma.imageJob.findUnique({
        where: { id: jobId },
        select: { status: true, result: true, error: true },
      });
      const result = parseImageJobResult(completedJob?.result ?? null);

      if (result) {
        return NextResponse.json({
          ok: true,
          jobId,
          status: "completed" satisfies ImageJobStatus,
          result,
        });
      }

      return NextResponse.json({
        ok: true,
        jobId,
        status: "error" satisfies ImageJobStatus,
        error:
          completedJob?.error ||
          "Image generation failed before a result was returned",
      });
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

    const jobAgeMs = Date.now() - new Date(job.createdAt).getTime();
    const STALE_JOB_TIMEOUT_MS = 5 * 60_000;

    if (
      jobAgeMs > STALE_JOB_TIMEOUT_MS &&
      job.provider !== "comfly" &&
      job.provider !== "zhenzhen" &&
      job.provider !== "runninghub" &&
      job.provider !== "grsai"
    ) {
      const errorMsg = "Image generation timed out (server may have restarted)";
      await prisma.imageJob.updateMany({
        where: { id: jobId, result: null },
        data: { status: "error", error: errorMsg },
      });
      return NextResponse.json({
        ok: true,
        jobId,
        status: "error" satisfies ImageJobStatus,
        error: errorMsg,
      });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  }

  if (job.status === "finalizing") {
    const finalizingAgeMs = Date.now() - new Date(job.updatedAt).getTime();
    const FINALIZE_TIMEOUT_MS = 8 * 60_000;

    if (finalizingAgeMs > FINALIZE_TIMEOUT_MS) {
      const errorMsg = "Image finalization timed out";
      await prisma.imageJob.updateMany({
        where: { id: jobId, result: null },
        data: { status: "error", error: errorMsg },
      });
      return NextResponse.json({
        ok: true,
        jobId,
        status: "error" satisfies ImageJobStatus,
        error: errorMsg,
      });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status: "pending" satisfies ImageJobStatus,
    });
  }

  if (job.status === "error") {
    if (
      !job.result &&
      (job.provider === "comfly" ||
        job.provider === "zhenzhen" ||
        job.provider === "runninghub" ||
        job.provider === "grsai") &&
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
