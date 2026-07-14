import type { MidjourneyGenerationSettings } from "@/types/canvas";
import { normalizeMidjourneySettings } from "./image-generation-options";

export type MidjourneyQuadrant = 1 | 2 | 3 | 4;

export type MidjourneyUpscaleActions = Record<MidjourneyQuadrant, string>;

export type MidjourneyReferenceImage = { url: string; fileName?: string };

export type MidjourneyTaskState =
  | { status: "pending" }
  | { status: "completed"; taskId: string; imageUrl: string; actions?: MidjourneyUpscaleActions };

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ReadImage = (
  image: MidjourneyReferenceImage,
  index: number,
) => Promise<{ bytes: Buffer; mediaType: string }>;

type MidjourneySubmissionResponse = {
  code?: number;
  description?: string;
  result?: string | number;
};

type MidjourneyButton = {
  customId?: unknown;
  label?: unknown;
};

type MidjourneyTaskResponse = {
  id?: string;
  status?: string;
  imageUrl?: string;
  failReason?: string;
  description?: string;
  buttons?: unknown;
};

export class MidjourneyApiError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MidjourneyApiError";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function getConfiguredComflyMidjourneyBaseUrl(): string {
  const configured = [
    process.env.COMFLY_MIDJOURNEY_BASE_URL,
    process.env.COMFLY_IMAGE_BASE_URL,
    process.env.COMFLY_BASE_URL,
    "https://ai.comfly.org",
  ].find((value) => value?.trim())!;
  return normalizeBaseUrl(configured).replace(/\/v1$/i, "");
}

function createHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function readJsonResponse(response: Response, fallbackMessage: string): Promise<unknown> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new MidjourneyApiError(fallbackMessage, response.status || 502);
  }
  if (!response.ok) {
    const record = json && typeof json === "object" ? json as Record<string, unknown> : {};
    const message = typeof record.description === "string"
      ? record.description
      : typeof record.message === "string"
        ? record.message
        : fallbackMessage;
    throw new MidjourneyApiError(message, response.status, response.status >= 500, json);
  }
  return json;
}

