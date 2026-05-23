"use client";

import { create } from "zustand";

import { stripImagePromptSectionLabels } from "@/lib/image-prompt";
import { buildProjectSnapshot, getProjectSnapshotSignature } from "@/lib/project-snapshot";
import {
  deleteProjectDirectory,
  duplicateProjectDirectory,
  hydrateProjectSnapshotPreviewUrls,
  listProjectLibrary,
  loadProjectSnapshot as loadProjectSnapshotFromDisk,
  persistGeneratedOutput,
  readProjectHistory,
  revokeObjectUrls,
  stripEmbeddedImageDataFromNodeData,
  type ProjectHandleRecord,
  renameProjectDirectory,
  saveProjectSnapshot,
} from "@/lib/project-storage";
import type {
  AITextResultNodeData,
  CanvasEdge,
  CanvasNode,
  ImageGenerationResultItem,
  ImageGenerationNodeData,
  ImageNodeData,
  NodeGroup,
  NodeType,
  ProjectOutputHistoryItem,
  ProjectSnapshot,
  TextNodeData,
  UploadedImageNodeData,
} from "@/types/canvas";

type ApiErrorResponse = {
  ok: false;
  error: string;
};

type ImageJobPollResponse =
  | ApiErrorResponse
  | {
      ok: true;
      jobId: string;
      status: "pending";
    }
  | {
      ok: true;
      jobId: string;
      status: "error";
      error: string;
    }
  | {
      ok: true;
      jobId: string;
      status: "completed";
      result: {
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
    };

type ImageGenerationRunResult = {
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

type SplitGridDimension = 2 | 3 | 5;

const inFlightImageGenerationNodeIds = new Set<string>();
const IMAGE_GENERATION_NODE_STAGE_WIDTH = 540;
const IMAGE_GENERATION_NODE_MIN_EDGE = 220;
const IMAGE_JOB_POLL_TIMEOUT_MS = 45 * 60_000;
const IMAGE_JOB_POLL_INTERVAL_MS = 1_000;
const IMAGE_JOB_POLL_REQUEST_TIMEOUT_MS = 30_000;
const REFERENCE_IMAGE_UPLOAD_MODE =
  process.env.NEXT_PUBLIC_REFERENCE_IMAGE_UPLOAD_MODE?.trim().toLowerCase();
const SHOULD_UPLOAD_REFERENCE_IMAGES_TO_OSS =
  REFERENCE_IMAGE_UPLOAD_MODE === "oss";
const SPLIT_OUTPUT_GROUP_GAP = 48;
const SPLIT_OUTPUT_TILE_GAP = 12;
const UPLOADED_IMAGE_NODE_HEADER_HEIGHT = 40;

function resolveParallelCount(value?: number): 1 | 2 | 4 {
  return value === 2 || value === 4 ? value : 1;
}

export type ApiProvider = "vibe" | "fucheers" | "comfly" | "zhenzhen";
export type ApiModelKind = "text" | "image";

export type StoredApiSettings = {
  textProvider: ApiProvider;
  imageProvider: ApiProvider;
  textApiKeys: Record<ApiProvider, string>;
  imageApiKeys: Record<ApiProvider, string>;
};

const DEFAULT_API_PROVIDER: ApiProvider = "vibe";
const API_PROVIDER_LABELS: Record<ApiProvider, string> = {
  vibe: "VibeAPI",
  fucheers: "Fucheers API",
  comfly: "Comfly",
  zhenzhen: "贞贞的AI工坊",
};

export const CANVAS_TEXT_API_PROVIDER_STORAGE_KEY = "genlink.textApiProvider";
export const CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY = "genlink.imageApiProvider";
export const CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY = "genlink.vibeTextApiKey";
export const CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY = "genlink.fucheersTextApiKey";
export const CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY = "genlink.comflyTextApiKey";
export const CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY = "genlink.zhenzhenTextApiKey";
export const CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY = "genlink.vibeImageApiKey";
export const CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY = "genlink.fucheersImageApiKey";
export const CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY = "genlink.comflyImageApiKey";
export const CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY = "genlink.zhenzhenImageApiKey";

function readStoredValue(storageKey: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(storageKey)?.trim() ?? "";
}

export function normalizeApiProvider(value?: string): ApiProvider {
  switch (value?.trim().toLowerCase()) {
    case "comfly":
      return "comfly";
    case "fucheers":
      return "fucheers";
    case "zhenzhen":
      return "zhenzhen";
    default:
      return DEFAULT_API_PROVIDER;
  }
}

export function getApiProviderLabel(provider: ApiProvider): string {
  return API_PROVIDER_LABELS[provider];
}

function getApiProviderStorageKey(kind: ApiModelKind): string {
  return kind === "text"
    ? CANVAS_TEXT_API_PROVIDER_STORAGE_KEY
    : CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY;
}

function getApiKeyStorageKey(kind: ApiModelKind, provider: ApiProvider): string {
  if (kind === "text") {
    switch (provider) {
      case "comfly":
        return CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY;
      case "fucheers":
        return CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY;
      case "zhenzhen":
        return CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY;
      default:
        return CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY;
    }
  }

  switch (provider) {
    case "comfly":
      return CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY;
    case "fucheers":
      return CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY;
    case "zhenzhen":
      return CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY;
    default:
      return CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY;
  }
}

export function readStoredSelectedApiProvider(kind: ApiModelKind): ApiProvider {
  return normalizeApiProvider(readStoredValue(getApiProviderStorageKey(kind)));
}

export function readStoredApiKey(
  kind: ApiModelKind,
  provider: ApiProvider,
): string {
  return readStoredValue(getApiKeyStorageKey(kind, provider));
}

export function readStoredApiSettings(): StoredApiSettings {
  return {
    textProvider: readStoredSelectedApiProvider("text"),
    imageProvider: readStoredSelectedApiProvider("image"),
    textApiKeys: {
      vibe: readStoredApiKey("text", "vibe"),
      fucheers: readStoredApiKey("text", "fucheers"),
      comfly: readStoredApiKey("text", "comfly"),
      zhenzhen: readStoredApiKey("text", "zhenzhen"),
    },
    imageApiKeys: {
      vibe: readStoredApiKey("image", "vibe"),
      fucheers: readStoredApiKey("image", "fucheers"),
      comfly: readStoredApiKey("image", "comfly"),
      zhenzhen: readStoredApiKey("image", "zhenzhen"),
    },
  };
}

function assertStoredApiKey(kind: ApiModelKind, provider: ApiProvider): string {
  const apiKey = readStoredApiKey(kind, provider);

  if (!apiKey) {
    throw new Error(
      `请先在 API 设置中配置${kind === "text" ? "语言模型" : "图像模型"}的 ${getApiProviderLabel(provider)} API Key`,
    );
  }

  return apiKey;
}

type AiTextStreamEvent =
  | {
      type: "delta";
      delta?: string;
    }
  | {
      type: "done";
      result?: {
        content: string;
        model: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }
  | {
      type: "error";
      error?: string;
    };

type ConnectedImagePayload = {
  id: string;
  imageUrl: string;
  previewUrl: string;
  originalImageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  alt: string;
  sourceType: "image" | "uploaded_image" | "inline_reference";
  width?: number;
  height?: number;
};

const TEXT_SYSTEM_PROMPT =
  "Only output the final result. Do not include extra commentary. If there are multiple possible results, return just one.";

const IMAGE_SIZE_PRESETS = {
  "1K": {
    "1:1": "1024x1024",
    "16:9": "1280x720",
    "9:16": "720x1280",
    "4:3": "1152x864",
    "3:4": "864x1152",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "5:4": "1120x896",
    "4:5": "896x1120",
    "21:9": "1456x624",
    "9:21": "624x1456",
  },
  "2K": {
    "1:1": "2048x2048",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "5:4": "2240x1792",
    "4:5": "1792x2240",
    "21:9": "3024x1296",
    "9:21": "1296x3024",
  },
  "4K": {
    "1:1": "2880x2880",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "4:3": "3264x2448",
    "3:4": "2448x3264",
    "3:2": "3504x2336",
    "2:3": "2336x3504",
    "5:4": "3200x2560",
    "4:5": "2560x3200",
    "21:9": "3696x1584",
    "9:21": "1584x3696",
  },
} as const;

const GEMINI_IMAGE_SIZE_PRESETS = {
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

const SUPPORTED_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "21:9",
  "9:21",
] as const;
const GEMINI_SUPPORTED_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

type SupportedImageAspectRatio = (typeof SUPPORTED_IMAGE_ASPECT_RATIOS)[number];
type GeminiSupportedImageAspectRatio =
  (typeof GEMINI_SUPPORTED_IMAGE_ASPECT_RATIOS)[number];

function nowIso(): string {
  return new Date().toISOString();
}

function isClaudeModel(model?: string): boolean {
  return typeof model === "string" && /^claude-/i.test(model);
}

function isGeminiImageModel(model?: string): boolean {
  return typeof model === "string" && /^nano-banana/i.test(model);
}

function createTextNodeData(): TextNodeData {
  return {
    title: "Text",
    text: "",
    model: "gpt-5.4",
    status: "idle",
  };
}

function createImageGenerationNodeData(): ImageGenerationNodeData {
  return {
    title: "Image",
    prompt: "",
    model: "gpt-image-2",
    aspectRatio: "auto",
    quality: "1K",
    detail: "medium",
    outputFormat: "png",
    moderation: "auto",
    parallelCount: 1,
    status: "idle",
  };
}

function createAITextResultNodeData(): AITextResultNodeData {
  return {
    title: "AI Text Result",
    content: "",
    model: "",
    generatedAt: nowIso(),
  };
}

function createImageNodeData(): ImageNodeData {
  return {
    title: "Image",
    imageUrl: "",
    prompt: "",
    generatedAt: nowIso(),
  };
}

function createUploadedImageNodeData(): UploadedImageNodeData {
  return {
    title: "image",
    imageUrl: "",
    width: 320,
    height: 320,
  };
}

function sanitizeSplitNodeTitle(value?: string): string {
  const title = value?.trim();
  return title ? title : "image";
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load source image"));
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

async function createOssUploadTarget(params: {
  fileName?: string;
  contentType: string;
  folder?: string;
}): Promise<{
  uploadUrl: string;
  imageUrl: string;
  headers?: Record<string, string>;
}> {
  const response = await fetch("/api/image-hosting/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await readJsonResponse<
    | {
        ok: true;
        result: {
          uploadUrl: string;
          imageUrl: string;
          headers?: Record<string, string>;
        };
      }
    | ApiErrorResponse
  >(response, "Failed to create image upload URL");

  if (!response.ok || !json.ok) {
    throw new Error("error" in json ? json.error : "Failed to create image upload URL");
  }

  return json.result;
}

async function uploadReferenceBlobToOss(
  blob: Blob,
  fileName?: string,
): Promise<string> {
  const target = await createOssUploadTarget({
    fileName,
    contentType: blob.type || "image/png",
    folder: "references",
  });
  const response = await fetch(target.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": blob.type || "image/png",
      ...(target.headers ?? {}),
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload reference image (${response.status})`);
  }

  return target.imageUrl;
}

async function normalizeReferenceImageViaOss(image: {
  imageUrl: string;
  fileName?: string;
}): Promise<{
  url: string;
  fileName?: string;
}> {
  const url = image.imageUrl.trim();

  if (isAliyunOssUrl(url)) {
    return {
      url,
      fileName: image.fileName,
    };
  }

  if (url.startsWith("data:") || isObjectUrl(url) || isSameOriginUrl(url)) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to read reference image");
    }

    return {
      url: await uploadReferenceBlobToOss(await response.blob(), image.fileName),
      fileName: image.fileName,
    };
  }

  return {
    url,
    fileName: image.fileName,
  };
}

async function normalizeReferenceImagesViaOss(
  images: ConnectedImagePayload[],
): Promise<Array<{ url: string; fileName?: string }>> {
  const uploadCache = new Map<string, Promise<{ url: string; fileName?: string }>>();
  const requestImages: Array<{ url: string; fileName?: string }> = [];
  const seenRequestUrls = new Set<string>();

  for (const image of images) {
    const cacheKey =
      image.hostedImageUrl?.trim() ||
      image.originalImageUrl?.trim() ||
      image.imageUrl.trim();
    const normalizedPromise =
      uploadCache.get(cacheKey) ??
      normalizeReferenceImageViaOss({
        imageUrl: image.imageUrl,
        fileName: image.fileName,
      });

    uploadCache.set(cacheKey, normalizedPromise);

    const normalized = await normalizedPromise;
    const requestUrl = normalized.url.trim();

    if (!requestUrl || seenRequestUrls.has(requestUrl)) {
      continue;
    }

    seenRequestUrls.add(requestUrl);
    requestImages.push(normalized);
  }

  return requestImages;
}

function normalizeReferenceImagesForRequest(
  images: ConnectedImagePayload[],
): Array<{ url: string; fileName?: string }> {
  const requestImages: Array<{ url: string; fileName?: string }> = [];
  const seenRequestUrls = new Set<string>();

  for (const image of images) {
    const requestUrl = image.imageUrl.trim();

    if (!requestUrl || seenRequestUrls.has(requestUrl)) {
      continue;
    }

    seenRequestUrls.add(requestUrl);
    requestImages.push({
      url: requestUrl,
      fileName: image.fileName,
    });
  }

  return requestImages;
}

function getImageGenerationPreviewDimensions(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const safeWidth = Math.max(sourceWidth, 1);
  const safeHeight = Math.max(sourceHeight, 1);
  const aspectRatio = safeWidth / safeHeight;

  if (aspectRatio >= 1) {
    return {
      width: IMAGE_GENERATION_NODE_STAGE_WIDTH,
      height: Math.max(
        IMAGE_GENERATION_NODE_MIN_EDGE,
        Math.round(IMAGE_GENERATION_NODE_STAGE_WIDTH / aspectRatio),
      ),
    };
  }

  return {
    width: Math.max(
      IMAGE_GENERATION_NODE_MIN_EDGE,
      Math.round(IMAGE_GENERATION_NODE_STAGE_WIDTH * aspectRatio),
    ),
    height: IMAGE_GENERATION_NODE_STAGE_WIDTH,
  };
}

function getSplitDisplaySizeMatchingPreview(
  sourceWidth: number,
  sourceHeight: number,
): { cardWidth: number; cardHeight: number; totalHeight: number } {
  const preview = getImageGenerationPreviewDimensions(sourceWidth, sourceHeight);

  return {
    cardWidth: preview.width,
    cardHeight: preview.height,
    totalHeight: UPLOADED_IMAGE_NODE_HEADER_HEIGHT + preview.height,
  };
}

function getGridSegmentLengths(total: number, segments: number): number[] {
  const lengths: number[] = [];
  let offset = 0;

  for (let index = 0; index < segments; index += 1) {
    const nextOffset =
      index === segments - 1 ? total : offset + Math.floor(total / segments);
    lengths.push(nextOffset - offset);
    offset = nextOffset;
  }

  return lengths;
}

function createNode(type: NodeType, position: { x: number; y: number }): CanvasNode {
  switch (type) {
    case "text":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createTextNodeData(),
      };
    case "ai_text_result":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createAITextResultNodeData(),
      };
    case "image_generation":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createImageGenerationNodeData(),
      };
    case "image":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createImageNodeData(),
      };
    case "uploaded_image":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createUploadedImageNodeData(),
      };
  }
}

function createSnapshot(state: {
  projectId: string | null;
  projectName: string;
  projectCreatedAt?: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
}): ProjectSnapshot {
  return buildProjectSnapshot({
    id: state.projectId ?? crypto.randomUUID(),
    name: state.projectName,
    nodes: sanitizeNodesForPersistence(state.nodes),
    edges: state.edges,
    groups: state.groups,
    createdAt: state.projectCreatedAt ?? undefined,
    updatedAt: nowIso(),
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : null;

    if (message?.trim()) {
      return message;
    }
  }

  return "Internal error";
}

function toProjectOutputSaveErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);

  if (
    message === "Failed to fetch" ||
    message === "Failed to read generated image" ||
    message === "Failed to read hosted generated image"
  ) {
    return "\u56fe\u7247\u5df2\u751f\u6210\uff0c\u4f46\u4fdd\u5b58\u5230\u9879\u76ee\u5386\u53f2\u5931\u8d25\uff1a\u65e0\u6cd5\u8bfb\u53d6\u751f\u6210\u56fe\u7247";
  }

  return `\u56fe\u7247\u5df2\u751f\u6210\uff0c\u4f46\u4fdd\u5b58\u5230\u9879\u76ee\u5386\u53f2\u5931\u8d25\uff1a${message}`;
}

function toResponseTextErrorMessage(text: string, fallback: string): string {
  const normalized = text.trim();

  if (/request entity too large/i.test(normalized)) {
    return "参考图过大，云端拒绝了请求。请减少参考图数量或压缩后重试。";
  }

  if (/<(?:!doctype|html|script|body|head)\b/i.test(normalized)) {
    return `${fallback}: upstream returned an HTML error page`;
  }

  return normalized.slice(0, 500) || fallback;
}

async function readJsonResponse<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(toResponseTextErrorMessage(text, fallbackError));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isObjectUrl(value?: string): boolean {
  return typeof value === "string" && value.startsWith("blob:");
}

function isSameOriginUrl(value: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URL(value, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isAliyunOssUrl(value: string): boolean {
  try {
    return /\.aliyuncs\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function getReferenceImageDebugLabel(url: string): string {
  if (url.startsWith("data:")) return "data";
  if (isObjectUrl(url)) return "blob";
  if (isAliyunOssUrl(url)) return "oss";
  if (isSameOriginUrl(url)) return "same-origin";

  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}

function sanitizeImageGenerationNodeDataForPersistence(
  data: ImageGenerationNodeData,
): ImageGenerationNodeData {
  return stripEmbeddedImageDataFromNodeData(data);
}

function sanitizeNodesForPersistence(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => {
    if (node.type !== "image_generation") {
      return node;
    }

    return {
      ...node,
      data: sanitizeImageGenerationNodeDataForPersistence(node.data),
    };
  });
}

function collectPreviewUrlsFromNodes(nodes: CanvasNode[]): string[] {
  const urls = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "image_generation") {
      continue;
    }

    if (isObjectUrl(node.data.generatedHostedImageUrl)) {
      urls.add(node.data.generatedHostedImageUrl as string);
    }

    for (const result of node.data.generationResults ?? []) {
      if (isObjectUrl(result.hostedImageUrl)) {
        urls.add(result.hostedImageUrl as string);
      }
    }
  }

  return [...urls];
}

function computeDirtyState(state: {
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  lastSavedSignature: string;
}): boolean {
  const currentSignature = getProjectSnapshotSignature({
    name: state.projectName,
    nodes: state.nodes,
    edges: state.edges,
    groups: state.groups,
  });

  return currentSignature !== state.lastSavedSignature;
}

async function pollImageGenerationJob(
  jobId: string,
  apiKey?: string,
): Promise<Extract<ImageJobPollResponse, { ok: true; status: "completed" }>["result"]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < IMAGE_JOB_POLL_TIMEOUT_MS) {
    const query = new URLSearchParams({ jobId });

    if (apiKey?.trim()) {
      query.set("apiKey", apiKey.trim());
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      IMAGE_JOB_POLL_REQUEST_TIMEOUT_MS,
    );

    try {
      response = await fetch(`/api/ai/image?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      await sleep(IMAGE_JOB_POLL_INTERVAL_MS);
      continue;
    } finally {
      window.clearTimeout(timeout);
    }

    const json = await readJsonResponse<ImageJobPollResponse>(
      response,
      "Image polling failed",
    );

    if (!response.ok || ("ok" in json && json.ok === false)) {
      throw new Error("error" in json ? json.error : "Image polling failed");
    }

    if (json.status === "completed") {
      return json.result;
    }

    if (json.status === "error") {
      throw new Error(json.error || "Image generation failed");
    }

    await sleep(IMAGE_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("Image generation polling timed out");
}

async function submitImageGenerationJob(params: {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  moderation?: string;
  apiKey?: string;
  provider?: ApiProvider;
  historyNodeData?: ImageGenerationNodeData;
  images?: Array<{
    url: string;
    fileName?: string;
  }>;
}): Promise<ImageGenerationRunResult> {
  const response = await fetch("/api/ai/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await readJsonResponse<
    | {
        ok: true;
        jobId: string;
        status: "pending";
      }
    | {
        ok: true;
        jobId: string;
        status: "completed";
        result: ImageGenerationRunResult;
      }
    | {
        ok: true;
        jobId: string;
        status: "error";
        error?: string;
      }
    | ApiErrorResponse
  >(response, "Image generation request failed");

  if (!response.ok || !("ok" in json) || json.ok === false) {
    throw new Error("error" in json ? json.error : "Request failed");
  }

  if (json.status === "completed") {
    return json.result;
  }

  if (json.status === "error") {
    throw new Error(json.error || "Image generation failed");
  }

  return pollImageGenerationJob(json.jobId, params.apiKey);
}

function resolveImageApiQuality(detail?: string): "low" | "medium" | "high" {
  if (detail === "low" || detail === "high") {
    return detail;
  }

  return "medium";
}

function resolveImageApiOutputFormat(
  outputFormat?: string,
): "png" | "jpeg" | "webp" {
  if (outputFormat === "jpeg" || outputFormat === "webp") {
    return outputFormat;
  }

  return "png";
}

function resolveImageApiModeration(moderation?: string): "auto" | "low" {
  if (moderation === "low") {
    return "low";
  }

  return "auto";
}

function resolveNearestAspectRatio(
  width?: number,
  height?: number,
): SupportedImageAspectRatio {
  if (!width || !height || width <= 0 || height <= 0) {
    return "1:1";
  }

  const ratio = width / height;
  let best: SupportedImageAspectRatio = SUPPORTED_IMAGE_ASPECT_RATIOS[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of SUPPORTED_IMAGE_ASPECT_RATIOS) {
    const [w, h] = option.split(":").map(Number);
    const delta = Math.abs(ratio - w / h);

    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }

  return best;
}

function resolveNearestGeminiAspectRatio(
  width?: number,
  height?: number,
): GeminiSupportedImageAspectRatio {
  if (!width || !height || width <= 0 || height <= 0) {
    return "1:1";
  }

  const ratio = width / height;
  let best: GeminiSupportedImageAspectRatio = GEMINI_SUPPORTED_IMAGE_ASPECT_RATIOS[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of GEMINI_SUPPORTED_IMAGE_ASPECT_RATIOS) {
    const [w, h] = option.split(":").map(Number);
    const delta = Math.abs(ratio - w / h);

    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }

  return best;
}

function resolveImageSize(
  sizeTier: string | undefined,
  aspectRatio: string | undefined,
  connectedImages: ConnectedImagePayload[],
  model?: string,
): string {
  const normalizedSizeTier =
    sizeTier === "2K" || sizeTier === "4K" ? sizeTier : "1K";

  if (isGeminiImageModel(model)) {
    const presets = GEMINI_IMAGE_SIZE_PRESETS[normalizedSizeTier];

    if (aspectRatio === "auto") {
      const primaryImage = connectedImages[0];

      if (!primaryImage) {
        return presets["1:1"];
      }

      return presets[
        resolveNearestGeminiAspectRatio(primaryImage.width, primaryImage.height)
      ];
    }

    if (
      aspectRatio &&
      Object.prototype.hasOwnProperty.call(presets, aspectRatio)
    ) {
      return presets[aspectRatio as keyof typeof presets];
    }

    return presets["1:1"];
  }

  const presets = IMAGE_SIZE_PRESETS[normalizedSizeTier];

  if (aspectRatio === "auto") {
    const primaryImage = connectedImages[0];

    if (!primaryImage) {
      return "auto";
    }

    return presets[
      resolveNearestAspectRatio(primaryImage.width, primaryImage.height)
    ];
  }

  if (
    aspectRatio &&
    Object.prototype.hasOwnProperty.call(presets, aspectRatio)
  ) {
    return presets[aspectRatio as keyof typeof presets];
  }

  return presets["1:1"];
}

async function readTextStreamResponse(
  response: Response,
  handlers: {
    onDelta?: (delta: string) => void;
  } = {},
): Promise<NonNullable<Extract<AiTextStreamEvent, { type: "done" }>["result"]>> {
  if (!response.ok) {
    const text = await response.text();

    try {
      const json = JSON.parse(text) as ApiErrorResponse;
      throw new Error(json.error || "Request failed");
    } catch {
      throw new Error(text || "Request failed");
    }
  }

  if (!response.body) {
    throw new Error("Stream response body is missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult:
    | NonNullable<Extract<AiTextStreamEvent, { type: "done" }>["result"]>
    | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");

        if (separatorIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length === 0) {
          continue;
        }

        const event = JSON.parse(dataLines.join("\n")) as AiTextStreamEvent;

        if (event.type === "delta") {
          handlers.onDelta?.(event.delta ?? "");
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.error || "Text stream failed");
        }

        if (event.type === "done" && event.result) {
          finalResult = event.result;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    throw new Error("Stream ended before the final result was received");
  }

  return finalResult;
}

function setTextNodeStatus(
  nodes: CanvasNode[],
  textNodeId: string,
  status: NonNullable<TextNodeData["status"]>,
  errorMessage?: string,
): CanvasNode[] {
  return nodes.map((node) =>
    node.id === textNodeId && node.type === "text"
      ? {
          ...node,
          data: {
            ...node.data,
            status,
            errorMessage,
          },
        }
      : node,
  );
}

function getConnectedImagesForTargetNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): ConnectedImagePayload[] {
  const connectedSourceIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.source);

  return connectedSourceIds.reduce<ConnectedImagePayload[]>((acc, sourceId) => {
    const sourceNode = nodes.find((node) => node.id === sourceId);

    if (!sourceNode) {
      return acc;
    }

    if (sourceNode.type === "uploaded_image") {
      if (!sourceNode.data.imageUrl.trim()) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl:
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        previewUrl: sourceNode.data.imageUrl,
        originalImageUrl: sourceNode.data.imageUrl,
        hostedImageUrl: sourceNode.data.hostedImageUrl?.trim() || undefined,
        fileName: sourceNode.data.fileName,
        alt: sourceNode.data.fileName?.trim() || "Connected image",
        sourceType: "uploaded_image",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
      });
      return acc;
    }

    if (sourceNode.type === "image") {
      if (!sourceNode.data.imageUrl.trim()) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl:
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        previewUrl:
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        originalImageUrl: sourceNode.data.imageUrl,
        hostedImageUrl: sourceNode.data.hostedImageUrl?.trim() || undefined,
        fileName: undefined,
        alt: sourceNode.data.prompt?.trim() || "Generated image",
        sourceType: "image",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
      });
      return acc;
    }

    if (sourceNode.type === "image_generation") {
      const requestUrl =
        sourceNode.data.generatedImageUrl?.trim() ||
        sourceNode.data.generatedHostedImageUrl?.trim() ||
        "";
      const previewUrl =
        sourceNode.data.generatedHostedImageUrl?.trim() ||
        sourceNode.data.generatedImageUrl?.trim() ||
        "";

      if (!requestUrl || !previewUrl) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        imageUrl: requestUrl,
        previewUrl,
        originalImageUrl: requestUrl,
        hostedImageUrl: sourceNode.data.generatedHostedImageUrl?.trim() || undefined,
        alt: sourceNode.data.prompt?.trim() || "Generated image",
        sourceType: "image",
        width: sourceNode.data.generatedImageWidth,
        height: sourceNode.data.generatedImageHeight,
      });
      return acc;
    }

    return acc;
  }, []);
}

