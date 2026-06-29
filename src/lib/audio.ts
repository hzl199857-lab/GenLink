import "server-only";

import type {
  AudioGenerationMode,
  AudioGenerationModel,
  AudioGenerationProvider,
  AudioGenerationVocalGender,
} from "../types/canvas";

const DEFAULT_SUNO_MODEL: SunoModel = "chirp-fenix";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export type SunoModel = "chirp-fenix" | "chirp-crow" | "chirp-bluejay";

export class AudioApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AudioApiError";
    this.status = status;
    this.details = details;
  }
}

export interface GenerateSunoMusicParams {
  apiKey: string;
  prompt: string;
  model?: AudioGenerationModel | string;
  mode?: AudioGenerationMode;
  title?: string;
  style?: string;
  instrumental?: boolean;
  negativeTags?: string;
  vocalGender?: AudioGenerationVocalGender;
}

export interface SunoMusicSubmitRequest {
  path: "/suno/submit/music";
  body: Record<string, unknown>;
}

export interface AudioTaskSubmission {
  taskId: string;
  model: SunoModel;
}

export interface AudioGenerationResult {
  taskId: string;
  model: SunoModel;
  audioUrl: string;
  title?: string;
  durationSeconds?: number;
  mimeType?: string;
  sizeBytes?: number;
}

type SunoSubmitResponse = {
  task_id?: string;
  taskId?: string;
  id?: string;
  jobId?: string;
  code?: number | string;
  msg?: string;
  message?: string;
  data?: unknown;
  error?: { message?: string };
};

