import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getLocalImageDirectory,
  getLocalImageFileNameFromUrl,
} from "@/lib/local-image-storage";

// GenLink Vibe API client for server-side route handlers and actions only.

export type ImageApiProvider = "vibe" | "fucheers" | "comfly" | "zhenzhen";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveApiProvider(value?: string): ImageApiProvider {
  switch (value?.trim().toLowerCase()) {
    case "comfly":
      return "comfly";
    case "fucheers":
      return "fucheers";
    case "zhenzhen":
      return "zhenzhen";
    default:
      return "vibe";
  }
}

const VIBE_BASE_URL = normalizeBaseUrl(
  process.env.VIBE_BASE_URL ?? "https://www.vibeapi.cn/v1",
);
const VIBE_GEMINI_BASE_URL = normalizeBaseUrl("https://www.vibeapi.cn");
const FUCHEERS_BASE_URL = normalizeBaseUrl(
  process.env.FUCHEERS_BASE_URL ?? "https://www.fucheers.top/v1",
);
const FUCHEERS_GEMINI_BASE_URL = normalizeBaseUrl(
  process.env.FUCHEERS_GEMINI_BASE_URL ?? "https://www.fucheers.top",
);
const COMFLY_BASE_URL = normalizeBaseUrl(
  process.env.COMFLY_BASE_URL ?? "https://ai.comfly.org",
);
const COMFLY_IMAGE_BASE_URL = normalizeBaseUrl(
  process.env.COMFLY_IMAGE_BASE_URL ?? COMFLY_BASE_URL,
);
const COMFLY_TEXT_BASE_URL = normalizeBaseUrl(
  process.env.COMFLY_TEXT_BASE_URL ?? COMFLY_BASE_URL,
);
const ZHENZHEN_BASE_URL = normalizeBaseUrl(
  process.env.ZHENZHEN_BASE_URL ?? "https://ai.t8star.cn/v1",
);
const ZHENZHEN_IMAGE_BASE_URL = normalizeBaseUrl(
  process.env.ZHENZHEN_IMAGE_BASE_URL ?? ZHENZHEN_BASE_URL,
);
const ZHENZHEN_TEXT_BASE_URL = normalizeBaseUrl(
  process.env.ZHENZHEN_TEXT_BASE_URL ?? ZHENZHEN_BASE_URL,
);
const IMAGE_API_PROVIDER = resolveApiProvider(
  process.env.IMAGE_API_PROVIDER,
);
const TEXT_API_PROVIDER = resolveApiProvider(
  process.env.TEXT_API_PROVIDER ?? process.env.IMAGE_API_PROVIDER,
);

const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const IMAGE_REQUEST_TIMEOUT_MS = 6 * 60_000;
const COMFLY_TASK_STATUS_TIMEOUT_MS = 15_000;
const OUTPUT_IMAGE_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_COMFLY_RESPONSE_FORMAT = "b64_json";
const COMFLY_ASYNC_RESPONSE_FORMAT = "url";
const COMFLY_TEXT_MODEL_MAP = new Map<string, string>([
  ["gemini-3-flash", "gemini-3-flash-preview"],
  ["gemini-3.5-flash", "gemini-3.5-flash-preview"],
  ["gemini-3.1-pro", "gemini-3.1-pro-preview"],
  ["claude-opus-4-7", "claude-opus-4-7"],
  ["claude-opus-4-6", "claude-opus-4-6"],
  ["gpt-5.4", "gpt-5.4"],
  ["gpt-5.5", "gpt-5.5"],
]);
const COMFLY_TEXT_MODEL_REVERSE_MAP = new Map<string, string>(
  Array.from(COMFLY_TEXT_MODEL_MAP.entries()).map(([logicalModel, providerModel]) => [
    providerModel,
    logicalModel,
  ]),
);
const GEMINI_IMAGE_SIZE_BY_DIMENSIONS = new Map<string, string>(
  [
    ["1024x1024", "1K"],
    ["512x2064", "1K"],
    ["352x2928", "1K"],
    ["848x1264", "1K"],
    ["1264x848", "1K"],
    ["896x1200", "1K"],
    ["2064x512", "1K"],
    ["1200x896", "1K"],
    ["928x1152", "1K"],
    ["1152x928", "1K"],
    ["2928x352", "1K"],
    ["768x1376", "1K"],
    ["1376x768", "1K"],
    ["1584x672", "1K"],
    ["2048x2048", "2K"],
    ["1024x4128", "2K"],
    ["704x5856", "2K"],
    ["1696x2528", "2K"],
    ["2528x1696", "2K"],
    ["1792x2400", "2K"],
    ["4128x1024", "2K"],
    ["2400x1792", "2K"],
    ["1856x2304", "2K"],
    ["2304x1856", "2K"],
    ["5856x704", "2K"],
    ["1536x2752", "2K"],
    ["2752x1536", "2K"],
    ["3168x1344", "2K"],
    ["4096x4096", "4K"],
    ["2048x8256", "4K"],
    ["1408x11712", "4K"],
    ["3392x5056", "4K"],
    ["5056x3392", "4K"],
    ["3584x4800", "4K"],
    ["8256x2048", "4K"],
    ["4800x3584", "4K"],
    ["3712x4608", "4K"],
    ["4608x3712", "4K"],
    ["11712x1408", "4K"],
    ["3072x5504", "4K"],
    ["5504x3072", "4K"],
    ["6336x2688", "4K"],
  ] as const,
);

export interface GenerateTextParams {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: ImageApiProvider;
  apiKey?: string;
  images?: Array<{
    url: string;
  }>;
}

export interface GenerateTextResult {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface TextStreamChunk {
  type: "delta" | "done" | "error";
  delta?: string;
  result?: GenerateTextResult;
  error?: string;
}

export interface GenerateImageParams {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  moderation?: string;
  n?: number;
  provider?: ImageApiProvider;
  apiKey?: string;
  images?: Array<{
    url: string;
    fileName?: string;
  }>;
}

export interface GenerateImageResultItem {
  imageUrl: string;
  hostedImageUrl?: string;
  model: string;
  width: number;
  height: number;
}

export interface GenerateImageResult {
  images: GenerateImageResultItem[];
  model: string;
}

export interface GenerateImageTaskResult {
  taskId: string;
  model: string;
}

export class VibeApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "VibeApiError";
  }
}

type JsonObject = Record<string, unknown>;

interface VibeChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  error?: {
    message?: string;
  };
}

interface ClaudeMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  error?: {
    message?: string;
  };
}

type ChatMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

interface VibeImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface ComflyAsyncTaskCreateResponse {
  code?: string;
  message?: string;
  data?:
    | string
    | {
        task_id?: string;
        taskId?: string;
        id?: string;
        job_id?: string;
        jobId?: string;
      };
  task_id?: string;
  taskId?: string;
  id?: string;
  job_id?: string;
  jobId?: string;
  error?: {
    message?: string;
  };
}

interface ComflyAsyncTaskStatusResponse {
  code?: string | number;
  message?: string;
  request_id?: string;
  properties?: {
    request_id?: string;
    response_format?: string;
  };
  data?: {
    task_id?: string;
    taskId?: string;
    id?: string;
    status?: string;
    task_status?: string;
    state?: string;
    fail_reason?: string;
    failReason?: string;
    task_status_msg?: string;
    message?: string;
    progress?: string;
    data?: {
      data?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      images?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      url?: string;
      b64_json?: string;
      b64Json?: string;
      model?: string;
      created?: number;
    };
    task_result?: {
      data?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      images?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      url?: string;
      b64_json?: string;
      b64Json?: string;
      model?: string;
    };
    result?: {
      data?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      images?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
      }>;
      url?: string;
      b64_json?: string;
      b64Json?: string;
      model?: string;
    };
  };
  status?: string;
  task_status?: string;
  state?: string;
  error?: {
    message?: string;
  };
}

interface VibeGeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
    code?: number | string;
    status?: string;
  };
}

type GeminiContentPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const REFERENCE_IMAGE_FETCH_TIMEOUT_MS = 30_000;

function getImageMimeType(fileName: string): string {
  return IMAGE_MIME_TYPES[path.extname(fileName).toLowerCase()] || "image/png";
}