function getInlineReferenceImagesForImageGenerationNode(
  node: Extract<CanvasNode, { type: "image_generation" }>,
): ConnectedImagePayload[] {
  return (node.data.referenceImages ?? []).reduce<ConnectedImagePayload[]>(
    (acc, image, index) => {
      if (!image.imageUrl.trim()) {
        return acc;
      }

      acc.push({
        id: image.id || `${node.id}-reference-${index}`,
        imageUrl: image.hostedImageUrl?.trim() || image.imageUrl,
        previewUrl: image.imageUrl,
        originalImageUrl: image.imageUrl,
        hostedImageUrl: image.hostedImageUrl?.trim() || undefined,
        fileName: image.fileName,
        alt: image.fileName?.trim() || `Reference image ${index + 1}`,
        sourceType: "inline_reference",
        width: image.width,
        height: image.height,
      });
      return acc;
    },
    [],
  );
}

function getGeneratedImageReferenceForImageGenerationNode(
  node: Extract<CanvasNode, { type: "image_generation" }>,
): ConnectedImagePayload[] {
  const requestUrl =
    node.data.generatedImageUrl?.trim() ||
    node.data.generatedHostedImageUrl?.trim() ||
    "";
  const previewUrl =
    node.data.generatedHostedImageUrl?.trim() ||
    node.data.generatedImageUrl?.trim() ||
    "";

  if (!requestUrl || !previewUrl) {
    return [];
  }

  return [
    {
      id: `${node.id}-generated-reference`,
      imageUrl: requestUrl,
      previewUrl,
      originalImageUrl: requestUrl,
      hostedImageUrl: node.data.generatedHostedImageUrl?.trim() || undefined,
      fileName: node.data.generatedOutputFileName,
      alt: node.data.prompt?.trim() || "Generated image",
      sourceType: "image",
      width: node.data.generatedImageWidth,
      height: node.data.generatedImageHeight,
    },
  ];
}

