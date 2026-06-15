import type { AgentEcomPlannerPromptImageSlot, AgentTaskAttachment } from "@/types/agent";

export const ECOM_PLANNER_PRESET_ID = "ecom-planner" as const;

export type AgentEcomPlannerAttachmentRole = "product" | "benchmark";

export type AgentEcomPlannerOption = {
  id: "A" | "B" | "C";
  title: string;
  positioning: string;
  visualDirection: string;
  sellingPointStrategy: string;
  imagePlan: string[];
  benchmarkUsage: string;
  workflowPrompt: string;
  uiSummary?: {
    coreDifference: string;
    visualKeyword: string;
    sellingPointFocus: string;
    scenarioMood: string;
    bestFor: string;
  };
  detailSections?: Array<{ title: string; content: string }>;
  rawOptionJson?: string;
};

export type AgentEcomPlannerSharedContext = {
  anchorMode?: string;
  diagnosticLog?: unknown;
  productDNA?: unknown;
  visualAnchor?: unknown;
  differentiationMatrix?: unknown;
  optionSkeletons?: unknown;
  raw?: UnknownRecord;
};

export type AgentEcomPlannerOptionsResult = {
  productName: string;
  platform: string;
  taskType: string;
  sellingPoints: string;
  targetAudience: string;
  stylePreference: string;
  imageQuantity: string;
  benchmarkNote: string;
  productImageCount: number;
  benchmarkImageCount: number;
  options: AgentEcomPlannerOption[];
  sharedPlannerContext?: AgentEcomPlannerSharedContext;
};

type UnknownRecord = Record<string, unknown>;

export const ECOM_PLANNER_MAX_PROMPT_SLOTS = 10;

export type AgentEcomPlannerPromptDisplayBlock = {
  index: number;
  heading: string;
  intent: string;
  ratio: string;
  prompt: string;
};

export type AgentEcomPlannerPromptSlot = {
  index: number;
  title: string;
  rhythm: string;
  headline: string;
  scene: string;
  aspectRatio: "1:1" | "3:4";
};

export const ECOM_PLANNER_PROMPT_TEMPLATE = [
  "平台：[如：淘宝]",
  "任务类型：[如：主图 + 详情页]",
  "产品：[如：XX显示器]",
  "核心卖点：[如：4K 144Hz / 护眼低蓝光 / 27英寸 IPS]",
  "目标人群：[如：电竞玩家 / 设计师 / 办公白领]",
  "风格倾向：[如：科技感 / 极简商务 / 电竞氛围]（可不填，系统会自动发散）",
  "对标图参考点：[如：参考它的桌面场景、暗色光影、文字排版，不参考产品本体]",
  "图片数量：主图5张 + 详情页8张（可不填，系统会按平台默认推演）",
].join("\n");

export function getAgentEcomPlannerAttachmentRole(
  attachment: AgentTaskAttachment,
): AgentEcomPlannerAttachmentRole {
  return attachment.ecomPlannerRole === "benchmark" ? "benchmark" : "product";
}

export function limitAgentEcomPlannerPromptSlots<T>(slots: T[]): T[] {
  return slots.slice(0, ECOM_PLANNER_MAX_PROMPT_SLOTS);
}

export function buildAgentEcomPlannerPromptDisplayBlocks(
  slots: AgentEcomPlannerPromptImageSlot[],
): AgentEcomPlannerPromptDisplayBlock[] {
  return slots.map((slot, index) => {
    const displayIndex = slot.index > 0 ? slot.index : index + 1;

    return {
      index: displayIndex,
      heading: `图 ${String(displayIndex).padStart(2, "0")}　${slot.slot}`,
      intent: slot.intent,
      ratio: slot.ratio,
      prompt: slot.prompt.trim(),
    };
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyUnknownValue).filter(Boolean).join(" / ");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => {
        const rendered = stringifyUnknownValue(nestedValue);

        return rendered ? `${key}: ${rendered}` : "";
      })
      .filter(Boolean)
      .join(" / ");
  }

  return "";
}

function readPlannerOptionBody(optionJson: string): UnknownRecord {
  try {
    const parsed = JSON.parse(optionJson) as unknown;

    if (!isRecord(parsed)) {
      return {};
    }

    return isRecord(parsed.option) ? parsed.option : parsed;
  } catch {
    return {};
  }
}

