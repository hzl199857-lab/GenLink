import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { isAgentTextProvider } from "@/lib/agent-provider-options";
import { generateText, VibeApiError, type ImageApiProvider } from "@/lib/vibe";
import {
  buildAgentEcomPlannerPromptSlots,
  type AgentEcomPlannerPromptSlot,
} from "@/lib/agent-ecom-planner";

export const runtime = "nodejs";
export const maxDuration = 300;

const PLANNER_PROMPT_MODEL_TIMEOUT_MS = 5 * 60_000;
const PLANNER_PROMPT_SLOT_MAX_TOKENS = 2_200;
const PLANNER_OPTION_BRIEF_MAX_CHARS = 8_000;
const PLANNER_SYSTEM_EXCERPT_MAX_CHARS = 12_000;

const PLANNER_SKILL_DIR = path.join(
  process.cwd(),
  "rules",
  "planf-canvas",
  "skills",
  "ecommerce-image-planner",
);
const PLANNER_SKILL_FILE = path.join(PLANNER_SKILL_DIR, "SKILL.md");
const PLANNER_SYSTEM_PROMPT_FILE = path.join(PLANNER_SKILL_DIR, "references", "system_prompt.md");

const PLANNER_PROMPT_OUTPUT_CONSTRAINTS = [
  "You are GenLink's ecommerce image-set prompt executor.",
  "You must follow ecommerce-image-planner/SKILL.md in order.",
  "The selected option JSON supplied by the app is the completed Step 4 output. Continue from Step 5 only.",
  "In this app integration, do not write files to disk. Return the Markdown document as model text; the API will wrap it in JSON.",
  "Return Markdown only. Do not return JSON, explanations, or code fences around the whole Markdown document.",
  "The Markdown must be the Step 5 image prompt document for the selected option only.",
  "Each image must have one independent fenced ```text prompt block.",
  "Every ```text prompt block must be self-contained: product DNA, colors with HEX, font names, style tags, negative prompts, and TEXT OVERLAY instructions.",
  "Use natural-language aspect ratios: main images use for 1:1 square composition; detail-page images use for 3:4 vertical composition. Do not use --ar suffixes.",
  "Text must be rendered directly in the generated image, not left for PS or Canva post-editing.",
  "Keep the Markdown concise enough for a chat panel. Prefer 5-8 image prompts unless the selected option explicitly requires fewer or more.",
].join("\n");

type PlannerPromptRequestBody = {
  request?: unknown;
  productName?: unknown;
  platform?: unknown;
  taskType?: unknown;
  optionId?: unknown;
  optionTitle?: unknown;
  optionJson?: unknown;
  optionSummary?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

type PromptSlot = AgentEcomPlannerPromptSlot;

type PromptImageSlot = {
  index: number;
  slot: string;
  intent: string;
  ratio: "1:1" | "3:4";
  prompt: string;
  markdownSection: string;
};

function parseProvider(value: unknown): ImageApiProvider | undefined {
  return isAgentTextProvider(value) ? value : undefined;
}

function parseOptionId(value: unknown): "A" | "B" | "C" {
  if (value === "A" || value === "B" || value === "C") {
    return value;
  }

  throw new Error("optionId must be A, B, or C");
}

function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 40) || "套图企划";
}

function cleanMarkdownOutput(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);

  return (fenced?.[1] ?? trimmed).trim();
}

