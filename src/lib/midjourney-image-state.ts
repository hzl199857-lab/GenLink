import type {
  ImageGenerationNodeData,
  ImageGenerationResultItem,
  MidjourneyImageMetadata,
  MidjourneyQuadrant,
} from "../types/canvas";

export type MidjourneyImageApiResult = {
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
  midjourney?: MidjourneyImageMetadata;
};

function toResultItem(
  result: MidjourneyImageApiResult,
  generatedAt: string,
): ImageGenerationResultItem {
  const image = result.images[0];

  if (!image) {
    throw new Error("Midjourney 未返回图片结果");
  }

  return {
    status: "completed",
    imageUrl: image.imageUrl,
    hostedImageUrl: image.hostedImageUrl,
    model: image.model,
    width: image.width,
    height: image.height,
    format: image.format,
    sizeBytes: image.sizeBytes,
    generatedAt,
  };
}

function applyPrimaryResult(
  data: ImageGenerationNodeData,
  item: ImageGenerationResultItem,
): ImageGenerationNodeData {
  return {
    ...data,
    generatedImageUrl: item.imageUrl,
    generatedHostedImageUrl: item.hostedImageUrl,
    generatedImageWidth: item.width,
    generatedImageHeight: item.height,
    generatedImageFormat: item.format,
    generatedImageSizeBytes: item.sizeBytes,
    generatedModel: item.model,
    generatedAt: item.generatedAt,
  };
}

export function applyMidjourneyGridResult(
  data: ImageGenerationNodeData,
  result: MidjourneyImageApiResult,
  generatedAt: string,
): ImageGenerationNodeData {
  const item = toResultItem(result, generatedAt);

  return applyPrimaryResult({
    ...data,
    generationResults: [item],
    midjourney: result.midjourney
      ? {
          ...result.midjourney,
          gridImageUrl: item.imageUrl,
          gridHostedImageUrl: item.hostedImageUrl,
        }
      : undefined,
    status: "idle",
    errorMessage: undefined,
  }, item);
}

export function startMidjourneyUpscale(
  data: ImageGenerationNodeData,
  quadrant: MidjourneyQuadrant,
  pendingJobId?: string,
): ImageGenerationNodeData {
  if (data.midjourney?.kind !== "grid" || !data.midjourney.actions?.[quadrant]) {
    throw new Error("该图片没有可用的 Midjourney 高清操作");
  }

  return {
    ...data,
    midjourney: {
      ...data.midjourney,
      gridImageUrl: data.midjourney.gridImageUrl ?? data.generatedImageUrl,
      gridHostedImageUrl:
        data.midjourney.gridHostedImageUrl ?? data.generatedHostedImageUrl,
      pendingQuadrant: quadrant,
      pendingJobId,
    },
    status: "generating",
    errorMessage: undefined,
  };
}

export function applyMidjourneyUpscaleResult(
  data: ImageGenerationNodeData,
  result: MidjourneyImageApiResult,
  generatedAt: string,
): ImageGenerationNodeData {
  const item = toResultItem(result, generatedAt);
  const gridResults = (data.generationResults ?? []).filter((candidate) =>
    candidate.imageUrl === data.midjourney?.gridImageUrl ||
    candidate.hostedImageUrl === data.midjourney?.gridHostedImageUrl
  );
  const midjourney = result.midjourney
    ? {
        ...result.midjourney,
        gridImageUrl: result.midjourney.gridImageUrl ?? data.midjourney?.gridImageUrl,
        gridHostedImageUrl:
          result.midjourney.gridHostedImageUrl ?? data.midjourney?.gridHostedImageUrl,
        pendingQuadrant: undefined,
        pendingJobId: undefined,
      }
    : undefined;

  return applyPrimaryResult({
    ...data,
    generationResults: [...gridResults, item],
    midjourney,
    status: "idle",
    errorMessage: undefined,
  }, item);
}

export function failMidjourneyUpscale(
  data: ImageGenerationNodeData,
  message: string,
): ImageGenerationNodeData {
  return {
    ...data,
    midjourney: data.midjourney
      ? {
          ...data.midjourney,
          pendingQuadrant: undefined,
          pendingJobId: undefined,
        }
      : undefined,
    status: "error",
    errorMessage: message,
  };
}
