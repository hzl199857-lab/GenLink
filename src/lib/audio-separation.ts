import "server-only";

import type { AudioGenerationInstanceType } from "@/types/canvas";

const RUNNINGHUB_BASE_URL = "https://www.runninghub.cn/openapi/v2";
const RUNNINGHUB_AUDIO_SEPARATION_APP_ID = "2071882091696058369";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export class AudioSeparationApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AudioSeparationApiError";
    this.status = status;
    this.details = details;
  }
}

type RunningHubUploadResponse = {
  code?: number | string;
  message?: string;
  msg?: string;
  data?: {
    fileName?: string;
    download_url?: string;
    size?: string | number;
    type?: string;
  };
};

type RunningHubTaskResponse = {
  code?: number | string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  failedReason?: unknown;
  promptTips?: unknown;
  message?: string;
  msg?: string;
  results?: Array<{
    url?: string;
    nodeId?: string;
    outputType?: string;
    text?: string | null;
  }> | null;
};

export interface RunningHubAudioSeparationSubmitBody {
  nodeInfoList: Array<{
    nodeId: "317";
    fieldName: "audio";
    fieldValue: string;
    description: string;
  }>;
  instanceType: AudioGenerationInstanceType;
  usePersonalQueue: "false";
}

export interface AudioSeparationOutput {
  audioUrl: string;
  mimeType?: string;
  outputType?: string;
}

export interface AudioSeparationResult {
  taskId: string;
  vocal: AudioSeparationOutput;
  accompaniment: AudioSeparationOutput;
}

export interface SubmitRunningHubAudioSeparationParams {
  apiKey: string;
  audioUrl: string;
  fileName?: string;
  instanceType?: AudioGenerationInstanceType;
}

function assertApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    throw new AudioSeparationApiError(401, "RunningHub workflow API key is required");
  }

  return trimmed;
}

function createRunningHubHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${assertApiKey(apiKey)}`,
    Accept: "application/json",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AudioSeparationApiError(504, "RunningHub request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new AudioSeparationApiError(response.ok ? 502 : response.status, fallbackMessage, {
      bodyPreview: text.slice(0, 500),
    });
  }
}

function getResponsePreview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function getFileNameFromUrl(url: string, fallback = "audio.mp3"): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function getAudioMimeTypeFromOutputType(outputType?: string): string | undefined {
  switch (outputType?.trim().toLowerCase()) {
    case "mp3":
    case "mpeg":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "aac":
      return "audio/aac";
    default:
      return undefined;
  }
}

function isAudioResult(result?: { url?: string; outputType?: string }): boolean {
  const outputType = result?.outputType?.trim().toLowerCase();

  if (outputType && ["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(outputType)) {
    return true;
  }

  const url = result?.url?.trim().toLowerCase() ?? "";
  return /\.(mp3|wav|m4a|ogg|flac|aac)(?:[?#].*)?$/.test(url);
}

function outputFromResult(result: { url?: string; outputType?: string }): AudioSeparationOutput {
  return {
    audioUrl: result.url?.trim() || "",
    outputType: result.outputType?.trim() || undefined,
    mimeType: getAudioMimeTypeFromOutputType(result.outputType),
  };
}

function hasSeparatedToken(text: string, token: string): boolean {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedToken = token.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  return ` ${normalizedText} `.includes(` ${normalizedToken} `);
}

function isVocalLike(result: { url?: string; outputType?: string }): boolean {
  const text = `${result.url ?? ""} ${result.outputType ?? ""}`.toLowerCase();
  return (
    !isAccompanimentLike(result) &&
    (
      ["vocal", "vocals", "voice", "stem_vocal"].some((token) => hasSeparatedToken(text, token)) ||
      /人声/.test(text)
    )
  );
}

function isAccompanimentLike(result: { url?: string; outputType?: string }): boolean {
  const text = `${result.url ?? ""} ${result.outputType ?? ""}`.toLowerCase();
  return (
    ["instrumental", "accompaniment", "music", "bgm", "karaoke", "no_vocal"].some(
      (token) => hasSeparatedToken(text, token),
    ) ||
    /伴奏|背景/.test(text)
  );
}

function getRunningHubErrorMessage(response: RunningHubTaskResponse): string {
  const parts = [
    response.errorMessage,
    response.message,
    response.msg,
    typeof response.failedReason === "string" ? response.failedReason : undefined,
    typeof response.promptTips === "string" ? response.promptTips : undefined,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (response.errorCode?.trim()) {
    parts.unshift(`错误码 ${response.errorCode.trim()}`);
  }

  return parts.length ? parts.join("；") : "RunningHub audio separation failed";
}

export function buildRunningHubAudioSeparationSubmitBody(params: {
  audioFileName: string;
  instanceType?: AudioGenerationInstanceType;
}): RunningHubAudioSeparationSubmitBody {
  const audioFileName = params.audioFileName.trim();

  if (!audioFileName) {
    throw new AudioSeparationApiError(400, "RunningHub audio file is required");
  }

  return {
    nodeInfoList: [
      {
        nodeId: "317",
        fieldName: "audio",
        fieldValue: audioFileName,
        description: "添加音频",
      },
    ],
    instanceType: params.instanceType === "plus" ? "plus" : "default",
    usePersonalQueue: "false",
  };
}

export function parseRunningHubAudioSeparationResult(
  taskId: string,
  response: RunningHubTaskResponse,
): AudioSeparationResult {
  const audioResults = (response.results ?? []).filter((item) => item.url?.trim() && isAudioResult(item));
  const labeledVocal = audioResults.find(isVocalLike);
  const labeledAccompaniment = audioResults.find(isAccompanimentLike);
  const accompaniment = labeledAccompaniment ?? audioResults[0];
  const vocal =
    labeledVocal ??
    audioResults.find((item) => item !== accompaniment);

  if (!vocal?.url?.trim() || !accompaniment?.url?.trim()) {
    throw new AudioSeparationApiError(
      502,
      `RunningHub returned incomplete audio separation results: ${getResponsePreview(response)}`,
      response,
    );
  }

  return {
    taskId,
    vocal: outputFromResult(vocal),
    accompaniment: outputFromResult(accompaniment),
  };
}

async function uploadAudioToRunningHub(params: {
  apiKey: string;
  audioUrl: string;
  fileName?: string;
}): Promise<string> {
  const sourceResponse = await fetchWithTimeout(params.audioUrl, { method: "GET" });

  if (!sourceResponse.ok) {
    throw new AudioSeparationApiError(
      400,
      `读取源音频失败（HTTP ${sourceResponse.status}）`,
    );
  }

  const blob = await sourceResponse.blob();
  const formData = new FormData();
  formData.append(
    "file",
    blob,
    params.fileName?.trim() || getFileNameFromUrl(params.audioUrl),
  );

  const uploadResponse = await fetchWithTimeout(
    `${RUNNINGHUB_BASE_URL}/media/upload/binary`,
    {
      method: "POST",
      headers: createRunningHubHeaders(params.apiKey),
      body: formData,
    },
  );
  const json = await readJson<RunningHubUploadResponse>(
    uploadResponse,
    "RunningHub upload returned invalid JSON",
  );
  const upstreamCode =
    typeof json.code === "number" || typeof json.code === "string"
      ? String(json.code)
      : "";
  const fileName = json.data?.fileName?.trim();

  if (!uploadResponse.ok || (upstreamCode && upstreamCode !== "0") || !fileName) {
    throw new AudioSeparationApiError(
      uploadResponse.ok ? 502 : uploadResponse.status,
      json.message || json.msg || "RunningHub audio upload failed",
      json,
    );
  }

  return fileName;
}

export async function submitRunningHubAudioSeparationTask(
  params: SubmitRunningHubAudioSeparationParams,
): Promise<{ taskId: string }> {
  const uploadedFileName = await uploadAudioToRunningHub({
    apiKey: params.apiKey,
    audioUrl: params.audioUrl,
    fileName: params.fileName,
  });
  const response = await fetchWithTimeout(
    `${RUNNINGHUB_BASE_URL}/run/ai-app/${RUNNINGHUB_AUDIO_SEPARATION_APP_ID}`,
    {
      method: "POST",
      headers: {
        ...createRunningHubHeaders(params.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildRunningHubAudioSeparationSubmitBody({
          audioFileName: uploadedFileName,
          instanceType: params.instanceType,
        }),
      ),
    },
  );
  const json = await readJson<RunningHubTaskResponse>(
    response,
    "RunningHub audio separation submit returned invalid JSON",
  );
  const upstreamCode =
    typeof json.code === "number" || typeof json.code === "string"
      ? String(json.code)
      : "";
  const taskId = json.taskId?.trim();

  if (!response.ok || (upstreamCode && upstreamCode !== "0") || !taskId) {
    throw new AudioSeparationApiError(
      response.ok ? 502 : response.status,
      getRunningHubErrorMessage(json),
      json,
    );
  }

  return { taskId };
}

export async function getRunningHubAudioSeparationTaskResult(params: {
  apiKey: string;
  taskId: string;
}): Promise<
  | { status: "pending"; progress?: string }
  | { status: "completed"; result: AudioSeparationResult }
  | { status: "error"; error: string }
> {
  const response = await fetchWithTimeout(`${RUNNINGHUB_BASE_URL}/query`, {
    method: "POST",
    headers: {
      ...createRunningHubHeaders(params.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taskId: params.taskId }),
  });
  const json = await readJson<RunningHubTaskResponse>(
    response,
    "RunningHub audio separation status returned invalid JSON",
  );

  if (!response.ok) {
    throw new AudioSeparationApiError(response.status, getRunningHubErrorMessage(json), json);
  }

  const status = json.status?.trim().toUpperCase();

  if (status === "SUCCESS") {
    return {
      status: "completed",
      result: parseRunningHubAudioSeparationResult(params.taskId, json),
    };
  }

  if (status === "FAILED") {
    return {
      status: "error",
      error: getRunningHubErrorMessage(json),
    };
  }

  return {
    status: "pending",
    progress: status || undefined,
  };
}
