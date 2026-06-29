import type { VideoGenerationMode } from "@/types/canvas";
import {
  normalizeVideoProvider,
  type VideoGenerationProvider,
} from "./video-provider";

export interface VideoReferenceInput {
  url: string;
  fileName?: string;
}

export interface GenerateVideoParams {
  provider?: VideoGenerationProvider;
  apiKey?: string;
  model?: string;
  mode: VideoGenerationMode;
  prompt: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  seed?: number;
  camerafixed?: boolean;
  watermark?: boolean;
  returnLastFrame?: boolean;
  generateAudio?: boolean;
  images?: VideoReferenceInput[];
  videos?: VideoReferenceInput[];
  audio?: VideoReferenceInput[];
}

export interface VideoCreateRequest {
  path: string;
  body: Record<string, unknown>;
  officialFormat: boolean;
}

const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-2-0-260128";

function cleanReferences(references?: VideoReferenceInput[]): VideoReferenceInput[] {
  return (references ?? []).filter((reference) => reference.url.trim());
}

function appendOptionalSeed(
  body: Record<string, unknown>,
  seed?: number,
): Record<string, unknown> {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    body.seed = seed;
  }

  return body;
}

function buildOfficialContent(params: GenerateVideoParams): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: params.prompt.trim(),
    },
  ];

  for (const image of cleanReferences(params.images)) {
    content.push({
      type: "image_url",
      role: "reference_image",
      image_url: { url: image.url },
    });
  }

  for (const video of cleanReferences(params.videos)) {
    content.push({
      type: "video_url",
      role: "reference_video",
      video_url: { url: video.url },
    });
  }

  for (const audio of cleanReferences(params.audio)) {
    content.push({
      type: "audio_url",
      role: "reference_audio",
      audio_url: { url: audio.url },
    });
  }

  return content;
}

function buildOfficialBody(params: GenerateVideoParams): Record<string, unknown> {
  return appendOptionalSeed(
    {
      model: params.model || DEFAULT_SEEDANCE_MODEL,
      content: buildOfficialContent(params),
      duration: params.duration ?? 5,
      ratio: params.ratio ?? "16:9",
      resolution: params.resolution ?? "720p",
      watermark: params.watermark ?? false,
      camerafixed: params.camerafixed ?? false,
      return_last_frame: params.returnLastFrame ?? false,
      generate_audio: params.generateAudio ?? false,
    },
    params.seed,
  );
}

function buildUnifiedBody(params: GenerateVideoParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model || DEFAULT_SEEDANCE_MODEL,
    prompt: params.prompt.trim(),
    duration: params.duration ?? 5,
    resolution: params.resolution ?? "720p",
    ratio: params.ratio ?? "16:9",
    watermark: params.watermark ?? false,
    camerafixed: params.camerafixed ?? false,
    return_last_frame: params.returnLastFrame ?? false,
    generate_audio: params.generateAudio ?? false,
  };
  const images = cleanReferences(params.images).map((image) => image.url);
  const videos = cleanReferences(params.videos).map((video) => video.url);
  const audio = cleanReferences(params.audio).map((item) => item.url);

  if (images.length) {
    body.images = images;
  }

  if (videos.length) {
    body.videos = videos;
  }

  if (audio.length) {
    body.audio = audio;
  }

  return appendOptionalSeed(body, params.seed);
}

function shouldUseOfficialFormat(params: GenerateVideoParams): boolean {
  if (normalizeVideoProvider(params.provider) === "zhenzhen") {
    return false;
  }

  return (
    params.mode === "text-to-video" ||
    params.mode === "all-reference" ||
    cleanReferences(params.videos).length > 0 ||
    cleanReferences(params.audio).length > 0
  );
}

export function buildVideoCreateRequest(params: GenerateVideoParams): VideoCreateRequest {
  const officialFormat = shouldUseOfficialFormat(params);

  return {
    path: officialFormat
      ? "/seedance/v3/contents/generations/tasks"
      : "/v2/videos/generations",
    body: officialFormat ? buildOfficialBody(params) : buildUnifiedBody(params),
    officialFormat,
  };
}

export function buildVideoTaskResultRequestPath(params: {
  provider?: VideoGenerationProvider;
  taskId: string;
  officialFormat: boolean;
}): string {
  if (normalizeVideoProvider(params.provider) === "zhenzhen") {
    return `/v2/videos/generations/${encodeURIComponent(params.taskId)}`;
  }

  return params.officialFormat
    ? `/seedance/v3/contents/generations/tasks/${encodeURIComponent(params.taskId)}`
    : `/v2/videos/generations/${encodeURIComponent(params.taskId)}`;
}
