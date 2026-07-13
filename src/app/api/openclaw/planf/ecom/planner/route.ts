import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildAgentEcomPlannerOptions,
  buildAgentEcomPlannerSingleOptionResult,
  hasParsedEcomPlannerOption,
  parseAgentEcomPlannerModelResponse,
  shouldSendImagesForEcomPlannerOption,
  type AgentEcomPlannerOption,
  type AgentEcomPlannerOptionsResult,
  type AgentEcomPlannerSharedContext,
} from "@/lib/agent-ecom-planner";
import { isAgentTextProvider } from "@/lib/agent-provider-options";
import { generateText, type ImageApiProvider } from "@/lib/vibe";

export const runtime = "nodejs";
export const maxDuration = 300;

const PLANNER_MODEL_TIMEOUT_MS = 5 * 60_000;
const PLANNER_MAX_MODEL_IMAGES = 2;
const PLANNER_SINGLE_OPTION_MAX_TOKENS = 8_000;
const PLANNER_MULTI_OPTION_MAX_TOKENS = 12_000;
const PLANNER_UI_SUMMARY_MAX_TOKENS = 900;
const PLANNER_JSON_REPAIR_MAX_TOKENS = 4_000;
const PLANNER_IMAGE_FETCH_TIMEOUT_MS = 15_000;
const PLANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const PLANNER_SKILL_DIR = path.join(
  process.cwd(),
  "rules",
  "planf-canvas",
  "skills",
  "ecommerce-image-planner",
);
const PLANNER_SKILL_FILE = path.join(PLANNER_SKILL_DIR, "SKILL.md");
const PLANNER_SYSTEM_PROMPT_FILE = path.join(PLANNER_SKILL_DIR, "references", "system_prompt.md");
const PLANNER_OUTPUT_CONSTRAINTS = [
  "You are GenLink's ecommerce image-set planning agent.",
  "You must read and follow the ecommerce-image-planner skill documents included below.",
  "In this app integration, do not write files to disk even if the skill document mentions file output. Return the requested JSON through the API response only.",
  "Only return JSON. Do not return Markdown or explanations. The first character must be { and the last character must be }.",
  "Primary JSON schema for this integration: {\"_shared_planner_context\":{},\"_system_diagnostic_log\":{},\"_option_label\":\"方案 A - <风格名称>\",\"option\":{\"目标平台\":\"...\",\"任务类型\":\"...\",\"期望图片数量\":\"...\",\"文案语调指引\":\"...\",\"风格名称\":\"...\",\"视觉风格与光影\":{},\"版式语言与排版哲学\":{},\"产品信息\":{},\"产品参数\":\"...\",\"全局色彩资产\":{},\"下游执行注意事项\":{},\"用户需求原文\":\"...\"}}.",
  "\"_shared_planner_context\" is a compact cross-round planning context, not an additional option.",
  "Aspect ratio rules: main images use 1:1; detail-page images use 3:4; product cards and seeding posts infer common platform ratios; explicit user ratios override defaults.",
  "If asked for one option, output only that option as one independent JSON object. Keep the other two options out of the response.",
].join("\n");

type PlannerAttachment = {
  id?: unknown;
  name?: unknown;
  imageUrl?: unknown;
  previewUrl?: unknown;
  plannerImageDataUrl?: unknown;
  ecomPlannerRole?: unknown;
};

type PlannerRequestBody = {
  request?: unknown;
  attachments?: unknown;
  optionId?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  sharedPlannerContext?: unknown;
  clientRequestId?: unknown;
};

function parseProvider(value: unknown): ImageApiProvider | undefined {
  return isAgentTextProvider(value) ? value : undefined;
}

function parseOptionId(value: unknown): AgentEcomPlannerOption["id"] | undefined {
  return value === "A" || value === "B" || value === "C" ? value : undefined;
}

function parseAttachments(value: unknown): PlannerAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PlannerAttachment => (
    Boolean(item) && typeof item === "object"
  ));
}

function parseSharedPlannerContext(value: unknown): AgentEcomPlannerSharedContext | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AgentEcomPlannerSharedContext
    : undefined;
}

