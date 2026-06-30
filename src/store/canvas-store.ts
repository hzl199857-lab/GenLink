"use client";

import { create } from "zustand";

import {
  buildThreeViewPrompt,
  stripImagePromptSectionLabels,
} from "@/lib/image-prompt";
import {
  createReferenceMentionToken,
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
  AudioGenerationNodeData,
  AudioNodeData,
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
  StoryboardGridNodeData,
  StoryboardReferenceImage,
  StoryboardReferenceVideo,
  StoryboardRow,
  StoryboardScriptNodeData,
  TextNodeData,
  VideoNodeData,
  VideoGenerationMediaReference,
  VideoGenerationNodeData,
  VideoUpscaleNodeData,
} from "@/types/canvas";
import {
  STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
  STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
} from "@/lib/storyboard/layout";
import {
  TEXT_NODE_DEFAULT_CARD_HEIGHT,
  TEXT_NODE_DEFAULT_CARD_WIDTH,
} from "@/lib/text-node/layout";
import {
  isStoryboardRecord,
  normalizeStoryboardRow,
} from "@/lib/storyboard/normalize";

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

type VideoGenerationResponse =
  | ApiErrorResponse
  | {
      ok: true;
      status: "submitted";
      task: {
        taskId: string;
        model: string;
        officialFormat: boolean;
      };
    }
  | {
      ok: true;
      status: "pending";
      progress?: string;
    }
  | {
      ok: true;
      status: "error";
      error: string;
    }
  | {
      ok: true;
      status: "completed";
      result: {
        taskId: string;
        model: string;
        videoUrl: string;
        lastFrameUrl?: string;
        ratio?: string;
        resolution?: string;
        duration?: string;
        seed?: string;
      };
    };

type VideoUpscaleResponse =
  | ApiErrorResponse
  | {
      ok: true;
      status: "submitted";
      task: {
        taskId: string;
      };
    }
  | {
      ok: true;
      status: "pending";
      progress?: string;
    }
  | {
      ok: true;
      status: "error";
      error: string;
    }
  | {
      ok: true;
      status: "completed";
      result: {
        taskId: string;
        videoUrl: string;
        outputType?: string;
      };
    };

type AudioGenerationResponse =
  | ApiErrorResponse
  | {
      ok: true;
      status: "submitted";
        task: {
          taskId: string;
        model: string;
      };
    }
  | {
      ok: true;
      status: "pending";
      progress?: string;
    }
  | {
      ok: true;
      status: "error";
      error: string;
    }
  | {
      ok: true;
      status: "completed";
      result: {
        taskId: string;
        model: string;
        audioUrl: string;
        title?: string;
        durationSeconds?: number;
        mimeType?: string;
        sizeBytes?: number;
      };
    };

type StoryboardGenerationResponse =
  | ApiErrorResponse
  | {
      ok: true;
      data: {
        title: string;
        rows: StoryboardRow[];
      };
      rawJson: string;
      model?: string;
    };

type StoryboardJobPollResponse =
  | ApiErrorResponse
  | {
      ok: true;
      jobId: string;
      status: "pending";
    }
  | {
      ok: true;
      jobId: string;
      status: "completed";
      result: Extract<StoryboardGenerationResponse, { ok: true }>;
    }
  | {
      ok: true;
      jobId: string;
      status: "error";
      error?: string;
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
const inFlightVideoGenerationNodeIds = new Set<string>();
const inFlightVideoUpscaleNodeIds = new Set<string>();
const inFlightAudioGenerationNodeIds = new Set<string>();
const IMAGE_GENERATION_NODE_STAGE_WIDTH = 540;
const IMAGE_GENERATION_NODE_MIN_EDGE = 220;
const IMAGE_JOB_POLL_TIMEOUT_MS = 45 * 60_000;
const IMAGE_JOB_POLL_INTERVAL_MS = 1_000;
const IMAGE_JOB_POLL_REQUEST_TIMEOUT_MS = 30_000;
const IMAGE_JOB_SUBMIT_RETRY_COUNT = 3;
const IMAGE_JOB_SUBMIT_RETRY_DELAY_MS = 800;
const STORYBOARD_JOB_POLL_TIMEOUT_MS = 8 * 60_000;
const STORYBOARD_JOB_POLL_INTERVAL_MS = 2_000;
const REFERENCE_OSS_UPLOAD_CACHE_LIMIT = 80;
const VIDEO_JOB_POLL_TIMEOUT_MS = 45 * 60_000;
const VIDEO_JOB_POLL_INTERVAL_MS = 2_000;
const AUDIO_JOB_POLL_TIMEOUT_MS = 45 * 60_000;
const AUDIO_JOB_POLL_INTERVAL_MS = 2_000;
const REFERENCE_IMAGE_UPLOAD_MODE =
  process.env.NEXT_PUBLIC_REFERENCE_IMAGE_UPLOAD_MODE?.trim().toLowerCase();
const SHOULD_PREFER_OSS_FOR_REFERENCE_IMAGES =
  REFERENCE_IMAGE_UPLOAD_MODE !== "local";
const SPLIT_OUTPUT_GROUP_GAP = 48;
const SPLIT_OUTPUT_TILE_GAP = 12;
const UPLOADED_IMAGE_NODE_HEADER_HEIGHT = 40;
const UPLOADED_IMAGE_MAX_CARD_WIDTH = 420;
const UPLOADED_IMAGE_MAX_CARD_HEIGHT = 540;
const UPLOADED_IMAGE_MIN_CARD_WIDTH = 300;
const CANVAS_HISTORY_LIMIT = 100;
const CANVAS_HISTORY_COALESCE_MS = 700;
const SAVE_MESSAGE_AUTO_CLEAR_MS = 3_000;
const PANORAMA_360_PROMPT = `A seamless 360-degree equirectangular panorama of a {scene_type} environment, 
designed for VR viewing with perfect spherical continuity. 

{scene_description}

The space features consistent architectural/landscape logic, 
with {lighting_desc} lighting that creates {color_tone} tones throughout. 
Textures, perspectives, and environmental elements wrap continuously 
around the full 360 degrees鈥攍eft and right edges match flawlessly, 
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
export type ApiModelKind = "text" | "image" | "video";

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
  zhenzhen: "贞贞AI工坊",
};

export const CANVAS_TEXT_API_PROVIDER_STORAGE_KEY = "genlink.textApiProvider";
export const CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY = "genlink.imageApiProvider";
export const CANVAS_VIDEO_API_PROVIDER_STORAGE_KEY = "genlink.videoApiProvider";
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
const CANVAS_VIDEO_MODEL_STORAGE_KEY = "genlink.videoModel";
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
  if (kind === "text") {
    return CANVAS_TEXT_API_PROVIDER_STORAGE_KEY;
  }

  return kind === "video"
    ? CANVAS_VIDEO_API_PROVIDER_STORAGE_KEY
    : CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY;
}

function getModelStorageKey(kind: ApiModelKind): string {
  if (kind === "text") {
    return CANVAS_TEXT_MODEL_STORAGE_KEY;
  }

  return kind === "video"
    ? CANVAS_VIDEO_MODEL_STORAGE_KEY
    : CANVAS_IMAGE_MODEL_STORAGE_KEY;
}

function getApiKeyStorageKey(kind: ApiModelKind, provider: ApiProvider): string {
  if (kind === "video") {
    switch (provider) {
      case "zhenzhen":
        return CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY;
      default:
        return CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY;
    }
  }

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
    throw new Error("请先在 API 设置中配置 RunningHub 工作流 API Key");
  }

  return apiKey;
}

function assertStoredApiKey(kind: ApiModelKind, provider: ApiProvider): string {
  const apiKey = readStoredApiKey(kind, provider);

  if (!apiKey) {
    const kindLabel = kind === "text" ? "text" : kind === "video" ? "video" : "image";
    throw new Error(
      `Please configure the ${kindLabel} ${getApiProviderLabel(provider)} API Key in API settings first.`,
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
  semanticImageUrl?: string;
  originalImageUrl: string;
  hostedImageUrl?: string;
  fileName?: string;
  alt: string;
  sourceType: "image" | "uploaded_image" | "inline_reference";
  width?: number;
  height?: number;
  uploadStatus?: "uploading" | "uploaded" | "error";
  uploadError?: string;
};

type NormalizedReferenceImage = {
  url: string;
  fileName?: string;
};

const referenceOssUploadCache = new Map<string, Promise<NormalizedReferenceImage>>();

type ConnectedVideoPayload = {
  id: string;
  videoUrl: string;
  previewUrl?: string;
  hostedVideoUrl?: string;
  fileName?: string;
  alt: string;
  sourceType: "video_generation" | "video_upscale" | "video" | "inline_reference";
  width?: number;
  height?: number;
  durationSeconds?: number;
  uploadStatus?: "uploading" | "uploaded" | "error";
  uploadError?: string;
};

type InlineReferenceMediaUpdate = Partial<VideoGenerationMediaReference> & {
  imageUrl?: string;
  hostedImageUrl?: string;
  semanticImageUrl?: string;
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

function getConnectedVideoDedupKeys(video: ConnectedVideoPayload): string[] {
  const hostedVideoUrl = video.hostedVideoUrl?.trim();
  const videoUrl = video.videoUrl.trim();

  return [
    video.id ? `node:${video.id}` : null,
    hostedVideoUrl ? `url:${hostedVideoUrl}` : null,
    videoUrl ? `url:${videoUrl}` : null,
  ].filter((key): key is string => Boolean(key));
}

function dedupeConnectedVideos(
  videos: ConnectedVideoPayload[],
): ConnectedVideoPayload[] {
  const seen = new Set<string>();
  const deduped: ConnectedVideoPayload[] = [];

  for (const video of videos) {
    const keys = getConnectedVideoDedupKeys(video);

    if (keys.some((key) => seen.has(key))) {
      continue;
    }

    for (const key of keys) {
      seen.add(key);
    }
    deduped.push(video);
  }

  return deduped;
}

function createAudioReferenceFromNode(node: CanvasNode): VideoGenerationMediaReference | null {
  if (node.type === "audio") {
    const audioUrl = node.data.hostedAudioUrl?.trim() || node.data.audioUrl.trim();

    if (!audioUrl) {
      return null;
    }

    return {
      id: node.id,
      url: audioUrl,
      hostedUrl: node.data.hostedAudioUrl?.trim() || undefined,
      previewUrl: node.data.previewUrl,
      fileName: node.data.fileName,
      mimeType: node.data.mimeType || "audio/*",
      sizeBytes: node.data.sizeBytes,
      durationSeconds: node.data.durationSeconds,
      uploadStatus: node.data.status === "error" ? "error" : "uploaded",
      uploadError: node.data.errorMessage,
    };
  }

  if (node.type === "audio_generation") {
    const audioUrl = node.data.hostedAudioUrl?.trim() || node.data.audioUrl?.trim();

    if (!audioUrl) {
      return null;
    }

    return {
      id: node.id,
      url: audioUrl,
      hostedUrl: node.data.hostedAudioUrl?.trim() || undefined,
      fileName: node.data.generatedOutputFileName,
      mimeType: node.data.mimeType || "audio/*",
      sizeBytes: node.data.sizeBytes,
      durationSeconds: node.data.durationSeconds,
      uploadStatus: node.data.status === "error" ? "error" : "uploaded",
      uploadError: node.data.errorMessage,
    };
  }

  return null;
}

function appendDedupeReferences(
  current: VideoGenerationMediaReference[] | undefined,
  refs: VideoGenerationMediaReference[],
): VideoGenerationMediaReference[] {
  const existing = current ?? [];
  const seen = new Set(
    existing.flatMap((reference) => [
      reference.id,
      reference.url,
      reference.hostedUrl,
    ]).filter((value): value is string => Boolean(value?.trim())),
  );
  const nextRefs = refs.filter((reference) => {
    const keys = [reference.id, reference.url, reference.hostedUrl]
      .filter((value): value is string => Boolean(value?.trim()));

    if (keys.some((key) => seen.has(key))) {
      return false;
    }

    keys.forEach((key) => seen.add(key));
    return true;
  });

  return [...existing, ...nextRefs];
}

type CanvasImageSource = {
  imageUrl: string;
  hostedImageUrl?: string;
  previewUrl?: string;
  semanticImageUrl?: string;
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

function isGeminiTextModel(model?: string): boolean {
  return typeof model === "string" && /^gemini-/i.test(model);
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

function stripVideoReferenceMentionTokens(
  value: string | undefined,
  images: Array<{ id: string }> = [],
  videos: Array<{ id: string }> = [],
): string {
  const imageOrderById = new Map(
    images.map((image, index) => [image.id, index + 1]),
  );
  const videoOrderById = new Map(
    videos.map((video, index) => [video.id, index + 1]),
  );
  const mentions = parseReferenceMentions(value);
  const fallbackImageOrder = new Map<string, number>();
  const fallbackVideoOrder = new Map<string, number>();
  let nextValue = value ?? "";

  for (const mention of mentions) {
    const imageIndex = imageOrderById.get(mention.nodeId);
    let label: string;

    if (imageIndex) {
      label = `\u53c2\u8003\u56fe${imageIndex}`;
    } else {
      const videoIndex = videoOrderById.get(mention.nodeId);

      if (videoIndex) {
        label = `\u53c2\u8003\u89c6\u9891${videoIndex}`;
      } else {
        const mentionLabel = mention.label.trim();
        const isVideo = mentionLabel.startsWith("\u89c6\u9891");

        if (isVideo) {
          const fallbackIndex =
            fallbackVideoOrder.get(mention.nodeId) ??
            fallbackVideoOrder.size + 1;
          fallbackVideoOrder.set(mention.nodeId, fallbackIndex);
          label = `\u53c2\u8003\u89c6\u9891${fallbackIndex}`;
        } else {
          const fallbackIndex =
            fallbackImageOrder.get(mention.nodeId) ??
            fallbackImageOrder.size + 1;
          fallbackImageOrder.set(mention.nodeId, fallbackIndex);
          label = `\u53c2\u8003\u56fe${fallbackIndex}`;
        }
      }
    }

    nextValue = nextValue.replace(
      createReferenceMentionToken(mention.nodeId, mention.label),
      label,
    );
  }

  return nextValue
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reconcileImageVideoReferenceMentionTokens(
  value: string | undefined,
  images: Array<{ id: string; label?: string }> = [],
  videos: Array<{ id: string; label?: string }> = [],
): string {
  if (!parseReferenceMentions(value).length) {
    return value ?? "";
  }

  const references = [
    ...images.map((image, index) => ({
      id: image.id,
      label: image.label?.trim() || `\u56fe\u7247${index + 1}`,
    })),
    ...videos.map((video, index) => ({
      id: video.id,
      label: video.label?.trim() || `\u89c6\u9891${index + 1}`,
    })),
  ];

  return reconcileReferenceMentionTokens(value, references);
}

function createTextNodeData(): TextNodeData {
  const provider = readStoredSelectedApiProvider("text");

  return {
    title: "Text",
    text: "",
    cardWidth: TEXT_NODE_DEFAULT_CARD_WIDTH,
    cardHeight: TEXT_NODE_DEFAULT_CARD_HEIGHT,
    provider,
    model: readStoredSelectedModel("text", "gpt-5.4"),
    status: "idle",
  };
}

function createStoryboardScriptNodeData(): StoryboardScriptNodeData {
  const provider = readStoredSelectedApiProvider("text");

  return {
    title: "分镜脚本",
    prompt: "",
    rows: [],
    cardWidth: STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
    cardHeight: STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
    provider,
    model: readStoredSelectedModel("text", "gpt-5.4"),
    status: "idle",
    viewMode: "list",
    focusMode: "imagePrompt",
    referenceImages: [],
  };
}

function createStoryboardGridNodeData(): StoryboardGridNodeData {
  return {
    title: "分镜格子",
    aspectRatio: "16:9",
    grid: "3x3",
    cells: Array.from({ length: 9 }, () => null),
    isEditing: false,
    isCollapsed: false,
    status: "idle",
  };
}

function normalizeStoryboardGridNodeData(data: unknown): StoryboardGridNodeData {
  const defaults = createStoryboardGridNodeData();
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const aspectRatio = record.aspectRatio === "16:9" ||
    record.aspectRatio === "9:16" ||
    record.aspectRatio === "3:4" ||
    record.aspectRatio === "4:3" ||
    record.aspectRatio === "1:1"
      ? record.aspectRatio
      : defaults.aspectRatio;
  const grid = record.grid === "2x2" ||
    record.grid === "3x3" ||
    record.grid === "4x4" ||
    record.grid === "5x5"
      ? record.grid
      : defaults.grid;
  const [columns, rows] = grid.split("x").map((value) => Number(value));
  const count = (columns || 3) * (rows || 3);
  const rawCells = Array.isArray(record.cells) ? record.cells : [];
  const cells = rawCells.length > 0
    ? Array.from({ length: count }, (_, index) => {
        const cell = rawCells[index];
        return cell && typeof cell === "object" ? cell as StoryboardGridNodeData["cells"][number] : null;
      })
    : Array.from({ length: count }, () => null);

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    aspectRatio,
    grid,
    cells,
    isEditing: Boolean(record.isEditing),
    isCollapsed: Boolean(record.isCollapsed),
    status: record.status === "generating" || record.status === "error" || record.status === "idle"
      ? record.status
      : defaults.status,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

function normalizeStoryboardScriptNodeData(data: unknown): StoryboardScriptNodeData {
  const defaults = createStoryboardScriptNodeData();
  const record = isStoryboardRecord(data) ? data : {};
  const rows = Array.isArray(record.rows)
    ? record.rows.map(normalizeStoryboardRow)
    : [];
  const referenceImages = Array.isArray(record.referenceImages)
    ? record.referenceImages.filter((item): item is StoryboardReferenceImage => {
        if (!isStoryboardRecord(item)) {
          return false;
        }

        return typeof item.label === "string" &&
          typeof item.url === "string" &&
          typeof item.sourceNodeId === "string";
      })
    : [];
  const viewMode = record.viewMode === "card" || record.viewMode === "list"
    ? record.viewMode
    : defaults.viewMode;
  const focusMode = record.focusMode === "videoPrompt" || record.focusMode === "imagePrompt"
    ? record.focusMode
    : defaults.focusMode;
  const status = record.status === "generating" || record.status === "error" || record.status === "idle"
    ? record.status
    : defaults.status;

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    prompt: typeof record.prompt === "string" ? record.prompt : defaults.prompt,
    rows,
    rawJson: typeof record.rawJson === "string" ? record.rawJson : undefined,
    cardWidth: typeof record.cardWidth === "number" ? record.cardWidth : defaults.cardWidth,
    cardHeight: typeof record.cardHeight === "number" ? record.cardHeight : defaults.cardHeight,
    status,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
    viewMode,
    focusMode,
    provider: typeof record.provider === "string"
      ? record.provider as StoryboardScriptNodeData["provider"]
      : defaults.provider,
    model: typeof record.model === "string" ? record.model : defaults.model,
    referenceImages,
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

function createVideoNodeData(): VideoNodeData {
  return {
    title: "Video",
    videoUrl: "",
    width: 320,
    height: 180,
  };
}

function createVideoGenerationNodeData(): VideoGenerationNodeData {
  return {
    title: "Video",
    prompt: "",
    provider: "comfly",
    model: readStoredSelectedModel("video", "doubao-seedance-2-0-260128"),
    mode: "all-reference",
    ratio: "16:9",
    resolution: "720p",
    duration: 5,
    watermark: false,
    camerafixed: false,
    returnLastFrame: false,
    generateAudio: false,
    status: "idle",
  };
}

function createAudioGenerationNodeData(): AudioGenerationNodeData {
  return {
    title: "Audio",
    songTitle: "",
    songTitleEdited: false,
    generatedAudioTitle: "",
    prompt: "",
    provider: "comfly",
    model: "suno-v5.5",
    mode: "inspiration",
    runningHubWorkflowId: "",
    instanceType: "default",
    taskType: "music",
    duration: 10,
    style: "",
    voice: "",
    instrumental: false,
    negativeTags: "",
    vocalGender: "auto",
    referenceAudio: [],
    status: "idle",
  };
}

function createAudioNodeData(): AudioNodeData {
  return {
    title: "Audio",
    audioUrl: "",
    status: "idle",
  };
}

function normalizeAudioNodeData(data: unknown): AudioNodeData {
  const defaults = createAudioNodeData();
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : "",
    hostedAudioUrl: typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
    previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
    fileName: typeof record.fileName === "string" ? record.fileName : undefined,
    outputFileName: typeof record.outputFileName === "string" ? record.outputFileName : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    status: record.status === "generating" || record.status === "error" ? record.status : "idle",
    statusMessage: typeof record.statusMessage === "string" ? record.statusMessage : undefined,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

function normalizeAudioGenerationNodeData(data: unknown): AudioGenerationNodeData {
  const defaults = createAudioGenerationNodeData();
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const taskType = record.taskType === "voiceover" ||
    record.taskType === "music" ||
    record.taskType === "sound-effect"
      ? record.taskType
      : "general";
  const provider = record.provider === "runninghub"
    ? "runninghub"
    : record.provider === "zhenzhen"
      ? "zhenzhen"
      : "comfly";
  const model =
    record.model === "runninghub-voice-clone" ||
    record.model === "suno-v5" ||
    record.model === "suno-v4.5-plus"
      ? record.model
      : "suno-v5.5";
  const mode = record.mode === "custom" ? "custom" : "inspiration";
  const vocalGender =
    record.vocalGender === "f" || record.vocalGender === "m"
      ? record.vocalGender
      : "auto";
  const songTitleEdited = record.songTitleEdited === true;
  const legacySongTitle = typeof record.songTitle === "string" ? record.songTitle : "";

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    songTitle: songTitleEdited ? legacySongTitle : "",
    songTitleEdited,
    generatedAudioTitle: typeof record.generatedAudioTitle === "string"
      ? record.generatedAudioTitle
      : songTitleEdited
        ? ""
        : legacySongTitle,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    provider,
    model,
    mode,
    runningHubWorkflowId: typeof record.runningHubWorkflowId === "string"
      ? record.runningHubWorkflowId
      : "",
    instanceType: record.instanceType === "plus" ? "plus" : "default",
    taskType,
    duration: typeof record.duration === "number" ? record.duration : defaults.duration,
    style: typeof record.style === "string" ? record.style : "",
    voice: typeof record.voice === "string" ? record.voice : "",
    instrumental: record.instrumental === true,
    negativeTags: typeof record.negativeTags === "string" ? record.negativeTags : "",
    vocalGender,
    referenceAudio: Array.isArray(record.referenceAudio)
      ? record.referenceAudio as VideoGenerationMediaReference[]
      : [],
    taskId: typeof record.taskId === "string" ? record.taskId : undefined,
    progress: typeof record.progress === "string" ? record.progress : undefined,
    audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : undefined,
    hostedAudioUrl: typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
    generatedOutputFileName: typeof record.generatedOutputFileName === "string"
      ? record.generatedOutputFileName
      : undefined,
    generatedModel: typeof record.generatedModel === "string" ? record.generatedModel : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    status: record.status === "generating" || record.status === "error" ? record.status : "idle",
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

function createVideoUpscaleNodeData(): VideoUpscaleNodeData {
  return {
    title: "视频超清",
    targetResolution: "1080p",
    targetFps: "30",
    instanceType: "default",
    status: "idle",
  };
}

function normalizeVideoUpscaleTitle(value?: string): string {
  const trimmed = value?.trim();

  if (!trimmed || /瑙嗛|瓒呮|鐞|璧/.test(trimmed)) {
    return "视频超清";
  }

  return trimmed;
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

function readVideoMetadataFromUrl(src: string): Promise<{
  width: number;
  height: number;
  durationSeconds?: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      video.removeAttribute("src");
      video.load();
      reject(new Error("Video metadata timed out"));
    }, 10_000);

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };
    const handleLoadedMetadata = () => {
      if (settled) {
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        handleError();
        return;
      }

      settled = true;
      cleanup();
      resolve({
        width,
        height,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
      });
    };
    const handleError = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error("Failed to read video metadata"));
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.src = src;
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
    const fallback = getDisplayDimensionsForImage(sourceWidth, sourceHeight);

    return {
      width: node.data.displayWidth ?? fallback.width,
      height: node.data.displayHeight ?? fallback.height,
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
  console.info("[GenLink] reference image upload step", {
    step: "create-upload-url",
    folder,
    fileName,
    contentType,
    sizeBytes: blob.size,
  });
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

  console.info("[GenLink] reference image upload step", {
    step: "put-oss",
    folder,
    fileName,
    contentType,
    sizeBytes: blob.size,
    imageUrl: targetJson.result.imageUrl,
  });
  const uploadResponse = await fetch(targetJson.result.uploadUrl, {
    method: "PUT",
    headers: targetJson.result.headers,
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image to OSS (${uploadResponse.status})`);
  }

  console.info("[GenLink] reference image upload step", {
    step: "put-oss-complete",
    folder,
    fileName,
    contentType,
    sizeBytes: blob.size,
    imageUrl: targetJson.result.imageUrl,
  });
  return targetJson.result.imageUrl;
}