export function buildMidjourneyPrompt(
  prompt: string,
  aspectRatio?: string,
  settings?: MidjourneyGenerationSettings,
): string {
  const normalizedPrompt = prompt
    .trim()
    .replace(
      /(?:^|\s)--(?:version|stylize|quality|aspect|chaos|weird|v|ar|s|c|q)(?=$|[=\s])(?:=(?:"[^"]*"|'[^']*'|\S+)|\s+(?:"[^"]*"|'[^']*'|\S+))?/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const normalizedSettings = normalizeMidjourneySettings(settings);
  const parameters = [
    "--v 8.1",
    ...(aspectRatio && aspectRatio !== "auto" ? [`--ar ${aspectRatio}`] : []),
    `--s ${normalizedSettings.stylize}`,
    `--weird ${normalizedSettings.weird}`,
    `--chaos ${normalizedSettings.chaos}`,
    `--q ${normalizedSettings.quality}`,
  ];

  return [normalizedPrompt, ...parameters].filter(Boolean).join(" ");
}

export function parseMidjourneySubmission(
  value: unknown,
): { taskId: string } {
  const response = (value ?? {}) as MidjourneySubmissionResponse;

  if (response.code === 23) {
    throw new MidjourneyApiError("Midjourney 队列已满，请稍后重试", 429, true, value);
  }

  if (response.code === 24) {
    throw new MidjourneyApiError("提示词包含 Midjourney 不支持的敏感内容", 400, false, value);
  }

  if (response.code !== 1 && response.code !== 22) {
    throw new MidjourneyApiError(response.description?.trim() || "Midjourney 任务提交失败", 502, false, value);
  }

  const taskId = String(response.result ?? "").trim();

  if (!taskId) {
    throw new MidjourneyApiError("Midjourney 未返回任务 ID", 502, false, value);
  }

  return { taskId };
}

export async function submitMidjourneyImagine(params: {
  prompt: string;
  aspectRatio?: string;
  settings?: MidjourneyGenerationSettings;
  apiKey: string;
  baseUrl?: string;
  images?: MidjourneyReferenceImage[];
  readImage: ReadImage;
  fetchImpl?: FetchLike;
}): Promise<{ taskId: string }> {
  const baseUrl = normalizeBaseUrl(params.baseUrl ?? getConfiguredComflyMidjourneyBaseUrl());
  const base64Array = await Promise.all((params.images ?? []).map(async (image, index) => {
    const input = await params.readImage(image, index);
    return `data:${input.mediaType};base64,${input.bytes.toString("base64")}`;
  }));
  const response = await (params.fetchImpl ?? fetch)(`${baseUrl}/mj/submit/imagine`, {
    method: "POST",
    headers: createHeaders(params.apiKey),
    body: JSON.stringify({
      prompt: buildMidjourneyPrompt(params.prompt, params.aspectRatio, params.settings),
      base64Array,
    }),
  });
  return parseMidjourneySubmission(
    await readJsonResponse(response, "Midjourney Imagine 请求失败"),
  );
}

export async function fetchMidjourneyTask(params: {
  taskId: string;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<MidjourneyTaskState> {
  const taskId = params.taskId.trim();
  if (!taskId) throw new MidjourneyApiError("Midjourney 任务 ID 不能为空", 400);
  const baseUrl = normalizeBaseUrl(params.baseUrl ?? getConfiguredComflyMidjourneyBaseUrl());
  const response = await (params.fetchImpl ?? fetch)(
    `${baseUrl}/mj/task/${encodeURIComponent(taskId)}/fetch`,
    { headers: createHeaders(params.apiKey), cache: "no-store" },
  );
  const json = await readJsonResponse(response, "Midjourney 任务查询失败") as MidjourneyTaskResponse;
  const status = json.status?.trim().toUpperCase();
  if (status === "NOT_START" || status === "SUBMITTED" || status === "IN_PROGRESS") {
    return { status: "pending" };
  }
  if (status === "MODAL") {
    throw new MidjourneyApiError("该操作需要 Midjourney 高级交互，当前版本暂不支持", 409, false, json);
  }
  if (status === "CANCEL") {
    throw new MidjourneyApiError("Midjourney 任务已取消", 409, false, json);
  }
  if (status === "FAILURE") {
    throw new MidjourneyApiError(
      json.failReason?.trim() || json.description?.trim() || "Midjourney 生成失败",
      502,
      false,
      json,
    );
  }
  if (status !== "SUCCESS") {
    throw new MidjourneyApiError(`Midjourney 返回未知任务状态：${status || "EMPTY"}`, 502, false, json);
  }
  const imageUrl = json.imageUrl?.trim();
  if (!imageUrl) {
    throw new MidjourneyApiError("Midjourney 任务成功但未返回图片", 502, false, json);
  }
  return {
    status: "completed",
    taskId: json.id?.trim() || taskId,
    imageUrl,
    actions: extractMidjourneyUpscaleActions(json.buttons),
  };
}

export async function submitMidjourneyUpscale(params: {
  taskId: string;
  quadrant: MidjourneyQuadrant;
  actions: MidjourneyUpscaleActions;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<{ taskId: string }> {
  const baseUrl = normalizeBaseUrl(params.baseUrl ?? getConfiguredComflyMidjourneyBaseUrl());
  const response = await (params.fetchImpl ?? fetch)(`${baseUrl}/mj/submit/action`, {
    method: "POST",
    headers: createHeaders(params.apiKey),
    body: JSON.stringify({ taskId: params.taskId, customId: params.actions[params.quadrant] }),
  });
  return parseMidjourneySubmission(
    await readJsonResponse(response, "Midjourney 高清任务提交失败"),
  );
}

export function parseMidjourneyUpscaleRequest(value: unknown): {
  jobId: string;
  quadrant: MidjourneyQuadrant;
  apiKey?: string;
} {
  if (!value || typeof value !== "object") {
    throw new MidjourneyApiError("Midjourney 高清请求格式不正确", 400);
  }

  const record = value as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, "customId")) {
    throw new MidjourneyApiError("不支持由客户端提交 Midjourney customId", 400);
  }

  const jobId = typeof record.jobId === "string" ? record.jobId.trim() : "";
  const quadrant = record.quadrant;

  if (!jobId) {
    throw new MidjourneyApiError("Midjourney 原始任务 ID 不能为空", 400);
  }

  if (
    typeof quadrant !== "number" ||
    !Number.isInteger(quadrant) ||
    quadrant < 1 ||
    quadrant > 4
  ) {
    throw new MidjourneyApiError("Midjourney 图片分区必须是 1 到 4", 400);
  }

  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";

  return {
    jobId,
    quadrant: quadrant as MidjourneyQuadrant,
    ...(apiKey ? { apiKey } : {}),
  };
}

export function extractMidjourneyUpscaleActions(
  value: unknown,
): MidjourneyUpscaleActions | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = new Map<MidjourneyQuadrant, string>();

  for (const item of value) {
    const button = (item ?? {}) as MidjourneyButton;
    const customId = typeof button.customId === "string" ? button.customId.trim() : "";
    const label = typeof button.label === "string" ? button.label.trim().toUpperCase() : "";
    const labelMatch = label.match(/^U([1-4])$/);
    const customIdMatch = customId.match(/::upsample::([1-4])::/i);
    const quadrantValue = labelMatch?.[1] ?? customIdMatch?.[1];

    if (!customId || !quadrantValue) {
      continue;
    }

    actions.set(Number(quadrantValue) as MidjourneyQuadrant, customId);
  }

  if (actions.size !== 4) {
    return undefined;
  }

  return {
    1: actions.get(1)!,
    2: actions.get(2)!,
    3: actions.get(3)!,
    4: actions.get(4)!,
  };
}