function readPlannerTextField(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = stringifyUnknownValue(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function parseImageQuantityParts(text: string): { main: number; detail: number } {
  const mainMatch = text.match(/主图\s*(\d+)\s*张?/i);
  const detailMatch = text.match(/详情(?:页|图)?\s*(\d+)\s*张?/i);

  return {
    main: mainMatch ? Math.max(0, Number(mainMatch[1])) : 0,
    detail: detailMatch ? Math.max(0, Number(detailMatch[1])) : 0,
  };
}

function normalizePlannerPromptSlotFromUnknown(
  item: unknown,
  index: number,
  taskType: string,
): AgentEcomPlannerPromptSlot {
  const record = isRecord(item) ? item : {};
  const text = stringifyUnknownValue(item);
  const title = readPlannerTextField(record, ["标题", "图位", "name", "title", "label", "slot"]) ||
    text.split(/[。；\n]/)[0]?.trim() ||
    `图 ${String(index + 1).padStart(2, "0")}`;
  const headline = readPlannerTextField(record, ["主标", "主标题", "headline", "title", "文案"]) || title;
  const scene = readPlannerTextField(record, ["场景", "画面", "description", "intent", "说明", "目的"]) ||
    text ||
    title;
  const aspectRatioText = readPlannerTextField(record, ["比例", "画幅", "aspectRatio", "ratio"]);
  const aspectRatio = /3\s*:\s*4|竖|详情|detail/i.test(`${aspectRatioText} ${title} ${taskType}`) ? "3:4" : "1:1";
  const rhythms = ["看见", "心动", "兴趣", "确信", "决定"];

  return {
    index: index + 1,
    title,
    rhythm: readPlannerTextField(record, ["心理节拍", "节拍", "rhythm"]) || rhythms[Math.min(index, rhythms.length - 1)],
    headline,
    scene,
    aspectRatio,
  };
}

export function buildAgentEcomPlannerPromptSlots(input: {
  optionJson: string;
  taskType: string;
}): AgentEcomPlannerPromptSlot[] {
  const optionBody = readPlannerOptionBody(input.optionJson);
  const rawPlan = optionBody.imagePlan ?? optionBody["图片规划"] ?? optionBody["图位规划"] ?? optionBody["下游执行图位"];

  if (Array.isArray(rawPlan) && rawPlan.length) {
    return limitAgentEcomPlannerPromptSlots(rawPlan)
      .map((item, index) => normalizePlannerPromptSlotFromUnknown(item, index, input.taskType));
  }

  const quantityText = [
    readPlannerTextField(optionBody, ["期望图片数量", "图片数量", "图数", "数量"]),
    input.taskType,
  ].filter(Boolean).join(" ");
  const quantity = parseImageQuantityParts(quantityText);
  const mainCount = quantity.main;
  const detailCount = quantity.detail;

  if (mainCount > 0 || detailCount > 0) {
    const rhythms = ["看见", "心动", "兴趣", "确信", "确信", "确信", "决定", "决定", "决定", "决定"];
    const slots = [
      ...Array.from({ length: mainCount }, (_, index) => {
        return {
          index: index + 1,
          title: "主图",
          rhythm: rhythms[index] ?? "确信",
          headline: "由模型根据选中方案和本图内容生成具体主标题",
          scene: `第 ${index + 1} 张主图，必须根据选中方案生成唯一具体画面主题；不要使用固定模板标题。`,
          aspectRatio: "1:1" as const,
        };
      }),
      ...Array.from({ length: detailCount }, (_, index) => {
        const globalIndex = mainCount + index;

        return {
          index: globalIndex + 1,
          title: "详情页",
          rhythm: rhythms[globalIndex] ?? "确信",
          headline: "由模型根据选中方案和本图内容生成具体主标题",
          scene: `第 ${index + 1} 张详情页，必须根据选中方案生成唯一具体画面主题；不要使用固定模板标题。`,
          aspectRatio: "3:4" as const,
        };
      }),
    ];

    return limitAgentEcomPlannerPromptSlots(slots);
  }

  throw new Error("套图企划 Step 5 缺少明确图位规划或图片数量，无法生成生图 Prompt。");
}

export function hasAgentEcomPlannerProductImage(
  attachments: AgentTaskAttachment[],
): boolean {
  return attachments.some((attachment) => (
    getAgentEcomPlannerAttachmentRole(attachment) === "product"
  ));
}

export function getAgentEcomPlannerProductAttachments(
  attachments: AgentTaskAttachment[],
): AgentTaskAttachment[] {
  return attachments.filter((attachment) => (
    getAgentEcomPlannerAttachmentRole(attachment) === "product"
  ));
}

export function getAgentEcomPlannerSubmitBlockReason(input: {
  active: boolean;
  attachments: AgentTaskAttachment[];
}): string | undefined {
  if (!input.active || hasAgentEcomPlannerProductImage(input.attachments)) {
    return undefined;
  }

  const hasBenchmark = input.attachments.some((attachment) => (
    getAgentEcomPlannerAttachmentRole(attachment) === "benchmark"
  ));

  return hasBenchmark
    ? "对标图只能参考风格，不能替代产品图。请先上传产品图。"
    : "请先上传产品图，套图企划需要先识别产品外形、材质、颜色和品牌信息。";
}

function stripTemplateValue(value: string): string {
  return value
    .trim()
    .replace(/^[[【]\s*(?:如|例如)[:：]\s*/u, "")
    .replace(/[】\]]$/u, "")
    .trim();
}

function readBriefField(prompt: string, label: string, fallback: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = prompt.match(new RegExp(`^\\s*${escapedLabel}\\s*[:：]\\s*(.+?)\\s*$`, "imu"));
  const value = match?.[1] ? stripTemplateValue(match[1]) : "";

  return value || fallback;
}

function countAttachmentsByRole(
  attachments: AgentTaskAttachment[],
  role: AgentEcomPlannerAttachmentRole,
): number {
  return attachments.filter((attachment) => getAgentEcomPlannerAttachmentRole(attachment) === role).length;
}

export function buildAgentEcomPlannerOptions(input: {
  prompt: string;
  attachments: AgentTaskAttachment[];
}): AgentEcomPlannerOptionsResult {
  const platform = readBriefField(input.prompt, "平台", "淘宝");
  const taskType = readBriefField(input.prompt, "任务类型", "主图 + 详情页");
  const productName = readBriefField(input.prompt, "产品", "产品");
  const sellingPoints = readBriefField(input.prompt, "核心卖点", "核心卖点待用户补充");
  const targetAudience = readBriefField(input.prompt, "目标人群", "平台目标用户");
  const stylePreference = readBriefField(input.prompt, "风格倾向", "系统自动发散");
  const benchmarkNote = readBriefField(
    input.prompt,
    "对标图参考点",
    "仅参考风格、光影、版式和空间感，不复制竞品产品本体",
  );
  const imageQuantity = readBriefField(input.prompt, "图片数量", "按平台默认推演");
  const productImageCount = countAttachmentsByRole(input.attachments, "product");
  const benchmarkImageCount = countAttachmentsByRole(input.attachments, "benchmark");
  const benchmarkUsage = benchmarkImageCount > 0
    ? `已接入 ${benchmarkImageCount} 张对标图，只参考${benchmarkNote}。`
    : "未上传对标图，风格将根据平台、品类和卖点自动发散。";

  const optionSeeds: Array<Pick<AgentEcomPlannerOption, "id" | "positioning" | "visualDirection" | "sellingPointStrategy">> = [
    {
      id: "A",
      positioning: "高转化参数主导：先建立产品可信度，再用关键参数完成决策推动。",
      visualDirection: `${stylePreference}，偏清爽科技、强信息层级、产品大面积露出。`,
      sellingPointStrategy: `把 ${sellingPoints} 拆成首屏强卖点、参数证明和使用收益三层。`,
    },
    {
      id: "B",
      positioning: "真实场景体验主导：让用户先代入使用空间，再理解产品能力。",
      visualDirection: `${stylePreference}，偏桌面场景、空间光影、办公与生活方式结合。`,
      sellingPointStrategy: `围绕 ${targetAudience} 的痛点，把参数翻译成效率、舒适度和长期使用价值。`,
    },
    {
      id: "C",
      positioning: "品牌氛围差异化主导：用更强视觉记忆点拉开同质化商品距离。",
      visualDirection: `${stylePreference}，偏品牌海报感、暗亮对比、节奏更强的版式。`,
      sellingPointStrategy: `用 ${sellingPoints} 做系列化主视觉钩子，兼顾主图点击率和详情页连续阅读。`,
    },
  ];

  const options = optionSeeds.map((seed) => {
    const title = `${seed.id} 方案｜${productName}${seed.id === "A" ? "参数信任套图" : seed.id === "B" ? "场景体验套图" : "氛围拉新套图"}`;
    const imagePlan = [
      `主图 1：${productName} 核心视觉，突出第一决策卖点和平台点击率。`,
      "主图 2：关键参数/结构信息图，减少用户理解成本。",
      "主图 3：使用场景图，把卖点转换成实际收益。",
      "主图 4：细节特写图，强调材质、接口、工艺或品牌识别。",
      "主图 5：对比/人群/购买理由收束图，承接详情页继续转化。",
      `详情页：按 ${imageQuantity} 拆成痛点、卖点、证明、场景、参数、售后信任模块。`,
    ];
    const workflowPrompt = [
      `套图企划方案 ${seed.id}：${title}`,
      `平台：${platform}`,
      `任务类型：${taskType}`,
      `产品：${productName}`,
      `核心卖点：${sellingPoints}`,
      `目标人群：${targetAudience}`,
      `定位：${seed.positioning}`,
      `视觉方向：${seed.visualDirection}`,
      `卖点策略：${seed.sellingPointStrategy}`,
      `图片规划：${imagePlan.join(" / ")}`,
      `对标图处理：${benchmarkUsage}`,
    ].join("\n");

    return {
      ...seed,
      title,
      imagePlan,
      benchmarkUsage,
      workflowPrompt,
    };
  });

  return {
    productName,
    platform,
    taskType,
    sellingPoints,
    targetAudience,
    stylePreference,
    imageQuantity,
    benchmarkNote,
    productImageCount,
    benchmarkImageCount,
    options,
  };
}

export function buildAgentEcomPlannerOptionWorkflowPrompt(
  option: AgentEcomPlannerOption,
): string {
  return option.workflowPrompt;
}

export function buildAgentEcomPlannerSingleOptionResult(input: {
  optionId: AgentEcomPlannerOption["id"];
  prompt: string;
  attachments: AgentTaskAttachment[];
}): AgentEcomPlannerOptionsResult {
  const result = buildAgentEcomPlannerOptions({
    prompt: input.prompt,
    attachments: input.attachments,
  });
  const selectedOption = result.options.find((option) => option.id === input.optionId) ?? result.options[0];

  return {
    ...result,
    options: selectedOption ? [selectedOption] : [],
  };
}

function readStringField(record: UnknownRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function readStringFieldFromRecords(records: Array<UnknownRecord | undefined>, keys: string[], fallback = ""): string {
  for (const record of records) {
    if (!record) {
      continue;
    }

    const value = readStringField(record, keys);

    if (value) {
      return value;
    }
  }

  return fallback;
}

function stringifyDetailValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(stringifyDetailValue).filter(Boolean).join("\n");
  }

  if (isRecord(value)) {
    return JSON.stringify(value, null, 2);
  }

  return "";
}

function readDetailSection(record: UnknownRecord, key: string): { title: string; content: string } | undefined {
  const content = stringifyDetailValue(record[key]);

  return content ? { title: key, content } : undefined;
}

function readRecordField(record: UnknownRecord, keys: string[]): UnknownRecord | undefined {
  for (const key of keys) {
    const value = record[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeSharedPlannerContext(parsed: UnknownRecord): AgentEcomPlannerSharedContext | undefined {
  const source = readRecordField(parsed, [
    "_shared_planner_context",
    "sharedPlannerContext",
    "shared_planner_context",
    "共享企划上下文",
    "共享推演结果",
  ]);

  if (!source) {
    return undefined;
  }

  return {
    anchorMode: readStringField(source, ["anchorMode", "mode", "锚点模式", "风格锚点", "当前模式"]),
    diagnosticLog: source.diagnosticLog ?? source["_system_diagnostic_log"] ?? source["诊断日志"],
    productDNA: source.productDNA ?? source["产品DNA"] ?? source["产品物理DNA"],
    visualAnchor: source.visualAnchor ?? source["视觉锚点"] ?? source["参考图视觉向量"],
    differentiationMatrix: source.differentiationMatrix ?? source["差异矩阵"] ?? source["ABC差异矩阵"],
    optionSkeletons: source.optionSkeletons ?? source["方案骨架"] ?? source["ABC方案骨架"],
    raw: source,
  };
}

function normalizeOptionTitle(label: string, fallback: string): string {
  return label
    .replace(/^方案\s*[ABC]\s*[-—|｜:：]\s*/u, "")
    .trim() || fallback;
}

function readOptionIdFromLabel(label: string): AgentEcomPlannerOption["id"] | undefined {
  const match = label.match(/方案\s*([ABC])/iu);
  const id = match?.[1]?.toUpperCase();

  return id === "A" || id === "B" || id === "C" ? id : undefined;
}

function cleanPlannerUiText(value: string, maxLength = 96): string {
  const cleaned = value
    .replace(/[{}"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/；+/g, '；')
    .trim();

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

function normalizePlannerUiSummary(
  option: UnknownRecord,
  optionBody: UnknownRecord,
  fallback: AgentEcomPlannerOption,
): NonNullable<AgentEcomPlannerOption["uiSummary"]> {
  const source = readRecordField(optionBody, ["ui_summary", "UI摘要", "前端摘要", "方案摘要"]) ??
    readRecordField(option, ["ui_summary", "UI摘要", "前端摘要", "方案摘要"]);

  const visualStyleSection = stringifyDetailValue(optionBody["视觉风格与光影"]);
  const productInfoSection = stringifyDetailValue(optionBody["产品信息"]);
  const layoutSection = stringifyDetailValue(optionBody["版式语言与排版哲学"]);

  return {
    coreDifference: cleanPlannerUiText(readStringField(
      source ?? {},
      ["coreDifference", "核心差异", "差异定位", "一句话定位"],
      fallback.positioning,
    )),
    visualKeyword: cleanPlannerUiText(readStringField(
      source ?? {},
      ["visualKeyword", "视觉关键词", "视觉风格", "画面风格"],
      visualStyleSection || fallback.visualDirection,
    )),
    sellingPointFocus: cleanPlannerUiText(readStringField(
      source ?? {},
      ["sellingPointFocus", "卖点重点", "主打卖点", "转化重点"],
      productInfoSection || fallback.sellingPointStrategy,
    )),
    scenarioMood: cleanPlannerUiText(readStringField(
      source ?? {},
      ["scenarioMood", "场景氛围", "使用场景", "氛围"],
      layoutSection || fallback.visualDirection,
    )),
    bestFor: cleanPlannerUiText(readStringField(
      source ?? {},
      ["bestFor", "适合选择", "适合人群", "选择理由"],
      "适合想要该方向视觉和转化侧重的电商套图。",
    )),
  };
}

function extractJsonObject(text: string): UnknownRecord | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeImagePlanItem(item: unknown): string {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!isRecord(item)) {
    return "";
  }

  const label = readStringField(item, ["label", "slot", "name", "标题", "图位"], "图片");
  const aspectRatio = readStringField(item, ["aspectRatio", "ratio", "比例", "画幅"]);
  const intent = readStringField(item, ["intent", "description", "goal", "说明", "目的"]);

  return [
    label,
    aspectRatio ? `aspectRatio=${aspectRatio}` : undefined,
    intent,
  ].filter(Boolean).join("：");
}

function normalizePlannerOption(
  option: unknown,
  index: number,
  fallback: AgentEcomPlannerOption,
): AgentEcomPlannerOption {
  if (!isRecord(option)) {
    return fallback;
  }

  const optionBody = isRecord(option.option) ? option.option : option;
  const optionLabel = readStringFieldFromRecords(
    [option, optionBody],
    ["_option_label", "option_label", "方案标签", "方案名称"],
  );
  const id = readStringFieldFromRecords([option, optionBody], ["id", "option_id", "方案ID"], fallback.id);
  const labelId = readOptionIdFromLabel(optionLabel);
  const safeId: AgentEcomPlannerOption["id"] = id === "A" || id === "B" || id === "C" ? id : labelId ?? fallback.id;
  const uiSummary = normalizePlannerUiSummary(option, optionBody, fallback);
  const title = readStringField(
    optionBody,
    ["title", "_option_label", "方案名称", "标题", "visual_name", "视觉风格名称", "风格名称"],
    optionLabel ? normalizeOptionTitle(optionLabel, fallback.title) : fallback.title,
  );
  const positioning = readStringField(
    optionBody,
    ["positioning", "核心定位", "商业定位", "策略定位", "定位", "文案语调指引"],
    uiSummary.coreDifference || fallback.positioning,
  );
  const visualStyleSection = stringifyDetailValue(optionBody["视觉风格与光影"]);
  const visualDirection = readStringField(
    optionBody,
    ["visualDirection", "视觉方向", "视觉风格", "美学世界观", "风格"],
    uiSummary.visualKeyword || visualStyleSection || fallback.visualDirection,
  );
  const productInfoSection = stringifyDetailValue(optionBody["产品信息"]);
  const sellingPointStrategy = readStringField(
    optionBody,
    ["sellingPointStrategy", "卖点策略", "转化策略", "信息层级", "首屏钩子"],
    uiSummary.sellingPointFocus || productInfoSection || fallback.sellingPointStrategy,
  );
  const executionNotesSection = stringifyDetailValue(optionBody["下游执行注意事项"]);
  const benchmarkUsage = readStringField(
    optionBody,
    ["benchmarkUsage", "对标图处理", "参考图使用", "风格参考处理"],
    executionNotesSection || fallback.benchmarkUsage,
  );
  const rawImagePlan = optionBody.imagePlan ?? optionBody["图片规划"] ?? optionBody["图位规划"] ?? optionBody["下游执行图位"];
  const imagePlan = Array.isArray(rawImagePlan)
    ? rawImagePlan.map(normalizeImagePlanItem).filter(Boolean)
    : fallback.imagePlan;
  const detailSections = [
    readDetailSection(option, "_system_diagnostic_log"),
    readDetailSection(optionBody, "目标平台"),
    readDetailSection(optionBody, "任务类型"),
    readDetailSection(optionBody, "期望图片数量"),
    readDetailSection(optionBody, "文案语调指引"),
    readDetailSection(optionBody, "风格名称"),
    readDetailSection(optionBody, "视觉风格与光影"),
    readDetailSection(optionBody, "版式语言与排版哲学"),
    readDetailSection(optionBody, "产品信息"),
    readDetailSection(optionBody, "产品参数"),
    readDetailSection(optionBody, "全局色彩资产"),
    readDetailSection(optionBody, "下游执行注意事项"),
    readDetailSection(optionBody, "用户需求原文"),
  ].filter((section): section is { title: string; content: string } => Boolean(section));
  const rawOptionJson = JSON.stringify(option, null, 2);
  const workflowPrompt = [
    `套图企划方案 ${safeId}：${title}`,
    `定位：${positioning}`,
    `视觉方向：${visualDirection}`,
    `卖点策略：${sellingPointStrategy}`,
    `图片规划：${imagePlan.join(" / ")}`,
    `对标图处理：${benchmarkUsage}`,
    detailSections.length ? `完整方案模块：\n${detailSections.map((section) => `【${section.title}】\n${section.content}`).join("\n\n")}` : undefined,
  ].filter(Boolean).join("\n");

  return {
    id: safeId,
    title,
    positioning: uiSummary.coreDifference || positioning,
    visualDirection: uiSummary.visualKeyword || visualDirection,
    sellingPointStrategy: uiSummary.sellingPointFocus || sellingPointStrategy,
    imagePlan,
    benchmarkUsage,
    workflowPrompt,
    uiSummary,
    detailSections: detailSections.length ? detailSections : undefined,
    rawOptionJson,
  };
}

export function parseAgentEcomPlannerModelResponse(input: {
  text: string;
  fallback: AgentEcomPlannerOptionsResult;
}): AgentEcomPlannerOptionsResult {
  const parsed = extractJsonObject(input.text);

  if (!parsed) {
    return input.fallback;
  }

  const optionsSource = Array.isArray(parsed.options)
    ? parsed.options
    : Array.isArray(parsed["方案"])
      ? parsed["方案"]
      : isRecord(parsed.option)
        ? [parsed]
        : [];
  const options = input.fallback.options.map((fallbackOption, index) => (
    normalizePlannerOption(optionsSource[index], index, fallbackOption)
  ));
  const parsedOption = isRecord(parsed.option) ? parsed.option : undefined;
  const productInfo = parsedOption && isRecord(parsedOption["产品信息"])
    ? parsedOption["产品信息"]
    : undefined;
  const sharedPlannerContext = normalizeSharedPlannerContext(parsed) ?? input.fallback.sharedPlannerContext;

  return {
    ...input.fallback,
    productName: readStringFieldFromRecords(
      [parsed, parsedOption, productInfo],
      ["productName", "产品", "产品名称", "产品名"],
      input.fallback.productName,
    ),
    platform: readStringFieldFromRecords([parsed, parsedOption], ["platform", "目标平台", "平台"], input.fallback.platform),
    taskType: readStringFieldFromRecords([parsed, parsedOption], ["taskType", "任务类型"], input.fallback.taskType),
    productImageCount: typeof parsed.productImageCount === "number"
      ? parsed.productImageCount
      : input.fallback.productImageCount,
    benchmarkImageCount: typeof parsed.benchmarkImageCount === "number"
      ? parsed.benchmarkImageCount
      : input.fallback.benchmarkImageCount,
    options,
    sharedPlannerContext,
  };
}