function toAgentAttachments(attachments: PlannerAttachment[]) {
  return attachments.map((attachment, index) => ({
    id: typeof attachment.id === "string" ? attachment.id : `attachment-${index}`,
    kind: "image" as const,
    name: typeof attachment.name === "string" ? attachment.name : `image-${index + 1}`,
    mimeType: "image/png",
    imageUrl: typeof attachment.imageUrl === "string" ? attachment.imageUrl : "",
    previewUrl: typeof attachment.previewUrl === "string" ? attachment.previewUrl : "",
    status: "ready" as const,
    ecomPlannerRole: attachment.ecomPlannerRole === "benchmark" ? "benchmark" as const : "product" as const,
  }));
}

function getModelImages(attachments: PlannerAttachment[]): Array<{ url: string }> {
  const productImages = attachments.filter((attachment) => attachment.ecomPlannerRole !== "benchmark");
  const benchmarkImages = attachments.filter((attachment) => attachment.ecomPlannerRole === "benchmark");

  return [...productImages.slice(0, 1), ...benchmarkImages.slice(0, 1)]
    .slice(0, PLANNER_MAX_MODEL_IMAGES)
    .map((attachment) => {
      const plannerImageDataUrl = typeof attachment.plannerImageDataUrl === "string"
        ? attachment.plannerImageDataUrl.trim()
        : "";
      const imageUrl = typeof attachment.imageUrl === "string"
        ? attachment.imageUrl.trim()
        : "";
      const url = plannerImageDataUrl || imageUrl;

      return url ? { url } : undefined;
    })
    .filter((item): item is { url: string } => Boolean(item));
}

function describePlannerImageSources(attachments: PlannerAttachment[]): string[] {
  return attachments.map((attachment, index) => {
    const hasPlannerDataUrl = typeof attachment.plannerImageDataUrl === "string" &&
      attachment.plannerImageDataUrl.trim().startsWith("data:image/");
    const hasImageUrl = typeof attachment.imageUrl === "string" && attachment.imageUrl.trim();
    const role = attachment.ecomPlannerRole === "benchmark" ? "benchmark" : "product";

    return `${index + 1}:${role}:${hasPlannerDataUrl ? "planner-data-url" : hasImageUrl ? "image-url" : "missing"}`;
  });
}

