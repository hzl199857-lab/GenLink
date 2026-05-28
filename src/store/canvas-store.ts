"use client";

import { create } from "zustand";

import {
  buildThreeViewPrompt,
  stripImagePromptSectionLabels,
} from "@/lib/image-prompt";
import {
  parseReferenceMentions,
  reconcileReferenceMentionTokens,
  selectMentionedReferences,
  stripReferenceMentionTokens,
} from "@/lib/prompt-mentions";
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
  ImageGenerationRunOptions,
  ImageNodeData,
  MaterialLibraryItem,
  NodeGroup,
  NodeType,
  Panorama360NodeData,
  Panorama360ViewState,
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
const IMAGE_JOB_SUBMIT_RETRY_COUNT = 3;
const IMAGE_JOB_SUBMIT_RETRY_DELAY_MS = 800;
const REFERENCE_IMAGE_UPLOAD_MODE =
  process.env.NEXT_PUBLIC_REFERENCE_IMAGE_UPLOAD_MODE?.trim().toLowerCase();
const SHOULD_PREFER_OSS_FOR_REFERENCE_IMAGES =
  REFERENCE_IMAGE_UPLOAD_MODE !== "local";
const SPLIT_OUTPUT_GROUP_GAP = 48;
const SPLIT_OUTPUT_TILE_GAP = 12;
const UPLOADED_IMAGE_NODE_HEADER_HEIGHT = 40;
const CANVAS_HISTORY_LIMIT = 100;
const CANVAS_HISTORY_COALESCE_MS = 700;
const SAVE_MESSAGE_AUTO_CLEAR_MS = 3_000;
const PANORAMA_360_PROMPT = `A seamless 360-degree equirectangular panorama of a {scene_type} environment, 
designed for VR viewing with perfect spherical continuity. 

{scene_description}

The space features consistent architectural/landscape logic, 
with {lighting_desc} lighting that creates {color_tone} tones throughout. 
Textures, perspectives, and environmental elements wrap continuously 
around the full 360 degrees—left and right edges match flawlessly, 
horizon line flows without breaks, no visible seams or stitch lines.

Photorealistic, ultra-detailed, cinematic composition, 
with delicate attention to material textures and atmospheric depth. 
{emotional_keywords}`;
const PANORAMA_360_ASPECT_RATIO = 2;
const PANORAMA_360_ASPECT_RATIO_TOLERANCE = 0.04;
const PANORAMA_360_NODE_GAP = 48;
const PANORAMA_360_NODE_HEIGHT = 405;

type CanvasHistorySnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  materials: MaterialLibraryItem[];
};

let lastCanvasHistoryPushAt = 0;
let saveMessageClearTimer: number | undefined;

function resolveParallelCount(value?: number): 1 | 2 | 4 {
  return value === 2 || value === 4 ? value : 1;
}

export type ApiProvider = "vibe" | "fucheers" | "comfly" | "zhenzhen" | "runninghub" | "grsai";
export type ApiModelKind = "text" | "image";

export type StoredApiSettings = {
  textProvider: ApiProvider;
  imageProvider: ApiProvider;
  textApiKeys: Record<ApiProvider, string>;
  imageApiKeys: Record<ApiProvider, string>;
  runningHubWorkflowApiKey: string;
};

const DEFAULT_API_PROVIDER: ApiProvider = "vibe";
const API_PROVIDER_LABELS: Record<ApiProvider, string> = {
  vibe: "VibeAPI",
  fucheers: "Fucheers API",
  comfly: "Comfly",
  runninghub: "RunningHub",
  grsai: "Grsai",
  zhenzhen: "真真 AI 工坊",
};

export const CANVAS_TEXT_API_PROVIDER_STORAGE_KEY = "genlink.textApiProvider";
export const CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY = "genlink.imageApiProvider";
export const CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY = "genlink.vibeTextApiKey";
export const CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY = "genlink.fucheersTextApiKey";
export const CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY = "genlink.comflyTextApiKey";
export const CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY = "genlink.zhenzhenTextApiKey";
export const CANVAS_TEXT_RUNNINGHUB_API_KEY_STORAGE_KEY = "genlink.runninghubTextApiKey";
export const CANVAS_TEXT_GRSAI_API_KEY_STORAGE_KEY = "genlink.grsaiTextApiKey";
export const CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY = "genlink.vibeImageApiKey";
export const CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY = "genlink.fucheersImageApiKey";
export const CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY = "genlink.comflyImageApiKey";
export const CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY = "genlink.zhenzhenImageApiKey";
export const CANVAS_IMAGE_RUNNINGHUB_API_KEY_STORAGE_KEY = "genlink.runninghubImageApiKey";
export const CANVAS_RUNNINGHUB_WORKFLOW_API_KEY_STORAGE_KEY = "genlink.runninghubWorkflowApiKey";
export const CANVAS_IMAGE_GRSAI_API_KEY_STORAGE_KEY = "genlink.grsaiImageApiKey";
const CANVAS_TEXT_MODEL_STORAGE_KEY = "genlink.textModel";
const CANVAS_IMAGE_MODEL_STORAGE_KEY = "genlink.imageModel";
const CANVAS_IMAGE_RUNNINGHUB_CHANNEL_STORAGE_KEY = "genlink.imageRunningHubChannel";
const THREE_VIEW_RUNNINGHUB_WORKFLOW_ID = "2059192086624296961";

type StoredImageModelSelection = {
  provider: ApiProvider;
  model: string;
  runningHubChannel?: "official" | "low-cost";
};

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
    case "runninghub":
      return "runninghub";
    case "grsai":
      return "grsai";
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

function getModelStorageKey(kind: ApiModelKind): string {
  return kind === "text"
    ? CANVAS_TEXT_MODEL_STORAGE_KEY
    : CANVAS_IMAGE_MODEL_STORAGE_KEY;
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
      case "runninghub":
        return CANVAS_TEXT_RUNNINGHUB_API_KEY_STORAGE_KEY;
      case "grsai":
        return CANVAS_TEXT_GRSAI_API_KEY_STORAGE_KEY;
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
    case "runninghub":
      return CANVAS_IMAGE_RUNNINGHUB_API_KEY_STORAGE_KEY;
    case "grsai":
      return CANVAS_IMAGE_GRSAI_API_KEY_STORAGE_KEY;
    default:
      return CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY;
  }
}

export function readStoredSelectedApiProvider(kind: ApiModelKind): ApiProvider {
  return normalizeApiProvider(readStoredValue(getApiProviderStorageKey(kind)));
}

export function readStoredSelectedModel(
  kind: ApiModelKind,
  fallbackModel: string,
): string {
  return readStoredValue(getModelStorageKey(kind)) || fallbackModel;
}

export function readStoredImageModelSelection(): StoredImageModelSelection {
  const runningHubChannel = readStoredValue(CANVAS_IMAGE_RUNNINGHUB_CHANNEL_STORAGE_KEY);

  return {
    provider: readStoredSelectedApiProvider("image"),
    model: readStoredSelectedModel("image", "gpt-image-2"),
    runningHubChannel: runningHubChannel === "low-cost" ? "low-cost" : "official",
  };
}

export function persistSelectedModel(params: {
  kind: ApiModelKind;
  provider: ApiProvider;
  model: string;
  runningHubChannel?: "official" | "low-cost";
}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getApiProviderStorageKey(params.kind), params.provider);
  window.localStorage.setItem(getModelStorageKey(params.kind), params.model);

  if (params.kind === "image" && params.provider === "runninghub") {
    window.localStorage.setItem(
      CANVAS_IMAGE_RUNNINGHUB_CHANNEL_STORAGE_KEY,
      params.runningHubChannel === "low-cost" ? "low-cost" : "official",
    );
  }
}

export function readStoredApiKey(
  kind: ApiModelKind,
  provider: ApiProvider,
): string {
  return readStoredValue(getApiKeyStorageKey(kind, provider));
}

export function readStoredRunningHubWorkflowApiKey(): string {
  return readStoredValue(CANVAS_RUNNINGHUB_WORKFLOW_API_KEY_STORAGE_KEY);
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
      runninghub: readStoredApiKey("text", "runninghub"),
      grsai: readStoredApiKey("text", "grsai"),
    },
    imageApiKeys: {
      vibe: readStoredApiKey("image", "vibe"),
      fucheers: readStoredApiKey("image", "fucheers"),
      comfly: readStoredApiKey("image", "comfly"),
      zhenzhen: readStoredApiKey("image", "zhenzhen"),
      runninghub: readStoredApiKey("image", "runninghub"),
      grsai: readStoredApiKey("image", "grsai"),
    },
    runningHubWorkflowApiKey: readStoredRunningHubWorkflowApiKey(),
  };
}

