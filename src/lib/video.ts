import 'server-only';

import { VibeApiError } from '@/lib/vibe';
import type { VideoGenerationMode } from '@/types/canvas';

const COMFLY_VIDEO_BASE_URL = normalizeBaseUrl(
  process.env.COMFLY_VIDEO_BASE_URL ??
    process.env.COMFLY_BASE_URL?.replace(/\/v1\/?$/, '') ??
    'https://ai.comfly.org',
);
const DEFAULT_SEEDANCE_MODEL = 'doubao-seedance-2-0-260128';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 45 * 60_000;

export interface VideoReferenceInput {
  url: string;
  fileName?: string;
}

export interface GenerateVideoParams {
  apiKey: string;
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

export interface VideoGenerationResult {
  taskId: string;
  model: string;
  videoUrl: string;
  lastFrameUrl?: string;
  ratio?: string;
  resolution?: string;
  duration?: string;
  seed?: string;
  usage?: unknown;
}

export interface VideoTaskSubmission {
  taskId: string;
  model: string;
  officialFormat: boolean;
}

type SeedanceCreateResponse = {
  id?: string;
  task_id?: string;
  error?: { message?: string };
  message?: string;
};

type SeedanceTaskResponse = {
  id?: string;
  task_id?: string;
  model?: string;
  status?: string;
  fail_reason?: string;
  progress?: string;
  content?: {
    video_url?: string;
    [key: string]: unknown;
  };
  data?: {
    output?: string;
    content?: {
      video_url?: string;
      [key: string]: unknown;
    };
    last_frame_url?: string;
    ratio?: string;
    resolution?: string;
    duration?: string;
    seed?: string;
    usage?: unknown;
    [key: string]: unknown;
  };
  usage?: unknown;
  error?: { message?: string };
  message?: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function assertConfigured(value: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new VibeApiError(401, 'Comfly API key is required');
  }

  return trimmed;
}

function createHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${assertConfigured(apiKey)}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function requestJson<T>(
  path: string,
  init: {
    method: 'GET' | 'POST';
    apiKey: string;
    body?: Record<string, unknown>;
    timeoutMs?: number;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  );
  let responseStatus: number | undefined;
  let responseText = '';

  try {
    const response = await fetch(`${COMFLY_VIDEO_BASE_URL}${path}`, {
      method: init.method,
      headers: createHeaders(init.apiKey),
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    responseStatus = response.status;
    responseText = await response.text();
    const json = responseText ? (JSON.parse(responseText) as T) : ({} as T);

    if (!response.ok) {
      const message =
        (json as { error?: { message?: string }; message?: string }).error?.message ??
        (json as { message?: string }).message ??
        `Comfly video request failed with status ${response.status}`;

      throw new VibeApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new VibeApiError(
        502,
        `Comfly video returned invalid JSON (status=${responseStatus ?? '?'})`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new VibeApiError(504, 'Comfly video request timed out');
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : 'Comfly video request failed',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function cleanReferences(references?: VideoReferenceInput[]): VideoReferenceInput[] {
  return (references ?? []).filter((reference) => reference.url.trim());
}

function buildOfficialContent(params: GenerateVideoParams): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: buildOfficialPrompt(params),
    },
  ];

  for (const image of cleanReferences(params.images)) {
    content.push({
      type: 'image_url',
      role: 'reference_image',
      image_url: { url: image.url },
    });
  }

  for (const video of cleanReferences(params.videos)) {
    content.push({
      type: 'video_url',
      role: 'reference_video',
      video_url: { url: video.url },
    });
  }

  for (const audio of cleanReferences(params.audio)) {
    content.push({
      type: 'audio_url',
      role: 'reference_audio',
      audio_url: { url: audio.url },
    });
  }

  return content;
}

function buildOfficialPrompt(params: GenerateVideoParams): string {
  return params.prompt.trim();
}

function appendOptionalSeed(
  body: Record<string, unknown>,
  seed?: number,
): Record<string, unknown> {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    body.seed = seed;
  }

  return body;
}

function buildOfficialBody(params: GenerateVideoParams): Record<string, unknown> {
  return appendOptionalSeed(
    {
      model: params.model || DEFAULT_SEEDANCE_MODEL,
      content: buildOfficialContent(params),
      duration: params.duration ?? 5,
      ratio: params.ratio ?? '16:9',
      resolution: params.resolution ?? '720p',
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
    resolution: params.resolution ?? '720p',
    ratio: params.ratio ?? '16:9',
    watermark: params.watermark ?? false,
    camerafixed: params.camerafixed ?? false,
    return_last_frame: params.returnLastFrame ?? false,
    generate_audio: params.generateAudio ?? false,
  };
  const images = cleanReferences(params.images).map((image) => image.url);

  if (images.length) {
    body.images = images;
  }

  return appendOptionalSeed(body, params.seed);
}

function shouldUseOfficialFormat(params: GenerateVideoParams): boolean {
  return (
    params.mode === 'text-to-video' ||
    params.mode === 'all-reference' ||
    cleanReferences(params.videos).length > 0 ||
    cleanReferences(params.audio).length > 0
  );
}

function extractTaskId(response: SeedanceCreateResponse): string {
  const taskId = response.id?.trim() || response.task_id?.trim();

  if (!taskId) {
    throw new VibeApiError(502, 'Comfly video returned no task id', response);
  }

  return taskId;
}

function normalizeTaskStatus(status?: string): string {
  return status?.trim().toLowerCase() ?? '';
}

function isCompletedStatus(status: string): boolean {
  return status === 'success' || status === 'succeeded' || status === 'completed';
}

function isFailedStatus(status: string): boolean {
  return status === 'failure' || status === 'failed' || status === 'error' || status === 'canceled';
}

function getFailureMessage(task: SeedanceTaskResponse): string {
  return (
    task.fail_reason?.trim() ||
    task.error?.message?.trim() ||
    task.message?.trim() ||
    'Comfly video generation failed'
  );
}

function toVideoResult(
  taskId: string,
  model: string,
  task: SeedanceTaskResponse,
): VideoGenerationResult {
  const videoUrl =
    task.content?.video_url?.trim() ||
    task.data?.content?.video_url?.trim() ||
    task.data?.output?.trim() ||
    '';

  if (!videoUrl) {
    throw new VibeApiError(502, 'Comfly video returned no video URL', task);
  }

  return {
    taskId,
    model: task.model?.trim() || model,
    videoUrl,
    lastFrameUrl: task.data?.last_frame_url?.trim() || undefined,
    ratio: task.data?.ratio,
    resolution: task.data?.resolution,
    duration: task.data?.duration,
    seed: task.data?.seed,
    usage: task.usage ?? task.data?.usage,
  };
}

export async function submitComflyVideoTask(
  params: GenerateVideoParams,
): Promise<VideoTaskSubmission> {
  const model = params.model || DEFAULT_SEEDANCE_MODEL;
  const officialFormat = shouldUseOfficialFormat(params);
  const body = officialFormat
    ? buildOfficialBody({ ...params, model })
    : buildUnifiedBody({ ...params, model });
  const response = await requestJson<SeedanceCreateResponse>(
    officialFormat
      ? '/seedance/v3/contents/generations/tasks'
      : '/v2/videos/generations',
    {
      method: 'POST',
      apiKey: params.apiKey,
      body,
    },
  );

  return {
    taskId: extractTaskId(response),
    model,
    officialFormat,
  };
}

export async function getComflyVideoTaskResult(params: {
  apiKey: string;
  taskId: string;
  model: string;
  officialFormat: boolean;
}): Promise<
  | { status: 'pending'; progress?: string }
  | { status: 'completed'; result: VideoGenerationResult }
  | { status: 'error'; error: string }
> {
  const task = await requestJson<SeedanceTaskResponse>(
    params.officialFormat
      ? `/seedance/v3/contents/generations/tasks/${encodeURIComponent(params.taskId)}`
      : `/v2/videos/generations/${encodeURIComponent(params.taskId)}`,
    {
      method: 'GET',
      apiKey: params.apiKey,
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    },
  );
  const status = normalizeTaskStatus(task.status);

  if (isCompletedStatus(status)) {
    return {
      status: 'completed',
      result: toVideoResult(params.taskId, params.model, task),
    };
  }

  if (isFailedStatus(status)) {
    return {
      status: 'error',
      error: getFailureMessage(task),
    };
  }

  return {
    status: 'pending',
    progress: task.progress,
  };
}

export async function generateVideo(params: GenerateVideoParams): Promise<VideoGenerationResult> {
  const submission = await submitComflyVideoTask(params);
  const startedAt = Date.now();

  while (Date.now() - startedAt < DEFAULT_POLL_TIMEOUT_MS) {
    const task = await getComflyVideoTaskResult({
      apiKey: params.apiKey,
      taskId: submission.taskId,
      model: submission.model,
      officialFormat: submission.officialFormat,
    });

    if (task.status === 'completed') {
      return task.result;
    }

    if (task.status === 'error') {
      throw new VibeApiError(502, task.error);
    }

    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  throw new VibeApiError(504, 'Comfly video generation timed out');
}
