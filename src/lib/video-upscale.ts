import 'server-only';

import { VibeApiError } from '@/lib/vibe';

const RUNNINGHUB_BASE_URL = 'https://www.runninghub.cn/openapi/v2';
const VIDEO_UPSCALE_APP_ID = '2061298406567538690';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const ERROR_MESSAGE_MAX_LENGTH = 360;
const GENERIC_VIDEO_UPSCALE_ERROR =
  '工作流运行失败，RunningHub 返回了执行错误，但未提供明确原因。请检查输入视频格式、分辨率/帧率参数或工作流配置。';

export type VideoUpscaleResolution = '720p' | '1080p' | '4k';
export type VideoUpscaleFps = '30' | '60';
export type RunningHubInstanceType = 'default' | 'plus';

export interface SubmitRunningHubVideoUpscaleParams {
  apiKey: string;
  videoUrl: string;
  fileName?: string;
  targetResolution: VideoUpscaleResolution;
  targetFps: VideoUpscaleFps;
  instanceType?: RunningHubInstanceType;
}

type RunningHubUploadResponse = {
  code?: number;
  message?: string;
  msg?: string;
  data?: {
    fileName?: string;
    download_url?: string;
  };
};

type RunningHubTaskResponse = {
  code?: number | string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  failedReason?: unknown;
  promptTips?: string;
  message?: string;
  msg?: string;
  results?: Array<{
    url?: string;
    nodeId?: string;
    outputType?: string;
    text?: string | null;
  }> | null;
};

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeErrorText(raw: string): string {
  return raw
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitErrorText(text: string): string {
  const normalized = normalizeErrorText(text);

  if (normalized.length <= ERROR_MESSAGE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, ERROR_MESSAGE_MAX_LENGTH)}...`;
}

function isTracebackLine(line: string): boolean {
  return [
    'Traceback',
    'File "',
    '/workspace/ComfyUI/',
    '\\workspace\\ComfyUI\\',
    'custom_nodes',
    'execution.py',
    'server.py',
    'nodes.py',
  ].some((marker) => line.includes(marker));
}

function cleanRunningHubErrorText(raw: string): string | undefined {
  const normalized = raw
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();

  if (!normalized) {
    return undefined;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulLines = lines.filter((line) => !isTracebackLine(line));
  const candidates = meaningfulLines.length ? meaningfulLines : lines;
  const errorLine = [...candidates]
    .reverse()
    .find((line) =>
      /(?:Exception|Error|ValueError|RuntimeError|FileNotFoundError|TypeError|KeyError|OSError)\s*:/i.test(line),
    );
  const selected = errorLine ?? candidates.at(-1);

  if (!selected || isTracebackLine(selected)) {
    return undefined;
  }

  return limitErrorText(
    selected
      .replace(/^(?:Exception|ValueError|RuntimeError|FileNotFoundError|TypeError|KeyError|OSError)\s*:\s*/i, '')
      .replace(/^Error\s*:\s*/i, '')
      .replace(/^error\s*:\s*/i, ''),
  );
}

function appendUnique(parts: string[], value?: string | null) {
  const trimmed = value ? cleanRunningHubErrorText(value) ?? limitErrorText(value) : undefined;

  if (trimmed && !parts.includes(trimmed)) {
    parts.push(trimmed);
  }
}

function extractJsonErrorText(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return undefined;
    }

    try {
      return extractJsonErrorText(JSON.parse(trimmed)) ?? cleanRunningHubErrorText(trimmed) ?? trimmed;
    } catch {
      return cleanRunningHubErrorText(trimmed) ?? limitErrorText(trimmed);
    }
  }

  if (typeof value !== 'object') {
    return limitErrorText(String(value));
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of ['message', 'errorMessage', 'error', 'reason', 'failedReason', 'detail']) {
    const item = record[key];

    if (typeof item === 'string') {
      appendUnique(parts, item);
    } else if (item && typeof item === 'object') {
      appendUnique(parts, extractJsonErrorText(item));
    }
  }

  if (record.node_errors && typeof record.node_errors === 'object') {
    appendUnique(parts, extractJsonErrorText(record.node_errors));
  }

  if (parts.length) {
    return parts.join('；');
  }

  return cleanRunningHubErrorText(compactJson(value));
}

function extractRunningHubErrorMessage(response: RunningHubTaskResponse): string {
  const parts: string[] = [];

  appendUnique(parts, response.errorMessage);
  appendUnique(parts, response.message);
  appendUnique(parts, response.msg);
  appendUnique(parts, extractJsonErrorText(response.failedReason));
  appendUnique(parts, extractJsonErrorText(response.promptTips));

  if (response.errorCode?.trim()) {
    parts.unshift(`错误码 ${response.errorCode.trim()}`);
  }

  return parts.length ? `工作流运行失败：${parts.join('；')}` : GENERIC_VIDEO_UPSCALE_ERROR;
}

function assertApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    throw new VibeApiError(401, '请先在 API 设置中配置 RunningHub 工作流 API Key');
  }

  return trimmed;
}

function createHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${assertApiKey(apiKey)}`,
    Accept: 'application/json',
  };
}

function getFileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    return name || 'video.mp4';
  } catch {
    return 'video.mp4';
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new VibeApiError(504, 'RunningHub 请求超时，请稍后重试');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new VibeApiError(response.ok ? 502 : response.status, fallbackMessage, {
      bodyPreview: text.slice(0, 500),
    });
  }
}

async function uploadVideoToRunningHub(params: {
  apiKey: string;
  videoUrl: string;
  fileName?: string;
}): Promise<string> {
  const sourceResponse = await fetchWithTimeout(params.videoUrl, {
    method: 'GET',
  });

  if (!sourceResponse.ok) {
    throw new VibeApiError(
      400,
      `读取上游视频失败（HTTP ${sourceResponse.status}）`,
    );
  }

  const blob = await sourceResponse.blob();
  const formData = new FormData();
  formData.append(
    'file',
    blob,
    params.fileName?.trim() || getFileNameFromUrl(params.videoUrl),
  );

  const uploadResponse = await fetchWithTimeout(
    `${RUNNINGHUB_BASE_URL}/media/upload/binary`,
    {
      method: 'POST',
      headers: createHeaders(params.apiKey),
      body: formData,
    },
  );
  const json = await readJson<RunningHubUploadResponse>(
    uploadResponse,
    'RunningHub 上传接口返回了无效 JSON',
  );

  if (!uploadResponse.ok || json.code !== 0 || !json.data?.fileName) {
    throw new VibeApiError(
      uploadResponse.ok ? 502 : uploadResponse.status,
      json.message || json.msg || 'RunningHub 视频上传失败',
      json,
    );
  }

  return json.data.fileName;
}

export async function submitRunningHubVideoUpscaleTask(
  params: SubmitRunningHubVideoUpscaleParams,
): Promise<{ taskId: string }> {
  const uploadedFileName = await uploadVideoToRunningHub({
    apiKey: params.apiKey,
    videoUrl: params.videoUrl,
    fileName: params.fileName,
  });
  const response = await fetchWithTimeout(
    `${RUNNINGHUB_BASE_URL}/run/ai-app/${VIDEO_UPSCALE_APP_ID}`,
    {
      method: 'POST',
      headers: {
        ...createHeaders(params.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nodeInfoList: [
          {
            nodeId: '6',
            fieldName: 'file',
            fieldValue: uploadedFileName,
            description: '上传视频',
          },
          {
            nodeId: '1',
            fieldName: 'target_resolution',
            fieldValue: params.targetResolution,
            description: '选择分辨率',
          },
          {
            nodeId: '1',
            fieldName: 'target_fps',
            fieldValue: params.targetFps,
            description: '选择帧率',
          },
        ],
        instanceType: params.instanceType || 'default',
        usePersonalQueue: 'false',
      }),
    },
  );
  const json = await readJson<RunningHubTaskResponse>(
    response,
    'RunningHub 视频超清接口返回了无效 JSON',
  );
  const taskId = json.taskId?.trim();
  const upstreamCode =
    typeof json.code === 'number' || typeof json.code === 'string'
      ? String(json.code)
      : '';

  if (!response.ok || (upstreamCode && upstreamCode !== '0') || !taskId) {
    throw new VibeApiError(
      response.ok ? 502 : response.status,
      extractRunningHubErrorMessage(json),
      json,
    );
  }

  return { taskId };
}

export async function getRunningHubVideoUpscaleTaskResult(params: {
  apiKey: string;
  taskId: string;
}): Promise<
  | { status: 'pending'; progress?: string }
  | { status: 'completed'; result: { taskId: string; videoUrl: string; outputType?: string } }
  | { status: 'error'; error: string }
> {
  const response = await fetchWithTimeout(`${RUNNINGHUB_BASE_URL}/query`, {
    method: 'POST',
    headers: {
      ...createHeaders(params.apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId: params.taskId }),
  });
  const json = await readJson<RunningHubTaskResponse>(
    response,
    'RunningHub 视频超清状态接口返回了无效 JSON',
  );

  if (!response.ok) {
    throw new VibeApiError(
      response.status,
      extractRunningHubErrorMessage(json),
      json,
    );
  }

  const status = json.status?.trim().toUpperCase();

  if (status === 'SUCCESS') {
    const result = json.results?.find((item) => item.url?.trim());
    const videoUrl = result?.url?.trim();

    if (!videoUrl) {
      throw new VibeApiError(502, 'RunningHub 视频超清任务没有返回视频地址', json);
    }

    return {
      status: 'completed',
      result: {
        taskId: params.taskId,
        videoUrl,
        outputType: result?.outputType,
      },
    };
  }

  if (status === 'FAILED') {
    return {
      status: 'error',
      error: extractRunningHubErrorMessage(json),
    };
  }

  return {
    status: 'pending',
    progress: status || undefined,
  };
}