async function uploadVideoBlobToOss(
  blob: Blob,
  fileName?: string,
  folder = "processing/videos",
): Promise<string> {
  const contentType = blob.type || "video/mp4";
  const targetResponse = await fetch("/api/media-hosting/upload-url", {
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
          mediaUrl: string;
          headers: Record<string, string>;
        };
      }
    | ApiErrorResponse
  >(targetResponse, "Failed to create video upload URL");

  if (!targetResponse.ok || !targetJson.ok) {
    throw new Error(
      "error" in targetJson ? targetJson.error : "Failed to create video upload URL",
    );
  }

  const uploadResponse = await fetch(targetJson.result.uploadUrl, {
    method: "PUT",
    headers: targetJson.result.headers,
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload video to OSS (${uploadResponse.status})`);
  }

  return targetJson.result.mediaUrl;
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
  console.info("[GenLink] reference image upload step", {
    step: "read-reference-image",
    viaProxy: shouldReadViaProxy,
    urlType: getReferenceImageDebugLabel(url),
  });
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

  const blob = await response.blob();

  console.info("[GenLink] reference image upload step", {
    step: "read-reference-image-complete",
    viaProxy: shouldReadViaProxy,
    urlType: getReferenceImageDebugLabel(url),
    contentType: blob.type || contentType,
    sizeBytes: blob.size,
  });

  return blob;
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
}): Promise<NormalizedReferenceImage> {
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

function getReferenceOssUploadCacheKey(image: ConnectedImagePayload): string {
  return (
    image.hostedImageUrl?.trim() ||
    image.originalImageUrl?.trim() ||
    image.imageUrl.trim()
  );
}

function rememberReferenceOssUpload(
  cacheKey: string,
  uploadPromise: Promise<NormalizedReferenceImage>,
) {
  if (referenceOssUploadCache.size >= REFERENCE_OSS_UPLOAD_CACHE_LIMIT) {
    const oldestKey = referenceOssUploadCache.keys().next().value;

    if (oldestKey) {
      referenceOssUploadCache.delete(oldestKey);
    }
  }

  referenceOssUploadCache.set(cacheKey, uploadPromise);
}

async function normalizeReferenceImagesViaOss(
  images: ConnectedImagePayload[],
  options?: { dedupe?: boolean },
): Promise<Array<{ url: string; fileName?: string }>> {
  const requestImages: Array<{ url: string; fileName?: string }> = [];
  const seenRequestUrls = new Set<string>();
  const shouldDedupe = options?.dedupe ?? true;

  console.info("[GenLink] reference image upload step", {
    step: "normalize-start",
    count: images.length,
    items: images.map((image, index) => ({
      index: index + 1,
      id: image.id,
      sourceType: image.sourceType,
      urlType: getReferenceImageDebugLabel(
        image.hostedImageUrl?.trim() ||
          image.originalImageUrl?.trim() ||
          image.imageUrl.trim(),
      ),
      fileName: image.fileName,
    })),
  });

  for (const image of images) {
    const cacheKey = getReferenceOssUploadCacheKey(image);
    let normalizedPromise = referenceOssUploadCache.get(cacheKey);

    if (normalizedPromise) {
      console.info("[GenLink] reference image upload step", {
        step: "normalize-cache-hit",
        id: image.id,
        sourceType: image.sourceType,
        urlType: getReferenceImageDebugLabel(cacheKey),
      });
    } else {
      normalizedPromise = normalizeReferenceImageViaOss({
        imageUrl: image.imageUrl,
        fileName: image.fileName,
      });
      rememberReferenceOssUpload(cacheKey, normalizedPromise);
    }

    let normalized: NormalizedReferenceImage;

    try {
      normalized = await normalizedPromise;
    } catch (error) {
      if (referenceOssUploadCache.get(cacheKey) === normalizedPromise) {
        referenceOssUploadCache.delete(cacheKey);
      }
      console.error("[GenLink] reference image upload failed", {
        id: image.id,
        sourceType: image.sourceType,
        urlType: getReferenceImageDebugLabel(cacheKey),
        fileName: image.fileName,
        error,
      });
      throw error;
    }
    const requestUrl = normalized.url.trim();

    if (!requestUrl || (shouldDedupe && seenRequestUrls.has(requestUrl))) {
      continue;
    }

    if (shouldDedupe) {
      seenRequestUrls.add(requestUrl);
    }
    requestImages.push(normalized);
  }

  console.info("[GenLink] reference image upload step", {
    step: "normalize-complete",
    count: requestImages.length,
    items: requestImages.map((image, index) => ({
      index: index + 1,
      urlType: getReferenceImageDebugLabel(image.url),
      fileName: image.fileName,
    })),
  });

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
  options?: { dedupe?: boolean },
): Promise<Array<{ url: string; fileName?: string }>> {
  const uploadCache = new Map<string, Promise<string>>();
  const requestImages: Array<{ url: string; fileName?: string }> = [];
  const seenRequestUrls = new Set<string>();
  const shouldDedupe = options?.dedupe ?? true;

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

    if (!requestUrl || (shouldDedupe && seenRequestUrls.has(requestUrl))) {
      continue;
    }

    if (shouldDedupe) {
      seenRequestUrls.add(requestUrl);
    }
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

function getUploadedImageDisplayDimensions(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const imageWidth = Math.max(sourceWidth || 320, 1);
  const imageHeight = Math.max(sourceHeight || 320, 1);
  const imageAspectRatio = imageWidth / imageHeight;
  const fittedWidthByHeight = UPLOADED_IMAGE_MAX_CARD_HEIGHT * imageAspectRatio;
  const width = Math.min(
    UPLOADED_IMAGE_MAX_CARD_WIDTH,
    Math.max(
      UPLOADED_IMAGE_MIN_CARD_WIDTH,
      Math.min(imageWidth, fittedWidthByHeight),
    ),
  );

  return {
    width,
    height: width * (imageHeight / imageWidth),
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
    case "storyboard_script":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createStoryboardScriptNodeData(),
      };
    case "storyboard_grid":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createStoryboardGridNodeData(),
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
    case "video_generation":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createVideoGenerationNodeData(),
      };
    case "audio_generation":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createAudioGenerationNodeData(),
      };
    case "video_upscale":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createVideoUpscaleNodeData(),
      };
    case "video":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createVideoNodeData(),
      };
    case "audio":
      return {
        id: crypto.randomUUID(),
        type,
        position,
        data: createAudioNodeData(),
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
        type: "image",
        position,
        data: createImageNodeData(),
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
  currentProjectThumbnailFileName?: string;
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
    thumbnailFileName: state.currentProjectThumbnailFileName,
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

async function requestVideoTaskStatus(params: {
  provider: "comfly" | "zhenzhen";
  apiKey: string;
  taskId: string;
  model: string;
  officialFormat: boolean;
}): Promise<VideoGenerationResponse> {
  const response = await fetch("/api/ai/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "status",
      provider: params.provider,
      apiKey: params.apiKey,
      taskId: params.taskId,
      model: params.model,
      officialFormat: params.officialFormat,
    }),
  });
  const json = await readJsonResponse<VideoGenerationResponse>(
    response,
    "Video generation status request failed",
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Video generation status request failed" : json.error);
  }

  return json;
}

async function waitForVideoTaskResult(params: {
  provider: "comfly" | "zhenzhen";
  apiKey: string;
  taskId: string;
  model: string;
  officialFormat: boolean;
  onProgress?: (progress?: string) => void;
}): Promise<Extract<VideoGenerationResponse, { status: "completed" }>["result"]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < VIDEO_JOB_POLL_TIMEOUT_MS) {
    const json = await requestVideoTaskStatus(params);

    if (json.ok && json.status === "completed") {
      return json.result;
    }

    if (json.ok && json.status === "error") {
      throw new Error(json.error || "Video generation failed");
    }

    if (json.ok && json.status === "pending") {
      params.onProgress?.(json.progress);
    }

    await sleep(VIDEO_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("Video generation timed out");
}

async function requestAudioTaskStatus(params: {
  provider: "comfly" | "zhenzhen" | "runninghub";
  apiKey: string;
  taskId: string;
  model: string;
}): Promise<AudioGenerationResponse> {
  const response = await fetch("/api/ai/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "status",
      provider: params.provider,
      apiKey: params.apiKey,
      taskId: params.taskId,
      model: params.model,
    }),
  });
  const json = await readJsonResponse<AudioGenerationResponse>(
    response,
    "Audio generation status request failed",
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Audio generation status request failed" : json.error);
  }

  return json;
}

async function waitForAudioTaskResult(params: {
  provider: "comfly" | "zhenzhen" | "runninghub";
  apiKey: string;
  taskId: string;
  model: string;
  onProgress?: (progress?: string) => void;
}): Promise<Extract<AudioGenerationResponse, { status: "completed" }>["result"]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < AUDIO_JOB_POLL_TIMEOUT_MS) {
    const json = await requestAudioTaskStatus(params);

    if (json.ok && json.status === "completed") {
      return json.result;
    }

    if (json.ok && json.status === "error") {
      throw new Error(json.error || "Audio generation failed");
    }

    if (json.ok && json.status === "pending") {
      params.onProgress?.(json.progress);
    }

    await sleep(AUDIO_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("Audio generation timed out");
}

async function requestVideoUpscaleTaskStatus(params: {
  apiKey: string;
  taskId: string;
}): Promise<VideoUpscaleResponse> {
  const response = await fetch("/api/ai/video-upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "status",
      apiKey: params.apiKey,
      taskId: params.taskId,
    }),
  });
  const json = await readJsonResponse<VideoUpscaleResponse>(
    response,
    "Video upscale status request failed",
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Video upscale status request failed" : json.error);
  }

  return json;
}

async function waitForVideoUpscaleTaskResult(params: {
  apiKey: string;
  taskId: string;
  onProgress?: (progress?: string) => void;
}): Promise<Extract<VideoUpscaleResponse, { status: "completed" }>["result"]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < VIDEO_JOB_POLL_TIMEOUT_MS) {
    const json = await requestVideoUpscaleTaskStatus(params);

    if (json.ok && json.status === "completed") {
      return json.result;
    }

    if (json.ok && json.status === "error") {
      throw new Error(json.error || "Video upscale failed");
    }

    if (json.ok && json.status === "pending") {
      params.onProgress?.(json.progress);
    }

    await sleep(VIDEO_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("Video upscale timed out");
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

function shouldFallbackUploadGeneratedResultToOss(
  result: ImageGenerationResultItem & { status: "completed"; imageUrl: string },
): boolean {
  const hostedUrl = result.hostedImageUrl?.trim();
  const sourceUrl = hostedUrl || result.imageUrl.trim();

  if (!sourceUrl || isAliyunOssUrl(sourceUrl)) {
    return false;
  }

  if (hostedUrl && /^https?:\/\//i.test(hostedUrl)) {
    return false;
  }

  return (
    sourceUrl.startsWith("data:") ||
    isObjectUrl(sourceUrl) ||
    isSameOriginUrl(sourceUrl) ||
    !/^https?:\/\//i.test(sourceUrl)
  );
}

function sanitizeImageGenerationNodeDataForPersistence(
  data: ImageGenerationNodeData,
): ImageGenerationNodeData {
  return stripEmbeddedImageDataFromNodeData(data);
}

function normalizeLoadedCanvasNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => {
    if (node.type === "storyboard_script") {
      return {
        ...node,
        data: normalizeStoryboardScriptNodeData(node.data),
      };
    }

    if (node.type === "storyboard_grid") {
      return {
        ...node,
        data: normalizeStoryboardGridNodeData(node.data),
      };
    }

    if (node.type === "audio") {
      return {
        ...node,
        data: normalizeAudioNodeData(node.data),
      };
    }

    if (node.type === "audio_generation") {
      return {
        ...node,
        data: normalizeAudioGenerationNodeData(node.data),
      };
    }

    return node;
  });
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
      if (node.type === "storyboard_grid") {
        return {
          ...node,
          data: {
            ...node.data,
            cells: node.data.cells.map((cell) => {
              if (!cell) {
                return null;
              }

              const persistentImageUrl = isObjectUrl(cell.imageUrl)
                ? cell.hostedImageUrl?.trim()
                : cell.imageUrl;

              return {
                ...cell,
                imageUrl: persistentImageUrl || cell.imageUrl,
                previewUrl: isObjectUrl(cell.previewUrl) ? undefined : cell.previewUrl,
              };
            }),
          },
        };
      }

      if (node.type === "video" && node.data.outputFileName?.trim()) {
        return {
          ...node,
          data: {
            ...node.data,
            videoUrl: `output:${node.data.outputFileName}`,
            hostedVideoUrl: undefined,
          },
        };
      }

      if (node.type === "audio" && node.data.outputFileName?.trim()) {
        return {
          ...node,
          data: {
            ...node.data,
            audioUrl: `output:${node.data.outputFileName}`,
            hostedAudioUrl: undefined,
          },
        };
      }

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
      if (node.type === "video") {
        if (isObjectUrl(node.data.hostedVideoUrl)) {
          urls.add(node.data.hostedVideoUrl as string);
        }

        if (isObjectUrl(node.data.videoUrl)) {
          urls.add(node.data.videoUrl);
        }
      }

      if (node.type === "audio") {
        if (isObjectUrl(node.data.hostedAudioUrl)) {
          urls.add(node.data.hostedAudioUrl as string);
        }

        if (isObjectUrl(node.data.previewUrl)) {
          urls.add(node.data.previewUrl as string);
        }

        if (isObjectUrl(node.data.audioUrl)) {
          urls.add(node.data.audioUrl);
        }
      }

      if (node.type === "audio_generation") {
        const audioUrl = node.data.audioUrl;

        if (isObjectUrl(node.data.hostedAudioUrl)) {
          urls.add(node.data.hostedAudioUrl as string);
        }

        if (typeof audioUrl === "string" && isObjectUrl(audioUrl)) {
          urls.add(audioUrl);
        }
      }

      if (node.type === "image") {
        if (isObjectUrl(node.data.hostedImageUrl)) {
          urls.add(node.data.hostedImageUrl as string);
        }

        if (isObjectUrl(node.data.imageUrl)) {
          urls.add(node.data.imageUrl);
        }
      }

      if (node.type === "uploaded_image") {
        if (isObjectUrl(node.data.hostedImageUrl)) {
          urls.add(node.data.hostedImageUrl as string);
        }

        if (isObjectUrl(node.data.previewUrl)) {
          urls.add(node.data.previewUrl as string);
        }

        if (isObjectUrl(node.data.imageUrl)) {
          urls.add(node.data.imageUrl);
        }
      }

      if (node.type === "storyboard_grid") {
        for (const cell of node.data.cells) {
          if (!cell) {
            continue;
          }

          if (isObjectUrl(cell.imageUrl)) {
            urls.add(cell.imageUrl);
          }

          if (isObjectUrl(cell.hostedImageUrl)) {
            urls.add(cell.hostedImageUrl as string);
          }

          if (isObjectUrl(cell.previewUrl)) {
            urls.add(cell.previewUrl as string);
          }
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

async function pollStoryboardGenerationJob(
  jobId: string,
): Promise<Extract<StoryboardGenerationResponse, { ok: true }>> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STORYBOARD_JOB_POLL_TIMEOUT_MS) {
    const query = new URLSearchParams({ jobId });
    const response = await fetch(`/api/ai/storyboard?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = await readJsonResponse<StoryboardJobPollResponse>(
      response,
      "Storyboard polling failed",
    );

    if (!response.ok || ("ok" in json && json.ok === false)) {
      throw new Error("error" in json ? json.error : "Storyboard polling failed");
    }

    if (json.status === "completed") {
      return json.result;
    }

    if (json.status === "error") {
      throw new Error(json.error || "Storyboard generation failed");
    }

    await sleep(STORYBOARD_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("Storyboard generation polling timed out");
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
    let errorMessage = text || "Request failed";

    try {
      const json = JSON.parse(text) as ApiErrorResponse;
      errorMessage = json.error || errorMessage;
    } catch {
      // Keep the raw response text when the body is not JSON.
    }

    throw new Error(errorMessage);
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

function setStoryboardNodeStatus(
  nodes: CanvasNode[],
  storyboardNodeId: string,
  status: NonNullable<StoryboardScriptNodeData["status"]>,
  errorMessage?: string,
): CanvasNode[] {
  return nodes.map((node) =>
    node.id === storyboardNodeId && node.type === "storyboard_script"
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

function toStoryboardReferenceImages(
  images: ConnectedImagePayload[],
  requestImages?: Array<{ url: string; fileName?: string }>,
): StoryboardReferenceImage[] {
  return images.map((image, index) => ({
    label: `@图片${index + 1}`,
    url: requestImages?.[index]?.url || image.imageUrl,
    previewUrl: image.previewUrl,
    sourceNodeId: image.id,
    alt: image.alt,
  }));
}

function toStoryboardReferenceVideos(
  videos: ConnectedVideoPayload[],
  requestVideos?: Array<{ url: string; fileName?: string }>,
): StoryboardReferenceVideo[] {
  return videos.map((video, index) => ({
    label: `@视频${index + 1}`,
    url: requestVideos?.[index]?.url || video.hostedVideoUrl || video.videoUrl,
    previewUrl: video.previewUrl,
    sourceNodeId: video.id,
    alt: video.alt,
    fileName: requestVideos?.[index]?.fileName || video.fileName,
    width: video.width,
    height: video.height,
    durationSeconds: video.durationSeconds,
  }));
}

function getStoryboardReferenceRequestUrl(image: ConnectedImagePayload): string {
  return (
    image.semanticImageUrl?.trim() ||
    image.hostedImageUrl?.trim() ||
    image.imageUrl.trim()
  );
}

function toStoryboardRequestImages(
  images: ConnectedImagePayload[],
): ConnectedImagePayload[] {
  return images.map((image) => ({
    ...image,
    imageUrl: getStoryboardReferenceRequestUrl(image),
  }));
}

async function normalizeStoryboardReferenceImagesForRequest(
  images: ConnectedImagePayload[],
): Promise<Array<{ url: string; fileName?: string }>> {
  const requestImages: Array<{ url: string; fileName?: string }> = [];

  for (const image of images) {
    const url = image.imageUrl.trim();

    if (!url) {
      continue;
    }

    if (/^https?:\/\//i.test(url) && !isSameOriginUrl(url)) {
      requestImages.push({
        url,
        fileName: image.fileName,
      });
      continue;
    }

    const [normalized] = await normalizeReferenceImagesViaOss([image], {
      dedupe: false,
    });

    if (normalized?.url?.trim()) {
      requestImages.push(normalized);
    }
  }

  return requestImages;
}

function getStoryboardGenerationErrorMessage(error: unknown): string {
  if (isFetchNetworkError(error)) {
    return "分镜接口连接被中断：服务可能超时或网络断开，请稍后重试。";
  }

  return toErrorMessage(error);
}

function isRemoteRequestUrl(value?: string): boolean {
  const trimmed = value?.trim() || "";

  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/api/");
}

function getConnectedSourceVideoForVideoUpscaleNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): ConnectedVideoPayload | null {
  return getConnectedVideosForTargetNode(nodes, edges, targetNodeId)[0] ?? null;
}

async function normalizeVideoForProcessing(video: ConnectedVideoPayload): Promise<{
  url: string;
  fileName?: string;
}> {
  const sourceUrl = video.hostedVideoUrl?.trim() || video.videoUrl.trim();

  if (!sourceUrl) {
    throw new Error("Source video is missing");
  }

  if (/^https:\/\//i.test(sourceUrl)) {
    return {
      url: sourceUrl,
      fileName: video.fileName,
    };
  }

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error("Failed to read source video for upscale");
  }

  return {
    url: await uploadVideoBlobToOss(
      await response.blob(),
      video.fileName || "video.mp4",
      "processing/videos",
    ),
    fileName: video.fileName,
  };
}

function getConnectedImagesForTargetNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): ConnectedImagePayload[] {
  const lookup = getCanvasConnectionLookup(nodes, edges);
  const cached = lookup.connectedImagesByTargetId.get(targetNodeId);

  if (cached) {
    return cached;
  }

  const connectedSourceIds = lookup.sourceIdsByTargetId.get(targetNodeId) ?? [];

  const connectedImages = connectedSourceIds.reduce<ConnectedImagePayload[]>((acc, sourceId) => {
    const sourceNode = lookup.nodeById.get(sourceId);

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
        previewUrl: sourceNode.data.previewUrl?.trim() || sourceNode.data.imageUrl,
        semanticImageUrl: sourceNode.data.semanticImageUrl?.trim() || undefined,
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
          sourceNode.data.previewUrl?.trim() ||
          sourceNode.data.hostedImageUrl?.trim() ||
          sourceNode.data.imageUrl,
        semanticImageUrl: sourceNode.data.semanticImageUrl?.trim() || undefined,
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
  lookup.connectedImagesByTargetId.set(targetNodeId, connectedImages);
  return connectedImages;
}

function getConnectedVideosForTargetNode(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): ConnectedVideoPayload[] {
  const lookup = getCanvasConnectionLookup(nodes, edges);
  const cached = lookup.connectedVideosByTargetId.get(targetNodeId);

  if (cached) {
    return cached;
  }

  const connectedSourceIds = lookup.sourceIdsByTargetId.get(targetNodeId) ?? [];

  const connectedVideos = connectedSourceIds.reduce<ConnectedVideoPayload[]>((acc, sourceId) => {
    const sourceNode = lookup.nodeById.get(sourceId);

    if (!sourceNode) {
      return acc;
    }

    if (sourceNode.type === "video") {
      const videoUrl =
        sourceNode.data.hostedVideoUrl?.trim() ||
        sourceNode.data.videoUrl?.trim() ||
        "";

      if (!videoUrl) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        videoUrl,
        hostedVideoUrl: sourceNode.data.hostedVideoUrl?.trim() || undefined,
        previewUrl: sourceNode.data.previewUrl,
        fileName: sourceNode.data.fileName,
        alt: sourceNode.data.fileName?.trim() || sourceNode.data.title?.trim() || "Connected video",
        sourceType: "video",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
        durationSeconds: sourceNode.data.durationSeconds,
      });
      return acc;
    }

    if (sourceNode.type === "video_upscale") {
      const videoUrl =
        sourceNode.data.hostedVideoUrl?.trim() ||
        sourceNode.data.videoUrl?.trim() ||
        "";

      if (!videoUrl) {
        return acc;
      }

      acc.push({
        id: sourceNode.id,
        videoUrl,
        hostedVideoUrl: sourceNode.data.hostedVideoUrl?.trim() || undefined,
        fileName: sourceNode.data.generatedOutputFileName,
        alt: sourceNode.data.title?.trim() || "Upscaled video",
        sourceType: "video_upscale",
        width: sourceNode.data.width,
        height: sourceNode.data.height,
      });
      return acc;
    }

    if (sourceNode.type !== "video_generation") {
      return acc;
    }

    const videoUrl =
      sourceNode.data.hostedVideoUrl?.trim() ||
      sourceNode.data.videoUrl?.trim() ||
      "";

    if (!videoUrl) {
      return acc;
    }

    const ratioMatch = sourceNode.data.ratio?.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    const inferredWidth = ratioMatch ? Number(ratioMatch[1]) : undefined;
    const inferredHeight = ratioMatch ? Number(ratioMatch[2]) : undefined;

    acc.push({
      id: sourceNode.id,
      videoUrl,
      hostedVideoUrl: sourceNode.data.hostedVideoUrl?.trim() || undefined,
      previewUrl: sourceNode.data.lastFrameUrl?.trim() || undefined,
      alt: sourceNode.data.prompt?.trim() || "Connected video",
      sourceType: "video_generation",
      width: inferredWidth && inferredHeight ? inferredWidth : undefined,
      height: inferredWidth && inferredHeight ? inferredHeight : undefined,
      durationSeconds: sourceNode.data.duration,
    });
    return acc;
  }, []);
  lookup.connectedVideosByTargetId.set(targetNodeId, connectedVideos);
  return connectedVideos;
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
        previewUrl: image.previewUrl?.trim() || image.imageUrl,
        semanticImageUrl: image.semanticImageUrl?.trim() || undefined,
        originalImageUrl: image.imageUrl,
        hostedImageUrl: image.hostedImageUrl?.trim() || undefined,
        fileName: image.fileName,
        alt: image.fileName?.trim() || `Reference image ${index + 1}`,
        sourceType: "inline_reference",
        width: image.width,
        height: image.height,
        uploadStatus: image.uploadStatus,
        uploadError: image.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getInlineReferenceImagesForTextNode(
  node: Extract<CanvasNode, { type: "text" }>,
): ConnectedImagePayload[] {
  return (node.data.referenceImages ?? []).reduce<ConnectedImagePayload[]>(
    (acc, image, index) => {
      const imageUrl = image.hostedUrl?.trim() || image.url.trim();

      if (!imageUrl) {
        return acc;
      }

      acc.push({
        id: image.id || `${node.id}-image-reference-${index}`,
        imageUrl,
        previewUrl: image.previewUrl?.trim() || imageUrl,
        originalImageUrl: image.url,
        hostedImageUrl: image.hostedUrl?.trim() || undefined,
        fileName: image.fileName,
        alt: image.fileName?.trim() || `Reference image ${index + 1}`,
        sourceType: "inline_reference",
        width: image.width,
        height: image.height,
        uploadStatus: image.uploadStatus,
        uploadError: image.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getInlineReferenceVideosForVideoGenerationNode(
  node: Extract<CanvasNode, { type: "video_generation" }>,
): ConnectedVideoPayload[] {
  return (node.data.referenceVideos ?? []).reduce<ConnectedVideoPayload[]>(
    (acc, video, index) => {
      const videoUrl = video.hostedUrl?.trim() || video.url.trim();

      if (!videoUrl) {
        return acc;
      }

      acc.push({
        id: video.id || `${node.id}-video-reference-${index}`,
        videoUrl,
        hostedVideoUrl: video.hostedUrl?.trim() || undefined,
        previewUrl: video.previewUrl,
        fileName: video.fileName,
        alt: video.fileName?.trim() || `Reference video ${index + 1}`,
        sourceType: "inline_reference",
        width: video.width,
        height: video.height,
        durationSeconds: video.durationSeconds,
        uploadStatus: video.uploadStatus,
        uploadError: video.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getInlineReferenceVideosForTextNode(
  node: Extract<CanvasNode, { type: "text" }>,
): ConnectedVideoPayload[] {
  return (node.data.referenceVideos ?? []).reduce<ConnectedVideoPayload[]>(
    (acc, video, index) => {
      const videoUrl = video.hostedUrl?.trim() || video.url.trim();

      if (!videoUrl) {
        return acc;
      }

      acc.push({
        id: video.id || `${node.id}-video-reference-${index}`,
        videoUrl,
        hostedVideoUrl: video.hostedUrl?.trim() || undefined,
        previewUrl: video.previewUrl,
        fileName: video.fileName,
        alt: video.fileName?.trim() || `Reference video ${index + 1}`,
        sourceType: "inline_reference",
        width: video.width,
        height: video.height,
        durationSeconds: video.durationSeconds,
        uploadStatus: video.uploadStatus,
        uploadError: video.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getInlineReferenceImagesForStoryboardNode(
  node: Extract<CanvasNode, { type: "storyboard_script" }>,
): ConnectedImagePayload[] {
  return (node.data.referenceImages ?? []).reduce<ConnectedImagePayload[]>(
    (acc, image, index) => {
      const imageUrl = image.hostedUrl?.trim() || image.url.trim();

      if (!imageUrl) {
        return acc;
      }

      acc.push({
        id: image.id || image.sourceNodeId || `${node.id}-image-reference-${index}`,
        imageUrl,
        previewUrl: image.previewUrl?.trim() || imageUrl,
        originalImageUrl: image.url,
        hostedImageUrl: image.hostedUrl?.trim() || undefined,
        fileName: image.fileName,
        alt: image.alt || image.fileName?.trim() || `Reference image ${index + 1}`,
        sourceType: "inline_reference",
        width: image.width,
        height: image.height,
        uploadStatus: image.uploadStatus,
        uploadError: image.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getInlineReferenceVideosForStoryboardNode(
  node: Extract<CanvasNode, { type: "storyboard_script" }>,
): ConnectedVideoPayload[] {
  return (node.data.referenceVideos ?? []).reduce<ConnectedVideoPayload[]>(
    (acc, video, index) => {
      const videoUrl = video.hostedUrl?.trim() || video.url.trim();

      if (!videoUrl) {
        return acc;
      }

      acc.push({
        id: video.id || video.sourceNodeId || `${node.id}-video-reference-${index}`,
        videoUrl,
        hostedVideoUrl: video.hostedUrl?.trim() || undefined,
        previewUrl: video.previewUrl,
        fileName: video.fileName,
        alt: video.alt || video.fileName?.trim() || `Reference video ${index + 1}`,
        sourceType: "inline_reference",
        width: video.width,
        height: video.height,
        durationSeconds: video.durationSeconds,
        uploadStatus: video.uploadStatus,
        uploadError: video.uploadError,
      });
      return acc;
    },
    [],
  );
}

function getVideoGenerationReferenceVideos(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  videoGenerationNodeId: string,
): ConnectedVideoPayload[] {
  const lookup = getCanvasConnectionLookup(nodes, edges);
  const videoGenerationNode = lookup.nodeById.get(videoGenerationNodeId);

  if (videoGenerationNode?.type !== "video_generation") {
    return [];
  }

  return [
    ...getInlineReferenceVideosForVideoGenerationNode(videoGenerationNode),
    ...getConnectedVideosForTargetNode(nodes, edges, videoGenerationNodeId),
  ];
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

function getImageGenerationReferenceImages(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  imageGenerationNodeId: string,
): ConnectedImagePayload[] {
  const lookup = getCanvasConnectionLookup(nodes, edges);
  const imageGenerationNode = lookup.nodeById.get(imageGenerationNodeId);

  if (imageGenerationNode?.type !== "image_generation") {
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
  const lookup = getCanvasConnectionLookup(nodes, edges);
  const cached = lookup.connectedTextPromptByTargetId.get(targetNodeId);

  if (cached !== undefined) {
    return cached;
  }

  const connectedSourceIds = lookup.sourceIdsByTargetId.get(targetNodeId) ?? [];
  const promptSections = connectedSourceIds.reduce<string[]>((acc, sourceId) => {
    const sourceNode = lookup.nodeById.get(sourceId);

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
  const textPrompt = promptSections.join("\n\n");

  lookup.connectedTextPromptByTargetId.set(targetNodeId, textPrompt);
  return textPrompt;
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
      previewUrl: node.data.previewUrl?.trim() || undefined,
      semanticImageUrl: node.data.semanticImageUrl?.trim() || undefined,
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
      previewUrl: node.data.previewUrl?.trim() || undefined,
      semanticImageUrl: node.data.semanticImageUrl?.trim() || undefined,
      fileName: node.data.fileName,
      title: node.data.title,
      alt: node.data.fileName?.trim() || node.data.title?.trim() || "Uploaded image",
      width: node.data.width,
      height: node.data.height,
    };
  }

  return null;
}

type CanvasConnectionLookup = {
  nodeById: Map<string, CanvasNode>;
  sourceIdsByTargetId: Map<string, string[]>;
  connectedImagesByTargetId: Map<string, ConnectedImagePayload[]>;
  connectedVideosByTargetId: Map<string, ConnectedVideoPayload[]>;
  connectedTextPromptByTargetId: Map<string, string>;
};

let canvasConnectionLookupCache:
  | {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
      lookup: CanvasConnectionLookup;
    }
  | null = null;

function getCanvasConnectionLookup(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasConnectionLookup {
  if (
    canvasConnectionLookupCache?.nodes === nodes &&
    canvasConnectionLookupCache.edges === edges
  ) {
    return canvasConnectionLookupCache.lookup;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceIdsByTargetId = new Map<string, string[]>();

  for (const edge of edges) {
    const sourceIds = sourceIdsByTargetId.get(edge.target);

    if (sourceIds) {
      sourceIds.push(edge.source);
    } else {
      sourceIdsByTargetId.set(edge.target, [edge.source]);
    }
  }

  const lookup: CanvasConnectionLookup = {
    nodeById,
    sourceIdsByTargetId,
    connectedImagesByTargetId: new Map(),
    connectedVideosByTargetId: new Map(),
    connectedTextPromptByTargetId: new Map(),
  };

  canvasConnectionLookupCache = { nodes, edges, lookup };
  return lookup;
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

export interface CanvasState {
  projectId: string | null;
  projectName: string;
  projectCreatedAt: string | null;
  currentProject: ProjectHandleRecord | null;
  currentProjectThumbnailFileName?: string;
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
  removeReferenceFromNode: (targetNodeId: string, referenceId: string) => void;
  deleteIncomingEdges: (targetNodeId: string) => void;
  deleteIncomingVideoEdges: (targetNodeId: string) => void;
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
  generateStoryboardFromStoryboardNode: (storyboardNodeId: string) => Promise<void>;
  generateImageFromImageGenerationNode: (
    imageGenerationNodeId: string,
    promptOverride?: string,
    options?: ImageGenerationRunOptions,
  ) => Promise<void>;
  generateVideoFromVideoGenerationNode: (
    videoGenerationNodeId: string,
    promptOverride?: string,
  ) => Promise<void>;
  generateAudioFromAudioGenerationNode: (
    audioGenerationNodeId: string,
    promptOverride?: string,
  ) => Promise<void>;
  createVideoUpscaleNodeFromSource: (sourceNodeId: string) => string;
  runVideoUpscaleFromNode: (videoUpscaleNodeId: string) => Promise<void>;
  getConnectedVideoForVideoUpscaleNode: (videoUpscaleNodeId: string) => ConnectedVideoPayload | null;
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
  splitImageNodeToGrid: (
    nodeId: string,
    dimension: SplitGridDimension,
  ) => Promise<void>;
  cropImageNode: (
    nodeId: string,
    cropRect: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
  createVideoNodeFromProcessedResult: (params: {
    sourceNodeId: string;
    title: string;
    resultUrl: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    sizeBytes?: number;
    mimeType?: string;
    position?: { x: number; y: number };
  }) => Promise<string>;
  createImageNodeFromVideoFrame: (params: {
    sourceNodeId: string;
    dataUrl: string;
    width: number;
    height: number;
    title?: string;
    position?: { x: number; y: number };
  }) => Promise<string>;
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
  removeReferenceImageFromStoryboardNode: (
    storyboardNodeId: string,
    referenceImageId: string,
  ) => void;
  addReferenceImagesToImageGenerationNode: (
    imageGenerationNodeId: string,
    images: Array<{
      imageUrl: string;
      hostedImageUrl?: string;
      previewUrl?: string;
      semanticImageUrl?: string;
      fileName?: string;
      width?: number;
      height?: number;
      sizeBytes?: number;
      uploadStatus?: "uploading" | "uploaded" | "error";
      uploadError?: string;
    }>,
  ) => void;
  addReferenceMediaToVideoGenerationNode: (
    videoGenerationNodeId: string,
    media: VideoGenerationMediaReference[],
  ) => void;
  addReferenceMediaToAudioGenerationNode: (
    audioGenerationNodeId: string,
    media: VideoGenerationMediaReference[],
  ) => void;
  addReferenceMediaToTextNode: (
    textNodeId: string,
    media: VideoGenerationMediaReference[],
  ) => void;
  addReferenceMediaToStoryboardNode: (
    storyboardNodeId: string,
    media: VideoGenerationMediaReference[],
  ) => void;
  updateInlineReferenceMedia: (
    targetNodeId: string,
    referenceId: string,
    updates: InlineReferenceMediaUpdate,
  ) => void;
  getConnectedImagesForTextNode: (textNodeId: string) => ConnectedImagePayload[];
  getConnectedVideosForTextNode: (textNodeId: string) => ConnectedVideoPayload[];
  getConnectedImagesForStoryboardNode: (storyboardNodeId: string) => ConnectedImagePayload[];
  getConnectedVideosForStoryboardNode: (storyboardNodeId: string) => ConnectedVideoPayload[];
  getConnectedImagesForImageGenerationNode: (
    imageGenerationNodeId: string,
  ) => ConnectedImagePayload[];
  getConnectedImagesForVideoGenerationNode: (
    videoGenerationNodeId: string,
  ) => ConnectedImagePayload[];
  getConnectedVideosForVideoGenerationNode: (
    videoGenerationNodeId: string,
  ) => ConnectedVideoPayload[];
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
    kind?: "image" | "video";
    fileName?: string;
    generatedAt: string;
    nodeData: ImageGenerationNodeData | VideoGenerationNodeData | VideoUpscaleNodeData | VideoNodeData;
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
  currentProjectThumbnailFileName: undefined,
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
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === edge.source);
      const audioReference = sourceNode ? createAudioReferenceFromNode(sourceNode) : null;
      const connectsVideoReference =
        (sourceNode?.type === "video_generation" || sourceNode?.type === "video") &&
        Boolean(
          sourceNode.type === "video_generation"
            ? sourceNode.data.hostedVideoUrl?.trim() ||
                sourceNode.data.videoUrl?.trim()
            : sourceNode.data.hostedVideoUrl?.trim() ||
                sourceNode.data.videoUrl?.trim(),
        );

      return {
        ...createUndoHistoryUpdate(state),
        edges: [...state.edges, edge],
        nodes: connectsVideoReference
          ? state.nodes.map((node) =>
              node.id === edge.target && node.type === "video_generation"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      mode: "all-reference",
                      status: node.data.status === "error" ? "idle" : node.data.status,
                      errorMessage: undefined,
                    },
                  }
                : node,
            )
          : audioReference
            ? state.nodes.map((node) => {
                if (node.id === edge.target && node.type === "video_generation") {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      referenceAudio: appendDedupeReferences(
                        node.data.referenceAudio,
                        [audioReference],
                      ),
                      status: node.data.status === "error" ? "idle" : node.data.status,
                      errorMessage: undefined,
                    },
                  };
                }

                if (node.id === edge.target && node.type === "audio_generation") {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      referenceAudio: appendDedupeReferences(
                        node.data.referenceAudio,
                        [audioReference],
                      ),
                      status: node.data.status === "error" ? "idle" : node.data.status,
                      errorMessage: undefined,
                    },
                  };
                }

                return node;
              })
            : state.nodes,
        dirty: true,
        error: null,
      };
    });
  },

  deleteEdge: (id) => {
    set((state) => ({
      ...createUndoHistoryUpdate(state),
      edges: state.edges.filter((edge) => edge.id !== id),
      dirty: true,
    }));
  },

  removeReferenceFromNode: (targetNodeId, referenceId) => {
    set((state) => {
      const nextEdges = state.edges.filter(
        (edge) => !(edge.target === targetNodeId && edge.source === referenceId),
      );
      const removedEdge = nextEdges.length !== state.edges.length;
      let removedInline = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== targetNodeId) {
          return node;
        }

        if (node.type === "text") {
          const referenceImages = node.data.referenceImages ?? [];
          const referenceVideos = node.data.referenceVideos ?? [];
          const nextReferenceImages = referenceImages.filter((item) => item.id !== referenceId);
          const nextReferenceVideos = referenceVideos.filter((item) => item.id !== referenceId);
          const nodeRemovedInline =
            nextReferenceImages.length !== referenceImages.length ||
            nextReferenceVideos.length !== referenceVideos.length;
          removedInline = removedInline || nodeRemovedInline;

          if (!nodeRemovedInline) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              referenceImages: nextReferenceImages,
              referenceVideos: nextReferenceVideos,
              status: node.data.status === "error" ? "idle" : node.data.status,
              errorMessage: undefined,
            },
          };
        }

        if (node.type === "storyboard_script") {
          const referenceImages = node.data.referenceImages ?? [];
          const referenceVideos = node.data.referenceVideos ?? [];
          const nextReferenceImages = referenceImages.filter(
            (item) => item.id !== referenceId && item.sourceNodeId !== referenceId,
          );
          const nextReferenceVideos = referenceVideos.filter(
            (item) => item.id !== referenceId && item.sourceNodeId !== referenceId,
          );
          const nodeRemovedInline =
            nextReferenceImages.length !== referenceImages.length ||
            nextReferenceVideos.length !== referenceVideos.length;
          removedInline = removedInline || nodeRemovedInline;

          if (!nodeRemovedInline) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              referenceImages: nextReferenceImages,
              referenceVideos: nextReferenceVideos,
              status: node.data.status === "error" ? "idle" : node.data.status,
              errorMessage: undefined,
            },
          };
        }

        if (node.type === "video_generation") {
          const referenceImages = node.data.referenceImages ?? [];
          const referenceVideos = node.data.referenceVideos ?? [];
          const referenceAudio = node.data.referenceAudio ?? [];
          const nextReferenceImages = referenceImages.filter((item) => item.id !== referenceId);
          const nextReferenceVideos = referenceVideos.filter((item) => item.id !== referenceId);
          const nextReferenceAudio = referenceAudio.filter((item) => item.id !== referenceId);
          const nodeRemovedInline =
            nextReferenceImages.length !== referenceImages.length ||
            nextReferenceVideos.length !== referenceVideos.length ||
            nextReferenceAudio.length !== referenceAudio.length;
          removedInline = removedInline || nodeRemovedInline;

          if (!nodeRemovedInline) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              referenceImages: nextReferenceImages,
              referenceVideos: nextReferenceVideos,
              referenceAudio: nextReferenceAudio,
              status: node.data.status === "error" ? "idle" : node.data.status,
              errorMessage: undefined,
            },
          };
        }

        if (node.type === "audio_generation") {
          const referenceAudio = node.data.referenceAudio ?? [];
          const nextReferenceAudio = referenceAudio.filter((item) => item.id !== referenceId);
          const nodeRemovedInline = nextReferenceAudio.length !== referenceAudio.length;
          removedInline = removedInline || nodeRemovedInline;

          if (!nodeRemovedInline) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              referenceAudio: nextReferenceAudio,
              status: node.data.status === "error" ? "idle" : node.data.status,
              errorMessage: undefined,
            },
          };
        }

        return node;
      });

      if (!removedEdge && !removedInline) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state),
        nodes: nextNodes,
        edges: nextEdges,
        dirty: true,
        error: null,
      };
    });
  },

  deleteIncomingEdges: (targetNodeId) => {
    set((state) => {
      const nextEdges = state.edges.filter((edge) => edge.target !== targetNodeId);

      if (nextEdges.length === state.edges.length) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        edges: nextEdges,
        dirty: true,
      };
    });
  },

  deleteIncomingVideoEdges: (targetNodeId) => {
    set((state) => {
      const videoSourceIds = new Set(
        state.nodes
          .filter((node) => node.type === "video_generation")
          .map((node) => node.id),
      );
      const nextEdges = state.edges.filter(
        (edge) => edge.target !== targetNodeId || !videoSourceIds.has(edge.source),
      );

      if (nextEdges.length === state.edges.length) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        edges: nextEdges,
        dirty: true,
      };
    });
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
    const connectedVideos = selectPromptReferences(
      getConnectedVideosForTargetNode(
        state.nodes,
        state.edges,
        textNodeId,
      ),
      textNode.data.aiPrompt,
    );
    const textTaskPrompt = stripVideoReferenceMentionTokens(
      textNode.data.aiPrompt,
      connectedImages,
      connectedVideos,
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
      const hasVideoReferences = connectedVideos.length > 0;
      const storedTextProvider =
        textNode.data.provider ?? readStoredSelectedApiProvider("text");
      const textProvider =
        hasVideoReferences && storedTextProvider !== "comfly" && storedTextProvider !== "zhenzhen"
          ? "comfly"
          : storedTextProvider;
      const textModel =
        hasVideoReferences && !isGeminiTextModel(textNode.data.model)
          ? "gemini-3.1-pro"
          : textNode.data.model;
      const apiKey = assertStoredApiKey("text", textProvider);
      const requestVideos = await Promise.all(
        connectedVideos.map((video) => normalizeVideoForProcessing(video)),
      );
      const response = await fetch("/api/ai/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptSections.join("\n\n"),
          model: textModel,
          systemPrompt: TEXT_SYSTEM_PROMPT,
          temperature: 0.9,
          provider: textProvider,
          apiKey,
          images: connectedImages.map((image) => ({
            url: isClaudeModel(textNode.data.model)
              ? image.originalImageUrl
              : image.imageUrl,
          })),
          videos: requestVideos,
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
                    provider: textProvider,
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

  generateStoryboardFromStoryboardNode: async (storyboardNodeId) => {
    const state = get();
    const storyboardNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "storyboard_script" }> =>
        node.id === storyboardNodeId && node.type === "storyboard_script",
    );

    if (!storyboardNode) {
      throw new Error("Storyboard node not found");
    }

    const connectedImages = selectPromptReferences(
      getConnectedImagesForTargetNode(
        state.nodes,
        state.edges,
        storyboardNodeId,
      ),
      storyboardNode.data.prompt,
    );
    const connectedVideos = selectPromptReferences(
      getConnectedVideosForTargetNode(
        state.nodes,
        state.edges,
        storyboardNodeId,
      ),
      storyboardNode.data.prompt,
    );
    const storyboardPrompt = stripVideoReferenceMentionTokens(
      storyboardNode.data.prompt,
      connectedImages,
      connectedVideos,
    );
    const initialReferenceImages = toStoryboardReferenceImages(connectedImages);
    const initialReferenceVideos = toStoryboardReferenceVideos(connectedVideos);

    if (
      !storyboardPrompt.trim() &&
      initialReferenceImages.length === 0 &&
      initialReferenceVideos.length === 0
    ) {
      throw new Error("Prompt or reference media are required");
    }

    set((state) => ({
      error: null,
      dirty: true,
      nodes: state.nodes.map((node) =>
        node.id === storyboardNodeId && node.type === "storyboard_script"
          ? {
              ...node,
              data: {
                ...node.data,
                status: "generating",
                errorMessage: undefined,
                referenceImages: initialReferenceImages,
                referenceVideos: initialReferenceVideos,
              },
            }
          : node,
      ),
    }));

    try {
      const hasVideoReferences = connectedVideos.length > 0;
      const storedTextProvider =
        storyboardNode.data.provider ?? readStoredSelectedApiProvider("text");
      const textProvider =
        hasVideoReferences && storedTextProvider !== "comfly" && storedTextProvider !== "zhenzhen"
          ? "comfly"
          : storedTextProvider;
      const textModel =
        hasVideoReferences && !isGeminiTextModel(storyboardNode.data.model)
          ? "gemini-3.5-flash"
          : storyboardNode.data.model;
      const apiKey = assertStoredApiKey("text", textProvider);
      let requestImages: Array<{ url: string; fileName?: string }>;

      try {
        requestImages = await normalizeStoryboardReferenceImagesForRequest(
          toStoryboardRequestImages(connectedImages),
        );
      } catch (error) {
        throw new Error(
          `分镜参考图处理失败：${getStoryboardGenerationErrorMessage(error)}`,
        );
      }

      const referenceImages = toStoryboardReferenceImages(
        connectedImages,
        requestImages,
      );
      const requestVideos = await Promise.all(
        connectedVideos.map((video) => normalizeVideoForProcessing(video)),
      );
      const referenceVideos = toStoryboardReferenceVideos(
        connectedVideos,
        requestVideos,
      );
      const response = await fetch("/api/ai/storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: storyboardPrompt || storyboardNode.data.prompt,
          model: textModel,
          provider: textProvider,
          apiKey,
          referenceImages: referenceImages.map((image) => ({
            label: image.label,
            url: image.url,
          })),
          referenceVideos: referenceVideos.map((video) => ({
            label: video.label,
            url: video.url,
          })),
        }),
      });
      const submitted = await readJsonResponse<
        | {
            ok: true;
            jobId: string;
            status: "pending";
          }
        | {
            ok: true;
            jobId: string;
            status: "completed";
            result: Extract<StoryboardGenerationResponse, { ok: true }>;
          }
        | {
            ok: true;
            jobId: string;
            status: "error";
            error?: string;
          }
        | ApiErrorResponse
      >(response, "Storyboard generation request failed");

      if (!response.ok || !("ok" in submitted) || submitted.ok === false) {
        throw new Error("error" in submitted ? submitted.error : "Request failed");
      }

      if (submitted.status === "error") {
        throw new Error(submitted.error || "Storyboard generation failed");
      }

      const payload = submitted.status === "completed"
        ? submitted.result
        : await pollStoryboardGenerationJob(submitted.jobId);

      set((state) => ({
        error: null,
        dirty: true,
        nodes: state.nodes.map((node) =>
          node.id === storyboardNodeId && node.type === "storyboard_script"
            ? {
                ...node,
                data: {
                  ...node.data,
                  rows: payload.data.rows,
                  rawJson: payload.rawJson,
                  title: payload.data.title || node.data.title,
                  provider: textProvider,
                  model: payload.model || node.data.model,
                  status: "idle",
                  errorMessage: undefined,
                  referenceImages,
                  referenceVideos,
                },
              }
            : node,
        ),
      }));
    } catch (error) {
      const message = getStoryboardGenerationErrorMessage(error);

      set((state) => ({
        error: message,
        dirty: true,
        nodes: setStoryboardNodeStatus(state.nodes, storyboardNodeId, "error", message),
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
    const textNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "text" }> =>
        node.id === textNodeId && node.type === "text",
    );

    return [
      ...(textNode ? getInlineReferenceImagesForTextNode(textNode) : []),
      ...getConnectedImagesForTargetNode(
        state.nodes,
        state.edges,
        textNodeId,
      ),
    ];
  },

  getConnectedVideosForTextNode: (textNodeId) => {
    const state = get();
    const textNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "text" }> =>
        node.id === textNodeId && node.type === "text",
    );

    return [
      ...(textNode ? getInlineReferenceVideosForTextNode(textNode) : []),
      ...getConnectedVideosForTargetNode(
        state.nodes,
        state.edges,
        textNodeId,
      ),
    ];
  },

  getConnectedImagesForStoryboardNode: (storyboardNodeId) => {
    const state = get();
    const storyboardNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "storyboard_script" }> =>
        node.id === storyboardNodeId && node.type === "storyboard_script",
    );

    return dedupeConnectedImages([
      ...(storyboardNode ? getInlineReferenceImagesForStoryboardNode(storyboardNode) : []),
      ...getConnectedImagesForTargetNode(
        state.nodes,
        state.edges,
        storyboardNodeId,
      ),
    ]);
  },

  getConnectedVideosForStoryboardNode: (storyboardNodeId) => {
    const state = get();
    const storyboardNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "storyboard_script" }> =>
        node.id === storyboardNodeId && node.type === "storyboard_script",
    );

    return dedupeConnectedVideos([
      ...(storyboardNode ? getInlineReferenceVideosForStoryboardNode(storyboardNode) : []),
      ...getConnectedVideosForTargetNode(
        state.nodes,
        state.edges,
        storyboardNodeId,
      ),
    ]);
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
                  generationStatus: "running",
                  generationErrorCode: undefined,
                  generationErrorMessage: undefined,
                  generationRetryable: undefined,
                  generationLastRunId: `image-run-${Date.now()}`,
                  generationUpdatedAt: nowIso(),
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
            previewUrl: image.previewUrl,
            semanticImageUrl: image.semanticImageUrl,
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
            } else if (
              shouldUploadReferenceImagesToOss &&
              shouldFallbackUploadGeneratedResultToOss(result)
            ) {
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
                  generationStatus: primaryResult ? "finished" : "failed",
                  generationErrorCode: primaryResult ? undefined : "IMAGE_GENERATION_FAILED",
                  generationErrorMessage:
                    primaryResult
                      ? undefined
                      : failureMessages.length > 0
                        ? failureMessages.join("\n")
                        : "Image generation failed",
                  generationRetryable: primaryResult ? undefined : true,
                  generationUpdatedAt: nowIso(),
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
                  generationStatus: "failed",
                  generationErrorCode: "IMAGE_GENERATION_FAILED",
                  generationErrorMessage: message,
                  generationRetryable: true,
                  generationUpdatedAt: nowIso(),
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

  generateVideoFromVideoGenerationNode: async (videoGenerationNodeId, promptOverride) => {
    const state = get();
    const videoGenerationNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "video_generation" }> =>
        node.id === videoGenerationNodeId && node.type === "video_generation",
    );

    if (!videoGenerationNode) {
      throw new Error("Video generation node not found");
    }

    if (videoGenerationNode.data.status === "generating") {
      return;
    }

    if (inFlightVideoGenerationNodeIds.has(videoGenerationNodeId)) {
      return;
    }

    inFlightVideoGenerationNodeIds.add(videoGenerationNodeId);

    try {
      const latestState = get();
      const latestVideoGenerationNode = latestState.nodes.find(
        (node): node is Extract<CanvasNode, { type: "video_generation" }> =>
          node.id === videoGenerationNodeId && node.type === "video_generation",
      );

      if (!latestVideoGenerationNode) {
        throw new Error("Video generation node not found");
      }

      const rawPrompt =
        promptOverride?.trim() ||
        latestVideoGenerationNode.data.prompt?.trim() ||
        "";

      if (!rawPrompt) {
        throw new Error("Prompt is required");
      }

      const connectedImages = selectPromptReferences(
        getConnectedImagesForTargetNode(
          latestState.nodes,
          latestState.edges,
          videoGenerationNodeId,
        ),
        rawPrompt,
      );
      const connectedVideos = selectPromptReferences(
        getConnectedVideosForTargetNode(
          latestState.nodes,
          latestState.edges,
          videoGenerationNodeId,
        ),
        rawPrompt,
      );
      const prompt = stripVideoReferenceMentionTokens(
        rawPrompt,
        connectedImages,
        connectedVideos,
      );
      const inlineImages = (latestVideoGenerationNode.data.referenceImages ?? [])
        .flatMap<ConnectedImagePayload>((image, index) => {
          const imageUrl = image.hostedUrl?.trim() || image.url.trim();

          if (!imageUrl) {
            return [];
          }

          return [{
            id: image.id || `${videoGenerationNodeId}-image-reference-${index}`,
            imageUrl,
            previewUrl: image.previewUrl?.trim() || imageUrl,
            originalImageUrl: image.url.trim() || imageUrl,
            hostedImageUrl: image.hostedUrl?.trim() || undefined,
            fileName: image.fileName,
            alt: image.fileName?.trim() || `Reference image ${index + 1}`,
            sourceType: "inline_reference",
            width: image.width,
            height: image.height,
          }];
        });
      const requestImages = await normalizeReferenceImagesViaOss([
        ...connectedImages,
        ...inlineImages,
      ]);
      const inlineVideos = (latestVideoGenerationNode.data.referenceVideos ?? [])
        .map((video) => ({
          url: video.hostedUrl?.trim() || video.url.trim(),
          fileName: video.fileName,
        }))
        .filter((video) => isRemoteRequestUrl(video.url));
      const requestVideos = [
        ...connectedVideos.map((video) => ({
          url: video.hostedVideoUrl?.trim() || video.videoUrl.trim(),
          fileName: video.fileName,
        })),
        ...inlineVideos,
      ].filter((video) => isRemoteRequestUrl(video.url));
      const requestAudio = (latestVideoGenerationNode.data.referenceAudio ?? [])
        .map((audio) => ({
          url: audio.hostedUrl?.trim() || audio.url.trim(),
          fileName: audio.fileName,
        }))
        .filter((audio) => audio.url);
      const mode = latestVideoGenerationNode.data.mode ?? "all-reference";

      if (mode === "image-to-video" && requestImages.length === 0) {
        throw new Error("Image to video requires at least one image");
      }

      if (mode === "first-last-frame" && requestImages.length !== 2) {
        throw new Error("First-last-frame mode requires exactly two images");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoGenerationNodeId && node.type === "video_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: undefined,
                  progress: undefined,
                  videoUrl: undefined,
                  hostedVideoUrl: undefined,
                  lastFrameUrl: undefined,
                  generatedModel: undefined,
                  generatedAt: undefined,
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const provider = latestVideoGenerationNode.data.provider ?? "comfly";
      const apiKey = assertStoredApiKey("video", provider);
      const response = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          provider,
          model: latestVideoGenerationNode.data.model,
          mode,
          prompt,
          ratio: latestVideoGenerationNode.data.ratio,
          resolution: latestVideoGenerationNode.data.resolution,
          duration: latestVideoGenerationNode.data.duration,
          seed: latestVideoGenerationNode.data.seed,
          camerafixed: latestVideoGenerationNode.data.camerafixed,
          watermark: latestVideoGenerationNode.data.watermark,
          returnLastFrame: latestVideoGenerationNode.data.returnLastFrame,
          generateAudio: latestVideoGenerationNode.data.generateAudio,
          images: requestImages,
          videos: requestVideos,
          audio: requestAudio,
        }),
      });
      const json = await readJsonResponse<VideoGenerationResponse>(
        response,
        "Video generation request failed",
      );

      if (!response.ok || !json.ok) {
        throw new Error(json.ok ? "Video generation failed" : json.error);
      }

      if (json.status !== "submitted") {
        throw new Error("Video generation request did not return a task id");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoGenerationNodeId && node.type === "video_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: json.task.taskId,
                  generatedModel: json.task.model,
                  progress: "0%",
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const result = await waitForVideoTaskResult({
        provider,
        apiKey,
        taskId: json.task.taskId,
        model: json.task.model,
        officialFormat: json.task.officialFormat,
        onProgress: (progress) => {
          if (!progress) {
            return;
          }

          set((currentState) => ({
            dirty: true,
            nodes: currentState.nodes.map((node) =>
              node.id === videoGenerationNodeId && node.type === "video_generation"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      progress,
                    },
                  }
                : node,
            ),
          }));
        },
      });

      const generatedAt = nowIso();

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoGenerationNodeId && node.type === "video_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: result.taskId,
                  progress: "100%",
                  videoUrl: result.videoUrl,
                  hostedVideoUrl: result.videoUrl,
                  lastFrameUrl: result.lastFrameUrl,
                  generatedModel: result.model,
                  generatedAt,
                  status: "idle",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      void get().persistProjectOutput({
        sourceKey: `${videoGenerationNodeId}:${generatedAt}:${result.videoUrl}`,
        imageUrl: result.videoUrl,
        kind: "video",
        fileName: `${latestVideoGenerationNode.data.title || "video"}.mp4`,
        generatedAt,
        nodeData: {
          ...latestVideoGenerationNode.data,
          taskId: result.taskId,
          videoUrl: result.videoUrl,
          hostedVideoUrl: result.videoUrl,
          lastFrameUrl: result.lastFrameUrl,
          generatedModel: result.model,
          generatedAt,
          status: "idle",
          errorMessage: undefined,
        },
        title: latestVideoGenerationNode.data.title,
        model: result.model,
        format: "mp4",
      }).catch((error) => {
        get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
      });
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        error: message,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoGenerationNodeId && node.type === "video_generation"
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
      }));
    } finally {
      inFlightVideoGenerationNodeIds.delete(videoGenerationNodeId);
    }
  },

  generateAudioFromAudioGenerationNode: async (audioGenerationNodeId, promptOverride) => {
    const state = get();
    const audioGenerationNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "audio_generation" }> =>
        node.id === audioGenerationNodeId && node.type === "audio_generation",
    );

    if (!audioGenerationNode) {
      throw new Error("Audio generation node not found");
    }

    if (audioGenerationNode.data.status === "generating") {
      return;
    }

    if (inFlightAudioGenerationNodeIds.has(audioGenerationNodeId)) {
      return;
    }

    inFlightAudioGenerationNodeIds.add(audioGenerationNodeId);

    try {
      const latestState = get();
      const latestAudioGenerationNode = latestState.nodes.find(
        (node): node is Extract<CanvasNode, { type: "audio_generation" }> =>
          node.id === audioGenerationNodeId && node.type === "audio_generation",
      );

      if (!latestAudioGenerationNode) {
        throw new Error("Audio generation node not found");
      }

      const provider = latestAudioGenerationNode.data.provider ?? "comfly";
      const model = latestAudioGenerationNode.data.model ?? "suno-v5.5";
      const isRunningHubVoiceClone =
        provider === "runninghub" || model === "runninghub-voice-clone";
      const rawPrompt =
        promptOverride?.trim() ||
        latestAudioGenerationNode.data.prompt?.trim() ||
        "";
      const stylePrompt = latestAudioGenerationNode.data.style?.trim() || "";
      const mode = latestAudioGenerationNode.data.mode ?? "inspiration";
      const instrumental = latestAudioGenerationNode.data.instrumental === true;
      const prompt = rawPrompt || (mode === "custom" && instrumental ? stylePrompt : "");
      const sourceAudio = latestAudioGenerationNode.data.referenceAudio?.find((reference) =>
        Boolean(reference.hostedUrl?.trim() || reference.url?.trim()),
      );

      if (isRunningHubVoiceClone && !sourceAudio) {
        throw new Error("请先添加一段参考音频");
      }

      if (!isRunningHubVoiceClone && !prompt) {
        throw new Error("请输入音乐描述或风格标签");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === audioGenerationNodeId && node.type === "audio_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: undefined,
                  progress: undefined,
                  audioUrl: undefined,
                  hostedAudioUrl: undefined,
                  generatedAudioTitle: undefined,
                  generatedOutputFileName: undefined,
                  generatedModel: undefined,
                  generatedAt: undefined,
                  durationSeconds: undefined,
                  mimeType: undefined,
                  sizeBytes: undefined,
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const apiKey = isRunningHubVoiceClone
        ? assertStoredRunningHubWorkflowApiKey()
        : assertStoredApiKey("video", provider);
      const response = await fetch("/api/ai/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRunningHubVoiceClone
            ? {
                apiKey,
                provider: "runninghub",
                model: "runninghub-voice-clone",
                sourceAudioUrl: sourceAudio?.hostedUrl?.trim() || sourceAudio?.url?.trim(),
                sourceAudioFileName: sourceAudio?.fileName,
                instanceType: latestAudioGenerationNode.data.instanceType || "default",
              }
            : {
                apiKey,
                provider,
                model,
                mode,
                prompt,
                title: latestAudioGenerationNode.data.songTitleEdited
                  ? latestAudioGenerationNode.data.songTitle
                  : "",
                style: latestAudioGenerationNode.data.style,
                instrumental,
                negativeTags: latestAudioGenerationNode.data.negativeTags,
                vocalGender: latestAudioGenerationNode.data.vocalGender,
              },
        ),
      });
      const json = await readJsonResponse<AudioGenerationResponse>(
        response,
        "Audio generation request failed",
      );

      if (!response.ok || !json.ok) {
        throw new Error(json.ok ? "Audio generation failed" : json.error);
      }

      if (json.status !== "submitted") {
        throw new Error("Audio generation request did not return a task id");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === audioGenerationNodeId && node.type === "audio_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: json.task.taskId,
                  generatedModel: json.task.model,
                  progress: "0%",
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const result = await waitForAudioTaskResult({
        provider,
        apiKey,
        taskId: json.task.taskId,
        model: json.task.model,
        onProgress: (progress) => {
          if (!progress) {
            return;
          }

          set((currentState) => ({
            dirty: true,
            nodes: currentState.nodes.map((node) =>
              node.id === audioGenerationNodeId && node.type === "audio_generation"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      progress,
                    },
                  }
                : node,
            ),
          }));
        },
      });
      const generatedAt = nowIso();

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === audioGenerationNodeId && node.type === "audio_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  generatedAudioTitle: result.title,
                  taskId: result.taskId,
                  progress: "100%",
                  audioUrl: result.audioUrl,
                  hostedAudioUrl: result.audioUrl,
                  generatedModel: result.model,
                  generatedAt,
                  durationSeconds: result.durationSeconds,
                  mimeType: result.mimeType,
                  sizeBytes: result.sizeBytes,
                  status: "idle",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        error: message,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === audioGenerationNodeId && node.type === "audio_generation"
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
      }));
    } finally {
      inFlightAudioGenerationNodeIds.delete(audioGenerationNodeId);
    }
  },

  createVideoUpscaleNodeFromSource: (sourceNodeId) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);

    if (
      !sourceNode ||
      (sourceNode.type !== "video" &&
        sourceNode.type !== "video_generation" &&
        sourceNode.type !== "video_upscale")
    ) {
      throw new Error("Source video node not found");
    }

    const nextNode: CanvasNode = {
      id: crypto.randomUUID(),
      type: "video_upscale",
      position: {
        x: sourceNode.position.x + 600,
        y: sourceNode.position.y,
      },
      data: createVideoUpscaleNodeData(),
    };
    const nextEdge: CanvasEdge = {
      id: crypto.randomUUID(),
      source: sourceNode.id,
      target: nextNode.id,
    };

    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      nodes: [...currentState.nodes, nextNode],
      edges: [...currentState.edges, nextEdge],
      dirty: true,
      error: null,
    }));

    return nextNode.id;
  },

  runVideoUpscaleFromNode: async (videoUpscaleNodeId) => {
    const state = get();
    const videoUpscaleNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "video_upscale" }> =>
        node.id === videoUpscaleNodeId && node.type === "video_upscale",
    );

    if (!videoUpscaleNode) {
      throw new Error("Video upscale node not found");
    }

    if (videoUpscaleNode.data.status === "generating") {
      return;
    }

    if (inFlightVideoUpscaleNodeIds.has(videoUpscaleNodeId)) {
      return;
    }

    inFlightVideoUpscaleNodeIds.add(videoUpscaleNodeId);

    try {
      const latestState = get();
      const latestVideoUpscaleNode = latestState.nodes.find(
        (node): node is Extract<CanvasNode, { type: "video_upscale" }> =>
          node.id === videoUpscaleNodeId && node.type === "video_upscale",
      );

      if (!latestVideoUpscaleNode) {
        throw new Error("Video upscale node not found");
      }

      const sourceVideo = getConnectedSourceVideoForVideoUpscaleNode(
        latestState.nodes,
        latestState.edges,
        videoUpscaleNodeId,
      );

      if (!sourceVideo) {
        throw new Error("Video upscale requires an upstream video");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoUpscaleNodeId && node.type === "video_upscale"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: undefined,
                  progress: undefined,
                  videoUrl: undefined,
                  hostedVideoUrl: undefined,
                  generatedAt: undefined,
                  generatedOutputFileName: undefined,
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const requestVideo = await normalizeVideoForProcessing(sourceVideo);
      const apiKey = assertStoredRunningHubWorkflowApiKey();
      const response = await fetch("/api/ai/video-upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          videoUrl: requestVideo.url,
          fileName: requestVideo.fileName,
          targetResolution: latestVideoUpscaleNode.data.targetResolution || "1080p",
          targetFps: latestVideoUpscaleNode.data.targetFps || "30",
          instanceType: latestVideoUpscaleNode.data.instanceType || "default",
        }),
      });
      const json = await readJsonResponse<VideoUpscaleResponse>(
        response,
        "Video upscale request failed",
      );

      if (!response.ok || !json.ok) {
        throw new Error(json.ok ? "Video upscale failed" : json.error);
      }

      if (json.status !== "submitted") {
        throw new Error("Video upscale request did not return a task id");
      }

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoUpscaleNodeId && node.type === "video_upscale"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: json.task.taskId,
                  progress: "0%",
                  status: "generating",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      const result = await waitForVideoUpscaleTaskResult({
        apiKey,
        taskId: json.task.taskId,
        onProgress: (progress) => {
          if (!progress) {
            return;
          }

          set((currentState) => ({
            dirty: true,
            nodes: currentState.nodes.map((node) =>
              node.id === videoUpscaleNodeId && node.type === "video_upscale"
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      progress,
                    },
                  }
                : node,
            ),
          }));
        },
      });
      const generatedAt = nowIso();
      const videoUpscaleTitle = normalizeVideoUpscaleTitle(latestVideoUpscaleNode.data.title);
      const outputFileName = `${videoUpscaleTitle}.mp4`;
      const videoMetadata = await readVideoMetadataFromUrl(result.videoUrl).catch(() => null);

      set((currentState) => ({
        error: null,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoUpscaleNodeId && node.type === "video_upscale"
            ? {
                ...node,
                data: {
                  ...node.data,
                  taskId: result.taskId,
                  progress: "100%",
                  videoUrl: result.videoUrl,
                  hostedVideoUrl: result.videoUrl,
                  width: videoMetadata?.width,
                  height: videoMetadata?.height,
                  generatedAt,
                  generatedOutputFileName: outputFileName,
                  status: "idle",
                  errorMessage: undefined,
                },
              }
            : node,
        ),
      }));

      void get().persistProjectOutput({
        sourceKey: `${videoUpscaleNodeId}:${generatedAt}:${result.videoUrl}`,
        imageUrl: result.videoUrl,
        kind: "video",
        fileName: outputFileName,
        generatedAt,
        nodeData: {
          ...latestVideoUpscaleNode.data,
          taskId: result.taskId,
          videoUrl: result.videoUrl,
          hostedVideoUrl: result.videoUrl,
          width: videoMetadata?.width,
          height: videoMetadata?.height,
          generatedAt,
          generatedOutputFileName: outputFileName,
          status: "idle",
          errorMessage: undefined,
        },
        title: videoUpscaleTitle,
        model: "runninghub-video-upscale",
        width: videoMetadata?.width,
        height: videoMetadata?.height,
        format: "mp4",
      }).catch((error) => {
        get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
      });
    } catch (error) {
      const message = toErrorMessage(error);

      set((currentState) => ({
        error: message,
        dirty: true,
        nodes: currentState.nodes.map((node) =>
          node.id === videoUpscaleNodeId && node.type === "video_upscale"
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
      }));
    } finally {
      inFlightVideoUpscaleNodeIds.delete(videoUpscaleNodeId);
    }
  },

  getConnectedVideoForVideoUpscaleNode: (videoUpscaleNodeId) => {
    const state = get();
    return getConnectedSourceVideoForVideoUpscaleNode(
      state.nodes,
      state.edges,
      videoUpscaleNodeId,
    );
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
            type: "image",
            position: {
              x: positionX,
              y: positionY,
            },
            data: {
              title: `${baseTitle}-${titleIndex}`,
              imageUrl,
              prompt: `${baseTitle}-${titleIndex}`,
              width: tileWidth,
              height: tileHeight,
              displayWidth: tileLayouts[rowIndex][columnIndex].cardWidth,
              displayHeight: tileLayouts[rowIndex][columnIndex].cardHeight,
              generatedAt: new Date().toISOString(),
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
            type: "image",
            position: { x: positionX, y: positionY },
            data: {
              title: `${baseTitle}-${titleIndex}`,
              imageUrl,
              prompt: `${baseTitle}-${titleIndex}`,
              width: tileWidth,
              height: tileHeight,
              displayWidth: tileLayouts[rowIndex][columnIndex].cardWidth,
              displayHeight: tileLayouts[rowIndex][columnIndex].cardHeight,
              generatedAt: new Date().toISOString(),
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
      const displaySize = getUploadedImageDisplayDimensions(sw, sh);

      const nextNode: CanvasNode = {
        id: crypto.randomUUID(),
        type: "image",
        position: { x: positionX, y: positionY },
        data: {
          title: `${baseTitle}-crop`,
          imageUrl,
          prompt: `${baseTitle}-crop`,
          width: sw,
          height: sh,
          displayWidth: displaySize.width,
          displayHeight: displaySize.height,
          generatedAt: new Date().toISOString(),
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

  splitImageNodeToGrid: async (nodeId, dimension) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image" }> =>
        node.id === nodeId && node.type === "image",
    );

    if (!sourceNode) {
      throw new Error("Image node not found");
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
      const sourceDisplay = getCanvasImageNodeDisplayDimensions(sourceNode, naturalWidth, naturalHeight);
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
      const startX = sourceNode.position.x + sourceDisplay.width + SPLIT_OUTPUT_GROUP_GAP;
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
            type: "image",
            position: { x: positionX, y: positionY },
            data: {
              title: `${baseTitle}-${titleIndex}`,
              imageUrl,
              prompt: `${baseTitle}-${titleIndex}`,
              width: tileWidth,
              height: tileHeight,
              displayWidth: tileLayouts[rowIndex][columnIndex].cardWidth,
              displayHeight: tileLayouts[rowIndex][columnIndex].cardHeight,
              generatedAt: new Date().toISOString(),
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

  cropImageNode: async (nodeId, cropRect) => {
    const state = get();
    const sourceNode = state.nodes.find(
      (node): node is Extract<CanvasNode, { type: "image" }> =>
        node.id === nodeId && node.type === "image",
    );

    if (!sourceNode) {
      throw new Error("Image node not found");
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
      const sourceDisplay = getCanvasImageNodeDisplayDimensions(sourceNode, naturalWidth, naturalHeight);
      const positionX = sourceNode.position.x + sourceDisplay.width + SPLIT_OUTPUT_GROUP_GAP;
      const positionY = sourceNode.position.y;
      const baseTitle = sanitizeSplitNodeTitle(sourceNode.data.title);
      const displaySize = getUploadedImageDisplayDimensions(sw, sh);

      const nextNode: CanvasNode = {
        id: crypto.randomUUID(),
        type: "image",
        position: { x: positionX, y: positionY },
        data: {
          title: `${baseTitle}-crop`,
          imageUrl,
          prompt: `${baseTitle}-crop`,
          width: sw,
          height: sh,
          displayWidth: displaySize.width,
          displayHeight: displaySize.height,
          generatedAt: new Date().toISOString(),
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

  createVideoNodeFromProcessedResult: async (params) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === params.sourceNodeId);

    if (!sourceNode) {
      throw new Error("Source video node not found");
    }

    const generatedAt = nowIso();
    const nextNodeId = crypto.randomUUID();
    const title = params.title.trim() || "鍓緫瑙嗛";
    const width = params.width || 320;
    const height = params.height || 180;
    const nextPosition = params.position ?? {
      x: sourceNode.position.x + 468,
      y: sourceNode.position.y,
    };
    const nodeData: VideoNodeData = {
      title,
      videoUrl: params.resultUrl,
      hostedVideoUrl: params.resultUrl,
      fileName: title,
      width,
      height,
      sizeBytes: params.sizeBytes,
      durationSeconds: params.durationSeconds,
      mimeType: params.mimeType || "video/mp4",
    };
    let persistedPreviewUrl: string | undefined;
    let persistedFileName: string | undefined;

    try {
      if (state.currentProject) {
        const persisted = await persistGeneratedOutput(state.currentProject, {
          sourceKey: `${nextNodeId}:video:${params.resultUrl}`,
          imageUrl: params.resultUrl,
          kind: "video",
          fileName: title,
          generatedAt,
          nodeData,
          title,
          width,
          height,
          format: "mp4",
          sizeBytes: params.sizeBytes,
        });

        persistedPreviewUrl = persisted.previewUrl;
        persistedFileName = persisted.fileName;
      }
    } catch (error) {
      get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
    }

    const nextNode: CanvasNode = {
      id: nextNodeId,
      type: "video",
      position: nextPosition,
      data: {
        ...nodeData,
        videoUrl: persistedPreviewUrl || params.resultUrl,
        hostedVideoUrl: persistedPreviewUrl || params.resultUrl,
        fileName: persistedFileName || nodeData.fileName,
        outputFileName: persistedFileName,
      },
    };

    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      nodes: [...currentState.nodes, nextNode],
      currentProjectPreviewUrls: persistedPreviewUrl
        ? [...currentState.currentProjectPreviewUrls, persistedPreviewUrl]
        : currentState.currentProjectPreviewUrls,
      dirty: true,
      error: null,
    }));

    return nextNodeId;
  },

  createImageNodeFromVideoFrame: async (params) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === params.sourceNodeId);

    if (!sourceNode) {
      throw new Error("Source video node not found");
    }

    const generatedAt = nowIso();
    const nextNodeId = crypto.randomUUID();
    const title = params.title?.trim() || "视频帧";
    const position = params.position ?? {
      x: sourceNode.position.x + 468,
      y: sourceNode.position.y + 44,
    };
    const historyNodeData: ImageGenerationNodeData = {
      title,
      prompt: "视频帧提取",
      model: "video-frame-capture",
      generatedImageUrl: params.dataUrl,
      generatedImageWidth: params.width,
      generatedImageHeight: params.height,
      generatedImageFormat: "PNG",
      generatedAt,
      generationResults: [{
        status: "completed",
        imageUrl: params.dataUrl,
        model: "video-frame-capture",
        width: params.width,
        height: params.height,
        format: "PNG",
        generatedAt,
      }],
      status: "idle",
    };
    let persistedPreviewUrl: string | undefined;
    let persistedFileName: string | undefined;

    try {
      if (state.currentProject) {
        const persisted = await persistGeneratedOutput(state.currentProject, {
          sourceKey: `${nextNodeId}:${generatedAt}:${params.dataUrl}`,
          imageUrl: params.dataUrl,
          fileName: title,
          generatedAt,
          nodeData: historyNodeData,
          title,
          model: historyNodeData.model,
          width: params.width,
          height: params.height,
          format: "PNG",
        });

        persistedPreviewUrl = persisted.previewUrl;
        persistedFileName = persisted.fileName;
      }
    } catch (error) {
      get().setSaveMessage(toProjectOutputSaveErrorMessage(error));
    }

    const nextNode: CanvasNode = {
      id: nextNodeId,
      type: "image",
      position,
      data: {
        title,
        imageUrl: persistedPreviewUrl || params.dataUrl,
        hostedImageUrl: persistedPreviewUrl,
        prompt: "视频帧提取",
        model: "video-frame-capture",
        width: params.width,
        height: params.height,
        generatedAt,
        generatedOutputFileName: persistedFileName,
        status: "idle",
      },
    };

    set((currentState) => ({
      ...createUndoHistoryUpdate(currentState),
      nodes: [...currentState.nodes, nextNode],
      currentProjectPreviewUrls: persistedPreviewUrl
        ? [...currentState.currentProjectPreviewUrls, persistedPreviewUrl]
        : currentState.currentProjectPreviewUrls,
      dirty: true,
      error: null,
    }));

    return nextNodeId;
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
      semanticImageUrl: source.semanticImageUrl,
      fileName: source.fileName,
      width: sourceWidth,
      height: sourceHeight,
      alt: source.alt,
      previewUrl: source.previewUrl || source.imageUrl,
      originalImageUrl: source.imageUrl,
      sourceType: "image",
    };
    const newNodeId = crypto.randomUUID();
    const nodeTitle = sourceNode.type === "image" ? sourceNode.data.title || "Image" : "3D瑙嗚";
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
          previewUrl: referenceImage.previewUrl,
          semanticImageUrl: referenceImage.semanticImageUrl,
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
      type: "image",
      position: {
        x: sourceNode.position.x + PANORAMA_360_NODE_HEIGHT * 16 / 9 + PANORAMA_360_NODE_GAP,
        y: sourceNode.position.y,
      },
      data: {
        title,
        imageUrl: hostedImageUrl || imageUrl,
        hostedImageUrl,
        fileName,
        generatedOutputFileName: fileName,
        prompt: title,
        width: capture.width,
        height: capture.height,
        displayWidth: capture.displayWidth,
        displayHeight: capture.displayHeight,
        sizeBytes,
        generatedAt,
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
          previewUrl: source.previewUrl,
          semanticImageUrl: source.semanticImageUrl,
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

  removeReferenceImageFromStoryboardNode: (
    storyboardNodeId,
    referenceImageId,
  ) => {
    set((state) => {
      const storyboardNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "storyboard_script" }> =>
          node.id === storyboardNodeId && node.type === "storyboard_script",
      );

      if (!storyboardNode) {
        return state;
      }

      const inlineReferenceImages = storyboardNode.data.referenceImages ?? [];
      const nextInlineReferenceImages = inlineReferenceImages.filter(
        (image) =>
          image.sourceNodeId !== referenceImageId &&
          image.url !== referenceImageId,
      );
      const removedInline =
        nextInlineReferenceImages.length !== inlineReferenceImages.length;
      const nextEdges = state.edges.filter(
        (edge) =>
          !(
            edge.target === storyboardNodeId &&
            edge.source === referenceImageId
          ),
      );
      const removedEdge = nextEdges.length !== state.edges.length;

      if (!removedInline && !removedEdge) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state),
        nodes: state.nodes.map((node) =>
          node.id === storyboardNodeId && node.type === "storyboard_script"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: nextInlineReferenceImages,
                  prompt: reconcileImageVideoReferenceMentionTokens(
                    node.data.prompt,
                    getConnectedImagesForTargetNode(
                      state.nodes,
                      nextEdges,
                      storyboardNodeId,
                    ),
                    getConnectedVideosForTargetNode(
                      state.nodes,
                      nextEdges,
                      storyboardNodeId,
                    ),
                  ),
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node,
        ),
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

  addReferenceMediaToVideoGenerationNode: (videoGenerationNodeId, media) => {
    if (media.length === 0) {
      return;
    }

    set((state) => {
      const videoGenerationNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "video_generation" }> =>
          node.id === videoGenerationNodeId && node.type === "video_generation",
      );

      if (!videoGenerationNode) {
        return state;
      }

      const imageRefs = media.filter((item) => item.mimeType?.startsWith("image/"));
      const videoRefs = media.filter((item) => item.mimeType?.startsWith("video/"));
      const audioRefs = media.filter((item) => item.mimeType?.startsWith("audio/"));

      return {
        ...createUndoHistoryUpdate(state),
        nodes: state.nodes.map((node) =>
          node.id === videoGenerationNodeId && node.type === "video_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: [
                    ...(node.data.referenceImages ?? []),
                    ...imageRefs,
                  ],
                  referenceVideos: [
                    ...(node.data.referenceVideos ?? []),
                    ...videoRefs,
                  ],
                  referenceAudio: [
                    ...(node.data.referenceAudio ?? []),
                    ...audioRefs,
                  ],
                  mode: videoRefs.length > 0 ? "all-reference" : node.data.mode,
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

  addReferenceMediaToAudioGenerationNode: (audioGenerationNodeId, media) => {
    if (media.length === 0) {
      return;
    }

    set((state) => {
      const audioGenerationNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "audio_generation" }> =>
          node.id === audioGenerationNodeId && node.type === "audio_generation",
      );

      if (!audioGenerationNode) {
        return state;
      }

      const audioRefs = media.filter((item) => item.mimeType?.startsWith("audio/"));

      if (audioRefs.length === 0) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state),
        nodes: state.nodes.map((node) =>
          node.id === audioGenerationNodeId && node.type === "audio_generation"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceAudio: appendDedupeReferences(
                    node.data.referenceAudio,
                    audioRefs,
                  ),
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

  addReferenceMediaToTextNode: (textNodeId, media) => {
    if (media.length === 0) {
      return;
    }

    set((state) => {
      const textNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "text" }> =>
          node.id === textNodeId && node.type === "text",
      );

      if (!textNode) {
        return state;
      }

      const imageRefs = media.filter((item) => item.mimeType?.startsWith("image/"));
      const videoRefs = media.filter((item) => item.mimeType?.startsWith("video/"));

      return {
        ...createUndoHistoryUpdate(state),
        nodes: state.nodes.map((node) =>
          node.id === textNodeId && node.type === "text"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: [
                    ...(node.data.referenceImages ?? []),
                    ...imageRefs,
                  ],
                  referenceVideos: [
                    ...(node.data.referenceVideos ?? []),
                    ...videoRefs,
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

  addReferenceMediaToStoryboardNode: (storyboardNodeId, media) => {
    if (media.length === 0) {
      return;
    }

    set((state) => {
      const storyboardNode = state.nodes.find(
        (node): node is Extract<CanvasNode, { type: "storyboard_script" }> =>
          node.id === storyboardNodeId && node.type === "storyboard_script",
      );

      if (!storyboardNode) {
        return state;
      }

      const existingImageIds = new Set(
        (storyboardNode.data.referenceImages ?? []).flatMap((image) => [
          image.id,
          image.sourceNodeId,
          image.url,
          image.hostedUrl,
        ]).filter((value): value is string => Boolean(value?.trim())),
      );
      const existingVideoIds = new Set(
        (storyboardNode.data.referenceVideos ?? []).flatMap((video) => [
          video.id,
          video.sourceNodeId,
          video.url,
          video.hostedUrl,
        ]).filter((value): value is string => Boolean(value?.trim())),
      );
      const imageRefs = media.filter(
        (item) =>
          item.mimeType?.startsWith("image/") &&
          ![item.id, item.url, item.hostedUrl].some((value) =>
            Boolean(value?.trim() && existingImageIds.has(value.trim())),
          ),
      );
      const videoRefs = media.filter(
        (item) =>
          item.mimeType?.startsWith("video/") &&
          ![item.id, item.url, item.hostedUrl].some((value) =>
            Boolean(value?.trim() && existingVideoIds.has(value.trim())),
          ),
      );

      if (imageRefs.length === 0 && videoRefs.length === 0) {
        return state;
      }

      const imageOffset = storyboardNode.data.referenceImages?.length ?? 0;
      const videoOffset = storyboardNode.data.referenceVideos?.length ?? 0;

      return {
        ...createUndoHistoryUpdate(state),
        nodes: state.nodes.map((node) =>
          node.id === storyboardNodeId && node.type === "storyboard_script"
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: [
                    ...(node.data.referenceImages ?? []),
                    ...imageRefs.map((reference, index) => ({
                      ...reference,
                      label: `@图片${imageOffset + index + 1}`,
                      sourceNodeId: reference.id,
                      alt: reference.fileName,
                    })),
                  ],
                  referenceVideos: [
                    ...(node.data.referenceVideos ?? []),
                    ...videoRefs.map((reference, index) => ({
                      ...reference,
                      label: `@视频${videoOffset + index + 1}`,
                      sourceNodeId: reference.id,
                      alt: reference.fileName,
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

  updateInlineReferenceMedia: (targetNodeId, referenceId, updates) => {
    set((state) => {
      let didUpdate = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== targetNodeId) {
          return node;
        }

        if (node.type === "image_generation") {
          let nodeDidUpdate = false;
          const nextReferenceImages = (node.data.referenceImages ?? []).map((image) => {
            if (image.id !== referenceId) {
              return image;
            }

            didUpdate = true;
            nodeDidUpdate = true;
            return {
              ...image,
              imageUrl: updates.imageUrl ?? updates.url ?? image.imageUrl,
              hostedImageUrl: updates.hostedImageUrl ?? updates.hostedUrl ?? image.hostedImageUrl,
              previewUrl: updates.previewUrl ?? image.previewUrl,
              semanticImageUrl: updates.semanticImageUrl ?? image.semanticImageUrl,
              fileName: updates.fileName ?? image.fileName,
              width: updates.width ?? image.width,
              height: updates.height ?? image.height,
              sizeBytes: updates.sizeBytes ?? image.sizeBytes,
              uploadStatus: updates.uploadStatus ?? image.uploadStatus,
              uploadError: updates.uploadError,
            };
          });

          return nodeDidUpdate
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: nextReferenceImages,
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node;
        }

        if (node.type === "text") {
          let nodeDidUpdate = false;
          const updateReference = (reference: VideoGenerationMediaReference) => {
            if (reference.id !== referenceId) {
              return reference;
            }

            didUpdate = true;
            nodeDidUpdate = true;
            return {
              ...reference,
              ...updates,
            };
          };
          const nextReferenceImages = (node.data.referenceImages ?? []).map(updateReference);
          const nextReferenceVideos = (node.data.referenceVideos ?? []).map(updateReference);

          return nodeDidUpdate
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: nextReferenceImages,
                  referenceVideos: nextReferenceVideos,
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node;
        }

        if (node.type === "storyboard_script") {
          let nodeDidUpdate = false;
          const updateReference = <
            T extends StoryboardReferenceImage | StoryboardReferenceVideo,
          >(reference: T): T => {
            if (reference.id !== referenceId && reference.sourceNodeId !== referenceId) {
              return reference;
            }

            didUpdate = true;
            nodeDidUpdate = true;
            return {
              ...reference,
              url: updates.hostedUrl ?? updates.url ?? reference.url,
              hostedUrl: updates.hostedUrl ?? reference.hostedUrl,
              previewUrl: updates.previewUrl ?? reference.previewUrl,
              fileName: updates.fileName ?? reference.fileName,
              mimeType: updates.mimeType ?? reference.mimeType,
              sizeBytes: updates.sizeBytes ?? reference.sizeBytes,
              width: updates.width ?? reference.width,
              height: updates.height ?? reference.height,
              uploadStatus: updates.uploadStatus ?? reference.uploadStatus,
              uploadError: updates.uploadError,
            };
          };
          const nextReferenceImages = (node.data.referenceImages ?? []).map(updateReference);
          const nextReferenceVideos = (node.data.referenceVideos ?? []).map(updateReference);

          return nodeDidUpdate
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: nextReferenceImages,
                  referenceVideos: nextReferenceVideos,
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node;
        }

        if (node.type === "video_generation") {
          let nodeDidUpdate = false;
          const updateReference = (reference: VideoGenerationMediaReference) => {
            if (reference.id !== referenceId) {
              return reference;
            }

            didUpdate = true;
            nodeDidUpdate = true;
            return {
              ...reference,
              ...updates,
            };
          };
          const nextReferenceImages = (node.data.referenceImages ?? []).map(updateReference);
          const nextReferenceVideos = (node.data.referenceVideos ?? []).map(updateReference);
          const nextReferenceAudio = (node.data.referenceAudio ?? []).map(updateReference);

          return nodeDidUpdate
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceImages: nextReferenceImages,
                  referenceVideos: nextReferenceVideos,
                  referenceAudio: nextReferenceAudio,
                  mode: nextReferenceVideos.length > 0 ? "all-reference" : node.data.mode,
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node;
        }

        if (node.type === "audio_generation") {
          let nodeDidUpdate = false;
          const nextReferenceAudio = (node.data.referenceAudio ?? []).map((reference) => {
            if (reference.id !== referenceId) {
              return reference;
            }

            didUpdate = true;
            nodeDidUpdate = true;
            return {
              ...reference,
              ...updates,
            };
          });

          return nodeDidUpdate
            ? {
                ...node,
                data: {
                  ...node.data,
                  referenceAudio: nextReferenceAudio,
                  status: node.data.status === "error" ? "idle" : node.data.status,
                  errorMessage: undefined,
                },
              }
            : node;
        }

        return node;
      });

      if (!didUpdate) {
        return state;
      }

      return {
        ...createUndoHistoryUpdate(state, { coalesce: true }),
        nodes: nextNodes,
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

  getConnectedImagesForVideoGenerationNode: (videoGenerationNodeId) => {
    const state = get();
    return getConnectedImagesForTargetNode(
      state.nodes,
      state.edges,
      videoGenerationNodeId,
    );
  },

  getConnectedVideosForVideoGenerationNode: (videoGenerationNodeId) => {
    const state = get();
    return getVideoGenerationReferenceVideos(
      state.nodes,
      state.edges,
      videoGenerationNodeId,
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
      currentProjectThumbnailFileName: undefined,
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
      const { project: updatedProject, snapshot: savedSnapshot } = await saveProjectSnapshot(state.currentProject, snapshot);

      set({
        projectId: savedSnapshot.id,
        projectName: savedSnapshot.name,
        projectCreatedAt: savedSnapshot.createdAt,
        currentProject: updatedProject,
        currentProjectThumbnailFileName: savedSnapshot.thumbnailFileName,
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
      const loadedNodes = normalizeLoadedCanvasNodes(hydrated.snapshot.nodes);

      revokeObjectUrls(previousPreviewUrls);

      set({
        projectId: hydrated.snapshot.id,
        projectName: hydrated.snapshot.name,
        projectCreatedAt: hydrated.snapshot.createdAt,
        currentProject: project,
        currentProjectThumbnailFileName: hydrated.snapshot.thumbnailFileName,
        currentProjectPreviewUrls: hydrated.previewUrls,
        nodes: loadedNodes,
        edges: hydrated.snapshot.edges,
        groups: hydrated.snapshot.groups ?? [],
        materials: hydrated.snapshot.materials ?? [],
        loading: false,
        error: null,
        dirty: false,
        lastSavedAt: hydrated.snapshot.updatedAt,
        lastSavedSignature: getPersistentProjectSnapshotSignature({
          ...hydrated.snapshot,
          nodes: loadedNodes,
        }),
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
    const loadedNodes = normalizeLoadedCanvasNodes(snapshot.nodes);
    const nextPreviewUrls = collectPreviewUrlsFromNodes(loadedNodes);

    set({
      projectId: snapshot.id,
      projectName: snapshot.name,
      projectCreatedAt: snapshot.createdAt,
      currentProject: project,
      currentProjectThumbnailFileName: snapshot.thumbnailFileName,
      currentProjectPreviewUrls: nextPreviewUrls,
      nodes: loadedNodes,
      edges: snapshot.edges,
      groups: snapshot.groups ?? [],
      materials: snapshot.materials ?? [],
      loading: false,
      error: null,
      dirty: false,
      lastSavedAt: snapshot.updatedAt,
      lastSavedSignature: getPersistentProjectSnapshotSignature({
        ...snapshot,
        nodes: loadedNodes,
      }),
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
      if (params.kind === "video") {
        const nodeData = params.nodeData as VideoGenerationNodeData | VideoUpscaleNodeData | VideoNodeData;
        const nodes = currentState.nodes.map((node) => {
          if (node.type === "video_generation" || node.type === "video_upscale") {
            const sourceKey = `${node.id}:${params.generatedAt}:${nodeData.videoUrl ?? ""}`;

            if (sourceKey !== params.sourceKey) {
              return node;
            }

            return {
              ...node,
              data: {
                ...node.data,
                videoUrl: persisted.previewUrl,
                hostedVideoUrl: persisted.previewUrl,
                generatedOutputFileName: persisted.fileName,
                sizeBytes: params.sizeBytes ?? persisted.sizeBytes,
              },
            };
          }

          if (node.type === "video") {
            const sourceNodeId = params.sourceKey.split(":")[0];

            if (node.id !== sourceNodeId) {
              return node;
            }

            return {
              ...node,
              data: {
                ...node.data,
                videoUrl: persisted.previewUrl,
                hostedVideoUrl: persisted.previewUrl,
                fileName: node.data.fileName ?? persisted.fileName,
                outputFileName: persisted.fileName,
              },
            };
          }

          return node;
        });

        return {
          nodes,
          currentProjectPreviewUrls: [
            ...currentState.currentProjectPreviewUrls,
            persisted.previewUrl,
          ],
        };
      }

      const nodeData = params.nodeData as ImageGenerationNodeData;
      let previousPreviewUrl: string | null = null;

      const nodes = currentState.nodes.map((node) => {
        if (node.type !== "image_generation") {
          return node;
        }

        const sourceKey = `${node.id}:${params.generatedAt}:${nodeData.generatedImageUrl ?? ""}`;

        if (sourceKey !== params.sourceKey) {
          return node;
        }

        const matchesPrimaryImage =
          node.data.generatedAt === params.generatedAt &&
          node.data.generatedImageUrl === nodeData.generatedImageUrl;

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
                result.imageUrl !== nodeData.generatedImageUrl
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