async function fetchPlannerModelImageAsDataUrl(
  image: { url: string },
  index: number,
): Promise<{ url: string }> {
  const trimmedUrl = image.url.trim();

  if (!trimmedUrl || /^data:image\//i.test(trimmedUrl)) {
    return image;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLANNER_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(trimmedUrl, {
      headers: {
        Accept: "image/*",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (contentLength > PLANNER_IMAGE_MAX_BYTES) {
      throw new Error(`image is too large (${contentLength} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > PLANNER_IMAGE_MAX_BYTES) {
      throw new Error(`image is too large (${arrayBuffer.byteLength} bytes)`);
    }

    const mediaType = response.headers.get("content-type")?.split(";")[0] || "image/png";

    return {
      url: `data:${mediaType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "download timed out"
      : error instanceof Error ? error.message : "download failed";

    throw new Error(`套图企划图片 ${index + 1} 读取失败：${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function preparePlannerModelImages(
  images: Array<{ url: string }>,
): Promise<Array<{ url: string }>> {
  return await Promise.all(images.map((image, index) => (
    fetchPlannerModelImageAsDataUrl(image, index)
  )));
}

function buildPlannerPrompt(params: {
  request: string;
  attachments: PlannerAttachment[];
  optionId?: AgentEcomPlannerOption["id"];
  sharedPlannerContext?: AgentEcomPlannerSharedContext;
}): string {
  const productImages = params.attachments.filter((attachment) => attachment.ecomPlannerRole !== "benchmark");
  const benchmarkImages = params.attachments.filter((attachment) => attachment.ecomPlannerRole === "benchmark");
  const hasSharedContext = Boolean(params.sharedPlannerContext);
  const optionInstruction = params.optionId
    ? hasSharedContext
      ? [
          `Serialize option ${params.optionId} only from the shared planner context below.`,
          "Do not rerun the six-module planning process. Do not invent a new A/B/C strategy.",
          `Return one independent JSON object with "_option_label" starting with "方案 ${params.optionId} - " and an "option" object.`,
        ].join(" ")
      : [
          `Complete the six-module planning process once, form the A/B/C option group internally, then output option ${params.optionId} only.`,
          "Because this is the first staged call, include a compact top-level \"_shared_planner_context\" object for later B/C calls.",
          "The shared context must include anchorMode, diagnosticLog, productDNA, visualAnchor, differentiationMatrix, and optionSkeletons.",
          `Return one independent JSON object with "_option_label" starting with "方案 ${params.optionId} - " and an "option" object.`,
        ].join(" ")
    : [
        "Complete the six-module planning process once, form the A/B/C option group internally, then output option A only.",
        "Include a compact top-level \"_shared_planner_context\" object for later staged calls.",
        "Do not output options B or C unless their optionId is explicitly requested.",
      ].join(" ");

  return [
    optionInstruction,
    params.optionId === "B"
      ? "Option B must fulfill the rule role: 邻近延展 / 变奏演绎. It must not repeat option A's scene, composition rhythm, or selling-point focus."
      : undefined,
    params.optionId === "C"
      ? "Option C must fulfill the rule role: 跳脱创新 / 边界探索 / third aesthetic dimension. It must not repeat option A or B's scene, composition rhythm, color temperature, or selling-point focus."
      : undefined,
    "Use concise Chinese copy for all user-facing fields.",
    "Do not say the option has been generated. Do not ask the user to reply 继续. Return the JSON object only.",
    "Do not include option.ui_summary in this step. UI summary will be generated by a separate model call after this JSON is parsed.",
    `Product image count: ${productImages.length}`,
    `Benchmark image count: ${benchmarkImages.length}`,
    `User brief: ${params.request}`,
    params.sharedPlannerContext
      ? `Shared planner context from the first staged call:\n${JSON.stringify(params.sharedPlannerContext, null, 2)}`
      : undefined,
  ].filter(Boolean).join("\n");
}

const PLANNER_UI_SUMMARY_SYSTEM_PROMPT = [
  "You summarize one ecommerce planning JSON for UI display.",
  "Return only JSON. No markdown, no explanation.",
  "Schema: {\"coreDifference\":\"...\",\"visualKeyword\":\"...\",\"sellingPointFocus\":\"...\",\"scenarioMood\":\"...\",\"bestFor\":\"...\"}.",
  "Each value must be concise Chinese, user-facing, without braces, quotes, JSON field names, diagnostic text, or line breaks.",
  "Limits: coreDifference <= 28 Chinese chars, visualKeyword <= 28, sellingPointFocus <= 32, scenarioMood <= 32, bestFor <= 32.",
].join("\n");

type PlannerUiSummary = NonNullable<AgentEcomPlannerOption["uiSummary"]>;

function cleanSummaryValue(value: unknown, fallback: string): string {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  const cleaned = source
    .replace(/[{}"]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}...` : cleaned;
}

function extractJsonRecord(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function parseUiSummary(text: string, fallback: PlannerUiSummary): PlannerUiSummary {
  const parsed = extractJsonRecord(text);

  if (!parsed) {
    return fallback;
  }

  return {
    coreDifference: cleanSummaryValue(parsed.coreDifference, fallback.coreDifference),
    visualKeyword: cleanSummaryValue(parsed.visualKeyword, fallback.visualKeyword),
    sellingPointFocus: cleanSummaryValue(parsed.sellingPointFocus, fallback.sellingPointFocus),
    scenarioMood: cleanSummaryValue(parsed.scenarioMood, fallback.scenarioMood),
    bestFor: cleanSummaryValue(parsed.bestFor, fallback.bestFor),
  };
}

async function generatePlannerText(params: {
  prompt: string;
  systemPrompt: string;
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  images?: Array<{ url: string }>;
}) {
  return await Promise.race([
    generateText({
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      timeoutMs: PLANNER_MODEL_TIMEOUT_MS,
      images: params.images,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("套图企划模型运行超时，请稍后重试。")), PLANNER_MODEL_TIMEOUT_MS);
    }),
  ]);
}

function buildPlannerJsonRepairPrompt(params: {
  optionId?: AgentEcomPlannerOption["id"];
  rawText: string;
  fallback: AgentEcomPlannerOptionsResult;
}): string {
  const expectedOptionId = params.optionId ?? params.fallback.options[0]?.id ?? "A";

  return [
    "The previous ecommerce planner model response was not accepted by the app parser.",
    "Repair it into one valid JSON object only. Do not add markdown, comments, or code fences.",
    `Expected option id: ${expectedOptionId}.`,
    "Required top-level shape:",
    "{\"_option_label\":\"方案 <ID> - <style name>\",\"option\":{\"目标平台\":\"...\",\"任务类型\":\"...\",\"期望图片数量\":\"...\",\"文案语调指引\":\"...\",\"风格名称\":\"...\",\"视觉风格与光影\":{},\"版式语言与排版哲学\":{},\"产品信息\":{},\"产品参数\":\"...\",\"全局色彩资产\":{},\"下游执行注意事项\":{},\"用户需求原文\":\"...\"}}",
    "Preserve the commercial strategy and visual direction from the previous response. If a field is missing, infer it from the fallback planner below.",
    "Fallback planner for missing fields:",
    JSON.stringify(params.fallback, null, 2),
    "Previous response to repair:",
    params.rawText,
  ].join("\n");
}

async function parsePlannerOrRepair(params: {
  resultContent: string;
  fallback: AgentEcomPlannerOptionsResult;
  optionId?: AgentEcomPlannerOption["id"];
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
}): Promise<AgentEcomPlannerOptionsResult> {
  const parsed = parseAgentEcomPlannerModelResponse({
    text: params.resultContent,
    fallback: params.fallback,
  });

  if (hasParsedEcomPlannerOption(parsed, params.optionId)) {
    return parsed;
  }

  const repaired = await generatePlannerText({
    prompt: buildPlannerJsonRepairPrompt({
      optionId: params.optionId,
      rawText: params.resultContent,
      fallback: params.fallback,
    }),
    systemPrompt: [
      "You repair ecommerce planner model output into strict JSON for an API parser.",
      "Return JSON only. The first character must be { and the last character must be }.",
      "Do not use markdown. Do not explain.",
    ].join("\n"),
    provider: params.provider,
    model: params.model,
    apiKey: params.apiKey,
    maxTokens: PLANNER_JSON_REPAIR_MAX_TOKENS,
    temperature: 0.1,
  });

  return parseAgentEcomPlannerModelResponse({
    text: repaired.content,
    fallback: params.fallback,
  });
}

async function summarizePlannerOption(params: {
  option: AgentEcomPlannerOption;
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
}): Promise<PlannerUiSummary> {
  const fallback = params.option.uiSummary ?? {
    coreDifference: params.option.positioning,
    visualKeyword: params.option.visualDirection,
    sellingPointFocus: params.option.sellingPointStrategy,
    scenarioMood: params.option.visualDirection,
    bestFor: "适合需要该视觉方向的电商套图。",
  };

  if (!params.option.rawOptionJson) {
    return fallback;
  }

  const result = await generatePlannerText({
    prompt: [
      `方案 ID：${params.option.id}`,
      "请只根据下面这份完整方案 JSON，提炼前端展示用摘要。",
      "不要新增产品参数，不要输出完整方案，不要输出解释。",
      `完整方案 JSON：${params.option.rawOptionJson}`,
    ].join("\n"),
    systemPrompt: PLANNER_UI_SUMMARY_SYSTEM_PROMPT,
    provider: params.provider,
    model: params.model,
    apiKey: params.apiKey,
    maxTokens: PLANNER_UI_SUMMARY_MAX_TOKENS,
    temperature: 0.2,
  });

  return parseUiSummary(result.content, fallback);
}

async function attachPlannerUiSummaries(
  planner: AgentEcomPlannerOptionsResult,
  params: {
    provider?: ImageApiProvider;
    model?: string;
    apiKey?: string;
  },
): Promise<AgentEcomPlannerOptionsResult> {
  const options = await Promise.all(planner.options.map(async (option) => {
    try {
      const uiSummary = await summarizePlannerOption({
        option,
        provider: params.provider,
        model: params.model,
        apiKey: params.apiKey,
      });

      return {
        ...option,
        positioning: uiSummary.coreDifference,
        visualDirection: uiSummary.visualKeyword,
        sellingPointStrategy: uiSummary.sellingPointFocus,
        uiSummary,
      };
    } catch (error) {
      console.warn("[openclaw/planf/ecom/planner] ui summary fallback", error);

      return option;
    }
  }));

  return {
    ...planner,
    options,
  };
}

async function readPlannerSystemPrompt(): Promise<string> {
  const [skill, systemPrompt] = await Promise.all([
    readFile(PLANNER_SKILL_FILE, "utf8"),
    readFile(PLANNER_SYSTEM_PROMPT_FILE, "utf8"),
  ]);

  return [
    PLANNER_OUTPUT_CONSTRAINTS,
    "",
    "===== BEGIN ecommerce-image-planner/SKILL.md =====",
    skill,
    "===== END ecommerce-image-planner/SKILL.md =====",
    "",
    "===== BEGIN ecommerce-image-planner/references/system_prompt.md =====",
    systemPrompt,
    "===== END ecommerce-image-planner/references/system_prompt.md =====",
  ].join("\n");
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  const requestStartedAt = Date.now();
  let clientRequestId = `planner-${requestStartedAt}`;

  try {
    const body = (await request.json()) as PlannerRequestBody;
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    clientRequestId = typeof body.clientRequestId === "string" && body.clientRequestId.trim()
      ? body.clientRequestId.trim()
      : `planner-${Date.now()}`;

    if (!userRequest) {
      return NextResponse.json(
        { ok: false, error: "request is required" },
        { status: 400 },
      );
    }

    const attachments = parseAttachments(body.attachments);
    const optionId = parseOptionId(body.optionId);
    const sharedPlannerContext = parseSharedPlannerContext(body.sharedPlannerContext);
    const agentAttachments = toAgentAttachments(attachments);
    const fallback = optionId
      ? buildAgentEcomPlannerSingleOptionResult({
          optionId,
          prompt: userRequest,
          attachments: agentAttachments,
        })
      : buildAgentEcomPlannerOptions({
          prompt: userRequest,
          attachments: agentAttachments,
        });
    const provider = parseProvider(body.provider);
    const model = typeof body.model === "string" ? body.model : undefined;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const plannerSystemPrompt = await readPlannerSystemPrompt();
    const shouldSendImages = shouldSendImagesForEcomPlannerOption({
      hasSharedPlannerContext: Boolean(sharedPlannerContext),
    });
    console.info("[openclaw/planf/ecom/planner] request", {
      clientRequestId,
      optionId,
      shouldSendImages,
      imageSources: describePlannerImageSources(attachments),
    });
    const modelImages = shouldSendImages
      ? await preparePlannerModelImages(getModelImages(attachments))
      : undefined;
    const result = await generatePlannerText({
      prompt: buildPlannerPrompt({ request: userRequest, attachments, optionId, sharedPlannerContext }),
      systemPrompt: plannerSystemPrompt,
      provider,
      model,
      apiKey,
      maxTokens: optionId ? PLANNER_SINGLE_OPTION_MAX_TOKENS : PLANNER_MULTI_OPTION_MAX_TOKENS,
      temperature: 0.65,
      images: modelImages,
    });

    const planner = await parsePlannerOrRepair({
      resultContent: result.content,
      fallback,
      optionId,
      provider,
      model,
      apiKey,
    });
    if (optionId && !hasParsedEcomPlannerOption(planner, optionId)) {
      throw new Error(`套图企划模型没有返回方案 ${optionId} 的有效 JSON，请重试。`);
    }

    if (!hasParsedEcomPlannerOption(planner)) {
      throw new Error("套图企划模型没有返回有效方案 JSON，请重试。");
    }
    const summarizedPlanner = await attachPlannerUiSummaries(planner, {
      provider,
      model,
      apiKey,
    });

    return NextResponse.json({
      ok: true,
      planner: summarizedPlanner,
      model: result.model,
    });
  } catch (error) {
    console.error("[openclaw/planf/ecom/planner] failed", {
      clientRequestId,
      elapsedMs: Date.now() - requestStartedAt,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "套图企划生成失败",
      },
      { status: 502 },
    );
  }
}