function getSafeMultipartFileName(fileName: string | undefined, fallback: string): string {
  const trimmed = fileName?.trim();
  const extension = trimmed ? path.extname(trimmed).toLowerCase() : "";
  const safeExtension = IMAGE_MIME_TYPES[extension] ? extension : ".png";
  const baseName = trimmed
    ? path
        .basename(trimmed, extension)
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
    : "";

  return `${baseName || fallback}${safeExtension}`;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function readReferenceImage(
  image: {
    url: string;
    fileName?: string;
  },
  index: number,
): Promise<{ bytes: Buffer; mediaType: string }> {
  const trimmedUrl = image.url.trim();

  if (!trimmedUrl) {
    throw new VibeApiError(400, `Reference image ${index + 1} is empty`);
  }

  const dataUrl = parseDataUrl(trimmedUrl);

  if (dataUrl) {
    return {
      bytes: Buffer.from(dataUrl.data, "base64"),
      mediaType: dataUrl.mediaType,
    };
  }

  const localFileName = getLocalImageFileNameFromUrl(trimmedUrl);

  if (localFileName) {
    try {
      return {
        bytes: await readFile(path.join(getLocalImageDirectory(), localFileName)),
        mediaType: getImageMimeType(localFileName),
      };
    } catch {
      throw new VibeApiError(
        404,
        `Reference image ${index + 1} was not found in local storage`,
      );
    }
  }

  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new VibeApiError(
      400,
      `Reference image ${index + 1} must be a data URL, a local image URL, or an absolute HTTP URL`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFERENCE_IMAGE_FETCH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(trimmedUrl, { signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `Reference image ${index + 1} download timed out`
      : `Failed to fetch reference image ${index + 1}`;

    throw new VibeApiError(502, message);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new VibeApiError(
      response.status,
      `Failed to fetch reference image ${index + 1}`,
    );
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mediaType: response.headers.get("content-type") || "image/png",
  };
}

async function createImageFilePart(
  image: {
    url: string;
    fileName?: string;
  },
  index: number,
): Promise<Blob> {
  const referenceImage = await readReferenceImage(image, index);

  return new Blob([bufferToArrayBuffer(referenceImage.bytes)], {
    type: referenceImage.mediaType,
  });
}

function assertConfigured(apiKey?: string): string {
  const resolvedApiKey = apiKey?.trim();

  if (!resolvedApiKey) {
    throw new VibeApiError(400, "API key is required");
  }

  return resolvedApiKey;
}

function createHeaders(apiKey?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${assertConfigured(apiKey)}`,
  };
}

function createAnthropicHeaders(apiKey?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": assertConfigured(apiKey),
    "anthropic-version": "2023-06-01",
  };
}

function parseImageSize(size?: string): { width: number; height: number } {
  const match = size?.match(/^(\d+)x(\d+)$/i);

  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function normalizeMessageContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item.type === "text" ? item.text ?? "" : ""))
      .join("");
  }

  return "";
}

function isClaudeModel(model: string): boolean {
  return /^claude-/i.test(model);
}

function parseDataUrl(url: string):
  | { mediaType: string; data: string }
  | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function getConfiguredComflyImageBaseUrl(): string {
  if (!COMFLY_IMAGE_BASE_URL) {
    throw new VibeApiError(
      500,
      "COMFLY_BASE_URL (or COMFLY_IMAGE_BASE_URL) is not configured for IMAGE_API_PROVIDER=comfly",
    );
  }

  return COMFLY_IMAGE_BASE_URL;
}

function getConfiguredComflyTextBaseUrl(): string {
  if (!COMFLY_TEXT_BASE_URL) {
    throw new VibeApiError(
      500,
      "COMFLY_BASE_URL (or COMFLY_TEXT_BASE_URL) is not configured for TEXT_API_PROVIDER=comfly",
    );
  }

  return COMFLY_TEXT_BASE_URL;
}

function getConfiguredZhenzhenImageBaseUrl(): string {
  if (!ZHENZHEN_IMAGE_BASE_URL) {
    throw new VibeApiError(
      500,
      "ZHENZHEN_BASE_URL (or ZHENZHEN_IMAGE_BASE_URL) is not configured for IMAGE_API_PROVIDER=zhenzhen",
    );
  }

  return ZHENZHEN_IMAGE_BASE_URL;
}

function getConfiguredZhenzhenTextBaseUrl(): string {
  if (!ZHENZHEN_TEXT_BASE_URL) {
    throw new VibeApiError(
      500,
      "ZHENZHEN_BASE_URL (or ZHENZHEN_TEXT_BASE_URL) is not configured for TEXT_API_PROVIDER=zhenzhen",
    );
  }

  return ZHENZHEN_TEXT_BASE_URL;
}

function toT8ImageSizeParams(size?: string): {
  aspect_ratio?: string;
  image_size?: "1K" | "2K" | "4K";
} {
  if (!size) {
    return {};
  }

  const [width, height] = size.split("x").map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {};
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const aspectRatio = `${width / divisor}:${height / divisor}`;
  const longestEdge = Math.max(width, height);
  const imageSize: "1K" | "2K" | "4K" =
    longestEdge >= 3072 ? "4K" : longestEdge >= 1536 ? "2K" : "1K";

  return {
    aspect_ratio: aspectRatio,
    image_size: imageSize,
  };
}

function resolveComflyTextModel(model: string): string {
  return COMFLY_TEXT_MODEL_MAP.get(model) ?? model;
}

function normalizeComflyTextModel(model: string): string {
  return COMFLY_TEXT_MODEL_REVERSE_MAP.get(model) ?? model;
}

function isComflyCompatibleProvider(
  provider: ImageApiProvider,
): provider is "comfly" | "zhenzhen" {
  return provider === "comfly" || provider === "zhenzhen";
}

function isVibeCompatibleProvider(
  provider: ImageApiProvider,
): provider is "vibe" | "fucheers" {
  return provider === "vibe" || provider === "fucheers";
}

function getComflyCompatibleProviderLabel(provider: "comfly" | "zhenzhen"): string {
  return provider === "zhenzhen" ? "贞贞的AI工坊" : "Comfly";
}

function getProviderLabel(baseUrl: string, fallback = "Upstream API"): string {
  if (baseUrl === ZHENZHEN_IMAGE_BASE_URL || baseUrl === ZHENZHEN_TEXT_BASE_URL) {
    return "贞贞的AI工坊";
  }

  if (baseUrl === COMFLY_IMAGE_BASE_URL || baseUrl === COMFLY_TEXT_BASE_URL) {
    return "Comfly";
  }

  if (baseUrl === VIBE_BASE_URL || baseUrl === VIBE_GEMINI_BASE_URL) {
    return "Vibe API";
  }

  if (baseUrl === FUCHEERS_BASE_URL || baseUrl === FUCHEERS_GEMINI_BASE_URL) {
    return "Fucheers API";
  }

  return fallback;
}

function getVibeCompatibleBaseUrl(provider: "vibe" | "fucheers"): string {
  return provider === "fucheers" ? FUCHEERS_BASE_URL : VIBE_BASE_URL;
}

function getVibeCompatibleGeminiBaseUrl(provider: "vibe" | "fucheers"): string {
  return provider === "fucheers" ? FUCHEERS_GEMINI_BASE_URL : VIBE_GEMINI_BASE_URL;
}

function getVibeCompatibleProviderLabel(provider: "vibe" | "fucheers"): string {
  return provider === "fucheers" ? "Fucheers API" : "Vibe API";
}

function createOpenAiUserContent(
  prompt: string,
  images?: Array<{
    url: string;
  }>,
): string | ChatMessageContentPart[] {
  const userContent: ChatMessageContentPart[] = [
    {
      type: "text",
      text: prompt,
    },
  ];

  for (const image of images ?? []) {
    if (!image.url.trim()) {
      continue;
    }

    userContent.push({
      type: "image_url",
      image_url: {
        url: image.url,
      },
    });
  }

  return userContent.length === 1 ? prompt : userContent;
}

function createClaudeUserContent(
  prompt: string,
  images?: Array<{
    url: string;
  }>,
): Array<
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    }
> {
  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source:
          | { type: "base64"; media_type: string; data: string }
          | { type: "url"; url: string };
      }
  > = [{ type: "text", text: prompt }];

  for (const image of images ?? []) {
    const url = image.url.trim();

    if (!url) {
      continue;
    }

    const dataUrl = parseDataUrl(url);

    if (dataUrl) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: dataUrl.mediaType,
          data: dataUrl.data,
        },
      });
      continue;
    }

    content.push({
      type: "image",
      source: {
        type: "url",
        url,
      },
    });
  }

  return content;
}

function toGeminiAspectRatio(size?: string): string {
  const { width, height } = parseImageSize(size);
  const ratio = width / height;
  const supported = [
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

  let best = "1:1";
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of supported) {
    const [w, h] = option.split(":").map(Number);
    const delta = Math.abs(ratio - w / h);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }

  return best;
}

function toGeminiImageSize(size?: string): string {
  const { width, height } = parseImageSize(size);
  const exactSize = GEMINI_IMAGE_SIZE_BY_DIMENSIONS.get(`${width}x${height}`);

  if (exactSize) {
    return exactSize;
  }

  const maxDimension = Math.max(width, height);

  if (maxDimension <= 768) {
    return "512px";
  }

  if (maxDimension <= 1280) {
    return "1K";
  }

  if (maxDimension <= 2560) {
    return "2K";
  }

  return "4K";
}

async function createGeminiImageParts(
  images?: Array<{
    url: string;
    fileName?: string;
  }>,
): Promise<GeminiContentPart[]> {
  const parts: GeminiContentPart[] = [];

  for (const [index, image] of (images ?? []).entries()) {
    if (!image.url.trim()) {
      continue;
    }

    const referenceImage = await readReferenceImage(image, index);

    parts.push({
      inlineData: {
        mimeType: referenceImage.mediaType,
        data: referenceImage.bytes.toString("base64"),
      },
    });
  }

  return parts;
}

async function requestJsonWithBaseUrl<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  requestHeadersFactory: (apiKey?: string) => HeadersInit = createHeaders,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  providerLabel = getProviderLabel(baseUrl),
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let responseStatus: number | undefined;
  let responseText = "";

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: requestHeadersFactory(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    responseStatus = response.status;
    responseText = await response.text();
    const json = responseText ? (JSON.parse(responseText) as T) : ({} as T);

    if (!response.ok) {
      const message =
        (json as { error?: { message?: string } }).error?.message ??
        `${providerLabel} request failed with status ${response.status}`;

      throw new VibeApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      const preview = responseText.slice(0, 200);
      throw new VibeApiError(
        502,
        `${providerLabel} returned invalid JSON (status=${responseStatus ?? "?"}): ${preview || "(empty)"}`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, `${providerLabel} request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerLabel} request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestStreamWithBaseUrl(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  requestHeadersFactory: (apiKey?: string) => HeadersInit = createHeaders,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  providerLabel = getProviderLabel(baseUrl),
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: requestHeadersFactory(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();

      try {
        const json = text
          ? (JSON.parse(text) as { error?: { message?: string } })
          : {};
        throw new VibeApiError(
          response.status,
          json.error?.message ??
            `${providerLabel} request failed with status ${response.status}`,
          json,
        );
      } catch (error) {
        if (error instanceof VibeApiError) {
          throw error;
        }

        throw new VibeApiError(
          response.status,
          text || `${providerLabel} request failed with status ${response.status}`,
        );
      }
    }

    if (!response.body) {
      throw new VibeApiError(502, `${providerLabel} returned no response stream`);
    }

    return response;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, `${providerLabel} request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerLabel} request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestFormWithBaseUrl<T>(
  baseUrl: string,
  path: string,
  formData: FormData,
  apiKey?: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  providerLabel = getProviderLabel(baseUrl),
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let responseStatus: number | undefined;
  let responseText = "";

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${assertConfigured(apiKey)}`,
      },
      body: formData,
      signal: controller.signal,
    });

    responseStatus = response.status;
    responseText = await response.text();
    const json = responseText ? (JSON.parse(responseText) as T) : ({} as T);

    if (!response.ok) {
      const message =
        (json as { error?: { message?: string } }).error?.message ??
        `${providerLabel} request failed with status ${response.status}`;

      throw new VibeApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      const preview = responseText.slice(0, 200);
      throw new VibeApiError(
        502,
        `${providerLabel} returned invalid JSON (status=${responseStatus ?? "?"}): ${preview || "(empty)"}`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, `${providerLabel} request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerLabel} request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGetWithBaseUrl<T>(
  baseUrl: string,
  path: string,
  apiKey?: string,
  requestHeadersFactory: (apiKey?: string) => HeadersInit = createHeaders,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  providerLabel = getProviderLabel(baseUrl),
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let responseStatus: number | undefined;
  let responseText = "";

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: requestHeadersFactory(apiKey),
      signal: controller.signal,
    });

    responseStatus = response.status;
    responseText = await response.text();
    const json = responseText ? (JSON.parse(responseText) as T) : ({} as T);

    if (!response.ok) {
      const message =
        (json as { error?: { message?: string }; message?: string }).error?.message ??
        (json as { message?: string }).message ??
        `${providerLabel} request failed with status ${response.status}`;

      throw new VibeApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      const preview = responseText.slice(0, 200);
      throw new VibeApiError(
        502,
        `${providerLabel} returned invalid JSON (status=${responseStatus ?? "?"}): ${preview || "(empty)"}`,
        { status: responseStatus, bodyPreview: responseText.slice(0, 500) },
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, `${providerLabel} request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerLabel} request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestComflyTaskStatusPreviewWithBaseUrl(
  baseUrl: string,
  path: string,
  apiKey?: string,
  timeoutMs = COMFLY_TASK_STATUS_TIMEOUT_MS,
  providerLabel = getProviderLabel(baseUrl),
): Promise<ComflyAsyncTaskStatusResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: createHeaders(apiKey),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();

      try {
        const json = text
          ? (JSON.parse(text) as { error?: { message?: string }; message?: string })
          : {};
        const message =
          json.error?.message ??
          json.message ??
          `${providerLabel} request failed with status ${response.status}`;

        throw new VibeApiError(response.status, message, json);
      } catch (error) {
        if (error instanceof VibeApiError) {
          throw error;
        }

        throw new VibeApiError(
          response.status,
          text || `${providerLabel} request failed with status ${response.status}`,
        );
      }
    }

    if (!response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";

    try {
      while (text.length < 262_144) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        text += decoder.decode(value, { stream: true });

        const preview = extractComflyTaskStatusPreview(text);

        if (preview) {
          await reader.cancel();
          return preview;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    return null;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, `${providerLabel} request timed out`);
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : `${providerLabel} request failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function buildComflyAsyncImageResult(
  taskResponse: ComflyAsyncTaskStatusResponse,
  fallbackModel: string,
  size?: string,
): Promise<GenerateImageResult> {
  const taskPayload = normalizeMaybeJson(
    taskResponse.data?.data ??
      taskResponse.data?.task_result ??
      taskResponse.data?.result ??
      (taskResponse as JsonObject).task_result ??
      (taskResponse as JsonObject).result ??
      taskResponse.data,
  );
  const taskPayloadRecord = asJsonObject(taskPayload);
  const model = stringValue(taskPayloadRecord?.model) ?? fallbackModel;
  const dimensions = parseImageSize(size);
  const images = await Promise.all(
    extractComflyImageUrls(taskPayload).map(async (imageUrl) => ({
      imageUrl,
      hostedImageUrl: await normalizeGeneratedImageUrl(imageUrl),
      model,
      width: dimensions.width,
      height: dimensions.height,
    }) satisfies GenerateImageResultItem),
  );

  if (!images.length) {
    throw new VibeApiError(502, "Comfly returned no image data", taskResponse);
  }

  return {
    images,
    model,
  };
}

function asJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  return value;
}

function decodeJsonStringLiteral(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function firstJsonStringField(source: string, fieldName: string): string | undefined {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = source.match(pattern);

  return match ? decodeJsonStringLiteral(match[1]) : undefined;
}

function firstJsonNumberField(source: string, fieldName: string): number | undefined {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*(\\d+)`);
  const match = source.match(pattern);

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractComflyTaskStatusPreview(
  source: string,
): ComflyAsyncTaskStatusResponse | null {
  const status = firstJsonStringField(source, "status");

  if (!status) {
    return null;
  }

  const taskId = firstJsonStringField(source, "task_id");
  const failReason = firstJsonStringField(source, "fail_reason");
  const progress = firstJsonStringField(source, "progress");
  const model = firstJsonStringField(source, "model");
  const url = firstJsonStringField(source, "url");
  const created = firstJsonNumberField(source, "created");
  const imageData = url ? [{ url, b64_json: "" }] : [];
  const normalizedStatus = normalizeComflyTaskStatus(status);

  if (
    (normalizedStatus === "SUCCESS" ||
      normalizedStatus === "SUCCEEDED" ||
      normalizedStatus === "COMPLETED") &&
    !url
  ) {
    return null;
  }

  return {
    code: firstJsonStringField(source, "code"),
    message: firstJsonStringField(source, "message"),
    data: {
      task_id: taskId,
      status,
      fail_reason: failReason,
      progress,
      data: {
        data: imageData,
        images: imageData,
        model,
        created,
      },
    },
  };
}

function imageUrlFromComflyValue(value: unknown): string | null {
  const normalized = normalizeMaybeJson(value);

  if (typeof normalized === "string") {
    const trimmed = normalized.trim();

    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")) {
      return trimmed;
    }

    return toDataImageUrl(trimmed);
  }

  const record = asJsonObject(normalized);

  if (!record) {
    return null;
  }

  const b64 =
    stringValue(record.b64_json) ??
    stringValue(record.b64Json) ??
    stringValue(record.base64) ??
    stringValue(record.b64);
  const directUrl =
    stringValue(record.url) ??
    stringValue(record.image_url) ??
    stringValue(record.imageUrl);

  return toDataImageUrl(b64) ?? directUrl ?? null;
}

function extractComflyImageUrls(payload: unknown): string[] {
  const urls: string[] = [];
  const seenObjects = new WeakSet<object>();
  const seenUrls = new Set<string>();

  const pushUrl = (value: unknown) => {
    const imageUrl = imageUrlFromComflyValue(value);

    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl);
      urls.push(imageUrl);
    }
  };

  const visit = (value: unknown, depth = 0) => {
    if (depth > 6) {
      return;
    }

    const normalized = normalizeMaybeJson(value);

    if (typeof normalized === "string") {
      pushUrl(normalized);
      return;
    }

    if (Array.isArray(normalized)) {
      normalized.forEach((item) => visit(item, depth + 1));
      return;
    }

    const record = asJsonObject(normalized);

    if (!record || seenObjects.has(record)) {
      return;
    }

    seenObjects.add(record);
    pushUrl(record);

    const nestedKeys = [
      "data",
      "images",
      "result",
      "results",
      "task_result",
      "output",
      "outputs",
      "image",
    ];

    nestedKeys.forEach((key) => {
      if (key in record) {
        visit(record[key], depth + 1);
      }
    });
  };

  visit(payload);

  return urls;
}