function assertStoredRunningHubWorkflowApiKey(): string {
  const apiKey = readStoredRunningHubWorkflowApiKey();

  if (!apiKey) {
    throw new Error("Please configure the RunningHub workflow API Key in API settings first.");
  }

  return apiKey;
}

function assertStoredApiKey(kind: ApiModelKind, provider: ApiProvider): string {
  const apiKey = readStoredApiKey(kind, provider);

  if (!apiKey) {
    throw new Error(
      `Please configure the ${kind === "text" ? "text" : "image"} ${getApiProviderLabel(provider)} API Key in API settings first.`,
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

function getConnectedImageDedupKey(image: ConnectedImagePayload): string {
  const originalUrl = image.originalImageUrl?.trim();
  const hostedUrl = image.hostedImageUrl?.trim();
  const imageUrl = image.imageUrl.trim();

  if (image.sourceType !== "inline_reference") {
    return `node:${image.id}`;
  }

  return `url:${hostedUrl || imageUrl || originalUrl || image.id}`;
}

function dedupeConnectedImages(
  images: ConnectedImagePayload[],
): ConnectedImagePayload[] {
  const seen = new Set<string>();
  const deduped: ConnectedImagePayload[] = [];

  for (const image of images) {
    const keys = [
      getConnectedImageDedupKey(image),
      image.originalImageUrl?.trim() ? `url:${image.originalImageUrl.trim()}` : null,
      image.hostedImageUrl?.trim() ? `url:${image.hostedImageUrl.trim()}` : null,
      image.imageUrl.trim() ? `url:${image.imageUrl.trim()}` : null,
      image.id ? `node:${image.id}` : null,
    ].filter((key): key is string => Boolean(key));

    if (keys.some((key) => seen.has(key))) {
      continue;
    }

    for (const key of keys) {
      seen.add(key);
    }
    deduped.push(image);
  }

  return deduped;
}

type CanvasImageSource = {
  imageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  title?: string;
  alt: string;
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
    "2:1": "1024x512",
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
    "2:1": "2048x1024",
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
    "2:1": "3840x1920",
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
  "2:1",
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

function shouldUseNanoImageSizePresets(
  provider: ApiProvider | undefined,
  model?: string,
): boolean {
  if (provider === "runninghub") {
    return model === "nano-banana-pro" || model === "nano-banana-2";
  }

  if (provider === "grsai") {
    return model === "nano-banana-pro";
  }

  return isGeminiImageModel(model);
}

function selectPromptReferences<T extends { id: string }>(
  references: T[],
  prompt: string | undefined,
): T[] {
  if (!parseReferenceMentions(prompt).length) {
    return references;
  }

  const selected = selectMentionedReferences(references, prompt);
  return selected.length > 0 ? selected : references;
}

function createTextNodeData(): TextNodeData {
  const provider = readStoredSelectedApiProvider("text");

  return {
    title: "Text",
    text: "",
    provider,
    model: readStoredSelectedModel("text", "gpt-5.4"),
    status: "idle",
  };
}

function createImageGenerationNodeData(): ImageGenerationNodeData {
  const selection = readStoredImageModelSelection();

  return {
    title: "Image",
    prompt: "",
    provider: selection.provider,
    model: selection.model,
    runningHubChannel:
      selection.provider === "runninghub"
        ? selection.runningHubChannel
        : undefined,
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

function createPanorama360NodeData(): Panorama360NodeData {
  return {
    title: "360全景图",
    panorama360Node: {
      version: 1,
      mode: "panorama",
      viewport: {
        activeView: "default",
        panoramaView: {
          yaw: 0,
          pitch: 0,
          fov: 72,
        },
      },
      panorama: {
        isLoaded: false,
        error: null,
      },
      ui: {
        mouseTool: "navigate",
        isEditing: false,
      },
    },
  };
}

function createPanorama360NodeDataWithStatus(
  status: NonNullable<
    Panorama360NodeData["panorama360Node"]["panorama"]["generationStatus"]
  > = "idle",
): Panorama360NodeData {
  const data = createPanorama360NodeData();

  return {
    ...data,
    panorama360Node: {
      ...data.panorama360Node,
      panorama: {
        ...data.panorama360Node.panorama,
        generationStatus: status,
      },
    },
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

function isCloseToPanorama360AspectRatio(width?: number, height?: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) {
    return false;
  }

  return Math.abs(width / height - PANORAMA_360_ASPECT_RATIO) <=
    PANORAMA_360_ASPECT_RATIO_TOLERANCE;
}

function getDisplayDimensionsForImage(width?: number, height?: number): {
  width: number;
  height: number;
} {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      width: IMAGE_GENERATION_NODE_STAGE_WIDTH,
      height: Math.round(IMAGE_GENERATION_NODE_STAGE_WIDTH / PANORAMA_360_ASPECT_RATIO),
    };
  }

  return getImageGenerationPreviewDimensions(width, height);
}

function getCanvasImageNodeDisplayDimensions(
  node: CanvasNode,
  sourceWidth?: number,
  sourceHeight?: number,
): {
  width: number;
  height: number;
} {
  if (node.type === "uploaded_image") {
    const fallback = getDisplayDimensionsForImage(sourceWidth, sourceHeight);

    return {
      width: node.data.displayWidth ?? fallback.width,
      height: node.data.displayHeight ?? fallback.height,
    };
  }

  if (node.type === "image") {
    return {
      width: 420,
      height: 420 * 3 / 4,
    };
  }

  return getDisplayDimensionsForImage(sourceWidth, sourceHeight);
}

async function resolveImageSourceDimensions(source: CanvasImageSource): Promise<{
  width?: number;
  height?: number;
}> {
  if (source.width && source.height) {
    return {
      width: source.width,
      height: source.height,
    };
  }

  try {
    const image = await loadImageElement(
      source.hostedImageUrl?.trim() || source.imageUrl.trim(),
    );

    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } catch {
    return {
      width: source.width,
      height: source.height,
    };
  }
}

async function uploadImageBlobToOss(
  blob: Blob,
  fileName?: string,
  folder = "references",
): Promise<string> {
  const contentType = blob.type || "image/png";
  const targetResponse = await fetch("/api/image-hosting/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName,
      folder,
      contentType,
    }),
  });
  const targetJson = await readJsonResponse<
    | {
        ok: true;
        result: {
          uploadUrl: string;
          imageUrl: string;
          headers: Record<string, string>;
        };
      }
    | ApiErrorResponse
  >(targetResponse, "Failed to create OSS upload URL");

  if (!targetResponse.ok || !targetJson.ok) {
    throw new Error(
      "error" in targetJson ? targetJson.error : "Failed to create OSS upload URL",
    );
  }

  const uploadResponse = await fetch(targetJson.result.uploadUrl, {
    method: "PUT",
    headers: targetJson.result.headers,
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image to OSS (${uploadResponse.status})`);
  }

  return targetJson.result.imageUrl;
}

async function uploadReferenceBlobToOss(
  blob: Blob,
  fileName?: string,
): Promise<string> {
  return uploadImageBlobToOss(blob, fileName, "references");
}

async function readReferenceImageBlob(
  imageUrl: string,
  failureContext: string,
): Promise<Blob> {
  const url = imageUrl.trim();
  const shouldReadViaProxy = /^https?:\/\//i.test(url) && !isSameOriginUrl(url);
  const response = shouldReadViaProxy
    ? await fetch("/api/image-hosting/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: url }),
      })
    : await fetch(url);

  if (!response.ok) {
    throw new Error(`${failureContext} (${response.status})`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";

  if (contentType && !contentType.startsWith("image/")) {
    throw new Error("Reference image URL did not return an image");
  }

  return response.blob();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    throw new Error("Invalid image data URL");
  }

  const mimeType = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
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

  if (url.startsWith("data:")) {
    return {
      url: await uploadReferenceBlobToOss(dataUrlToBlob(url), image.fileName),
      fileName: image.fileName,
    };
  }

  if (isObjectUrl(url) || isSameOriginUrl(url) || /^https?:\/\//i.test(url)) {
    return {
      url: await uploadReferenceBlobToOss(
        await readReferenceImageBlob(
          url,
          "Failed to read reference image before OSS upload",
        ),
        image.fileName,
      ),
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

function isLocalImageHostingUrl(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.startsWith("/api/image-hosting/file/")) {
    return true;
  }

  if (!/^https?:\/\//i.test(trimmed) || typeof window === "undefined") {
    return false;
  }

  try {
    const url = new URL(trimmed);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/image-hosting/file/")
    );
  } catch {
    return false;
  }
}

function shouldHostReferenceImageBeforeRequest(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || isLocalImageHostingUrl(trimmed)) {
    return false;
  }

  if (trimmed.startsWith("data:")) {
    return SHOULD_PREFER_OSS_FOR_REFERENCE_IMAGES;
  }

  return isObjectUrl(trimmed) || isSameOriginUrl(trimmed);
}

async function hostReferenceImageForRequest(image: {
  imageUrl: string;
  fileName?: string;
}): Promise<string> {
  const url = image.imageUrl.trim();
  const blob = await readReferenceImageBlob(
    url,
    "Failed to read reference image before local upload",
  );

  if (SHOULD_PREFER_OSS_FOR_REFERENCE_IMAGES) {
    return uploadReferenceBlobToOss(blob, image.fileName);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.trim()) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read reference image data"));
    };
    reader.onerror = () => reject(new Error("Failed to read reference image data"));
    reader.readAsDataURL(blob);
  });
  const uploadResponse = await fetch("/api/image-hosting/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dataUrl,
      fileName: image.fileName,
    }),
  });
  const json = await readJsonResponse<
    | { ok: true; result: { imageUrl: string } }
    | ApiErrorResponse
  >(uploadResponse, "Failed to host reference image");

  if (!uploadResponse.ok || !json.ok) {
    throw new Error("error" in json ? json.error : "Failed to host reference image");
  }

  return json.result.imageUrl;
}

async function normalizeReferenceImagesForRequest(
  images: ConnectedImagePayload[],
): Promise<Array<{ url: string; fileName?: string }>> {
  const uploadCache = new Map<string, Promise<string>>();
  const requestImages: Array<{ url: string; fileName?: string }> = [];
  const seenRequestUrls = new Set<string>();

  for (const image of images) {
    const cacheKey =
      image.hostedImageUrl?.trim() ||
      image.originalImageUrl?.trim() ||
      image.imageUrl.trim();
    const normalizedPromise =
      uploadCache.get(cacheKey) ??
      (shouldHostReferenceImageBeforeRequest(image.imageUrl)
        ? hostReferenceImageForRequest({
            imageUrl: image.imageUrl,
            fileName: image.fileName,
          })
        : Promise.resolve(image.imageUrl.trim()));

    uploadCache.set(cacheKey, normalizedPromise);

    const requestUrl = (await normalizedPromise).trim();

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
    case "panorama-360":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createPanorama360NodeData(),
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
  materials: MaterialLibraryItem[];
}): ProjectSnapshot {
  return buildProjectSnapshot({
    id: state.projectId ?? crypto.randomUUID(),
    name: state.projectName,
    nodes: sanitizeNodesForPersistence(state.nodes),
    edges: state.edges,
    groups: state.groups,
    materials: sanitizeMaterialsForPersistence(state.materials),
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

function scheduleSaveMessageClear(set: (state: Partial<CanvasState>) => void): void {
  if (saveMessageClearTimer !== undefined) {
    window.clearTimeout(saveMessageClearTimer);
  }

  saveMessageClearTimer = window.setTimeout(() => {
    saveMessageClearTimer = undefined;
    set({ saveMessage: null });
  }, SAVE_MESSAGE_AUTO_CLEAR_MS);
}

function toResponseTextErrorMessage(text: string, fallback: string): string {
  const normalized = text.trim();

  if (/request entity too large/i.test(normalized)) {
    return "Reference images are too large. Reduce the number of references or compress them, then try again.";
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

function isFetchNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

function isObjectUrl(value?: string): boolean {
  return typeof value === "string" && value.startsWith("blob:");
}

function isDataUrl(value?: string): boolean {
  return typeof value === "string" && value.startsWith("data:");
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

async function uploadGeneratedResultToOss(
  result: ImageGenerationResultItem & { status: "completed"; imageUrl: string },
  fileName?: string,
): Promise<string | undefined> {
  const sourceUrl = result.hostedImageUrl?.trim() || result.imageUrl.trim();

  if (!sourceUrl || isAliyunOssUrl(sourceUrl)) {
    return sourceUrl || undefined;
  }

  if (sourceUrl.startsWith("data:")) {
    return uploadImageBlobToOss(
      dataUrlToBlob(sourceUrl),
      fileName,
      "generated",
    );
  }

  if (
    !isObjectUrl(sourceUrl) &&
    !isSameOriginUrl(sourceUrl) &&
    !/^https?:\/\//i.test(sourceUrl)
  ) {
    return undefined;
  }

  if (/^https?:\/\//i.test(sourceUrl) && !isSameOriginUrl(sourceUrl)) {
    const response = await fetch("/api/image-hosting/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl: sourceUrl,
        fileName,
        folder: "generated",
      }),
    });
    const json = await readJsonResponse<
      | { ok: true; result: { imageUrl: string } }
      | ApiErrorResponse
    >(response, "Failed to host generated image");

    if (!response.ok || !json.ok) {
      throw new Error("error" in json ? json.error : "Failed to host generated image");
    }

    return json.result.imageUrl;
  }

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to read generated image before OSS upload (${response.status})`);
  }

  return uploadImageBlobToOss(await response.blob(), fileName, "generated");
}

function sanitizeImageGenerationNodeDataForPersistence(
  data: ImageGenerationNodeData,
): ImageGenerationNodeData {
  return stripEmbeddedImageDataFromNodeData(data);
}

function sanitizeNodesForPersistence(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => {
    if (node.type === "panorama-360") {
      const panorama = node.data.panorama360Node.panorama;

      return {
        ...node,
        data: {
          ...node.data,
          panorama360Node: {
            ...node.data.panorama360Node,
            panorama: {
              ...panorama,
              generatedImageUrl: isDataUrl(panorama.generatedImageUrl)
                ? undefined
                : panorama.generatedImageUrl,
              generatedHostedImageUrl: isObjectUrl(panorama.generatedHostedImageUrl)
                ? undefined
                : panorama.generatedHostedImageUrl,
            },
          },
        },
      };
    }

    if (node.type !== "image_generation") {
      if (node.type === "uploaded_image" && node.data.outputFileName?.trim()) {
        return {
          ...node,
          data: {
            ...node.data,
            imageUrl: `output:${node.data.outputFileName}`,
            hostedImageUrl: undefined,
          },
        };
      }

      return node;
    }

    return {
      ...node,
      data: sanitizeImageGenerationNodeDataForPersistence(node.data),
    };
  });
}

function sanitizeMaterialsForPersistence(materials: MaterialLibraryItem[]): MaterialLibraryItem[] {
  return materials.map((item) => {
    if (!item.outputFileName?.trim()) {
      return item;
    }

    return {
      ...item,
      imageUrl: `output:${item.outputFileName}`,
      hostedImageUrl: undefined,
    };
  });
}

function getPersistentProjectSnapshotSignature(
  value: Pick<ProjectSnapshot, "name" | "nodes" | "edges" | "groups" | "materials">,
): string {
  return getProjectSnapshotSignature({
    ...value,
    materials: sanitizeMaterialsForPersistence(value.materials ?? []),
  });
}

function collectPreviewUrlsFromNodes(nodes: CanvasNode[]): string[] {
  const urls = new Set<string>();

  for (const node of nodes) {
    if (node.type === "panorama-360") {
      const panorama = node.data.panorama360Node.panorama;

      if (isObjectUrl(panorama.generatedHostedImageUrl)) {
        urls.add(panorama.generatedHostedImageUrl as string);
      }

      continue;
    }

    if (node.type !== "image_generation") {
      if (node.type === "image") {
        if (isObjectUrl(node.data.hostedImageUrl)) {
          urls.add(node.data.hostedImageUrl as string);
        }

        if (isObjectUrl(node.data.imageUrl)) {
          urls.add(node.data.imageUrl);
        }
      }

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
  materials: MaterialLibraryItem[];
  lastSavedSignature: string;
}): boolean {
  const currentSignature = getPersistentProjectSnapshotSignature({
    name: state.projectName,
    nodes: state.nodes,
    edges: state.edges,
    groups: state.groups,
    materials: state.materials,
  });

  return currentSignature !== state.lastSavedSignature;
}

function createCanvasHistorySnapshot(state: {
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  materials: MaterialLibraryItem[];
}): CanvasHistorySnapshot {
  return {
    projectName: state.projectName,
    nodes: state.nodes,
    edges: state.edges,
    groups: state.groups,
    materials: state.materials,
  };
}

function getCanvasHistorySignature(snapshot: CanvasHistorySnapshot): string {
  return getPersistentProjectSnapshotSignature({
    name: snapshot.projectName,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    groups: snapshot.groups,
    materials: snapshot.materials,
  });
}

function createUndoHistoryUpdate(
  state: CanvasState,
  options: { coalesce?: boolean } = {},
): Pick<CanvasState, "undoStack" | "redoStack"> {
  const now = Date.now();
  const snapshot = createCanvasHistorySnapshot(state);
  const signature = getCanvasHistorySignature(snapshot);
  const lastSnapshot = state.undoStack[state.undoStack.length - 1];
  const lastSignature = lastSnapshot ? getCanvasHistorySignature(lastSnapshot) : null;
  const shouldCoalesce =
    Boolean(options.coalesce) &&
    now - lastCanvasHistoryPushAt < CANVAS_HISTORY_COALESCE_MS &&
    state.undoStack.length > 0;

  if (signature === lastSignature || shouldCoalesce) {
    return {
      undoStack: state.undoStack,
      redoStack: [],
    };
  }

  lastCanvasHistoryPushAt = now;

  return {
    undoStack: [...state.undoStack, snapshot].slice(-CANVAS_HISTORY_LIMIT),
    redoStack: [],
  };
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
  runningHubChannel?: "official" | "low-cost";
  runningHubWorkflowId?: string;
  apiKey?: string;
  provider?: ApiProvider;
  historyNodeData?: ImageGenerationNodeData;
  images?: Array<{
    url: string;
    fileName?: string;
  }>;
}): Promise<ImageGenerationRunResult> {
  let response: Response | undefined;
  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= IMAGE_JOB_SUBMIT_RETRY_COUNT; attempt += 1) {
    try {
      response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      break;
    } catch (error) {
      lastNetworkError = error;

      if (!isFetchNetworkError(error) || attempt === IMAGE_JOB_SUBMIT_RETRY_COUNT) {
        break;
      }

      await sleep(IMAGE_JOB_SUBMIT_RETRY_DELAY_MS * attempt);
    }
  }

  if (!response) {
    throw new Error(
      isFetchNetworkError(lastNetworkError)
        ? "图像生成请求发送失败，请检查本地服务或网络连接后重试"
        : toErrorMessage(lastNetworkError),
    );
  }

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
  model?: string,
): "png" | "jpeg" | "webp" {
  if (model === "gpt-image-2") {
    return "png";
  }

  if (outputFormat === "jpeg" || outputFormat === "webp") {
    return outputFormat;
  }

  return "png";
}