function countTextPromptBlocks(markdown: string): number {
  return markdown.match(/```text\b/gi)?.length ?? 0;
}

function extractTextPrompt(section: string): string {
  const match = section.match(/```text\s*([\s\S]*?)```/i);
  const prompt = (match?.[1] ?? section).trim();

  return prompt
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join(" / ");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => {
        const rendered = stringifyValue(nestedValue);

        return rendered ? `${key}: ${rendered}` : "";
      })
      .filter(Boolean)
      .join(" / ");
  }

  return "";
}

function truncateText(value: string, maxChars: number): string {
  return value.length > maxChars
    ? `${value.slice(0, maxChars)}\n\n[TRUNCATED: omitted ${value.length - maxChars} chars for request stability]`
    : value;
}

function sliceBetween(value: string, startMarker: string, endMarker?: string): string {
  const start = value.indexOf(startMarker);

  if (start < 0) {
    return "";
  }

  const end = endMarker ? value.indexOf(endMarker, start + startMarker.length) : -1;

  return value.slice(start, end > start ? end : undefined).trim();
}

function requireSection(value: string, startMarker: string, endMarker: string, label: string): string {
  const section = sliceBetween(value, startMarker, endMarker);

  if (!section) {
    throw new Error(`套图企划规则文件缺少必要段落：${label}`);
  }

  return section;
}

function buildSystemPromptExcerpt(systemPrompt: string): string {
  const excerpts = [
    sliceBetween(systemPrompt, "<absolute_guardrails", "</absolute_guardrails>"),
    sliceBetween(systemPrompt, "<pre_delivery_checkpoint", "</pre_delivery_checkpoint>"),
    sliceBetween(systemPrompt, "<json_serialization_protocol", "</json_serialization_protocol>"),
  ].filter(Boolean).join("\n\n");

  return truncateText(excerpts, PLANNER_SYSTEM_EXCERPT_MAX_CHARS);
}

function parseSelectedOptionJson(optionJson: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(optionJson) as unknown;

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readOptionBody(optionJson: string): Record<string, unknown> {
  const parsed = parseSelectedOptionJson(optionJson);
  const option = parsed?.option;

  return isRecord(option) ? option : parsed ?? {};
}

function firstTextFromRecord(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringifyValue(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function buildDocumentHeader(params: {
  productName: string;
  platform: string;
  taskType: string;
  optionId: "A" | "B" | "C";
  optionTitle: string;
  slots: PromptSlot[];
  optionJson: string;
}): string {
  const optionBody = readOptionBody(params.optionJson);
  const productInfo = firstTextFromRecord(optionBody, ["产品信息", "产品名称", "产品参数"]) || params.productName;
  const colorInfo = firstTextFromRecord(optionBody, ["全局色彩资产", "色彩资产", "色彩"]);
  const fontInfo = firstTextFromRecord(optionBody, ["视觉字体建议", "字体建议", "字体"]);
  const ratios = Array.from(new Set(params.slots.map((slot) => slot.aspectRatio))).join(" / ");

  return [
    `# ${params.productName} - 方案 ${params.optionId} 生图 Prompt 一览`,
    "",
    `> **方案**：${params.optionTitle}`,
    "> **目标模型**：Nano Banana Pro (Gemini 3 Pro Image), GPT-Image-1",
    `> **平台 / 任务**：${params.platform} / ${params.taskType}`,
    `> **比例**：${ratios}`,
    "> **后期**：无需 PS / Canva 加字，AI 直出成品",
    "",
    "> 每段 prompt 已完全自包含，单次 API 调用无需上下文。复制对应代码块直接粘贴到 API 即可。",
    "",
    "---",
    "",
    "## 全局产品 DNA 速查（仅作参考，每张 prompt 已内联）",
    "",
    `- **产品**：${productInfo}`,
    `- **色彩**：${colorInfo || "以方案 JSON 的全局色彩资产为准，未明确处不得编造具体认证或参数"}`,
    `- **字体**：${fontInfo || "中文 Source Han Sans / 思源黑体，英文 Inter / Helvetica Neue，按方案风格微调"}`,
    "",
    "---",
  ].join("\n");
}

function buildOptionBrief(optionJson: string): string {
  const optionBody = readOptionBody(optionJson);
  const rows = [
    ["目标平台", firstTextFromRecord(optionBody, ["目标平台"])],
    ["任务类型", firstTextFromRecord(optionBody, ["任务类型"])],
    ["期望图片数量", firstTextFromRecord(optionBody, ["期望图片数量", "图片数量"])],
    ["文案语调指引", firstTextFromRecord(optionBody, ["文案语调指引"])],
    ["风格名称", firstTextFromRecord(optionBody, ["风格名称", "视觉风格名称"])],
    ["视觉风格与光影", firstTextFromRecord(optionBody, ["视觉风格与光影", "视觉风格", "美学世界观"])],
    ["版式语言与排版哲学", firstTextFromRecord(optionBody, ["版式语言与排版哲学", "版式语言", "排版哲学"])],
    ["产品信息", firstTextFromRecord(optionBody, ["产品信息", "产品名称", "产品参数"])],
    ["全局色彩资产", firstTextFromRecord(optionBody, ["全局色彩资产", "色彩资产"])],
    ["视觉字体建议", firstTextFromRecord(optionBody, ["视觉字体建议", "字体建议"])],
    ["下游执行注意事项", firstTextFromRecord(optionBody, ["下游执行注意事项", "执行注意事项"])],
    ["用户需求原文", firstTextFromRecord(optionBody, ["用户需求原文"])],
  ]
    .map(([label, value]) => value ? `【${label}】\n${value}` : "")
    .filter(Boolean)
    .join("\n\n");

  return truncateText(rows || stringifyValue(optionBody), PLANNER_OPTION_BRIEF_MAX_CHARS);
}

