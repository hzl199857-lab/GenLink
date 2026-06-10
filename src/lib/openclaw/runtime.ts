import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ImageApiProvider } from "@/lib/vibe";
import { generateText } from "@/lib/vibe";

import type {
  OpenClawPlanfEcomField,
  OpenClawPlanfEcomFieldSource,
  OpenClawPlanfEcomOption,
} from "./planf-ecom-session";

const DEFAULT_RULES_ROOT = path.join(
  /* turbopackIgnore: true */
  process.cwd(),
  "rules",
  "planf-canvas",
);

export type OpenClawRuntimeInput = {
  request: string;
  preset?: string;
  referenceImageCount: number;
  provider?: ImageApiProvider;
  model?: string;
  apiKey?: string;
  timeoutMs: number;
};

export type OpenClawRuntimeResult = {
  fields: OpenClawPlanfEcomField[];
  loadedFiles: string[];
  route: string;
  nextAction: string;
};

export class OpenClawRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawRuntimeError";
  }
}

type OpenClawTriage = {
  route: string;
  nextAction: string;
  skillToLoad: string;
  referenceFiles: string[];
};

const FULL_SET_8_FORM_FIELD_IDS = [
  "productName",
  "productAsset",
  "category",
  "platform",
  "sellingPoints",
  "imageSet",
  "styleMode",
  "mainColor",
] as const;

const FULL_SET_8_FORM_FIELD_ID_SET = new Set<string>(FULL_SET_8_FORM_FIELD_IDS);

const APPAREL_SELLING_POINT_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "显瘦版型", value: "slimming_fit" },
  { label: "高腰设计", value: "high_waist" },
  { label: "拉长腿部比例", value: "leg_lengthening" },
  { label: "辣妹风格", value: "hot_girl_style" },
  { label: "日常好搭", value: "daily_matching" },
  { label: "出片上镜", value: "photogenic" },
  { label: "舒适面料", value: "comfortable_fabric" },
];

const GENERAL_SELLING_POINT_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "高颜值", value: "premium_look" },
  { label: "强功能", value: "strong_function" },
  { label: "高质感", value: "premium_texture" },
  { label: "易使用", value: "easy_to_use" },
  { label: "耐用可靠", value: "durable" },
  { label: "送礼合适", value: "giftable" },
  { label: "高性价比", value: "value_for_money" },
];

function resolveRulesRoot(): string {
  return process.env.PLANF_RULES_ROOT?.trim() || DEFAULT_RULES_ROOT;
}

function normalizeRulePath(filePath: string): string | undefined {
  const raw = filePath.trim().replaceAll("/", "\\").replace(/^\\+/, "");
  const aliases: Record<string, string> = {
    "ecom-image": "skills\\ecom-image\\SKILL.md",
    "ecom-image\\SKILL.md": "skills\\ecom-image\\SKILL.md",
    "categories.md": "skills\\ecom-image\\references\\categories.md",
    "ugc-style.md": "skills\\ecom-image\\references\\ugc-style.md",
    "fashion-stylist.md": "skills\\ecom-image\\references\\fashion-stylist.md",
    "detail-page-sop.md": "skills\\ecom-image\\references\\detail-page-sop.md",
  };
  const normalized = aliases[raw] || raw;

  if (
    normalized.includes("..") ||
    path.isAbsolute(normalized) ||
    !normalized.endsWith(".md")
  ) {
    return undefined;
  }

  return normalized;
}