function resolveImageApiModeration(moderation?: string, model?: string): "auto" | "low" {
  if (model === "gpt-image-2") {
    return "auto";
  }

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
  provider?: ApiProvider,
): string {
  const normalizedSizeTier =
    sizeTier === "2K" || sizeTier === "4K" ? sizeTier : "1K";

  if (shouldUseNanoImageSizePresets(provider, model)) {
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
        sourceNode.data.generatedHostedImageUrl?.trim() ||
        sourceNode.data.generatedImageUrl?.trim() ||
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
    node.data.generatedHostedImageUrl?.trim() ||
    node.data.generatedImageUrl?.trim() ||
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

function getCanvasImageSource(node: CanvasNode): CanvasImageSource | null {
  if (node.type === "image_generation") {
    const imageUrl =
      node.data.generatedHostedImageUrl?.trim() ||
      node.data.generatedImageUrl?.trim() ||
      "";

    if (!imageUrl) {
      return null;
    }

    return {
      imageUrl,
      hostedImageUrl: node.data.generatedHostedImageUrl?.trim() || undefined,
      fileName: node.data.generatedOutputFileName,
      title: node.data.title,
      alt: node.data.prompt?.trim() || "Generated image",
      width: node.data.generatedImageWidth,
      height: node.data.generatedImageHeight,
    };
  }

  if (node.type === "image") {
    if (!node.data.imageUrl.trim()) {
      return null;
    }

    return {
      imageUrl: node.data.hostedImageUrl?.trim() || node.data.imageUrl,
      hostedImageUrl: node.data.hostedImageUrl?.trim() || undefined,
      title: node.data.title,
      alt: node.data.prompt?.trim() || "Generated image",
      width: node.data.width,
      height: node.data.height,
    };
  }

  if (node.type === "uploaded_image") {
    if (!node.data.imageUrl.trim()) {
      return null;
    }

    return {
      imageUrl: node.data.hostedImageUrl?.trim() || node.data.imageUrl,
      hostedImageUrl: node.data.hostedImageUrl?.trim() || undefined,
      fileName: node.data.fileName,
      title: node.data.title,
      alt: node.data.fileName?.trim() || node.data.title?.trim() || "Uploaded image",
      width: node.data.width,
      height: node.data.height,
    };
  }

  return null;
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

  return dedupeConnectedImages([
    ...getInlineReferenceImagesForImageGenerationNode(imageGenerationNode),
    ...getConnectedImagesForTargetNode(nodes, edges, imageGenerationNodeId),
  ]);
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
  materials: MaterialLibraryItem[];
  loading: boolean;
  error: string | null;
  dirty: boolean;
  lastSavedAt: string | null;
  lastSavedSignature: string;
  saveMessage: string | null;
  undoStack: CanvasHistorySnapshot[];
  redoStack: CanvasHistorySnapshot[];
  threeViewControllerNodeId: string | null;

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
  addMaterial: (item: Omit<MaterialLibraryItem, "id" | "createdAt">) => MaterialLibraryItem;
  deleteMaterial: (id: string) => void;

  generateTextFromTextNode: (textNodeId: string) => Promise<void>;
  generateImageFromImageGenerationNode: (
    imageGenerationNodeId: string,
    promptOverride?: string,
    options?: ImageGenerationRunOptions,
  ) => Promise<void>;
  generateThreeViewImageFromNode: (
    nodeId: string,
    cameraAngle: { rotation: number; pitch: number; scale: number },
  ) => Promise<string>;
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
  createPanorama360ScreenshotNode: (
    nodeId: string,
    capture: {
      dataUrl: string;
      width: number;
      height: number;
      displayWidth: number;
      displayHeight: number;
      aspect: string;
      view: Panorama360ViewState;
    },
  ) => Promise<string>;
  createPanorama360FromImageNode: (nodeId: string) => Promise<string>;
  removeReferenceImageFromImageGenerationNode: (
    imageGenerationNodeId: string,
    referenceImageId: string,
  ) => void;
  addReferenceImagesToImageGenerationNode: (
    imageGenerationNodeId: string,
    images: Array<{
      imageUrl: string;
      hostedImageUrl?: string;
      fileName?: string;
      width?: number;
      height?: number;
      sizeBytes?: number;
    }>,
  ) => void;
  getConnectedImagesForTextNode: (textNodeId: string) => ConnectedImagePayload[];
  getConnectedImagesForImageGenerationNode: (
    imageGenerationNodeId: string,
  ) => ConnectedImagePayload[];
  getConnectedImagesForPanorama360Node: (
    panorama360NodeId: string,
  ) => ConnectedImagePayload[];

  setProjectName: (name: string) => void;
  setSaveMessage: (message: string | null) => void;
  undo: () => void;
  redo: () => void;
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
  setThreeViewControllerNodeId: (nodeId: string | null) => void;
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
  materials: [],
  loading: false,
  error: null,
  dirty: false,
  lastSavedAt: null,
  lastSavedSignature: getPersistentProjectSnapshotSignature({
    name: "Untitled",
    nodes: [],
    edges: [],
    groups: [],
    materials: [],
  }),
  saveMessage: null,
  undoStack: [],
  redoStack: [],
  threeViewControllerNodeId: null,

  addNode: (node) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
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
      ...createUndoHistoryUpdate(state),
      nodes: [...state.nodes, ...nodes],
      dirty: true,
      error: null,
    }));
  },

  addNodeAtCenter: (type, viewportCenter) => {
    const node = createNode(type, viewportCenter);
    set((state) => ({
      ...createUndoHistoryUpdate(state),
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
        ...createUndoHistoryUpdate(state, { coalesce: true }),
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
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        nodes,
        dirty: true,
      };
    });
  },

  deleteNode: (id) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge) => edge.source !== id && edge.target !== id,
      ),
      groups: state.groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((nid) => nid !== id) }))
        .filter((g) => g.nodeIds.length > 0),
      threeViewControllerNodeId:
        state.threeViewControllerNodeId === id
          ? null
          : state.threeViewControllerNodeId,
      dirty: true,
    }));
  },

  deleteNodes: (ids) => {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);

    set((state) => ({
      ...createUndoHistoryUpdate(state),
      nodes: state.nodes.filter((node) => !idSet.has(node.id)),
      edges: state.edges.filter(
        (edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
      ),
      groups: state.groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((nid) => !idSet.has(nid)) }))
        .filter((g) => g.nodeIds.length > 0),
      threeViewControllerNodeId:
        state.threeViewControllerNodeId && idSet.has(state.threeViewControllerNodeId)
          ? null
          : state.threeViewControllerNodeId,
      dirty: true,
    }));
  },

  addEdge: (edge) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      edges: [...state.edges, edge],
      dirty: true,
      error: null,
    }));
  },

  deleteEdge: (id) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
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
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      groups: [...state.groups, group],
      dirty: true,
    }));
    return group;
  },

  deleteGroup: (groupId) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      groups: state.groups.filter((g) => g.id !== groupId),
      dirty: true,
    }));
  },

  renameGroup: (groupId, name) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state, { coalesce: true }),
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      ),
      dirty: true,
    }));
  },

  updateGroupBackgroundColor: (groupId, backgroundColor) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, backgroundColor } : g,
      ),
      dirty: true,
    }));
  },

  removeNodeFromGroup: (groupId, nodeId) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
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
      ...createUndoHistoryUpdate(state, { coalesce: true }),
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
      return {
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        groups: updatedGroups,
        nodes: updatedNodes,
        dirty: true,
      };
    });
  },

  addMaterial: (item) => {
    const normalizedName = item.name.trim();
    const existing = get().materials.find(
      (candidate) =>
        candidate.name.trim() === normalizedName &&
        candidate.category === item.category,
    );

    if (existing) {
      return existing;
    }

    const nextItem: MaterialLibraryItem = {
      ...item,
      name: normalizedName,
      id: crypto.randomUUID(),
      createdAt: nowIso(),
    };

    set((state) => ({
      ...createUndoHistoryUpdate(state),
      materials: [...state.materials, nextItem],
      dirty: true,
      error: null,
    }));

    return nextItem;
  },

  deleteMaterial: (id) => {
    set((state) => {
      if (!state.materials.some((item) => item.id === id)) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state),
        materials: state.materials.filter((item) => item.id !== id),
        dirty: true,
        error: null,
      };
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

    const connectedImages = selectPromptReferences(
      getConnectedImagesForTargetNode(
        state.nodes,
        state.edges,
        textNodeId,
      ),
      textNode.data.aiPrompt,
    );
    const textTaskPrompt = stripReferenceMentionTokens(
      textNode.data.aiPrompt,
      connectedImages,
    );

    const promptSections = [
      textNode.data.text?.trim()
        ? `Current text content:\n${textNode.data.text.trim()}`
        : "",
      textTaskPrompt
        ? `Task instructions:\n${textTaskPrompt}`
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
      const textProvider =
        textNode.data.provider ?? readStoredSelectedApiProvider("text");
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
      ...createUndoHistoryUpdate(state, { coalesce: true }),
      projectName: name,
      dirty: computeDirtyState({
        projectName: name,
        nodes: state.nodes,
        edges: state.edges,
        groups: state.groups,
        materials: state.materials,
        lastSavedSignature: state.lastSavedSignature,
      }),
      error: null,
    }));
  },

  setSaveMessage: (message) => {
    set({ saveMessage: message });

    if (message) {
      scheduleSaveMessageClear(set);
    } else if (saveMessageClearTimer !== undefined) {
      window.clearTimeout(saveMessageClearTimer);
      saveMessageClearTimer = undefined;
    }
  },

  setThreeViewControllerNodeId: (nodeId) => {
    set({ threeViewControllerNodeId: nodeId });
  },

  undo: () => {
    set((state) => {
      const previous = state.undoStack[state.undoStack.length - 1];

      if (!previous) {
        return state;
      }

      const current = createCanvasHistorySnapshot(state);

      lastCanvasHistoryPushAt = 0;

      return {
        projectName: previous.projectName,
        nodes: previous.nodes,
        edges: previous.edges,
        groups: previous.groups,
        materials: previous.materials,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, current].slice(-CANVAS_HISTORY_LIMIT),
        dirty: getCanvasHistorySignature(previous) !== state.lastSavedSignature,
        error: null,
      };
    });
  },

  redo: () => {
    set((state) => {
      const next = state.redoStack[state.redoStack.length - 1];

      if (!next) {
        return state;
      }

      const current = createCanvasHistorySnapshot(state);

      lastCanvasHistoryPushAt = 0;

      return {
        projectName: next.projectName,
        nodes: next.nodes,
        edges: next.edges,
        groups: next.groups,
        materials: next.materials,
        undoStack: [...state.undoStack, current].slice(-CANVAS_HISTORY_LIMIT),
        redoStack: state.redoStack.slice(0, -1),
        dirty: getCanvasHistorySignature(next) !== state.lastSavedSignature,
        error: null,
      };
    });
  },

  markCleanFromSnapshot: (snapshot) => {
    set({
      projectId: snapshot.id,
      projectName: snapshot.name,
      projectCreatedAt: snapshot.createdAt,
      lastSavedAt: snapshot.updatedAt,
      lastSavedSignature: getPersistentProjectSnapshotSignature(snapshot),
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

  generateImageFromImageGenerationNode: async (imageGenerationNodeId, promptOverride, options) => {
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
      const hiddenPrompt = latestImageGenerationNode.data.effectivePromptOverride?.trim() || "";
      const connectedImages = selectPromptReferences(
        getImageGenerationReferenceImages(
          latestState.nodes,
          latestState.edges,
          imageGenerationNodeId,
        ),
        directPrompt,
      );
      const cleanDirectPrompt = stripReferenceMentionTokens(
        directPrompt,
        connectedImages,
      );
      const effectivePrompt = [
        connectedTextPrompt,
        cleanDirectPrompt,
        hiddenPrompt,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!effectivePrompt) {
        throw new Error("Prompt is required");
      }

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

      const shouldUseSelfGeneratedReference =
        Boolean(normalizedPromptOverride) && connectedImages.length === 0;
      const selfGeneratedReferences = shouldUseSelfGeneratedReference
        ? getGeneratedImageReferenceForImageGenerationNode(latestImageGenerationNode)
        : [];
      const referenceImages = [
        ...connectedImages,
        ...selfGeneratedReferences,
      ];
      const imageProvider =
        latestImageGenerationNode.data.provider ?? readStoredSelectedApiProvider("image");
      const shouldUploadReferenceImagesToOss =
        SHOULD_PREFER_OSS_FOR_REFERENCE_IMAGES || imageProvider === "grsai";
      let requestImages:
        | Array<{
            url: string;
            fileName?: string;
          }>
        | undefined;

      if (referenceImages.length > 0) {
        if (shouldUploadReferenceImagesToOss) {
          try {
            requestImages = await normalizeReferenceImagesViaOss(referenceImages);
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !/oss is not configured/i.test(error.message)
            ) {
              throw error;
            }

            requestImages = await normalizeReferenceImagesForRequest(referenceImages);
          }
        } else {
          requestImages = await normalizeReferenceImagesForRequest(referenceImages);
        }
      }

      if (shouldUploadReferenceImagesToOss && requestImages?.length) {
        console.info(
          "[GenLink] reference images for API",
          requestImages.map((image, index) => ({
            index: index + 1,
            type: getReferenceImageDebugLabel(image.url),
            url: image.url,
          })),
        );
      }

      if (process.env.NODE_ENV !== "production") {
        console.info("[GenLink] image generation references", {
          nodeId: imageGenerationNodeId,
          provider: imageProvider,
          referenceImages: referenceImages.length,
          requestImages: requestImages?.length ?? 0,
        });
      }

      const quality = resolveImageApiQuality(
        latestImageGenerationNode.data.detail,
      );
      const outputFormat = resolveImageApiOutputFormat(
        latestImageGenerationNode.data.outputFormat,
        latestImageGenerationNode.data.model,
      );
      const moderation = resolveImageApiModeration(
        latestImageGenerationNode.data.moderation,
        latestImageGenerationNode.data.model,
      );
      const parallelCount = resolveParallelCount(
        latestImageGenerationNode.data.parallelCount,
      );
      const runningHubWorkflowId =
        latestImageGenerationNode.data.runningHubWorkflowId?.trim();
      const apiKey = runningHubWorkflowId
        ? assertStoredRunningHubWorkflowApiKey()
        : assertStoredApiKey("image", imageProvider);
      const imageQuality = options?.quality ?? latestImageGenerationNode.data.quality;
      const imageAspectRatio = options?.aspectRatio ?? latestImageGenerationNode.data.aspectRatio;
      const size = resolveImageSize(
        imageQuality,
        imageAspectRatio,
        referenceImages,
        latestImageGenerationNode.data.model,
        imageProvider,
      );
      const baseJobParams = {
        prompt: effectivePrompt,
        model: latestImageGenerationNode.data.model,
        size,
        quality,
        outputFormat,
        moderation,
        runningHubChannel: latestImageGenerationNode.data.runningHubChannel,
        runningHubWorkflowId,
        provider: imageProvider,
        apiKey,
        images: requestImages,
      };
      const historyDisplayPrompt = stripImagePromptSectionLabels(directPrompt);
      const historyNodeData: ImageGenerationNodeData = {
        ...latestImageGenerationNode.data,
        prompt: historyDisplayPrompt,
        aspectRatio: imageAspectRatio,
        quality: imageQuality,
        effectivePromptOverride: hiddenPrompt || undefined,
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
          let hostedImageUrl = result.hostedImageUrl?.trim() || undefined;

          try {
            if (imageProvider === "grsai" && !result.hostedImageUrl?.trim()) {
              throw new Error("Grsai result was not cached to OSS");
            }

            if (imageProvider === "grsai") {
              hostedImageUrl = result.hostedImageUrl?.trim();
            } else if (shouldUploadReferenceImagesToOss) {
              try {
                hostedImageUrl = await uploadGeneratedResultToOss(
                  result,
                  latestImageGenerationNode.data.title,
                );
              } catch (error) {
                console.warn(
                  "[GenLink generated image OSS upload failed]",
                  {
                    provider: imageProvider,
                    sourceType: getReferenceImageDebugLabel(result.hostedImageUrl || result.imageUrl),
                    error: toErrorMessage(error),
                  },
                );
              }
            }

            const persistedImageUrl =
              hostedImageUrl || result.imageUrl;
            const persistedResult = hostedImageUrl
              ? { ...result, hostedImageUrl }
              : result;

            await get().persistProjectOutput({
              sourceKey: `${imageGenerationNodeId}:${result.generatedAt}:${result.imageUrl}`,
              imageUrl: persistedImageUrl,
              fileName: latestImageGenerationNode.data.title,
              generatedAt: result.generatedAt,
              nodeData: {
                ...historyNodeData,
                generatedImageUrl: result.imageUrl,
                generatedHostedImageUrl: hostedImageUrl,
                generatedImageWidth: result.width,
                generatedImageHeight: result.height,
                generatedImageFormat: result.format,
                generatedImageSizeBytes: result.sizeBytes,
                generatedModel: result.model,
                generatedAt: result.generatedAt,
                generationResults: [persistedResult],
              },
              title: latestImageGenerationNode.data.title,
              model: result.model,
              width: result.width,
              height: result.height,
              format: result.format,
              sizeBytes: result.sizeBytes,
            });

            if (hostedImageUrl) {
              set((currentState) => ({
                dirty: true,
                nodes: currentState.nodes.map((node) => {
                  if (node.id !== imageGenerationNodeId || node.type !== "image_generation") {
                    return node;
                  }

                  const matchesPrimaryImage =
                    node.data.generatedImageUrl === result.imageUrl &&
                    node.data.generatedAt === result.generatedAt;

                  return {
                    ...node,
                    data: {
                      ...node.data,
                      ...(matchesPrimaryImage
                        ? { generatedHostedImageUrl: hostedImageUrl }
                        : {}),
                      generationResults: node.data.generationResults?.map((item) =>
                        item.status === "completed" &&
                        item.generatedAt === result.generatedAt &&
                        item.imageUrl === result.imageUrl
                          ? { ...item, hostedImageUrl }
                          : item,
                      ),
                    },
                  };
                }),
              }));
            }
          } catch (error) {
            get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
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
        ...createUndoHistoryUpdate(currentState),
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
        ...createUndoHistoryUpdate(currentState),
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
        ...createUndoHistoryUpdate(currentState),
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
        ...createUndoHistoryUpdate(currentState),
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

  generateThreeViewImageFromNode: async (nodeId, cameraAngle) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === nodeId);

    if (!sourceNode) {
      throw new Error("Source node not found");
    }

    const source = getCanvasImageSource(sourceNode);

    if (!source) {
      throw new Error("Source image is missing");
    }

    const sourceDimensions = await resolveImageSourceDimensions(source);
    const sourceWidth = sourceDimensions.width ?? source.width;
    const sourceHeight = sourceDimensions.height ?? source.height;
    const imageProvider: ApiProvider = "runninghub";
    const model = "runninghub-workflow-3d-view";
    const prompt = buildThreeViewPrompt(cameraAngle);
    const referenceImage: ConnectedImagePayload = {
      id: sourceNode.id,
      imageUrl: source.hostedImageUrl?.trim() || source.imageUrl,
      hostedImageUrl: source.hostedImageUrl,
      fileName: source.fileName,
      width: sourceWidth,
      height: sourceHeight,
      alt: source.alt,
      previewUrl: source.imageUrl,
      originalImageUrl: source.imageUrl,
      sourceType: "image",
    };
    const newNodeId = crypto.randomUUID();
    const nodeTitle = sourceNode.type === "image" ? sourceNode.data.title || "Image" : "3D视角";
    const sourceDisplay = getCanvasImageNodeDisplayDimensions(
      sourceNode,
      sourceWidth,
      sourceHeight,
    );
    const placeholderNode: CanvasNode = {
      id: newNodeId,
      type: "image",
      position: {
        x: sourceNode.position.x + sourceDisplay.width + SPLIT_OUTPUT_GROUP_GAP,
        y: sourceNode.position.y,
      },
      data: {
        title: nodeTitle,
        imageUrl: "",
        prompt,
        model,
        width: sourceWidth,
        height: sourceHeight,
        generatedAt: nowIso(),
        sourceImageNodeId: sourceNode.id,
        cameraAngle,
        status: "generating",
      },
    };
    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      nodes: [...currentState.nodes, placeholderNode],
      dirty: true,
      error: null,
    }));
    try {
      const requestImages = await normalizeReferenceImagesForRequest([referenceImage]);
      const apiKey = assertStoredRunningHubWorkflowApiKey();
      const historyNodeData: ImageGenerationNodeData = {
        title: nodeTitle,
        prompt,
        effectivePromptOverride: prompt,
        provider: imageProvider,
        model,
        runningHubWorkflowId: THREE_VIEW_RUNNINGHUB_WORKFLOW_ID,
        aspectRatio: "auto",
        quality: "2K",
        detail: "medium",
        outputFormat: "png",
        moderation: "auto",
        parallelCount: 1,
        referenceImages: [{
          id: sourceNode.id,
          imageUrl: requestImages[0]?.url || referenceImage.imageUrl,
          hostedImageUrl: requestImages[0]?.url || referenceImage.hostedImageUrl,
          fileName: referenceImage.fileName,
          width: sourceWidth,
          height: sourceHeight,
        }],
        cameraAngle,
        status: "idle",
      };
      const result = await submitImageGenerationJob({
        prompt,
        model,
        size: resolveImageSize("2K", "auto", [referenceImage], model, imageProvider),
        quality: "medium",
        outputFormat: "png",
        moderation: "auto",
        provider: imageProvider,
        runningHubWorkflowId: THREE_VIEW_RUNNINGHUB_WORKFLOW_ID,
        apiKey,
        images: requestImages,
        historyNodeData,
      });
      const primaryImage = result.images[0];

      if (!primaryImage?.imageUrl) {
        throw new Error("Image generation failed");
      }

      const generatedAt = nowIso();
      const persistedSourceUrl = primaryImage.hostedImageUrl?.trim() || primaryImage.imageUrl;
      let persistedPreviewUrl: string | undefined;
      let persistedFileName: string | undefined;

      try {
        const currentProject = get().currentProject;

        if (currentProject) {
          const persisted = await persistGeneratedOutput(currentProject, {
            sourceKey: `${newNodeId}:${generatedAt}:${primaryImage.imageUrl}`,
            imageUrl: persistedSourceUrl,
            fileName: nodeTitle,
            generatedAt,
            nodeData: {
              ...historyNodeData,
              generatedImageUrl: primaryImage.imageUrl,
              generatedHostedImageUrl: primaryImage.hostedImageUrl,
              generatedImageWidth: primaryImage.width,
              generatedImageHeight: primaryImage.height,
              generatedImageFormat: primaryImage.format,
              generatedImageSizeBytes: primaryImage.sizeBytes,
              generatedModel: primaryImage.model,
              generatedAt,
              generationResults: [{
                status: "completed",
                imageUrl: primaryImage.imageUrl,
                hostedImageUrl: primaryImage.hostedImageUrl,
                model: primaryImage.model,
                width: primaryImage.width,
                height: primaryImage.height,
                format: primaryImage.format,
                sizeBytes: primaryImage.sizeBytes,
                generatedAt,
              }],
            },
            title: nodeTitle,
            model: primaryImage.model,
            width: primaryImage.width,
            height: primaryImage.height,
            format: primaryImage.format,
            sizeBytes: primaryImage.sizeBytes,
          });
          persistedPreviewUrl = persisted.previewUrl;
          persistedFileName = persisted.fileName;
        }
      } catch (error) {
        get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
      }

      set((currentState) => {
        const nextNodes = currentState.nodes.map((node) => {
          if (node.id !== newNodeId || node.type !== "image") {
            return node;
          }

          const nextNode: Extract<CanvasNode, { type: "image" }> = {
            ...node,
            data: {
              ...node.data,
              title: nodeTitle,
              imageUrl: primaryImage.imageUrl,
              hostedImageUrl: persistedPreviewUrl || primaryImage.hostedImageUrl,
              prompt,
              model: primaryImage.model,
              width: primaryImage.width,
              height: primaryImage.height,
              sizeBytes: primaryImage.sizeBytes,
              generatedAt,
              sourceImageNodeId: sourceNode.id,
              generatedOutputFileName: persistedFileName,
              cameraAngle,
              status: "idle",
              errorMessage: undefined,
            },
          };

          return nextNode;
        });

        return {
          ...createUndoHistoryUpdate(currentState),
          nodes: nextNodes,
          dirty: true,
          error: null,
        };
      });
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        ...createUndoHistoryUpdate(currentState),
        nodes: currentState.nodes.map((node) =>
          node.id === newNodeId && node.type === "image"
            ? {
                ...node,
                data: {
                  ...node.data,
                  status: "error",
                  errorMessage: message,
                },
              }
            : node,
        ),
        dirty: true,
        error: message,
      }));
    }

    return newNodeId;
  },

  createPanorama360ScreenshotNode: async (nodeId, capture) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "panorama-360" }> =>
        node.id === nodeId && node.type === "panorama-360",
    );

    if (!sourceNode) {
      throw new Error("Panorama 360 node not found");
    }

    if (!capture.dataUrl.trim()) {
      throw new Error("Screenshot image is missing");
    }

    const generatedAt = nowIso();
    const screenshotNodeId = crypto.randomUUID();
    const title = "场景截图";
    const imageUrl = capture.dataUrl;
    const sourceKey = `${screenshotNodeId}:${generatedAt}:${capture.dataUrl}`;
    const historyNodeData: ImageGenerationNodeData = {
      title,
      prompt: "360全景图场景截图",
      model: "panorama-360-capture",
      aspectRatio: capture.aspect,
      quality: "source",
      detail: "source",
      outputFormat: "png",
      moderation: "auto",
      parallelCount: 1,
      generatedImageUrl: imageUrl,
      generatedImageWidth: capture.width,
      generatedImageHeight: capture.height,
      generatedImageFormat: "PNG",
      generatedAt,
      generationResults: [{
        status: "completed",
        imageUrl,
        model: "panorama-360-capture",
        width: capture.width,
        height: capture.height,
        format: "PNG",
        generatedAt,
      }],
      status: "idle",
    };
    let hostedImageUrl: string | undefined;
    let fileName: string | undefined;
    let sizeBytes: number | undefined;

    try {
      if (state.currentProject) {
        const persisted = await persistGeneratedOutput(state.currentProject, {
          sourceKey,
          imageUrl,
          fileName: title,
          generatedAt,
          nodeData: historyNodeData,
          title,
          model: historyNodeData.model,
          width: capture.width,
          height: capture.height,
          format: "PNG",
        });

        hostedImageUrl = persisted.previewUrl;
        fileName = persisted.fileName;
        historyNodeData.generatedHostedImageUrl = persisted.previewUrl;
        historyNodeData.generatedOutputFileName = persisted.fileName;
        historyNodeData.generationResults = historyNodeData.generationResults?.map((result) => ({
          ...result,
          hostedImageUrl: persisted.previewUrl,
        }));
      }
    } catch (error) {
      get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
    }

    const nextNode: CanvasNode = {
      id: screenshotNodeId,
      type: "uploaded_image",
      position: {
        x: sourceNode.position.x + PANORAMA_360_NODE_HEIGHT * 16 / 9 + PANORAMA_360_NODE_GAP,
        y: sourceNode.position.y,
      },
      data: {
        title,
        imageUrl: hostedImageUrl || imageUrl,
        hostedImageUrl,
        fileName,
        outputFileName: fileName,
        width: capture.width,
        height: capture.height,
        displayWidth: capture.displayWidth,
        displayHeight: capture.displayHeight,
        sizeBytes,
      },
    };

    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      currentProjectPreviewUrls: hostedImageUrl
        ? [...currentState.currentProjectPreviewUrls, hostedImageUrl]
        : currentState.currentProjectPreviewUrls,
      nodes: [...currentState.nodes, nextNode],
      dirty: true,
      error: null,
    }));

    return screenshotNodeId;
  },

  createPanorama360FromImageNode: async (nodeId) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === nodeId);

    if (!sourceNode) {
      throw new Error("Image node not found");
    }

    const source = getCanvasImageSource(sourceNode);

    if (!source) {
      throw new Error("Source image is missing");
    }

    const dimensions = await resolveImageSourceDimensions(source);
    const sourceWidth = dimensions.width ?? source.width;
    const sourceHeight = dimensions.height ?? source.height;
    const sourceIsPanorama = isCloseToPanorama360AspectRatio(sourceWidth, sourceHeight);
    const sourceDisplay = getCanvasImageNodeDisplayDimensions(
      sourceNode,
      sourceWidth,
      sourceHeight,
    );
    const panoramaNodeId = crypto.randomUUID();
    const panoramaNode: Extract<CanvasNode, { type: "panorama-360" }> = {
      id: panoramaNodeId,
      type: "panorama-360",
      position: {
        x: sourceNode.position.x + sourceDisplay.width + PANORAMA_360_NODE_GAP,
        y: sourceNode.position.y + sourceDisplay.height - PANORAMA_360_NODE_HEIGHT,
      },
      data: createPanorama360NodeDataWithStatus(
        sourceIsPanorama ? "idle" : "generating",
      ),
    };
    const edge = sourceIsPanorama
      ? {
          id: crypto.randomUUID(),
          source: sourceNode.id,
          target: panoramaNode.id,
        }
      : null;

    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      nodes: [...currentState.nodes, panoramaNode],
      edges: edge ? [...currentState.edges, edge] : currentState.edges,
      dirty: true,
      error: null,
    }));

    if (sourceIsPanorama) {
      return panoramaNode.id;
    }

    try {
      const imageProvider = readStoredSelectedApiProvider("image");
      const apiKey = assertStoredApiKey("image", imageProvider);
      const historyNodeData: ImageGenerationNodeData = {
        title: "360全景图",
        prompt: PANORAMA_360_PROMPT,
        provider: imageProvider,
        model: "gpt-image-2",
        aspectRatio: "2:1",
        quality: "2K",
        detail: "medium",
        outputFormat: "png",
        moderation: "auto",
        parallelCount: 1,
        referenceImages: [{
          id: sourceNode.id,
          imageUrl: source.hostedImageUrl?.trim() || source.imageUrl,
          hostedImageUrl: source.hostedImageUrl,
          fileName: source.fileName,
          width: sourceWidth,
          height: sourceHeight,
        }],
        status: "idle",
      };
      const result = await submitImageGenerationJob({
        prompt: PANORAMA_360_PROMPT,
        model: "gpt-image-2",
        size: resolveImageSize("2K", "2:1", [], "gpt-image-2", imageProvider),
        quality: "medium",
        outputFormat: "png",
        moderation: "auto",
        provider: imageProvider,
        apiKey,
        historyNodeData,
      });
      const primaryImage = result.images[0];

      if (!primaryImage?.imageUrl) {
        throw new Error("Image generation failed");
      }

      const generatedAt = nowIso();
      const persistedSourceUrl = primaryImage.hostedImageUrl?.trim() || primaryImage.imageUrl;
      let persistedPreviewUrl: string | undefined;
      let persistedFileName: string | undefined;

      try {
        const currentProject = get().currentProject;

        if (currentProject) {
          const persisted = await persistGeneratedOutput(currentProject, {
            sourceKey: `${panoramaNode.id}:${generatedAt}:${primaryImage.imageUrl}`,
            imageUrl: persistedSourceUrl,
            fileName: "360全景图",
            generatedAt,
            nodeData: {
              ...historyNodeData,
              generatedImageUrl: primaryImage.imageUrl,
              generatedHostedImageUrl: primaryImage.hostedImageUrl,
              generatedImageWidth: primaryImage.width,
              generatedImageHeight: primaryImage.height,
              generatedImageFormat: primaryImage.format,
              generatedImageSizeBytes: primaryImage.sizeBytes,
              generatedModel: primaryImage.model,
              generatedAt,
              generationResults: [{
                status: "completed",
                imageUrl: primaryImage.imageUrl,
                hostedImageUrl: primaryImage.hostedImageUrl,
                model: primaryImage.model,
                width: primaryImage.width,
                height: primaryImage.height,
                format: primaryImage.format,
                sizeBytes: primaryImage.sizeBytes,
                generatedAt,
              }],
              status: "idle",
            },
            title: "360全景图",
            model: primaryImage.model,
            width: primaryImage.width,
            height: primaryImage.height,
            format: primaryImage.format,
            sizeBytes: primaryImage.sizeBytes,
          });
          persistedPreviewUrl = persisted.previewUrl;
          persistedFileName = persisted.fileName;
        }
      } catch (error) {
        get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
      }

      set((currentState) => ({
        dirty: true,
        error: null,
        currentProjectPreviewUrls: persistedPreviewUrl
          ? [...currentState.currentProjectPreviewUrls, persistedPreviewUrl]
          : currentState.currentProjectPreviewUrls,
        nodes: currentState.nodes.map((node) => {
          if (node.id !== panoramaNode.id || node.type !== "panorama-360") {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              panorama360Node: {
                ...node.data.panorama360Node,
                panorama: {
                  ...node.data.panorama360Node.panorama,
                  generatedImageUrl: primaryImage.imageUrl,
                  generatedHostedImageUrl:
                    persistedPreviewUrl || primaryImage.hostedImageUrl,
                  generatedOutputFileName: persistedFileName,
                  generatedImageWidth: primaryImage.width,
                  generatedImageHeight: primaryImage.height,
                  generatedImageFormat: primaryImage.format,
                  generatedImageSizeBytes: primaryImage.sizeBytes,
                  generatedModel: primaryImage.model,
                  generatedAt,
                  generationStatus: "idle",
                  generationErrorMessage: undefined,
                  isLoaded: false,
                  error: null,
                },
              },
            },
          };
        }),
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        dirty: true,
        error: message,
        nodes: currentState.nodes.map((node) => {
          if (node.id !== panoramaNode.id || node.type !== "panorama-360") {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              panorama360Node: {
                ...node.data.panorama360Node,
                panorama: {
                  ...node.data.panorama360Node.panorama,
                  generationStatus: "error",
                  generationErrorMessage: message,
                  error: message,
                },
              },
            },
          };
        }),
      }));
      throw error;
    }

    return panoramaNode.id;
  },

  removeReferenceImageFromImageGenerationNode: (
    imageGenerationNodeId,
    referenceImageId,
  ) => {
    set((state) => {
      const imageGenerationNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
          node.id === imageGenerationNodeId && node.type === "image_generation",
      );

      if (!imageGenerationNode) {
        return state;
      }

      const inlineReferenceImages =
        imageGenerationNode.data.referenceImages ?? [];
      const nextInlineReferenceImages = inlineReferenceImages.filter(
        (image) => image.id !== referenceImageId,
      );
      const removedInline =
        nextInlineReferenceImages.length !== inlineReferenceImages.length;
      const nextEdges = removedInline
        ? state.edges
        : state.edges.filter(
            (edge) =>
              !(
                edge.target === imageGenerationNodeId &&
                edge.source === referenceImageId
              ),
          );
      const removedEdge = nextEdges.length !== state.edges.length;

      if (!removedInline && !removedEdge) {
        return state;
      }

      const nextNodes = state.nodes.map((node) => {
        if (node.id !== imageGenerationNodeId || node.type !== "image_generation") {
          return node;
        }

        const nextNode: Extract<CanvasNode, { type: "image_generation" }> = {
          ...node,
          data: {
            ...node.data,
            referenceImages: nextInlineReferenceImages,
            prompt: reconcileReferenceMentionTokens(
              node.data.prompt,
              getImageGenerationReferenceImages(
                state.nodes.map((currentNode) =>
                  currentNode.id === imageGenerationNodeId &&
                  currentNode.type === "image_generation"
                    ? {
                        ...currentNode,
                        data: {
                          ...currentNode.data,
                          referenceImages: nextInlineReferenceImages,
                        },
                      }
                    : currentNode,
                ),
                nextEdges,
                imageGenerationNodeId,
              ),
            ),
            status: node.data.status === "error" ? "idle" : node.data.status,
            errorMessage: undefined,
          },
        };

        return nextNode;
      });

      return {
        ...createUndoHistoryUpdate(state),
        nodes: nextNodes,
        edges: nextEdges,
        dirty: true,
        error: null,
      };
    });
  },

  addReferenceImagesToImageGenerationNode: (
    imageGenerationNodeId,
    images,
  ) => {
    if (images.length === 0) {
      return;
    }

    set((state) => {
      const imageGenerationNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "image_generation" }> =>
          node.id === imageGenerationNodeId && node.type === "image_generation",
      );

      if (!imageGenerationNode) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        nodes: state.nodes.map((node) =>
          node.id === imageGenerationNodeId && node.type === "image_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: [
                    ...(node.data.referenceImages ?? []),
                    ...images.map((image) => ({
                      id: crypto.randomUUID(),
                      ...image,
                    })),
                  ],
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node,
        ),
        dirty: true,
        error: null,
      };
    });
  },

  getConnectedImagesForImageGenerationNode: (imageGenerationNodeId) => {
    const state = get();
    return getImageGenerationReferenceImages(
      state.nodes,
      state.edges,
      imageGenerationNodeId,
    );
  },

  getConnectedImagesForPanorama360Node: (panorama360NodeId) => {
    const state = get();
    return getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      panorama360NodeId,
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
      materials: [],
      loading: false,
      error: null,
      dirty: false,
      lastSavedAt: null,
      lastSavedSignature: getPersistentProjectSnapshotSignature({
        name: nextName,
        nodes: [],
        edges: [],
        groups: [],
        materials: [],
      }),
      saveMessage: null,
      undoStack: [],
      redoStack: [],
    });
  },

  saveProject: async () => {
    set({ loading: true, error: null });

    try {
      const state = get();

      if (!state.currentProject) {
        throw new Error("No project is currently open.");
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
        lastSavedSignature: getPersistentProjectSnapshotSignature(savedSnapshot),
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
        materials: hydrated.snapshot.materials ?? [],
        loading: false,
        error: null,
        dirty: false,
        lastSavedAt: hydrated.snapshot.updatedAt,
        lastSavedSignature: getPersistentProjectSnapshotSignature(hydrated.snapshot),
        undoStack: [],
        redoStack: [],
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
            materials: state.materials,
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
      materials: snapshot.materials ?? [],
      loading: false,
      error: null,
      dirty: false,
      lastSavedAt: snapshot.updatedAt,
      lastSavedSignature: getPersistentProjectSnapshotSignature(snapshot),
      saveMessage: null,
      undoStack: [],
      redoStack: [],
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