function appendImageGenerationNodeResults(
  nodes: CanvasNode[],
  imageGenerationNodeId: string,
  results: ImageGenerationResultItem[],
): CanvasNode[] {
  return nodes.map((node) => {
    if (node.id !== imageGenerationNodeId || node.type !== "image_generation") {
      return node;
    }

    const generationResults = [...(node.data.generationResults ?? [])];

    for (const result of results) {
      const existingIndex = generationResults.findIndex(
        (item) =>
          item.generatedAt === result.generatedAt &&
          item.imageUrl === result.imageUrl &&
          item.model === result.model,
      );

      if (existingIndex >= 0) {
        generationResults[existingIndex] = {
          ...generationResults[existingIndex],
          ...result,
        };
      } else {
        generationResults.push(result);
      }
    }

    const currentImageUrl = node.data.generatedImageUrl?.trim() || "";
    const firstCompletedResult = generationResults.find(
      (item) => item.status === "completed" && item.imageUrl?.trim(),
    );
    const shouldSetPrimaryImage =
      !currentImageUrl && Boolean(firstCompletedResult?.imageUrl?.trim());

    return {
      ...node,
      data: {
        ...node.data,
        generationResults,
        ...(shouldSetPrimaryImage && firstCompletedResult
          ? {
              generatedImageUrl: firstCompletedResult.imageUrl,
              generatedHostedImageUrl: firstCompletedResult.hostedImageUrl,
              generatedImageWidth: firstCompletedResult.width,
              generatedImageHeight: firstCompletedResult.height,
              generatedImageFormat: firstCompletedResult.format,
              generatedImageSizeBytes: firstCompletedResult.sizeBytes,
              generatedModel: firstCompletedResult.model,
              generatedAt: firstCompletedResult.generatedAt,
            }
          : {}),
      },
    };
  });
}