async function readRuleFile(relativePath: string): Promise<string> {
  const normalized = normalizeRulePath(relativePath);

  if (!normalized) {
    return "";
  }

  const fullPath = path.join(resolveRulesRoot(), ...normalized.split("\\"));

  try {
    return await readFile(fullPath, "utf8");
  } catch {
    return "";
  }
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new OpenClawRuntimeError(`runtime timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    task
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timeout));
  });
}

function extractJsonObject(value: string): Record<string, unknown> | undefined {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? value;
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

function findJsonObjectEnd(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractFormFieldsObject(value: string): Record<string, unknown> | undefined {
  const fenced = value.match(/```(?:json|form-fields)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? value;
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const marker = source.indexOf("form-fields", searchFrom);

    if (marker < 0) {
      return undefined;
    }

    const start = source.lastIndexOf("{", marker);

    if (start < 0) {
      searchFrom = marker + "form-fields".length;
      continue;
    }

    const end = findJsonObjectEnd(source, start);

    if (end < 0) {
      searchFrom = marker + "form-fields".length;
      continue;
    }

    try {
      const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).type === "form-fields"
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Continue searching; earlier text may contain non-protocol JSON snippets.
    }

    searchFrom = marker + "form-fields".length;
  }

  return undefined;
}

function extractJsonArray(value: string): unknown[] | undefined {
  const fenced = value.match(/```(?:json|form-fields)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? value;
  const object = extractFormFieldsObject(source) ?? extractJsonObject(source);
  const objectFields = object
    ? (
        Array.isArray(object.fields)
          ? object.fields
          : Array.isArray(object.formFields)
            ? object.formFields
            : object.data &&
              typeof object.data === "object" &&
              Array.isArray((object.data as Record<string, unknown>).fields)
                ? (object.data as Record<string, unknown>).fields as unknown[]
                : undefined
      )
    : undefined;

  if (objectFields) {
    return objectFields;
  }

  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");

  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;

    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseFieldOption(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return typeof record.label === "string" && typeof record.value === "string"
    ? { label: record.label, value: record.value }
    : undefined;
}

function parseFieldSource(value: unknown): OpenClawPlanfEcomFieldSource | undefined {
  return value === "user_explicit" ||
    value === "model_suggested" ||
    value === "default_guess"
    ? value
    : undefined;
}

function parseOpenClawFormFieldArray(value: string): OpenClawPlanfEcomField[] | undefined {
  const rawFields = extractJsonArray(value);

  if (!rawFields?.length) {
    return undefined;
  }

  const fields = rawFields.flatMap((field): OpenClawPlanfEcomField[] => {
    if (!field || typeof field !== "object") {
      return [];
    }

    const record = field as Record<string, unknown>;
    const id = typeof record.id === "string"
      ? record.id
      : typeof record.name === "string"
        ? record.name
        : "";
    const label = typeof record.label === "string" ? record.label : "";
    const type = typeof record.type === "string" ? record.type : "";
    const required = record.required === true;
    const source = parseFieldSource(record.source);

    if (!id || !label) {
      return [];
    }

    if (type === "text") {
      return [{
        id,
        label,
        type,
        value: typeof record.value === "string" ? record.value : "",
        required,
        placeholder: typeof record.placeholder === "string" ? record.placeholder : undefined,
        source,
      }];
    }

    if (type === "upload" && record.accept === "image") {
      return [{
        id,
        label,
        type,
        value: "",
        accept: "image",
        required,
        hint: typeof record.hint === "string" ? record.hint : "上传产品图作为一致性锚点。",
      }];
    }

    if (type === "upload") {
      return [{
        id,
        label,
        type,
        value: "",
        accept: "image",
        required,
        hint: typeof record.hint === "string" ? record.hint : "上传产品图作为一致性锚点。",
      }];
    }

    if (type === "select") {
      const options = Array.isArray(record.options)
        ? record.options.flatMap((option) => {
            const parsed = parseFieldOption(option);

            return parsed ? [parsed] : [];
          })
        : [];

      if (!options.length) {
        return [];
      }

      return [{
        id,
        label,
        type,
        value: typeof record.default === "string" ? record.default : options[0].value,
        options,
        required,
        hint: typeof record.hint === "string" ? record.hint : undefined,
        source,
      }];
    }

    if (type === "multi-select") {
      const options = Array.isArray(record.options)
        ? record.options.flatMap((option) => {
            const parsed = parseFieldOption(option);

            return parsed ? [parsed] : [];
          })
        : [];

      if (!options.length) {
        return [];
      }

      return [{
        id,
        label,
        type,
        value: Array.isArray(record.value)
          ? record.value.filter((item): item is string => typeof item === "string")
          : [],
        options,
        required,
        maxSelected: typeof record.maxSelect === "number" ? record.maxSelect : 3,
        minSelected: typeof record.minSelect === "number" ? record.minSelect : undefined,
        source,
      }];
    }

    return [];
  });

  return fields.length ? fields : undefined;
}

function hasCoreEcomFields(fields: OpenClawPlanfEcomField[]): boolean {
  return fields.some((field) => field.id === "productName") &&
    fields.some((field) => field.id === "category") &&
    fields.some((field) => field.id === "platform");
}

function summarizeFieldIds(fields: OpenClawPlanfEcomField[] | undefined): string {
  return fields?.length
    ? fields.map((field) => field.id).join(", ")
    : "none";
}

function isDefaultFullSetPreset(input: OpenClawRuntimeInput): boolean {
  return input.preset === "full-set-8";
}

function getDefaultFullSetFormIssue(fields: OpenClawPlanfEcomField[]): string | undefined {
  const fieldIds = fields.map((field) => field.id);
  const missing = FULL_SET_8_FORM_FIELD_IDS.filter((id) => !fieldIds.includes(id));
  const extra = fieldIds.filter((id) => !FULL_SET_8_FORM_FIELD_ID_SET.has(id));

  if (missing.length || extra.length) {
    return [
      missing.length ? `missing=${missing.join(",")}` : "",
      extra.length ? `extra=${extra.join(",")}` : "",
    ].filter(Boolean).join(" | ");
  }

  return undefined;
}

function normalizeDefaultFullSetFields(
  fields: OpenClawPlanfEcomField[],
): OpenClawPlanfEcomField[] {
  return FULL_SET_8_FORM_FIELD_IDS.flatMap((id) => {
    const field = fields.find((candidate) => candidate.id === id);

    return field ? [field] : [];
  });
}

function splitTextSellingPoints(value: string): string[] {
  return value
    .split(/[、/，,;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSellingPointsField(
  field: OpenClawPlanfEcomField,
  preset?: string,
): OpenClawPlanfEcomField {
  if (field.id !== "sellingPoints" || preset === "detail-page-pack") {
    return field;
  }

  if (field.source === "user_explicit") {
    if (field.type === "text") {
      return field;
    }

    const selectedLabels = field.type === "multi-select"
      ? field.options
          .filter((option) => field.value.includes(option.value))
          .map((option) => option.label)
      : [];

    return {
      id: field.id,
      label: field.label || "核心卖点",
      type: "text",
      value: selectedLabels.join("、"),
      required: field.required,
      source: field.source,
    };
  }

  if (field.source === "default_guess") {
    return {
      id: field.id,
      label: field.label || "核心卖点",
      type: "text",
      value: field.type === "text" ? field.value : "",
      required: true,
      placeholder: "请写下 1-3 个主打卖点，例如：透气、轻量、防晒、可调节。",
      source: field.source,
    };
  }

  if (field.source === "model_suggested" && field.type === "multi-select" && field.options.length) {
    const optionMap = new Map<string, OpenClawPlanfEcomOption>();

    for (const option of field.options) {
      optionMap.set(option.value, option);
    }

    const options = Array.from(optionMap.values());
    const values = field.value.filter((value) =>
      options.some((option) => option.value === value),
    );

    return {
      ...field,
      label: field.label || "核心卖点",
      value: values.length
        ? values
        : options.slice(0, field.maxSelected).map((option) => option.value),
      options,
    };
  }

  const baseOptions = preset === "ugc-lifestyle" || preset === "editorial-stylist"
    ? APPAREL_SELLING_POINT_OPTIONS
    : GENERAL_SELLING_POINT_OPTIONS;
  const existingOptions = "options" in field ? field.options : [];
  const textValues = field.type === "text" ? splitTextSellingPoints(field.value) : [];
  const textOptions = textValues.map((item) => ({
    label: item,
    value: `custom_${item}`,
  }));
  const optionMap = new Map<string, { label: string; value: string }>();

  for (const option of [...baseOptions, ...existingOptions, ...textOptions]) {
    optionMap.set(option.value, option);
  }

  const options = Array.from(optionMap.values());
  const existingValues = field.type === "multi-select"
    ? field.value.filter((value) => options.some((option) => option.value === value))
    : textOptions.map((option) => option.value);

  return {
    id: field.id,
    label: field.label || "核心卖点",
    type: "multi-select",
    value: existingValues.length ? existingValues : options.slice(0, 3).map((option) => option.value),
    options,
    required: field.required,
    maxSelected: field.type === "multi-select" ? field.maxSelected : 3,
    minSelected: field.type === "multi-select" ? field.minSelected : undefined,
    source: field.source,
  };
}

export function normalizeOpenClawFormFieldsForPreset(
  fields: OpenClawPlanfEcomField[],
  preset?: string,
): OpenClawPlanfEcomField[] {
  return fields.map((field) => normalizeSellingPointsField(field, preset));
}

function previewModelOutput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function parseOpenClawFormFields(value: string): OpenClawPlanfEcomField[] | undefined {
  const fields = parseOpenClawFormFieldArray(value);

  return fields && hasCoreEcomFields(fields) ? fields : undefined;
}

function parseTriage(value: string): OpenClawTriage | undefined {
  const record = extractJsonObject(value);

  if (!record) {
    return undefined;
  }

  const route = typeof record.route === "string" ? record.route : "";
  const nextAction = typeof record.nextAction === "string" ? record.nextAction : "";
  const skillToLoad = typeof record.skillToLoad === "string" ? record.skillToLoad : "";
  const rawReferenceFiles = Array.isArray(record.referenceFiles)
    ? record.referenceFiles
    : Array.isArray(record.references)
      ? record.references
      : Array.isArray(record.filesToLoad)
        ? record.filesToLoad
        : [];
  const referenceFiles = rawReferenceFiles.flatMap((item) => {
        if (typeof item !== "string") {
          return [];
        }

        const normalized = normalizeRulePath(item);

        return normalized ? [normalized] : [];
      });
  const normalizedSkill = normalizeRulePath(skillToLoad);

  return route && nextAction && normalizedSkill
    ? {
        route,
        nextAction,
        skillToLoad: normalizedSkill,
        referenceFiles: referenceFiles.length
          ? referenceFiles
          : ["skills\\ecom-image\\references\\categories.md"],
      }
    : undefined;
}

async function runTriage(input: OpenClawRuntimeInput): Promise<OpenClawTriage | undefined> {
  const [identityOverride, agents, bootstrap] = await Promise.all([
    readFile(path.join(process.cwd(), "rules", "genlink-overrides", "IDENTITY.md"), "utf8").catch(() => ""),
    readRuleFile("AGENTS.md"),
    readRuleFile("BOOTSTRAP.md"),
  ]);
  const result = await generateText({
    provider: input.provider,
    model: input.model === "auto" ? undefined : input.model,
    apiKey: input.apiKey,
    temperature: 0,
    maxTokens: 900,
    systemPrompt: [
      "你是 GenLink 内部的 OpenClaw runtime triage。",
      "必须遵守 GenLink Runtime Identity Override 的命名映射。",
      "你必须只输出 JSON object，不输出 Markdown 或解释。",
      "先根据 AGENTS.md 与 BOOTSTRAP.md 判断 route、nextAction、skillToLoad、referenceFiles。",
      "skillToLoad/referenceFiles 必须是 rules 根目录下的相对 .md 文件路径。",
      "不要泄露评分中间过程。",
    ].join("\n"),
    prompt: [
      `用户需求：${input.request}`,
      `用户点击入口：${input.preset ?? "-"}`,
      `参考图数量：${input.referenceImageCount}`,
      "",
      "输出 JSON schema:",
      `{"route":"ecomImageTrack","nextAction":"await-form-submit","skillToLoad":"skills/ecom-image/SKILL.md","referenceFiles":["skills/ecom-image/references/categories.md"]}`,
      "",
      "## GenLink Runtime Identity Override",
      identityOverride.slice(0, 5000),
      "",
      "## AGENTS.md",
      agents.slice(0, 12000),
      "",
      "## BOOTSTRAP.md",
      bootstrap.slice(0, 10000),
    ].join("\n"),
  });

  return parseTriage(result.content);
}

async function runFormFields(
  input: OpenClawRuntimeInput,
  triage: OpenClawTriage,
): Promise<OpenClawRuntimeResult | undefined> {
  const uniqueFiles = Array.from(new Set([
    triage.skillToLoad,
    ...triage.referenceFiles,
  ]));
  const docs = await Promise.all(uniqueFiles.map(async (file) => ({
    file,
    content: await readRuleFile(file),
  })));
  const identityOverride = await readFile(
    path.join(process.cwd(), "rules", "genlink-overrides", "IDENTITY.md"),
    "utf8",
  ).catch(() => "");
  const result = await generateText({
    provider: input.provider,
    model: input.model === "auto" ? undefined : input.model,
    apiKey: input.apiKey,
    temperature: 0.1,
    maxTokens: 2200,
    systemPrompt: [
      "你是 GenLink 内部的 OpenClaw/RH form-fields 协议生成器。",
      "必须遵守 GenLink Runtime Identity Override 的命名映射。",
      "你必须读取已加载 skill 与 references，并只输出 form-fields JSON。",
      "优先输出 {\"type\":\"form-fields\",\"fields\":[...]}，fields 数组元素必须是字段对象。",
      "禁止输出解释、Markdown、thinking、creative-doc 或 workflow-json。",
      "字段类型只能是 text、select、multi-select、upload。",
      "select 和 multi-select 的 options 必须是 {label,value}。",
      "必须至少包含 productName、category、platform。",
      "sellingPoints 字段必须带 source：user_explicit | model_suggested | default_guess。",
      "source=user_explicit 仅用于用户原文明确给出 1-3 个卖点/利益点；此时 sellingPoints 用 type=text 并保留用户原文卖点。",
      "source=model_suggested 用于可根据知名产品/类目提出可信候选卖点；此时 sellingPoints 用 type=multi-select。",
      "source=default_guess 用于只有泛产品名且主打方向商业上不确定；此时 sellingPoints 用 type=text、value 为空，让用户输入。",
      "如果当前 skill 规则要求详情页、UGC 或造型师增量字段，必须追加。",
      "当用户点击入口是 full-set-8，且没有详情页/UGC/造型师标签或关键词时，必须严格使用 ecom-image/SKILL.md §6.2 通用主图 / 套图 form-fields。",
      "full-set-8 只允许字段 id：productName、productAsset、category、platform、sellingPoints、imageSet、styleMode、mainColor。",
      "full-set-8 禁止追加详情页字段或共享 brief 字段，包括 mainTitle、subTitle、language、copyMode、styleDirection、scenarioPreference、deliverySpec。",
    ].join("\n"),
    prompt: [
      `用户需求：${input.request}`,
      `用户点击入口：${input.preset ?? "-"}`,
      `route：${triage.route}`,
      `nextAction：${triage.nextAction}`,
      `参考图数量：${input.referenceImageCount}`,
      "",
      `## GenLink Runtime Identity Override\n${identityOverride.slice(0, 5000)}`,
      "",
      ...docs.map((doc) => `## ${doc.file}\n${doc.content.slice(0, 14000)}`),
    ].join("\n\n"),
  });
  const fields = parseOpenClawFormFields(result.content);
  const formIssue = fields && isDefaultFullSetPreset(input)
    ? getDefaultFullSetFormIssue(fields)
    : undefined;

  if (!fields || formIssue) {
    const partialFields = parseOpenClawFormFieldArray(result.content);
    const repair = await generateText({
      provider: input.provider,
      model: input.model === "auto" ? undefined : input.model,
      apiKey: input.apiKey,
      temperature: 0,
      maxTokens: 1800,
      systemPrompt: [
        "你是 GenLink 内部的 OpenClaw form-fields 协议修复器。",
        "你必须只输出 {\"type\":\"form-fields\",\"fields\":[...]} JSON。",
        "修复目标：必须包含 productName、category、platform 三个字段。",
        "字段类型只能是 text、select、multi-select、upload。",
        "select 和 multi-select 的 options 必须是 {label,value}。",
        "如果用户点击入口是 full-set-8，必须严格修复为 ecom-image/SKILL.md §6.2 通用主图 / 套图表单。",
        "full-set-8 只允许字段 id：productName、productAsset、category、platform、sellingPoints、imageSet、styleMode、mainColor。",
        "full-set-8 禁止输出 mainTitle、subTitle、language、copyMode、styleDirection、scenarioPreference、deliverySpec。",
        "不要输出解释、Markdown、thinking、creative-doc 或 workflow-json。",
      ].join("\n"),
      prompt: [
        `用户需求：${input.request}`,
        `用户点击入口：${input.preset ?? "-"}`,
        `route：${triage.route}`,
        `nextAction：${triage.nextAction}`,
        `参考图数量：${input.referenceImageCount}`,
        "",
        `上一轮输出未通过校验，原因：${formIssue ?? "缺少 productName/category/platform 中的至少一个字段。"}`,
        "上一轮可解析字段：",
        JSON.stringify(partialFields ?? [], null, 2),
        "",
        "请补齐并输出完整 form-fields。category 使用 ecom-image 的 9 类目 select；platform 使用平台 select。",
      ].join("\n"),
    });
    const repairedFields = parseOpenClawFormFields(repair.content);
    const repairIssue = repairedFields && isDefaultFullSetPreset(input)
      ? getDefaultFullSetFormIssue(repairedFields)
      : undefined;

    if (repairedFields && !repairIssue) {
      return {
        fields: isDefaultFullSetPreset(input)
          ? normalizeDefaultFullSetFields(repairedFields)
          : repairedFields,
        loadedFiles: uniqueFiles,
        route: triage.route,
        nextAction: triage.nextAction,
      };
    }

    throw new OpenClawRuntimeError([
      "form-fields repair failed core field validation",
      `firstFieldIds=${summarizeFieldIds(partialFields)}`,
      `repairFieldIds=${summarizeFieldIds(parseOpenClawFormFieldArray(repair.content))}`,
      repairIssue ? `repairIssue=${repairIssue}` : "",
      `firstOutput=${previewModelOutput(result.content)}`,
      `repairOutput=${previewModelOutput(repair.content)}`,
    ].filter(Boolean).join(" | "));
  }

  return fields
    ? {
        fields: isDefaultFullSetPreset(input)
          ? normalizeDefaultFullSetFields(fields)
          : fields,
        loadedFiles: uniqueFiles,
        route: triage.route,
        nextAction: triage.nextAction,
      }
    : undefined;
}

export async function runOpenClawFormFields(
  input: OpenClawRuntimeInput,
): Promise<OpenClawRuntimeResult | undefined> {
  if (!input.apiKey) {
    return undefined;
  }

  return withTimeout((async () => {
    const triage = await runTriage(input);

    if (!triage) {
      throw new OpenClawRuntimeError("triage did not return route / nextAction / skillToLoad JSON");
    }

    if (triage.route !== "ecomImageTrack") {
      throw new OpenClawRuntimeError(`triage returned unsupported route: ${triage.route}`);
    }

    const result = await runFormFields(input, triage);

    return result;
  })(), input.timeoutMs);
}