type SunoClip = {
  id?: string;
  title?: string;
  audio_url?: string;
  audioUrl?: string;
  url?: string;
  file_url?: string;
  music_url?: string;
  video_url?: string;
  source_audio_url?: string;
  stream_audio_url?: string;
  duration?: number | string;
  metadata?: {
    duration?: number | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type SunoFetchResponse = {
  status?: string;
  task_status?: string;
  code?: number | string;
  msg?: string;
  message?: string;
  clips?: SunoClip[] | Record<string, SunoClip>;
  data?: {
    status?: string;
    task_status?: string;
    clips?: SunoClip[] | Record<string, SunoClip>;
    data?: SunoClip[];
    progress?: string;
    error?: string;
    fail_reason?: string;
    [key: string]: unknown;
  };
  error?: { message?: string };
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function getConfiguredAudioBaseUrl(provider?: AudioGenerationProvider): string {
  if (provider === "zhenzhen") {
    return normalizeBaseUrl(process.env.ZHENZHEN_AUDIO_BASE_URL ?? "https://ai.t8star.org");
  }

  return normalizeBaseUrl(
    process.env.COMFLY_AUDIO_BASE_URL ??
      process.env.COMFLY_BASE_URL?.replace(/\/v1\/?$/, "") ??
      "https://ai.comfly.org",
  );
}

function assertConfiguredApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    throw new AudioApiError(401, "Audio API key is required");
  }

  return trimmed;
}

function createHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${assertConfiguredApiKey(apiKey)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function requestJson<T>(
  provider: AudioGenerationProvider | undefined,
  path: string,
  init: {
    method: "GET" | "POST";
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
  let responseText = "";

  try {
    const response = await fetch(`${getConfiguredAudioBaseUrl(provider)}${path}`, {
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
        `Audio request failed with status ${response.status}`;

      throw new AudioApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof AudioApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new AudioApiError(
        502,
        `Audio API returned invalid JSON (status=${responseStatus ?? "?"})`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AudioApiError(504, "Audio request timed out");
    }

    throw new AudioApiError(
      502,
      error instanceof Error ? error.message : "Audio request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function optionalTrimmed(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeAudioGenerationModel(value?: string): SunoModel {
  switch (value?.trim()) {
    case "suno-v5":
    case "chirp-crow":
      return "chirp-crow";
    case "suno-v4.5-plus":
    case "chirp-bluejay":
      return "chirp-bluejay";
    case "suno-v5.5":
    case "chirp-fenix":
    default:
      return DEFAULT_SUNO_MODEL;
  }
}

function normalizeSunoMode(value?: AudioGenerationMode): AudioGenerationMode {
  return value === "custom" ? "custom" : "inspiration";
}

export function buildSunoMusicSubmitRequest(
  params: Omit<GenerateSunoMusicParams, "apiKey">,
): SunoMusicSubmitRequest {
  const prompt = params.prompt.trim();
  const mode = normalizeSunoMode(params.mode);
  const title = optionalTrimmed(params.title);
  const tags = optionalTrimmed(params.style);
  const negativeTags = optionalTrimmed(params.negativeTags);
  const isInstrumental = params.instrumental === true;
  const customInstrumentalDescription = mode === "custom" && isInstrumental
    ? tags || prompt
    : undefined;

  if (!prompt && !customInstrumentalDescription) {
    throw new AudioApiError(400, "Prompt is required");
  }

  const body: Record<string, unknown> = {
    mv: normalizeAudioGenerationModel(params.model),
    make_instrumental: isInstrumental,
  };

  if (mode === "inspiration") {
    body.gpt_description_prompt = prompt;
    body.prompt = "";
  } else {
    body.prompt = isInstrumental ? "" : prompt;
  }

  if (mode === "custom" && title) {
    body.title = title;
  }

  if (mode === "custom") {
    const resolvedTags = tags || customInstrumentalDescription;

    if (resolvedTags) {
      body.tags = resolvedTags;
    }
  }

  if (negativeTags) {
    body.negative_tags = negativeTags;
  }

  if (params.vocalGender === "f" || params.vocalGender === "m") {
    body.metadata = {
      vocal_gender: params.vocalGender,
    };
  }

  return {
    path: "/suno/submit/music",
    body,
  };
}

function isTaskIdKey(key: string): boolean {
  return /^(task[_-]?id|taskId|job[_-]?id|jobId)$/i.test(key);
}

function parseTaskIdText(value: unknown, options?: { allowBareString?: boolean }): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  if (!text) {
    return undefined;
  }

  const uuid = text.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  )?.[0];

  if (uuid) {
    return uuid;
  }

  const labeledId = text.match(
    /(?:任务\s*ID|任务ID|task[_\s-]?id|job[_\s-]?id)\s*[:：=]?\s*([A-Za-z0-9_-]{6,})/i,
  )?.[1];

  if (labeledId) {
    return labeledId;
  }

  return options?.allowBareString === true && !/^\d+$/.test(text) ? text : undefined;
}

function trimTaskId(value: unknown): string | undefined {
  return parseTaskIdText(value, { allowBareString: true });
}

function findTaskIdDeep(value: unknown, depth = 0, allowBareString = false): string | undefined {
  if (depth > 5) {
    return undefined;
  }

  const directString = allowBareString ? trimTaskId(value) : undefined;

  if (directString && !/^\d+$/.test(directString)) {
    return directString;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskIdDeep(item, depth + 1, allowBareString);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    if (!isTaskIdKey(key)) {
      continue;
    }

    const found = trimTaskId(item) ?? findTaskIdDeep(item, depth + 1, true);

    if (found) {
      return found;
    }
  }

  for (const [key, item] of Object.entries(record)) {
    if (key === "code") {
      continue;
    }

    const found = findTaskIdDeep(item, depth + 1, false);

    if (found) {
      return found;
    }
  }

  return undefined;
}

function getResponsePreview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

export function parseSunoSubmitTask(response: SunoSubmitResponse): string {
  const taskId =
    findTaskIdDeep(response, 0, false) ??
    parseTaskIdText(response.message) ??
    parseTaskIdText(response.msg) ??
    (typeof response.data === "string"
      ? parseTaskIdText(response.data, { allowBareString: true })
      : undefined);

  if (!taskId) {
    throw new AudioApiError(
      502,
      `Suno returned no task id: ${getResponsePreview(response)}`,
      response,
    );
  }

  return taskId;
}

function normalizeStatus(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function isCompletedStatus(status: string): boolean {
  return (
    status === "complete" ||
    status === "completed" ||
    status === "success" ||
    status === "succeeded" ||
    status === "成功"
  );
}

function isFailedStatus(status: string): boolean {
  return (
    status === "error" ||
    status === "failed" ||
    status === "failure" ||
    status === "canceled" ||
    status === "失败"
  );
}

function toClipArray(clips?: SunoClip[] | Record<string, SunoClip>): SunoClip[] {
  if (Array.isArray(clips)) {
    return clips;
  }

  if (clips && typeof clips === "object") {
    return Object.values(clips);
  }

  return [];
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function getFailureMessage(response: SunoFetchResponse): string {
  return (
    response.error?.message?.trim() ||
    response.data?.error?.trim() ||
    response.data?.fail_reason?.trim() ||
    response.msg?.trim() ||
    response.message?.trim() ||
    "Suno audio generation failed"
  );
}

function getResponseClips(response: SunoFetchResponse): SunoClip[] {
  const dataAsClip =
    response.data && typeof response.data === "object" && !Array.isArray(response.data)
      ? [response.data as SunoClip]
      : [];

  return [
    ...dataAsClip,
    ...toClipArray(response.data?.clips ?? response.clips),
    ...(Array.isArray(response.data?.data) ? response.data.data : []),
  ];
}

function getClipAudioUrl(clip?: SunoClip): string {
  return (
    clip?.audio_url?.trim() ||
    clip?.audioUrl?.trim() ||
    clip?.source_audio_url?.trim() ||
    clip?.stream_audio_url?.trim() ||
    clip?.file_url?.trim() ||
    clip?.music_url?.trim() ||
    clip?.url?.trim() ||
    clip?.video_url?.trim() ||
    ""
  );
}

export function parseSunoFetchResult(
  taskId: string,
  model: SunoModel,
  response: SunoFetchResponse,
): AudioGenerationResult {
  const clips = getResponseClips(response);
  const clip = clips.find((item) => getClipAudioUrl(item));
  const audioUrl = getClipAudioUrl(clip);

  if (!audioUrl) {
    throw new AudioApiError(
      502,
      `Suno returned no audio URL: ${getResponsePreview(response)}`,
      response,
    );
  }

  return {
    taskId,
    model,
    audioUrl,
    title: clip?.title?.trim() || undefined,
    durationSeconds: parseDurationSeconds(clip?.duration ?? clip?.metadata?.duration),
    mimeType: "audio/mpeg",
  };
}

export async function submitSunoMusicTask(
  params: GenerateSunoMusicParams & { provider?: AudioGenerationProvider },
): Promise<AudioTaskSubmission> {
  const model = normalizeAudioGenerationModel(params.model);
  const request = buildSunoMusicSubmitRequest({ ...params, model });
  const response = await requestJson<SunoSubmitResponse>(
    params.provider,
    request.path,
    {
      method: "POST",
      apiKey: params.apiKey,
      body: request.body,
    },
  );

  if (response.error?.message || (typeof response.code === "number" && response.code >= 400)) {
    throw new AudioApiError(502, response.error?.message || response.msg || "Suno submit failed", response);
  }

  return {
    taskId: parseSunoSubmitTask(response),
    model,
  };
}

export async function getSunoMusicTaskResult(params: {
  provider?: AudioGenerationProvider;
  apiKey: string;
  taskId: string;
  model: SunoModel;
}): Promise<
  | { status: "pending"; progress?: string }
  | { status: "completed"; result: AudioGenerationResult }
  | { status: "error"; error: string }
> {
  const response = await requestJson<SunoFetchResponse>(
    params.provider,
    `/suno/fetch/${encodeURIComponent(params.taskId)}`,
    {
      method: "GET",
      apiKey: params.apiKey,
    },
  );
  const status = normalizeStatus(response.data?.task_status ?? response.data?.status ?? response.task_status ?? response.status);
  const clips = getResponseClips(response);

  if (isCompletedStatus(status) || clips.some((clip) => Boolean(getClipAudioUrl(clip)))) {
    return {
      status: "completed",
      result: parseSunoFetchResult(params.taskId, params.model, response),
    };
  }

  if (isFailedStatus(status)) {
    return {
      status: "error",
      error: getFailureMessage(response),
    };
  }

  return {
    status: "pending",
    progress: response.data?.progress,
  };
}