function extractComflyTaskId(json: ComflyAsyncTaskCreateResponse): string | null {
  const candidates = [
    typeof json.data === "string" ? json.data : null,
    typeof json.data === "object" && json.data !== null
      ? (json.data.task_id ??
          json.data.taskId ??
          json.data.id ??
          json.data.job_id ??
          json.data.jobId)
      : null,
    json.task_id,
    json.taskId,
    json.id,
    json.job_id,
    json.jobId,
  ];

  for (const candidate of candidates) {
    const taskId = candidate?.trim();

    if (taskId) {
      return taskId;
    }
  }

  return null;
}

function normalizeComflyTaskStatus(status?: string): string {
  return status?.trim().replace(/[\s-]+/g, "_").toUpperCase() ?? "";
}

function toDataImageUrl(
  value?: string,
  fallbackMimeType = "image/png",
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(normalized)) {
    return normalized;
  }

  return `data:${fallbackMimeType};base64,${normalized}`;
}

async function fetchRemoteImageAsDataUrl(imageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTPUT_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      throw new VibeApiError(
        response.status,
        `Failed to fetch generated image (${response.status})`,
      );
    }

    const mediaType = response.headers.get("content-type")?.split(";")[0] || "image/png";

    if (!mediaType.startsWith("image/")) {
      throw new VibeApiError(502, "Generated image URL did not return an image");
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength === 0) {
      throw new VibeApiError(502, "Generated image URL returned empty data");
    }

    return `data:${mediaType};base64,${bytes.toString("base64")}`;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, "Generated image download timed out");
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : "Failed to fetch generated image",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function normalizeGeneratedImageUrl(imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim();

  if (!trimmed || parseDataUrl(trimmed)) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return fetchRemoteImageAsDataUrl(trimmed);
}