function buildSlotPrompt(params: {
  request: string;
  productName: string;
  platform: string;
  taskType: string;
  optionId: "A" | "B" | "C";
  optionTitle: string;
  optionBrief: string;
  optionSummary: string;
  slot: PromptSlot;
}): string {
  return [
    "Continue the ecommerce-image-planner skill sequence from Step 5.",
    "Do not regenerate or revise A/B/C options. Use the selected Step 4 JSON as the only strategy source.",
    "Generate only ONE image section for the specified slot. Do not output other image sections.",
    "Return Markdown only for this one slot, with exactly one ```text fenced prompt block.",
    "Keep the section concise but complete. The prompt inside the text block must be self-contained.",
    `Selected option: 方案 ${params.optionId}`,
    `Selected option title: ${params.optionTitle}`,
    `Product name: ${params.productName}`,
    `Platform: ${params.platform}`,
    `Task type: ${params.taskType}`,
    `Original user brief: ${params.request}`,
    params.optionSummary ? `UI summary for orientation only: ${params.optionSummary}` : "",
    `Slot index: ${params.slot.index}`,
    `Slot type: ${params.slot.title}`,
    `Slot rhythm: ${params.slot.rhythm}`,
    "You must create a concrete content title for this image from the selected option, product, selling points, and the actual prompt you write.",
    "The title after the full-width separator `｜` must describe this specific image content, such as `城市雨天机能首图` or `三防卖点`; do not use generic titles like `核心卖点`, `首屏 KV`, `痛点开场`, or `补充说明`.",
    `Slot headline guidance: ${params.slot.headline}`,
    `Slot scene guidance: ${params.slot.scene}`,
    `Slot aspect ratio: ${params.slot.aspectRatio === "3:4" ? "for 3:4 vertical composition" : "for 1:1 square composition"}`,
    "Required section shape:",
    `## 图 ${String(params.slot.index).padStart(2, "0")}　${params.slot.title}｜<具体内容标题，必须由本图内容生成>`,
    `**心理节拍**：${params.slot.rhythm}　|　**主标**：${params.slot.headline}`,
    `**场景**：${params.slot.scene}`,
    "```text",
    "<one complete English prompt with TEXT OVERLAY and GLOBAL NEGATIVE>",
    "```",
    "",
    "Relevant fields extracted from the selected Step 4 option JSON:",
    params.optionBrief,
    "",
    "Now output this one slot section only.",
  ].filter(Boolean).join("\n");
}

async function readPromptSystemPrompt(): Promise<string> {
  const [skill, systemPrompt] = await Promise.all([
    readFile(PLANNER_SKILL_FILE, "utf8"),
    readFile(PLANNER_SYSTEM_PROMPT_FILE, "utf8"),
  ]);
  const step5Rules = requireSection(
    skill,
    "### Step 5",
    "## 几条不能踩的红线",
    "SKILL.md Step 5",
  );
  const redLineRules = requireSection(
    skill,
    "## 几条不能踩的红线",
    "## 完整系统提示",
    "SKILL.md 几条不能踩的红线",
  );
  const systemPromptExcerpt = buildSystemPromptExcerpt(systemPrompt);

  return [
    PLANNER_PROMPT_OUTPUT_CONSTRAINTS,
    "",
    "===== BEGIN ecommerce-image-planner/SKILL.md Step 5 rules =====",
    step5Rules,
    "===== END ecommerce-image-planner/SKILL.md Step 5 rules =====",
    "",
    "===== BEGIN ecommerce-image-planner/SKILL.md red lines =====",
    redLineRules,
    "===== END ecommerce-image-planner/SKILL.md red lines =====",
    "",
    "===== BEGIN ecommerce-image-planner/references/system_prompt.md relevant excerpt =====",
    systemPromptExcerpt || "[No matching Step 5-adjacent system_prompt.md excerpt found. Do not use unrelated system_prompt.md content.]",
    "===== END ecommerce-image-planner/references/system_prompt.md relevant excerpt =====",
  ].join("\n");
}