function getImageGenerationReferenceImages(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  imageGenerationNodeId: string,
): ConnectedImagePayload[] {
  const imageGenerationNode = nodes.find(
    (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
      node.id === imageGenerationNodeId && node.type === "image_generation",
  );

  if (!imageGenerationNode) {
    return [];
  }

  return [
    ...getInlineReferenceImagesForImageGenerationNode(imageGenerationNode),
    ...getConnectedImagesForTargetNode(nodes, edges, imageGenerationNodeId),
  ];
}

function getConnectedTextPromptForTargetNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): string {
  const connectedSourceIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.source);

  const promptSections = connectedSourceIds.reduce<string[]>((acc, sourceId) => {
    const sourceNode = nodes.find((node) => node.id === sourceId);

    if (!sourceNode || sourceNode.type !== "text") {
      return acc;
    }

    const text = sourceNode.data.text?.trim();

    if (!text) {
      return acc;
    }

    acc.push(text);
    return acc;
  }, []);

  return promptSections.join("\n\n");
}

export interface CanvasState {
  projectId: string | null;
  projectName: string;
  projectCreatedAt: string | null;
  currentProject: ProjectHandleRecord | null;
  currentProjectPreviewUrls: string[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  loading: boolean;
  error: string | null;
  dirty: boolean;
  lastSavedAt: string | null;
  lastSavedSignature: string;
  saveMessage: string | null;

  addNode: (node: CanvasNode) => void;
  addNodes: (nodes: CanvasNode[]) => void;
  addNodeAtCenter: (
    type: NodeType,
    viewportCenter: { x: number; y: number },
  ) => CanvasNode;
  updateNodeData: <T extends NodeType>(
    id: string,
    partial: Partial<Extract<CanvasNode, { type: T }>["data"]>,
  ) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;
  createGroup: (nodeIds: string[], bounds: { x: number; y: number; width: number; height: number }) => NodeGroup;
  deleteGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string | undefined) => void;
  updateGroupBackgroundColor: (groupId: string, backgroundColor: string | undefined) => void;
  removeNodeFromGroup: (groupId: string, nodeId: string) => void;
  updateGroupBounds: (groupId: string, bounds: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  moveGroup: (groupId: string, dx: number, dy: number) => void;

  generateTextFromTextNode: (textNodeId: string) => Promise<void>;
  generateImageFromImageGenerationNode: (
    imageGenerationNodeId: string,
    promptOverride?: string,
  ) => Promise<void>;
  splitImageGenerationNodeToGrid: (
    imageGenerationNodeId: string,
    dimension: SplitGridDimension,
  ) => Promise<void>;
  cropImageGenerationNode: (
    imageGenerationNodeId: string,
    cropRect: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
  splitUploadedImageNodeToGrid: (
    nodeId: string,
    dimension: SplitGridDimension,
  ) => Promise<void>;
  cropUploadedImageNode: (
    nodeId: string,
    cropRect: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
  getConnectedImagesForTextNode: (textNodeId: string) => ConnectedImagePayload[];
  getConnectedImagesForImageGenerationNode: (
    imageGenerationNodeId: string,
  ) => ConnectedImagePayload[];

  setProjectName: (name: string) => void;
  setSaveMessage: (message: string | null) => void;
  markCleanFromSnapshot: (snapshot: ProjectSnapshot) => void;
  newProject: (name?: string) => void;
  saveProject: () => Promise<ProjectSnapshot>;
  loadProject: (project: ProjectHandleRecord) => Promise<void>;
  listProjects: () => Promise<ProjectHandleRecord[]>;
  deleteProject: (project: ProjectHandleRecord) => Promise<void>;
  renameProject: (
    project: ProjectHandleRecord,
    nextName: string,
  ) => Promise<ProjectHandleRecord>;
  duplicateProject: (
    project: ProjectHandleRecord,
  ) => Promise<ProjectHandleRecord>;
  attachProject: (project: ProjectHandleRecord, snapshot: ProjectSnapshot) => void;
  persistProjectOutput: (params: {
    sourceKey: string;
    imageUrl: string;
    fileName?: string;
    generatedAt: string;
    nodeData: ImageGenerationNodeData;
    title?: string;
    model?: string;
    width?: number;
    height?: number;
    format?: string;
    sizeBytes?: number;
  }) => Promise<void>;
  listCurrentProjectHistory: () => Promise<ProjectOutputHistoryItem[]>;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  projectName: "Untitled",
  projectCreatedAt: null,
  currentProject: null,
  currentProjectPreviewUrls: [],
  nodes: [],
  edges: [],
  groups: [],
  loading: false,
  error: null,
  dirty: false,
  lastSavedAt: null,
  lastSavedSignature: getProjectSnapshotSignature({
    name: "Untitled",
    nodes: [],
    edges: [],
    groups: [],
  }),
  saveMessage: null,

  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
      dirty: true,
      error: null,
    }));
  },

  addNodes: (nodes) => {
    if (nodes.length === 0) {
      return;
    }

    set((state) => ({
      nodes: [...state.nodes, ...nodes],
      dirty: true,
      error: null,
    }));
  },

  addNodeAtCenter: (type, viewportCenter) => {
    const node = createNode(type, viewportCenter);
    set((state) => ({
      nodes: [...state.nodes, node],
      dirty: true,
      error: null,
    }));
    return node;
  },

  updateNodeData: (id, partial) => {
    set((state) => {
      const index = state.nodes.findIndex((node) => node.id === id);

      if (index < 0) {
        console.warn(`Node "${id}" not found for updateNodeData`);
        return state;
      }

      const currentNode = state.nodes[index];
      const nextData = { ...currentNode.data, ...partial };
      const currentDataRecord = currentNode.data as Record<string, unknown>;
      const nextDataRecord = nextData as Record<string, unknown>;
      let changed = false;

      for (const key of Object.keys(partial) as Array<keyof typeof partial>) {
        const stringKey = String(key);

        if (currentDataRecord[stringKey] !== nextDataRecord[stringKey]) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return state;
      }

      const nextNode = { ...currentNode, data: nextData } as CanvasNode;
      const nodes = state.nodes.slice();
      nodes[index] = nextNode;

      return {
        nodes,
        dirty: true,
      };
    });
  },

  updateNodePosition: (id, position) => {
    set((state) => {
      const index = state.nodes.findIndex((node) => node.id === id);

      if (index < 0) {
        return state;
      }

      const currentNode = state.nodes[index];

      if (
        currentNode.position.x === position.x &&
        currentNode.position.y === position.y
      ) {
        return state;
      }

      const nodes = state.nodes.slice();
      nodes[index] = { ...currentNode, position };

      return {
        nodes,
        dirty: true,
      };
    });
  },

  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge) => edge.source !== id && edge.target !== id,
      ),
      groups: state.groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((nid) => nid !== id) }))
        .filter((g) => g.nodeIds.length > 0),
      dirty: true,
    }));
  },

  deleteNodes: (ids) => {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);

    set((state) => ({
      nodes: state.nodes.filter((node) => !idSet.has(node.id)),
      edges: state.edges.filter(
        (edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
      ),
      groups: state.groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((nid) => !idSet.has(nid)) }))
        .filter((g) => g.nodeIds.length > 0),
      dirty: true,
    }));
  },

  addEdge: (edge) => {
    set((state) => ({
      edges: [...state.edges, edge],
      dirty: true,
      error: null,
    }));
  },

  deleteEdge: (id) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== id),
      dirty: true,
    }));
  },

  createGroup: (nodeIds, bounds) => {
    const group: NodeGroup = {
      id: crypto.randomUUID(),
      nodeIds: [...nodeIds],
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    set((state) => ({ groups: [...state.groups, group], dirty: true }));
    return group;
  },

  deleteGroup: (groupId) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      dirty: true,
    }));
  },

  renameGroup: (groupId, name) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      ),
      dirty: true,
    }));
  },

  updateGroupBackgroundColor: (groupId, backgroundColor) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, backgroundColor } : g,
      ),
      dirty: true,
    }));
  },

  removeNodeFromGroup: (groupId, nodeId) => {
    set((state) => ({
      groups: state.groups
        .map((g) =>
          g.id === groupId
            ? { ...g, nodeIds: g.nodeIds.filter((id) => id !== nodeId) }
            : g,
        )
        .filter((g) => g.nodeIds.length >= 1),
      dirty: true,
    }));
  },

  updateGroupBounds: (groupId, bounds) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, ...bounds } : g,
      ),
      dirty: true,
    }));
  },

  moveGroup: (groupId, dx, dy) => {
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return {};
      const updatedGroups = state.groups.map((g) =>
        g.id === groupId ? { ...g, x: g.x + dx, y: g.y + dy } : g,
      );
      const updatedNodes = state.nodes.map((n) =>
        group.nodeIds.includes(n.id)
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          : n,
      );
      return { groups: updatedGroups, nodes: updatedNodes, dirty: true };
    });
  },

  generateTextFromTextNode: async (textNodeId) => {
    const state = get();
    const textNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "text" }> =>
        node.id === textNodeId && node.type === "text",
    );

    if (!textNode) {
      throw new Error("Text node not found");
    }

    if (!textNode.data.aiPrompt?.trim()) {
      throw new Error("Prompt is required");
    }

    const connectedImages = getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      textNodeId,
    );

    const promptSections = [
      textNode.data.text?.trim()
        ? `Current text content:\n${textNode.data.text.trim()}`
        : "",
      textNode.data.aiPrompt?.trim()
        ? `Task instructions:\n${textNode.data.aiPrompt.trim()}`
        : "",
      `Please produce a fresh variation that differs from previous results. Change the angle, wording, details, or composition. Random seed: ${crypto.randomUUID()}`,
    ].filter(Boolean);

    set((state) => ({
      error: null,
      dirty: true,
      nodes: state.nodes.map((node) =>
        node.id === textNodeId && node.type === "text"
          ? {
              ...node,
              data: {
                ...node.data,
                text: "",
                status: "generating",
                errorMessage: undefined,
              },
            }
          : node,
      ),
    }));

    try {
      const textProvider = readStoredSelectedApiProvider("text");
      const apiKey = assertStoredApiKey("text", textProvider);
      const response = await fetch("/api/ai/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptSections.join("\n\n"),
          model: textNode.data.model,
          systemPrompt: TEXT_SYSTEM_PROMPT,
          temperature: 0.9,
          provider: textProvider,
          apiKey,
          images: connectedImages.map((image) => ({
            url: isClaudeModel(textNode.data.model)
              ? image.originalImageUrl
              : image.imageUrl,
          })),
          stream: true,
        }),
      });

      let streamedText = "";
      const result = await readTextStreamResponse(response, {
        onDelta: (delta) => {
          streamedText += delta;

          set((currentState) => ({
            dirty: true,
            nodes: currentState.nodes.map((node) =>
              node.id === textNodeId && node.type === "text"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      text: streamedText,
                      status: "generating",
                      errorMessage: undefined,
                    },
                  }
                : node,
            ),
          }));
        },
      });

      set((state) => ({
        error: null,
        dirty: true,
        nodes: setTextNodeStatus(
          state.nodes.map((node) =>
            node.id === textNodeId && node.type === "text"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    text: result.content,
                    model: result.model,
                  },
                }
              : node,
          ),
          textNodeId,
          "idle",
        ),
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((state) => ({
        error: message,
        dirty: true,
        nodes: setTextNodeStatus(state.nodes, textNodeId, "error", message),
      }));
    }
  },

  setProjectName: (name) => {
    set((state) => ({
      projectName: name,
      dirty: computeDirtyState({
        projectName: name,
        nodes: state.nodes,
        edges: state.edges,
        groups: state.groups,
        lastSavedSignature: state.lastSavedSignature,
      }),
      error: null,
    }));
  },

  setSaveMessage: (message) => {
    set({ saveMessage: message });
  },

  markCleanFromSnapshot: (snapshot) => {
    set({
      projectId: snapshot.id,
      projectName: snapshot.name,
      projectCreatedAt: snapshot.createdAt,
      lastSavedAt: snapshot.updatedAt,
      lastSavedSignature: getProjectSnapshotSignature(snapshot),
      dirty: false,
    });
  },

  getConnectedImagesForTextNode: (textNodeId) => {
    const state = get();
    return getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      textNodeId,
    );
  },

  generateImageFromImageGenerationNode: async (imageGenerationNodeId, promptOverride) => {
    const state = get();
    const imageGenerationNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
        node.id === imageGenerationNodeId && node.type === "image_generation",
    );

    if (!imageGenerationNode) {
      throw new Error("Image generation node not found");
    }

    if (imageGenerationNode.data.status === "generating") {
      return;
    }

    if (inFlightImageGenerationNodeIds.has(imageGenerationNodeId)) {
      return;
    }

    inFlightImageGenerationNodeIds.add(imageGenerationNodeId);

    try {
      const latestState = get();
      const latestImageGenerationNode = latestState.nodes.find(
        (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
          node.id === imageGenerationNodeId && node.type === "image_generation",
      );

      if (!latestImageGenerationNode) {
        throw new Error("Image generation node not found");
      }

      const connectedTextPrompt = getConnectedTextPromptForTargetNode(
        latestState.nodes,
        latestState.edges,
        imageGenerationNodeId,
      );
      const normalizedPromptOverride = promptOverride?.trim();
      const directPrompt =
        normalizedPromptOverride || latestImageGenerationNode.data.prompt?.trim() || "";
      const effectivePrompt = [
        connectedTextPrompt
          ? `Upstream text node content:\n${connectedTextPrompt}`
          : "",
        directPrompt
          ? `Additional image instructions:\n${directPrompt}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!effectivePrompt) {
        throw new Error("Prompt is required");
      }

      const connectedImages = getImageGenerationReferenceImages(
        latestState.nodes,
        latestState.edges,
        imageGenerationNodeId,
      );
      const selfGeneratedReferences = normalizedPromptOverride
        ? getGeneratedImageReferenceForImageGenerationNode(latestImageGenerationNode)
        : [];
      const referenceImages = [
        ...connectedImages,
        ...selfGeneratedReferences,
      ];
      const requestImages =
        referenceImages.length > 0
          ? SHOULD_UPLOAD_REFERENCE_IMAGES_TO_OSS
            ? await normalizeReferenceImagesViaOss(referenceImages)
            : normalizeReferenceImagesForRequest(referenceImages)
          : undefined;

      if (SHOULD_UPLOAD_REFERENCE_IMAGES_TO_OSS && requestImages?.length) {
        console.info(
          "[GenLink] reference images for API",
          requestImages.map((image, index) => ({
            index: index + 1,
            type: getReferenceImageDebugLabel(image.url),
            url: image.url,
          })),
        );
      }

      const size = resolveImageSize(
        latestImageGenerationNode.data.quality,
        latestImageGenerationNode.data.aspectRatio,
        referenceImages,
        latestImageGenerationNode.data.model,
      );
      const quality = resolveImageApiQuality(
        latestImageGenerationNode.data.detail,
      );
      const outputFormat = resolveImageApiOutputFormat(
        latestImageGenerationNode.data.outputFormat,
      );
      const moderation = resolveImageApiModeration(
        latestImageGenerationNode.data.moderation,
      );
      const parallelCount = resolveParallelCount(
        latestImageGenerationNode.data.parallelCount,
      );
      const imageProvider = readStoredSelectedApiProvider("image");
      const apiKey = assertStoredApiKey("image", imageProvider);
      const baseJobParams = {
        prompt: effectivePrompt,
        model: latestImageGenerationNode.data.model,
        size,
        quality,
        outputFormat,
        moderation,
        provider: imageProvider,
        apiKey,
        images: requestImages,
      };
      const historyDisplayPrompt = directPrompt
        ? stripImagePromptSectionLabels(directPrompt)
        : stripImagePromptSectionLabels(effectivePrompt);
      const historyNodeData: ImageGenerationNodeData = {
        ...latestImageGenerationNode.data,
        prompt: historyDisplayPrompt,
        effectivePromptOverride: undefined,
        referenceImages: referenceImages.map((image, index) => {
          const requestImageUrl = requestImages?.[index]?.url || image.hostedImageUrl || image.imageUrl;

          return {
            id: image.id,
            imageUrl: requestImageUrl,
            hostedImageUrl: requestImageUrl,
            fileName: image.fileName,
            width: image.width,
            height: image.height,
          };
        }),
        generatedImageUrl: undefined,
        generatedHostedImageUrl: undefined,
        generatedImageWidth: undefined,
        generatedImageHeight: undefined,
        generatedImageFormat: undefined,
        generatedImageSizeBytes: undefined,
        generatedModel: undefined,
        generatedAt: undefined,
        generationResults: undefined,
        status: "idle",
        errorMessage: undefined,
      };

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === imageGenerationNodeId && node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  generatedImageUrl: undefined,
                  generatedHostedImageUrl: undefined,
                  generatedImageWidth: undefined,
                  generatedImageHeight: undefined,
                  generatedImageFormat: undefined,
                  generatedImageSizeBytes: undefined,
                  generatedModel: undefined,
                  generatedAt: undefined,
                  generationResults: undefined,
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const jobRuns = Array.from({ length: parallelCount }, async () => {
        try {
          const result = await submitImageGenerationJob({
            ...baseJobParams,
            historyNodeData,
          });
          const generatedAt = nowIso();
          const generationResults: ImageGenerationResultItem[] = result.images.map((image) => ({
            status: "completed" as const,
            imageUrl: image.imageUrl,
            hostedImageUrl: image.hostedImageUrl,
            model: image.model,
            width: image.width,
            height: image.height,
            format: image.format,
            sizeBytes: image.sizeBytes,
            generatedAt,
          }));

          set((currentState) => ({
            dirty: true,
            nodes: appendImageGenerationNodeResults(
              currentState.nodes,
              imageGenerationNodeId,
              generationResults,
            ),
          }));

          return generationResults;
        } catch (error) {
          const failureResult: ImageGenerationResultItem = {
            status: "error" as const,
            generatedAt: nowIso(),
            errorMessage: toErrorMessage(error),
          };

          set((currentState) => ({
            dirty: true,
            nodes: appendImageGenerationNodeResults(
              currentState.nodes,
              imageGenerationNodeId,
              [failureResult],
            ),
          }));

          return [failureResult];
        }
      });

      const generationResults: ImageGenerationResultItem[] = (
        await Promise.all(jobRuns)
      ).flat();
      const primaryResult = generationResults.find(
        (result) => result.status === "completed" && result.imageUrl,
      );
      const failureMessages = generationResults
        .filter(
          (
            result,
          ): result is ImageGenerationResultItem & {
            status: "error";
            errorMessage: string;
          } => result.status === "error" && typeof result.errorMessage === "string",
        )
        .map((result) => result.errorMessage);

      const completedResults = generationResults.filter(
        (
          result,
        ): result is ImageGenerationResultItem & {
          status: "completed";
          imageUrl: string;
        } => result.status === "completed" && Boolean(result.imageUrl),
      );

      void (async () => {
        for (const result of completedResults) {
          try {
            await get().persistProjectOutput({
              sourceKey: `${imageGenerationNodeId}:${result.generatedAt}:${result.imageUrl}`,
              imageUrl: result.hostedImageUrl?.trim() || result.imageUrl,
              fileName: latestImageGenerationNode.data.title,
              generatedAt: result.generatedAt,
              nodeData: {
                ...historyNodeData,
                generatedImageUrl: result.imageUrl,
                generatedHostedImageUrl: result.hostedImageUrl,
                generatedImageWidth: result.width,
                generatedImageHeight: result.height,
                generatedImageFormat: result.format,
                generatedImageSizeBytes: result.sizeBytes,
                generatedModel: result.model,
                generatedAt: result.generatedAt,
                generationResults: [result],
              },
              title: latestImageGenerationNode.data.title,
              model: result.model,
              width: result.width,
              height: result.height,
              format: result.format,
              sizeBytes: result.sizeBytes,
            });
          } catch (error) {
            set({
              saveMessage: toProjectOutputSaveErrorMessage(error),
            });
          }
        }
      })();

      set((currentState) => ({
        error: primaryResult
          ? null
          : failureMessages[0] || "Image generation failed",
        dirty: true,
        nodes: appendImageGenerationNodeResults(
          currentState.nodes,
          imageGenerationNodeId,
          generationResults,
        ).map((node) =>
          node.id === imageGenerationNodeId && node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  status: primaryResult ? "idle" : "error",
                  errorMessage:
                    failureMessages.length > 0
                      ? failureMessages.join("\n")
                      : undefined,
                },
              }
            : node,
        ),
        edges: currentState.edges,
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        error: message,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === imageGenerationNodeId &&
          node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  generatedImageUrl: undefined,
                  generatedHostedImageUrl: undefined,
                  generatedImageWidth: undefined,
                  generatedImageHeight: undefined,
                  generatedImageFormat: undefined,
                  generatedImageSizeBytes: undefined,
                  generatedModel: undefined,
                  generatedAt: undefined,
                  generationResults: [
                    {
                      status: "error",
                      generatedAt: nowIso(),
                      errorMessage: message,
                    },
                  ],
                  status: "error",
                  errorMessage: message,
                },
              }
          : node,
        ),
      }));
    } finally {
      inFlightImageGenerationNodeIds.delete(imageGenerationNodeId);
    }
  },

  splitImageGenerationNodeToGrid: async (imageGenerationNodeId, dimension) => {
    const state = get();
    const imageGenerationNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
        node.id === imageGenerationNodeId && node.type === "image_generation",
    );

    if (!imageGenerationNode) {
      throw new Error("Image generation node not found");
    }

    const sourceUrl =
      imageGenerationNode.data.generatedHostedImageUrl?.trim() ||
      imageGenerationNode.data.generatedImageUrl?.trim() ||
      "";

    if (!sourceUrl) {
      throw new Error("Source image is missing");
    }

    try {
      const sourceImage = await loadImageElement(sourceUrl);
      const naturalWidth = sourceImage.naturalWidth || sourceImage.width;
      const naturalHeight = sourceImage.naturalHeight || sourceImage.height;

      if (!naturalWidth || !naturalHeight) {
        throw new Error("Invalid source image dimensions");
      }

      const columnWidths = getGridSegmentLengths(naturalWidth, dimension);
      const rowHeights = getGridSegmentLengths(naturalHeight, dimension);
      const previewDimensions = getImageGenerationPreviewDimensions(
        naturalWidth,
        naturalHeight,
      );
      const tileLayouts = rowHeights.map(() =>
        columnWidths.map(() =>
          getSplitDisplaySizeMatchingPreview(
            naturalWidth,
            naturalHeight,
          ),
        ),
      );
      const columnCardWidths = columnWidths.map((_, columnIndex) =>
        Math.max(...tileLayouts.map((row) => row[columnIndex].cardWidth)),
      );
      const rowTotalHeights = rowHeights.map((_, rowIndex) =>
        Math.max(...tileLayouts[rowIndex].map((tile) => tile.totalHeight)),
      );
      const baseTitle = sanitizeSplitNodeTitle(imageGenerationNode.data.title);
      const startX =
        imageGenerationNode.position.x +
        previewDimensions.width +
        SPLIT_OUTPUT_GROUP_GAP;
      const startY = imageGenerationNode.position.y;
      const nextNodes: CanvasNode[] = [];
      let sourceY = 0;
      let titleIndex = 1;

      for (let rowIndex = 0; rowIndex < rowHeights.length; rowIndex += 1) {
        const tileHeight = rowHeights[rowIndex];
        let sourceX = 0;

        for (let columnIndex = 0; columnIndex < columnWidths.length; columnIndex += 1) {
          const tileWidth = columnWidths[columnIndex];
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = tileWidth;
          cropCanvas.height = tileHeight;

          const context = cropCanvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas 2D context is unavailable");
          }

          context.drawImage(
            sourceImage,
            sourceX,
            sourceY,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight,
          );

          const imageUrl = cropCanvas.toDataURL("image/png");
          const positionX =
            startX +
            columnCardWidths
              .slice(0, columnIndex)
              .reduce((sum, value) => sum + value, 0) +
            columnIndex * SPLIT_OUTPUT_TILE_GAP;
          const positionY =
            startY +
            rowTotalHeights
              .slice(0, rowIndex)
              .reduce((sum, value) => sum + value, 0) +
            rowIndex * SPLIT_OUTPUT_TILE_GAP;

          nextNodes.push({
            id: crypto.randomUUID(),
            type: "uploaded_image",
            position: {
              x: positionX,
              y: positionY,
            },
            data: {
              title: `${baseTitle}-${titleIndex}`,
              imageUrl,
              width: tileWidth,
              height: tileHeight,
              displayWidth: tileLayouts[rowIndex][columnIndex].cardWidth,
              displayHeight: tileLayouts[rowIndex][columnIndex].cardHeight,
            },
          });

          sourceX += tileWidth;
          titleIndex += 1;
        }

        sourceY += tileHeight;
      }

      set((currentState) => ({
        nodes: [...currentState.nodes, ...nextNodes],
        dirty: true,
        error: null,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  cropImageGenerationNode: async (imageGenerationNodeId, cropRect) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
        node.id === imageGenerationNodeId && node.type === "image_generation",
    );

    if (!sourceNode) {
      throw new Error("Image generation node not found");
    }

    const sourceUrl =
      sourceNode.data.generatedHostedImageUrl?.trim() ||
      sourceNode.data.generatedImageUrl?.trim() ||
      "";

    if (!sourceUrl) {
      throw new Error("Source image is missing");
    }

    try {
      const sourceImage = await loadImageElement(sourceUrl);
      const naturalWidth = sourceImage.naturalWidth || sourceImage.width;
      const naturalHeight = sourceImage.naturalHeight || sourceImage.height;

      if (!naturalWidth || !naturalHeight) {
        throw new Error("Invalid source image dimensions");
      }

      const sx = Math.round(cropRect.x * naturalWidth);
      const sy = Math.round(cropRect.y * naturalHeight);
      const sw = Math.round(cropRect.width * naturalWidth);
      const sh = Math.round(cropRect.height * naturalHeight);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const context = cropCanvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas 2D context is unavailable");
      }

      context.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
      const imageUrl = cropCanvas.toDataURL("image/png");

      const positionX =
        sourceNode.position.x +
        IMAGE_GENERATION_NODE_STAGE_WIDTH +
        SPLIT_OUTPUT_GROUP_GAP;
      const positionY = sourceNode.position.y;
      const baseTitle = sanitizeSplitNodeTitle(sourceNode.data.title);
      const aspectRatio = `${sw}:${sh}`;

      const nextNode: CanvasNode = {
        id: crypto.randomUUID(),
        type: "image_generation",
        position: { x: positionX, y: positionY },
        data: {
          ...sourceNode.data,
          title: `${baseTitle}-crop`,
          aspectRatio,
          generatedImageUrl: imageUrl,
          generatedHostedImageUrl: undefined,
          generatedImageWidth: sw,
          generatedImageHeight: sh,
          generatedImageFormat: "PNG",
          generatedImageSizeBytes: undefined,
          generatedAt: new Date().toISOString(),
          generationResults: [
            {
              status: "completed",
              imageUrl,
              hostedImageUrl: undefined,
              model: sourceNode.data.generatedModel,
              width: sw,
              height: sh,
              format: "PNG",
              sizeBytes: undefined,
              generatedAt: new Date().toISOString(),
            },
          ],
          status: "idle",
          errorMessage: undefined,
        },
      };

      set((currentState) => ({
        nodes: [...currentState.nodes, nextNode],
        dirty: true,
        error: null,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  splitUploadedImageNodeToGrid: async (nodeId, dimension) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "uploaded_image" }> =>
        node.id === nodeId && node.type === "uploaded_image",
    );

    if (!sourceNode) {
      throw new Error("Uploaded image node not found");
    }

    const sourceUrl = sourceNode.data.hostedImageUrl?.trim() || sourceNode.data.imageUrl?.trim() || "";

    if (!sourceUrl) {
      throw new Error("Source image is missing");
    }

    try {
      const sourceImage = await loadImageElement(sourceUrl);
      const naturalWidth = sourceImage.naturalWidth || sourceImage.width;
      const naturalHeight = sourceImage.naturalHeight || sourceImage.height;

      if (!naturalWidth || !naturalHeight) {
        throw new Error("Invalid source image dimensions");
      }

      const columnWidths = getGridSegmentLengths(naturalWidth, dimension);
      const rowHeights = getGridSegmentLengths(naturalHeight, dimension);
      const previewDimensions = getImageGenerationPreviewDimensions(naturalWidth, naturalHeight);
      const tileLayouts = rowHeights.map(() =>
        columnWidths.map(() => getSplitDisplaySizeMatchingPreview(naturalWidth, naturalHeight)),
      );
      const columnCardWidths = columnWidths.map((_, columnIndex) =>
        Math.max(...tileLayouts.map((row) => row[columnIndex].cardWidth)),
      );
      const rowTotalHeights = rowHeights.map((_, rowIndex) =>
        Math.max(...tileLayouts[rowIndex].map((tile) => tile.totalHeight)),
      );
      const baseTitle = sanitizeSplitNodeTitle(sourceNode.data.title);
      const startX = sourceNode.position.x + previewDimensions.width + SPLIT_OUTPUT_GROUP_GAP;
      const startY = sourceNode.position.y;
      const nextNodes: CanvasNode[] = [];
      let sourceY = 0;
      let titleIndex = 1;

      for (let rowIndex = 0; rowIndex < rowHeights.length; rowIndex += 1) {
        const tileHeight = rowHeights[rowIndex];
        let sourceX = 0;

        for (let columnIndex = 0; columnIndex < columnWidths.length; columnIndex += 1) {
          const tileWidth = columnWidths[columnIndex];
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = tileWidth;
          cropCanvas.height = tileHeight;
          const context = cropCanvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas 2D context is unavailable");
          }

          context.drawImage(sourceImage, sourceX, sourceY, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);

          const imageUrl = cropCanvas.toDataURL("image/png");
          const positionX =
            startX +
            columnCardWidths.slice(0, columnIndex).reduce((sum, value) => sum + value, 0) +
            columnIndex * SPLIT_OUTPUT_TILE_GAP;
          const positionY =
            startY +
            rowTotalHeights.slice(0, rowIndex).reduce((sum, value) => sum + value, 0) +
            rowIndex * SPLIT_OUTPUT_TILE_GAP;

          nextNodes.push({
            id: crypto.randomUUID(),
            type: "uploaded_image",
            position: { x: positionX, y: positionY },
            data: {
              title: `${baseTitle}-${titleIndex}`,
              imageUrl,
              width: tileWidth,
              height: tileHeight,
              displayWidth: tileLayouts[rowIndex][columnIndex].cardWidth,
              displayHeight: tileLayouts[rowIndex][columnIndex].cardHeight,
            },
          });

          sourceX += tileWidth;
          titleIndex += 1;
        }

        sourceY += tileHeight;
      }

      set((currentState) => ({
        nodes: [...currentState.nodes, ...nextNodes],
        dirty: true,
        error: null,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  cropUploadedImageNode: async (nodeId, cropRect) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "uploaded_image" }> =>
        node.id === nodeId && node.type === "uploaded_image",
    );

    if (!sourceNode) {
      throw new Error("Uploaded image node not found");
    }

    const sourceUrl = sourceNode.data.hostedImageUrl?.trim() || sourceNode.data.imageUrl?.trim() || "";

    if (!sourceUrl) {
      throw new Error("Source image is missing");
    }

    try {
      const sourceImage = await loadImageElement(sourceUrl);
      const naturalWidth = sourceImage.naturalWidth || sourceImage.width;
      const naturalHeight = sourceImage.naturalHeight || sourceImage.height;

      if (!naturalWidth || !naturalHeight) {
        throw new Error("Invalid source image dimensions");
      }

      const sx = Math.round(cropRect.x * naturalWidth);
      const sy = Math.round(cropRect.y * naturalHeight);
      const sw = Math.round(cropRect.width * naturalWidth);
      const sh = Math.round(cropRect.height * naturalHeight);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const context = cropCanvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas 2D context is unavailable");
      }

      context.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
      const imageUrl = cropCanvas.toDataURL("image/png");

      const positionX = sourceNode.position.x + (sourceNode.data.displayWidth || sourceNode.data.width) + SPLIT_OUTPUT_GROUP_GAP;
      const positionY = sourceNode.position.y;
      const baseTitle = sanitizeSplitNodeTitle(sourceNode.data.title);

      const nextNode: CanvasNode = {
        id: crypto.randomUUID(),
        type: "uploaded_image",
        position: { x: positionX, y: positionY },
        data: {
          title: `${baseTitle}-crop`,
          imageUrl,
          width: sw,
          height: sh,
          displayWidth: sw,
          displayHeight: sh,
        },
      };

      set((currentState) => ({
        nodes: [...currentState.nodes, nextNode],
        dirty: true,
        error: null,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  getConnectedImagesForImageGenerationNode: (imageGenerationNodeId) => {
    const state = get();
    return getImageGenerationReferenceImages(
      state.nodes,
      state.edges,
      imageGenerationNodeId,
    );
  },

  newProject: (name) => {
    const previewUrls = get().currentProjectPreviewUrls;
    revokeObjectUrls(previewUrls);

    const nextName = name?.trim() || "Untitled";
    set({
      projectId: null,
      projectName: nextName,
      projectCreatedAt: null,
      currentProject: null,
      currentProjectPreviewUrls: [],
      nodes: [],
      edges: [],
      groups: [],
      loading: false,
      error: null,
      dirty: false,
      lastSavedAt: null,
      lastSavedSignature: getProjectSnapshotSignature({
        name: nextName,
        nodes: [],
        edges: [],
        groups: [],
      }),
      saveMessage: null,
    });
  },

  saveProject: async () => {
    set({ loading: true, error: null });

    try {
      const state = get();

      if (!state.currentProject) {
        throw new Error("当前没有打开的项目");
      }

      const snapshot = createSnapshot(state);
      const updatedProject = await saveProjectSnapshot(state.currentProject, snapshot);
      const savedSnapshot = {
        ...snapshot,
        name: updatedProject.name,
        updatedAt: updatedProject.updatedAt,
      };

      set({
        projectId: savedSnapshot.id,
        projectName: savedSnapshot.name,
        projectCreatedAt: savedSnapshot.createdAt,
        currentProject: updatedProject,
        currentProjectPreviewUrls: state.currentProjectPreviewUrls,
        loading: false,
        error: null,
        dirty: false,
        lastSavedAt: savedSnapshot.updatedAt,
        lastSavedSignature: getProjectSnapshotSignature(savedSnapshot),
      });

      return savedSnapshot;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  loadProject: async (project) => {
    set({ loading: true, error: null, saveMessage: null });

    try {
      const previousPreviewUrls = get().currentProjectPreviewUrls;
      const snapshot = await loadProjectSnapshotFromDisk(project);
      const hydrated = await hydrateProjectSnapshotPreviewUrls(project, snapshot);

      revokeObjectUrls(previousPreviewUrls);

      set({
        projectId: hydrated.snapshot.id,
        projectName: hydrated.snapshot.name,
        projectCreatedAt: hydrated.snapshot.createdAt,
        currentProject: project,
        currentProjectPreviewUrls: hydrated.previewUrls,
        nodes: hydrated.snapshot.nodes,
        edges: hydrated.snapshot.edges,
        groups: hydrated.snapshot.groups ?? [],
        loading: false,
        error: null,
        dirty: false,
        lastSavedAt: hydrated.snapshot.updatedAt,
        lastSavedSignature: getProjectSnapshotSignature(hydrated.snapshot),
      });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  listProjects: async () => {
    set({ error: null });

    try {
      return await listProjectLibrary();
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message });
      throw error;
    }
  },

  deleteProject: async (project) => {
    set({ loading: true, error: null });

    try {
      await deleteProjectDirectory(project);

      if (get().projectId === project.id) {
        get().newProject();
      } else {
        set({ loading: false, error: null });
      }
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  renameProject: async (project, nextName) => {
    set({ loading: true, error: null });

    try {
      const renamedProject = await renameProjectDirectory(project, nextName);

      if (get().projectId === project.id) {
        set((state) => ({
          projectName: renamedProject.name,
          currentProject: renamedProject,
          loading: false,
          error: null,
          dirty: computeDirtyState({
            projectName: renamedProject.name,
            nodes: state.nodes,
            edges: state.edges,
            groups: state.groups,
            lastSavedSignature: state.lastSavedSignature,
          }),
        }));
      } else {
        set({ loading: false, error: null });
      }

      return renamedProject;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  duplicateProject: async (project) => {
    set({ loading: true, error: null });

    try {
      const duplicatedProject = await duplicateProjectDirectory(project);
      set({ loading: false, error: null });
      return duplicatedProject;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  attachProject: (project, snapshot) => {
    const previousPreviewUrls = get().currentProjectPreviewUrls;
    revokeObjectUrls(previousPreviewUrls);
    const nextPreviewUrls = collectPreviewUrlsFromNodes(snapshot.nodes);

    set({
      projectId: snapshot.id,
      projectName: snapshot.name,
      projectCreatedAt: snapshot.createdAt,
      currentProject: project,
      currentProjectPreviewUrls: nextPreviewUrls,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      groups: snapshot.groups ?? [],
      loading: false,
      error: null,
      dirty: false,
      lastSavedAt: snapshot.updatedAt,
      lastSavedSignature: getProjectSnapshotSignature(snapshot),
      saveMessage: null,
    });
  },

  persistProjectOutput: async (params) => {
    const state = get();

    if (!state.currentProject) {
      return;
    }

    const persisted = await persistGeneratedOutput(state.currentProject, params);

    set((currentState) => {
      let previousPreviewUrl: string | null = null;

      const nodes = currentState.nodes.map((node) => {
        if (node.type !== "image_generation") {
          return node;
        }

        const sourceKey = `${node.id}:${params.generatedAt}:${params.nodeData.generatedImageUrl ?? ""}`;

        if (sourceKey !== params.sourceKey) {
          return node;
        }

        const matchesPrimaryImage =
          node.data.generatedAt === params.generatedAt &&
          node.data.generatedImageUrl === params.nodeData.generatedImageUrl;

        previousPreviewUrl = matchesPrimaryImage
          ? node.data.generatedHostedImageUrl?.trim() || null
          : null;

        return {
          ...node,
          data: {
            ...node.data,
            ...(matchesPrimaryImage
              ? {
                  generatedHostedImageUrl: persisted.previewUrl,
                  generatedOutputFileName: persisted.fileName,
                }
              : {}),
            generationResults: node.data.generationResults?.map((result) => {
              if (
                result.status !== "completed" ||
                result.generatedAt !== params.generatedAt ||
                result.imageUrl !== params.nodeData.generatedImageUrl
              ) {
                return result;
              }

              return {
                ...result,
                hostedImageUrl: persisted.previewUrl,
              };
            }),
          },
        };
      });

      if (
        previousPreviewUrl &&
        previousPreviewUrl !== persisted.previewUrl &&
        currentState.currentProjectPreviewUrls.includes(previousPreviewUrl)
      ) {
        revokeObjectUrls([previousPreviewUrl]);
      }

      const previewUrls = currentState.currentProjectPreviewUrls.filter(
        (url) => url !== previousPreviewUrl,
      );
      previewUrls.push(persisted.previewUrl);

      return {
        nodes,
        currentProjectPreviewUrls: previewUrls,
      };
    });
  },

  listCurrentProjectHistory: async () => {
    const state = get();

    if (!state.currentProject) {
      return [];
    }

    return readProjectHistory(state.currentProject);
  },
}));