function extractComflyTaskStatus(json: ComflyAsyncTaskStatusResponse): string {
  const taskPayload = asJsonObject(
    normalizeMaybeJson(
      json.data?.data ??
        json.data?.task_result ??
        json.data?.result ??
        (json as JsonObject).task_result ??
        (json as JsonObject).result,
    ),
  );
  const candidates = [
    json.data?.status,
    json.data?.task_status,
    json.data?.state,
    taskPayload?.status,
    taskPayload?.task_status,
    taskPayload?.state,
    json.status,
    json.task_status,
    json.state,
  ];

  for (const candidate of candidates) {
    const status = normalizeComflyTaskStatus(
      typeof candidate === "string" ? candidate : undefined,
    );

    if (status) {
      return status;
    }
  }

  return "";
}

function getComflyTaskFailureMessage(json: ComflyAsyncTaskStatusResponse): string {
  const candidates = [
    json.data?.fail_reason,
    json.data?.failReason,
    json.data?.task_status_msg,
    json.data?.message,
    json.message,
    json.error?.message,
  ];

  for (const candidate of candidates) {
    const message = candidate?.trim();

    if (message) {
      return message;
    }
  }

  return "Comfly image generation failed";
}

function createSseChunk(chunk: TextStreamChunk): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function normalizeOpenAiDeltaContent(
  content:
    | string
    | Array<{ type?: string; text?: string }>
    | Array<{ type?: string; text?: { value?: string } | string }>
    | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (item.type !== "text") {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      if (item.text && typeof item.text === "object") {
        return item.text.value ?? "";
      }

      return "";
    })
    .join("");
}