async function generatePlannerPromptSection(params: {
  prompt: string;
  systemPrompt: string;
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
}) {
  return await Promise.race([
    generateText({
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
      maxTokens: PLANNER_PROMPT_SLOT_MAX_TOKENS,
      temperature: 0.35,
      timeoutMs: PLANNER_PROMPT_MODEL_TIMEOUT_MS,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("套图企划生图 Prompt 生成超时，请稍后重试。")), PLANNER_PROMPT_MODEL_TIMEOUT_MS);
    }),
  ]);
}

function normalizePromptSection(section: string, slot: PromptSlot): string {
  const cleaned = cleanMarkdownOutput(section);
  const hasHeading = /^##\s+/m.test(cleaned);
  const body = hasHeading
    ? cleaned
    : [
        `## 图 ${String(slot.index).padStart(2, "0")}　${slot.title}`,
        "",
        `**心理节拍**：${slot.rhythm}　|　**主标**：${slot.headline}`,
        `**场景**：${slot.scene}`,
        "",
        cleaned,
      ].join("\n");

  return body.trim();
}

function extractPromptSectionTitle(section: string, slot: PromptSlot): string {
  const match = section.match(/^##\s*图\s*\d+\s*[　\s]+(.+)$/m);
  const headingTitle = match?.[1]?.trim();

  if (headingTitle) {
    return headingTitle;
  }

  return slot.title;
}

async function generatePlannerPromptDocument(params: {
  request: string;
  productName: string;
  platform: string;
  taskType: string;
  optionId: "A" | "B" | "C";
  optionTitle: string;
  optionJson: string;
  optionSummary: string;
  systemPrompt: string;
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
  onProgress?: (event: PlannerPromptStreamEvent) => void;
}) {
  const slots = buildAgentEcomPlannerPromptSlots({
    optionJson: params.optionJson,
    taskType: params.taskType,
  });
  const optionBrief = buildOptionBrief(params.optionJson);
  const imageSlots: PromptImageSlot[] = [];
  let model: string | undefined;

  params.onProgress?.({
    type: "slots",
    current: 0,
    total: slots.length,
    message: `已解析 ${slots.length} 个图位，开始逐张生成 prompt。`,
  });

  for (const slot of slots) {
    params.onProgress?.({
      type: "slot_start",
      current: slot.index,
      total: slots.length,
      slotTitle: slot.title,
      message: `正在生成图 ${String(slot.index).padStart(2, "0")}：${slot.title}`,
    });

    const result = await generatePlannerPromptSection({
      prompt: buildSlotPrompt({
        request: params.request,
        productName: params.productName,
        platform: params.platform,
        taskType: params.taskType,
        optionId: params.optionId,
        optionTitle: params.optionTitle,
        optionBrief,
        optionSummary: params.optionSummary,
        slot,
      }),
      systemPrompt: params.systemPrompt,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
    });

    model = result.model ?? model;
    const markdownSection = normalizePromptSection(result.content, slot);
    imageSlots.push({
      index: slot.index,
      slot: extractPromptSectionTitle(markdownSection, slot),
      intent: [slot.headline, slot.scene].filter(Boolean).join("："),
      ratio: slot.aspectRatio,
      prompt: extractTextPrompt(markdownSection),
      markdownSection,
    });
    params.onProgress?.({
      type: "slot_done",
      current: slot.index,
      total: slots.length,
      slotTitle: slot.title,
      message: `已完成图 ${String(slot.index).padStart(2, "0")}：${slot.title}`,
    });
  }

  return {
    markdown: [
      buildDocumentHeader({
        productName: params.productName,
        platform: params.platform,
        taskType: params.taskType,
        optionId: params.optionId,
        optionTitle: params.optionTitle,
        slots,
        optionJson: params.optionJson,
      }),
      "",
      imageSlots.map((slot) => slot.markdownSection).join("\n\n---\n\n"),
    ].join("\n").trim(),
    imageSlots,
    model,
  };
}

type PlannerPromptStreamEvent =
  | {
      type: "start" | "slots" | "slot_start" | "slot_done" | "done";
      current?: number;
      total?: number;
      slotTitle?: string;
      message: string;
      prompt?: {
        optionId: "A" | "B" | "C";
        title: string;
        productName: string;
        platform: string;
        taskType: string;
        markdown: string;
        promptBlockCount: number;
        imageSlots: PromptImageSlot[];
      };
      model?: string;
    }
  | {
      type: "error";
      message: string;
    };

function encodePlannerPromptEvent(event: PlannerPromptStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function wantsNdjsonStream(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/x-ndjson") ?? false;
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();

  try {
    const body = (await request.json()) as PlannerPromptRequestBody;
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    const productName = typeof body.productName === "string" && body.productName.trim()
      ? body.productName.trim()
      : "套图企划";
    const platform = typeof body.platform === "string" && body.platform.trim()
      ? body.platform.trim()
      : "未指定平台";
    const taskType = typeof body.taskType === "string" && body.taskType.trim()
      ? body.taskType.trim()
      : "未指定任务";
    const optionId = parseOptionId(body.optionId);
    const optionTitle = typeof body.optionTitle === "string" && body.optionTitle.trim()
      ? body.optionTitle.trim()
      : `方案 ${optionId}`;
    const optionJson = typeof body.optionJson === "string" ? body.optionJson.trim() : "";
    const optionSummary = typeof body.optionSummary === "string" ? body.optionSummary.trim() : "";

    if (!optionJson) {
      return NextResponse.json(
        { ok: false, error: "selected option JSON is required" },
        { status: 400 },
      );
    }

    const suggestedFileName = `${sanitizeFileNamePart(productName)}_方案${optionId}_生图prompt.md`;
    const provider = parseProvider(body.provider);
    const model = typeof body.model === "string" ? body.model : undefined;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const systemPrompt = await readPromptSystemPrompt();

    if (wantsNdjsonStream(request)) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: PlannerPromptStreamEvent) => {
            controller.enqueue(encodePlannerPromptEvent(event));
          };

          void (async () => {
            try {
              send({
                type: "start",
                current: 0,
                total: 0,
                message: "已读取 SKILL.md 与 system_prompt.md 相关原文段落，准备生成生图 Prompt。",
              });

              const result = await generatePlannerPromptDocument({
                request: userRequest,
                productName,
                platform,
                taskType,
                optionId,
                optionTitle,
                optionJson,
                optionSummary,
                systemPrompt,
                provider,
                model,
                apiKey,
                onProgress: send,
              });
              const markdown = result.markdown;
              const promptBlockCount = result.imageSlots.length || countTextPromptBlocks(markdown);

              if (promptBlockCount < 1) {
                throw new Error("模型没有按 skill 第 5 步返回 ```text 生图 prompt 代码块，请重试。");
              }

              send({
                type: "done",
                message: `已生成 ${promptBlockCount} 段生图 prompt。`,
                prompt: {
                  optionId,
                  title: suggestedFileName,
                  productName,
                  platform,
                  taskType,
                  markdown,
                  promptBlockCount,
                  imageSlots: result.imageSlots,
                },
                model: result.model,
              });
            } catch (error) {
              const isTimeout = (
                error instanceof VibeApiError &&
                error.status === 504
              ) || (
                error instanceof Error &&
                /504|timed out|timeout/i.test(error.message)
              );

              send({
                type: "error",
                message: isTimeout
                  ? "套图企划第 5 步生成生图 Prompt 超时。已分段生成，但当前服务商响应过慢，请重试一次。"
                  : error instanceof Error ? error.message : "套图企划生图 Prompt 生成失败",
              });
            } finally {
              controller.close();
            }
          })();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await generatePlannerPromptDocument({
      request: userRequest,
      productName,
      platform,
      taskType,
      optionId,
      optionTitle,
      optionJson,
      optionSummary,
      systemPrompt,
      provider,
      model,
      apiKey,
    });
    const markdown = result.markdown;
    const promptBlockCount = result.imageSlots.length || countTextPromptBlocks(markdown);

    if (promptBlockCount < 1) {
      throw new Error("模型没有按 skill 第 5 步返回 ```text 生图 prompt 代码块，请重试。");
    }

    return NextResponse.json({
      ok: true,
      prompt: {
        optionId,
        title: suggestedFileName,
        request: userRequest,
        productName,
        platform,
        taskType,
        markdown,
        promptBlockCount,
        imageSlots: result.imageSlots,
      },
      model: result.model,
    });
  } catch (error) {
    console.error("[openclaw/planf/ecom/planner/prompts] failed", {
      elapsedMs: Date.now() - requestStartedAt,
      error: error instanceof Error ? error.message : error,
    });

    const isTimeout = (
      error instanceof VibeApiError &&
      error.status === 504
    ) || (
      error instanceof Error &&
      /504|timed out|timeout/i.test(error.message)
    );

    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "套图企划第 5 步生成生图 Prompt 超时。系统已按 skill 读取规则，但模型输出过长或服务商响应过慢，请重试一次。"
          : error instanceof Error ? error.message : "套图企划生图 Prompt 生成失败",
      },
      { status: 502 },
    );
  }
}
