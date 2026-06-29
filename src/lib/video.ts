import 'server-only';

import { VibeApiError } from '@/lib/vibe';
import {
  getVideoProviderConfig,
  normalizeVideoProvider,
  type VideoGenerationProvider,
} from './video-provider';
import {
  buildVideoCreateRequest,
  buildVideoTaskResultRequestPath,
  type GenerateVideoParams,
  type VideoReferenceInput,
} from './video-request';

const DEFAULT_SEEDANCE_MODEL = 'doubao-seedance-2-0-260128';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 45 * 60_000;

export type { GenerateVideoParams, VideoReferenceInput };

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

function getConfiguredVideoBaseUrl(provider?: VideoGenerationProvider): string {
  const normalizedProvider = normalizeVideoProvider(provider);

  if (normalizedProvider === 'zhenzhen') {
    return normalizeBaseUrl(process.env.ZHENZHEN_VIDEO_BASE_URL ?? getVideoProviderConfig('zhenzhen').baseUrl);
  }

  return normalizeBaseUrl(
    process.env.COMFLY_VIDEO_BASE_URL ??
      process.env.COMFLY_BASE_URL?.replace(/\/v1\/?$/, '') ??
      getVideoProviderConfig('comfly').baseUrl,
  );
}

function createHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${assertConfigured(apiKey)}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function requestJson<T>(
  provider: VideoGenerationProvider,
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
  const providerConfig = getVideoProviderConfig(provider);

  try {
    const response = await fetch(`${getConfiguredVideoBaseUrl(provider)}${path}`, {
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
        `${providerConfig.label} video request failed with status ${response.status}`;

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
        `${providerConfig.label} video returned invalid JSON (status=${responseStatus ?? '?'})`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new VibeApiError(504, `${providerConfig.label} video request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerConfig.label} video request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
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
  const provider = normalizeVideoProvider(params.provider);
  const model = params.model || DEFAULT_SEEDANCE_MODEL;
  const request = buildVideoCreateRequest({ ...params, model });
  const response = await requestJson<SeedanceCreateResponse>(
    provider,
    request.path,
    {
      method: 'POST',
      apiKey: params.apiKey,
      body: request.body,
    },
  );

  return {
    taskId: extractTaskId(response),
    model,
    officialFormat: request.officialFormat,
  };
}

export async function getComflyVideoTaskResult(params: {
  provider?: VideoGenerationProvider;
  apiKey: string;
  taskId: string;
  model: string;
  officialFormat: boolean;
}): Promise<
  | { status: 'pending'; progress?: string }
  | { status: 'completed'; result: VideoGenerationResult }
  | { status: 'error'; error: string }
> {
  const provider = normalizeVideoProvider(params.provider);
  const task = await requestJson<SeedanceTaskResponse>(
    provider,
    buildVideoTaskResultRequestPath(params),
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
      provider: params.provider,
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