export async function generateTextStream(
  params: GenerateTextParams,
): Promise<ReadableStream<Uint8Array>> {
  const textProvider = resolveApiProvider(params.provider ?? TEXT_API_PROVIDER);
  const requestedModel = params.model ?? DEFAULT_TEXT_MODEL;
  const isClaude = isClaudeModel(requestedModel);
  const providerModel =
    isComflyCompatibleProvider(textProvider)
      ? resolveComflyTextModel(requestedModel)
      : requestedModel;
  const baseUrl =
    textProvider === "comfly"
      ? getConfiguredComflyTextBaseUrl()
      : textProvider === "zhenzhen"
        ? getConfiguredZhenzhenTextBaseUrl()
        : getVibeCompatibleBaseUrl(textProvider);
  const providerLabel = isComflyCompatibleProvider(textProvider)
    ? getComflyCompatibleProviderLabel(textProvider)
    : getVibeCompatibleProviderLabel(textProvider);
  const path = isClaude ? "/messages" : "/chat/completions";
  const body = isClaude
    ? {
        model: providerModel,
        system: params.systemPrompt,
        messages: [
          {
            role: "user",
            content: createClaudeUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
        stream: true,
      }
    : {
        model: providerModel,
        messages: [
          ...(params.systemPrompt
            ? [{ role: "system" as const, content: params.systemPrompt }]
            : []),
          {
            role: "user" as const,
            content: createOpenAiUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      };

  const upstreamResponse = await requestStreamWithBaseUrl(
    baseUrl,
    path,
    body,
    params.apiKey,
    isClaude ? createAnthropicHeaders : createHeaders,
    DEFAULT_REQUEST_TIMEOUT_MS,
    providerLabel,
  );
  const reader = upstreamResponse.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let currentEvent = "message";
      let aggregatedText = "";
      let resolvedModel = requestedModel;

      const emitDone = () => {
        controller.enqueue(
          createSseChunk({
            type: "done",
            result: {
              content: aggregatedText,
              model: resolvedModel,
            },
          }),
        );
      };

      const processEvent = (eventName: string, dataLines: string[]) => {
        const data = dataLines.join("\n").trim();

        if (!data) {
          return;
        }

        if (data === "[DONE]") {
          emitDone();
          controller.close();
          return;
        }

        const json = JSON.parse(data) as Record<string, unknown>;

        if (typeof json.model === "string" && json.model) {
          resolvedModel =
            textProvider === "comfly"
              ? normalizeComflyTextModel(json.model)
              : json.model;
        }

        if (!isClaude) {
          const choice = Array.isArray(json.choices)
            ? (json.choices[0] as {
                delta?: {
                  content?:
                    | string
                    | Array<{
                        type?: string;
                        text?: { value?: string } | string;
                      }>;
                };
                finish_reason?: string | null;
              } | undefined)
            : undefined;

          const delta = normalizeOpenAiDeltaContent(choice?.delta?.content);

          if (delta) {
            aggregatedText += delta;
            controller.enqueue(createSseChunk({ type: "delta", delta }));
          }

          if (choice?.finish_reason) {
            emitDone();
            controller.close();
          }

          return;
        }

        if (
          eventName === "content_block_delta" &&
          typeof json.delta === "object" &&
          json.delta !== null
        ) {
          const delta = (json.delta as { text?: string }).text ?? "";

          if (delta) {
            aggregatedText += delta;
            controller.enqueue(createSseChunk({ type: "delta", delta }));
          }

          return;
        }

        if (eventName === "message_stop") {
          emitDone();
          controller.close();
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            if (aggregatedText) {
              emitDone();
            }
            controller.close();
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

            const lines = rawEvent.split(/\r?\n/);
            const dataLines: string[] = [];
            currentEvent = "message";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
              }
            }

            processEvent(currentEvent, dataLines);
          }
        }
      } catch (error) {
        controller.enqueue(
          createSseChunk({
            type: "error",
            error:
              error instanceof Error ? error.message : "Text stream failed",
          }),
        );
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function generateText(
  params: GenerateTextParams,
): Promise<GenerateTextResult> {
  const textProvider = resolveApiProvider(params.provider ?? TEXT_API_PROVIDER);
  const requestedModel = params.model ?? DEFAULT_TEXT_MODEL;
  const providerModel =
    isComflyCompatibleProvider(textProvider)
      ? resolveComflyTextModel(requestedModel)
      : requestedModel;
  const baseUrl =
    textProvider === "comfly"
      ? getConfiguredComflyTextBaseUrl()
      : textProvider === "zhenzhen"
        ? getConfiguredZhenzhenTextBaseUrl()
        : getVibeCompatibleBaseUrl(textProvider);
  const providerLabel = isComflyCompatibleProvider(textProvider)
    ? getComflyCompatibleProviderLabel(textProvider)
    : getVibeCompatibleProviderLabel(textProvider);

  if (isClaudeModel(requestedModel)) {
    const json = await requestJsonWithBaseUrl<ClaudeMessageResponse>(
      baseUrl,
      "/messages",
      {
        model: providerModel,
        system: params.systemPrompt,
        messages: [
          {
            role: "user",
            content: createClaudeUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
      },
      params.apiKey,
      createAnthropicHeaders,
      DEFAULT_REQUEST_TIMEOUT_MS,
      providerLabel,
    );

    const content = normalizeMessageContent(json.content);
    const promptTokens = json.usage?.input_tokens;
    const completionTokens = json.usage?.output_tokens;

    return {
      content,
      model:
        isComflyCompatibleProvider(textProvider)
          ? normalizeComflyTextModel(json.model ?? providerModel)
          : json.model ?? requestedModel,
      promptTokens,
      completionTokens,
      totalTokens:
        typeof promptTokens === "number" && typeof completionTokens === "number"
          ? promptTokens + completionTokens
          : undefined,
    };
  }

  const json = await requestJsonWithBaseUrl<VibeChatResponse>(
    baseUrl,
    "/chat/completions",
    {
      model: providerModel,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        {
          role: "user" as const,
          content: createOpenAiUserContent(params.prompt, params.images),
        },
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    },
    params.apiKey,
    createHeaders,
    DEFAULT_REQUEST_TIMEOUT_MS,
    providerLabel,
  );

  const content = normalizeMessageContent(json.choices?.[0]?.message?.content);

  return {
    content,
    model:
      isComflyCompatibleProvider(textProvider)
        ? normalizeComflyTextModel(json.model ?? providerModel)
        : json.model ?? requestedModel,
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
    totalTokens: json.usage?.total_tokens,
  };
}

async function generateImageOpenAI(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;
  const quality = params.quality;
  const outputFormat = params.outputFormat ?? "png";
  const moderation = params.moderation ?? "auto";
  const imageProvider = resolveApiProvider(params.provider ?? IMAGE_API_PROVIDER);
  const vibeCompatibleProvider = isVibeCompatibleProvider(imageProvider)
    ? imageProvider
    : "vibe";
  const baseUrl = getVibeCompatibleBaseUrl(vibeCompatibleProvider);
  const providerLabel = getVibeCompatibleProviderLabel(vibeCompatibleProvider);
  let json: VibeImageResponse;

  if (params.images?.length) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", params.prompt);

    if (size) {
      formData.append("size", size);
    }

    if (quality) {
      formData.append("quality", quality);
    }

    if (outputFormat) {
      formData.append("output_format", outputFormat);
    }

    if (moderation) {
      formData.append("moderation", moderation);
    }

    const imageBlobs = await Promise.all(
      params.images.map((image, index) => createImageFilePart(image, index)),
    );

    imageBlobs.forEach((blob, index) => {
      formData.append(
        "image[]",
        blob,
        getSafeMultipartFileName(
          params.images?.[index]?.fileName,
          `reference-${index + 1}`,
        ),
      );
    });

    json = await requestFormWithBaseUrl<VibeImageResponse>(
      baseUrl,
      "/images/edits",
      formData,
      params.apiKey,
      IMAGE_REQUEST_TIMEOUT_MS,
      providerLabel,
    );
  } else {
    const requestBody: {
      model: string;
      prompt: string;
      size: string;
      quality?: string;
      output_format: string;
      moderation: string;
      n?: number;
    } = {
      model,
      prompt: params.prompt,
      size,
      quality,
      output_format: outputFormat,
      moderation,
    };

    if (typeof params.n === "number") {
      requestBody.n = params.n;
    }

    json = await requestJsonWithBaseUrl<VibeImageResponse>(
      baseUrl,
      "/images/generations",
      requestBody,
      params.apiKey,
      createHeaders,
      IMAGE_REQUEST_TIMEOUT_MS,
      providerLabel,
    );
  }

  const dimensions = parseImageSize(size);
  const images =
    json.data
      ?.map((image) => {
        const imageUrl = toDataImageUrl(image?.b64_json) ?? image?.url;

        if (!imageUrl) {
          return null;
        }

        return {
          imageUrl,
          model,
          width: dimensions.width,
          height: dimensions.height,
        } satisfies GenerateImageResultItem;
      })
      .filter((image): image is GenerateImageResultItem => Boolean(image)) ?? [];

  if (!images.length) {
    throw new VibeApiError(502, `${providerLabel} returned no image data`, json);
  }

  return {
    images,
    model,
  };
}

async function generateImageComflySync(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;
  const quality = params.quality;
  const resolvedProvider = resolveApiProvider(params.provider ?? IMAGE_API_PROVIDER);
  const provider: "comfly" | "zhenzhen" = isComflyCompatibleProvider(resolvedProvider)
    ? resolvedProvider
    : "comfly";
  const providerLabel = getComflyCompatibleProviderLabel(provider);
  const baseUrl =
    provider === "zhenzhen"
      ? getConfiguredZhenzhenImageBaseUrl()
      : getConfiguredComflyImageBaseUrl();
  let json: VibeImageResponse;

  if (params.images?.length) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", params.prompt);

    if (size) {
      formData.append("size", size);
    }

    if (quality) {
      formData.append("quality", quality);
    }

    formData.append("response_format", DEFAULT_COMFLY_RESPONSE_FORMAT);

    const imageBlobs = await Promise.all(
      params.images.map((image, index) => createImageFilePart(image, index)),
    );

    imageBlobs.forEach((blob, index) => {
      formData.append(
        "image",
        blob,
        getSafeMultipartFileName(
          params.images?.[index]?.fileName,
          `reference-${index + 1}`,
        ),
      );
    });

    json = await requestFormWithBaseUrl<VibeImageResponse>(
      baseUrl,
      "/images/edits",
      formData,
      params.apiKey,
      IMAGE_REQUEST_TIMEOUT_MS,
    );
  } else {
    const requestBody: {
      model: string;
      prompt: string;
      size: string;
      quality?: string;
      response_format: string;
    } = {
      model,
      prompt: params.prompt,
      size,
      response_format: DEFAULT_COMFLY_RESPONSE_FORMAT,
    };

    if (quality) {
      requestBody.quality = quality;
    }

    json = await requestJsonWithBaseUrl<VibeImageResponse>(
      baseUrl,
      "/images/generations",
      requestBody,
      params.apiKey,
      createHeaders,
      IMAGE_REQUEST_TIMEOUT_MS,
    );
  }

  const dimensions = parseImageSize(size);
  const images =
    json.data
      ?.map((image) => {
        const imageUrl = toDataImageUrl(image?.b64_json) ?? image?.url;

        if (!imageUrl) {
          return null;
        }

        return {
          imageUrl,
          model,
          width: dimensions.width,
          height: dimensions.height,
        } satisfies GenerateImageResultItem;
      })
      .filter((image): image is GenerateImageResultItem => Boolean(image)) ?? [];
  const normalizedImages = await Promise.all(
    images.map(async (image) => ({
      ...image,
      hostedImageUrl: await normalizeGeneratedImageUrl(image.imageUrl),
    })),
  );

  if (!normalizedImages.length) {
    throw new VibeApiError(502, `${providerLabel} returned no image data`, json);
  }

  return {
    images: normalizedImages,
    model,
  };
}

export async function submitComflyImageTask(
  params: GenerateImageParams & { provider?: "comfly" | "zhenzhen" },
): Promise<GenerateImageTaskResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;
  const quality = params.quality;
  const provider = params.provider ?? "comfly";
  const providerLabel = getComflyCompatibleProviderLabel(provider);
  const baseUrl =
    provider === "zhenzhen"
      ? getConfiguredZhenzhenImageBaseUrl()
      : getConfiguredComflyImageBaseUrl();
  let json: ComflyAsyncTaskCreateResponse;

  if (params.images?.length) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", params.prompt);

    if (size) {
      formData.append("size", size);
    }

    if (quality) {
      formData.append("quality", quality);
    }

    formData.append("response_format", COMFLY_ASYNC_RESPONSE_FORMAT);

    const imageBlobs = await Promise.all(
      params.images.map((image, index) => createImageFilePart(image, index)),
    );

    imageBlobs.forEach((blob, index) => {
      formData.append(
        "image",
        blob,
        getSafeMultipartFileName(
          params.images?.[index]?.fileName,
          `reference-${index + 1}`,
        ),
      );
    });

    json = await requestFormWithBaseUrl<ComflyAsyncTaskCreateResponse>(
      baseUrl,
      "/images/edits?async=true",
      formData,
      params.apiKey,
      IMAGE_REQUEST_TIMEOUT_MS,
    );
  } else {
    const requestBody: {
      model: string;
      prompt: string;
      size: string;
      quality?: string;
      response_format: string;
    } = {
      model,
      prompt: params.prompt,
      size,
      response_format: COMFLY_ASYNC_RESPONSE_FORMAT,
    };

    if (quality) {
      requestBody.quality = quality;
    }

    json = await requestJsonWithBaseUrl<ComflyAsyncTaskCreateResponse>(
      baseUrl,
      "/images/generations?async=true",
      requestBody,
      params.apiKey,
      createHeaders,
      IMAGE_REQUEST_TIMEOUT_MS,
    );
  }

  const taskId = extractComflyTaskId(json);

  if (!taskId) {
    throw new VibeApiError(502, `${providerLabel} returned no task id`, json);
  }

  return {
    taskId,
    model,
  };
}

export async function getComflyImageTaskResult(params: {
  taskId: string;
  apiKey?: string;
  model?: string;
  size?: string;
  provider?: "comfly" | "zhenzhen";
}): Promise<
  | { status: "pending" }
  | { status: "completed"; result: GenerateImageResult }
> {
  const taskId = params.taskId.trim();
  const provider = params.provider ?? "comfly";
  const providerLabel = getComflyCompatibleProviderLabel(provider);

  if (!taskId) {
    throw new VibeApiError(400, `${providerLabel} task id is required`);
  }

  const baseUrl =
    provider === "zhenzhen"
      ? getConfiguredZhenzhenImageBaseUrl()
      : getConfiguredComflyImageBaseUrl();
  const taskPath = `/images/tasks/${encodeURIComponent(taskId)}`;
  let json: ComflyAsyncTaskStatusResponse;

  try {
    json =
      (await requestComflyTaskStatusPreviewWithBaseUrl(
        baseUrl,
        taskPath,
        params.apiKey,
        COMFLY_TASK_STATUS_TIMEOUT_MS,
        providerLabel,
      )) ??
      (await requestGetWithBaseUrl<ComflyAsyncTaskStatusResponse>(
        baseUrl,
        taskPath,
        params.apiKey,
        createHeaders,
        COMFLY_TASK_STATUS_TIMEOUT_MS,
        providerLabel,
      ));
  } catch (error) {
    if (error instanceof VibeApiError && error.status === 504) {
      const preview = await requestComflyTaskStatusPreviewWithBaseUrl(
        baseUrl,
        taskPath,
        params.apiKey,
        45_000,
        providerLabel,
      );

      if (preview) {
        json = preview;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const status = extractComflyTaskStatus(json);

  if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
    return {
      status: "completed",
      result: await buildComflyAsyncImageResult(
        json,
        params.model ?? DEFAULT_IMAGE_MODEL,
        params.size,
      ),
    };
  }

  if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
    throw new VibeApiError(
      502,
      getComflyTaskFailureMessage(json),
      json,
    );
  }

  if (
    status === "IN_PROGRESS" ||
    status === "PENDING" ||
    status === "PROCESSING" ||
    status === "QUEUED" ||
    status === "NOT_START" ||
    status === "NOT_STARTED" ||
    status === "SUBMITTED" ||
    status === "RUNNING" ||
    status === "CREATED"
  ) {
    return {
      status: "pending",
    };
  }

  const statusLabel = status || "EMPTY";
  const upstreamCode =
    typeof json.code === "string" || typeof json.code === "number"
      ? String(json.code)
      : "";
  const upstreamMessage = getComflyTaskFailureMessage(json);
  const detail = [upstreamCode ? `code=${upstreamCode}` : "", `status=${statusLabel}`, upstreamMessage]
    .filter(Boolean)
    .join(", ");

  throw new VibeApiError(
    502,
    `Comfly returned an unknown task status${detail ? ` (${detail})` : ""}`,
    json,
  );
}

async function generateImageGemini(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;
  const imageProvider = resolveApiProvider(params.provider ?? IMAGE_API_PROVIDER);
  const vibeCompatibleProvider = isVibeCompatibleProvider(imageProvider)
    ? imageProvider
    : "vibe";
  const baseUrl = getVibeCompatibleGeminiBaseUrl(vibeCompatibleProvider);
  const providerLabel = getVibeCompatibleProviderLabel(vibeCompatibleProvider);
  const imageParts = await createGeminiImageParts(params.images);

  const json = await requestJsonWithBaseUrl<VibeGeminiImageResponse>(
    baseUrl,
    `/v1beta/models/${model}:generateContent`,
    {
      contents: [
        {
          parts: [{ text: params.prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: toGeminiAspectRatio(size),
          imageSize: toGeminiImageSize(size),
        },
      },
    },
    params.apiKey,
    createHeaders,
    IMAGE_REQUEST_TIMEOUT_MS,
    providerLabel,
  );

  const imagePart = json.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  );
  const inlineData = imagePart?.inlineData;

  if (!inlineData?.data) {
    throw new VibeApiError(502, `${providerLabel} returned no image data`, json);
  }

  const mimeType = inlineData.mimeType ?? "image/png";
  const dimensions = parseImageSize(size);

  return {
    images: [
      {
        imageUrl: `data:${mimeType};base64,${inlineData.data}`,
        model,
        width: dimensions.width,
        height: dimensions.height,
      },
    ],
    model,
  };
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const imageProvider = resolveApiProvider(params.provider ?? IMAGE_API_PROVIDER);

  if (params.model && /^gemini-/i.test(params.model)) {
    return generateImageGemini(params);
  }

  if (imageProvider === "comfly") {
    return generateImageComflySync(params);
  }

  if (imageProvider === "zhenzhen") {
    return generateImageT8(params);
  }

  return generateImageOpenAI(params);
}

async function generateImageT8(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;
  const baseUrl = getConfiguredZhenzhenImageBaseUrl();
  const requestBody: {
    model: string;
    prompt: string;
    image?: string | string[];
    response_format: string;
    aspect_ratio?: string;
    image_size?: "1K" | "2K" | "4K";
  } = {
    model,
    prompt: params.prompt,
    response_format: DEFAULT_COMFLY_RESPONSE_FORMAT,
    ...toT8ImageSizeParams(size),
  };

  if (params.images?.length === 1) {
    requestBody.image = params.images[0].url;
  } else if (params.images && params.images.length > 1) {
    requestBody.image = params.images.map((image) => image.url);
  }

  const json = await requestJsonWithBaseUrl<VibeImageResponse>(
    baseUrl,
    "/images/generations",
    requestBody,
    params.apiKey,
    createHeaders,
    IMAGE_REQUEST_TIMEOUT_MS,
    "贞贞的AI工坊",
  );

  const dimensions = parseImageSize(size);
  const images =
    json.data
      ?.map((image) => {
        const imageUrl = toDataImageUrl(image?.b64_json) ?? image?.url;

        if (!imageUrl) {
          return null;
        }

        return {
          imageUrl,
          model,
          width: dimensions.width,
          height: dimensions.height,
        } satisfies GenerateImageResultItem;
      })
      .filter((image): image is GenerateImageResultItem => Boolean(image)) ?? [];

  if (!images.length) {
    throw new VibeApiError(502, "贞贞的AI工坊 returned no image data", json);
  }

  return {
    images,
    model,
  };
}
