import type { GLWorkflow } from "@/lib/planf-ecom";

import type {
  OpenClawPlanfEcomConfirmInput,
  OpenClawPlanfEcomConfirmResult,
  OpenClawPlanfEcomImagePlan,
} from "./planf-ecom-session";

type EcomProtocolInput = OpenClawPlanfEcomConfirmInput & {
  plan?: OpenClawPlanfEcomImagePlan;
  previousText?: string;
  previousValidationError?: string;
  referenceNodeMap?: Array<{
    attachmentId: string;
    name?: string;
    sourceNodeId: string;
  }>;
  anchor?: {
    nodeId: string;
    outputUrl: string;
  };
};

const RH_TO_GL_NODE_TYPE: Record<string, GLWorkflow["nodes"][number]["type"]> = {
  "rh-text": "text",
  "rh-image": "image_generation",
  "rh-video": "video_generation",
};

const DEFAULT_IMAGE_ASPECT_RATIO = "1:1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractFence(text: string, fence: string): string | undefined {
  const pattern = new RegExp(`\`\`\`${fence}\\s*([\\s\\S]*?)\\s*\`\`\``, "i");
  const match = text.match(pattern);

  return match?.[1]?.trim();
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseJson(trimmed);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return parseJson(trimmed.slice(start, end + 1));
  }

  throw new Error("OpenClaw response did not contain a JSON object");
}

function readToolCallWorkflow(text: string): unknown {
  const match = text.match(/<tool_call\b[^>]*>\s*([\s\S]*?)\s*<\/tool_call>/i);

  if (!match?.[1]) {
    return undefined;
  }

  const parsed = parseJson(match[1]);

  if (!isRecord(parsed)) {
    return undefined;
  }

  if (!isRecord(parsed.arguments)) {
    return undefined;
  }

  return parsed.arguments.workflow ?? parsed.arguments;
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const match = value.match(/\d+/);
      if (match) {
        return Number(match[0]);
      }
    }
  }

  return fallback;
}

function normalizeRound(value: unknown): 1 | 2 {
  if (typeof value === "number") {
    return value === 2 ? 2 : 1;
  }

  if (typeof value === "string") {
    return value.includes("2") || /second|fanout|扇出|第二/.test(value) ? 2 : 1;
  }

  if (Array.isArray(value)) {
    return value.some((item) => normalizeRound(item) === 2) ? 2 : 1;
  }

  if (isRecord(value)) {
    return normalizeRound(
      value.round ?? value["轮次"] ?? value.phase ?? value.stage ?? value.name ?? value.label,
    );
  }

  return 1;
}

function normalizeImageSlot(slot: unknown, index: number): OpenClawPlanfEcomImagePlan["imageSlots"][number] {
  if (!isRecord(slot)) {
    return {
      index: index + 1,
      slot: `图位 ${index + 1}`,
      round: 1,
      subType: "text-image",
      anchorSource: "",
      ratio: "1:1",
      intent: typeof slot === "string" ? slot : "",
    };
  }

  const slotIndex = readNumber(slot, ["index", "#", "id", "序号"], index + 1);
  const slotName = readString(slot, ["slot", "图位", "title", "name", "module", "模块"], `图位 ${slotIndex}`);
  const intent = readString(slot, ["intent", "核心意图", "visualStrategy", "视觉策略", "description", "传播功能"], slotName);
  const rawSubType = readString(slot, ["subType", "type"], "text-image");
  const subType = rawSubType === "image-image" ? "image-image" : "text-image";

  return {
    index: slotIndex,
    slot: slotName,
    round: normalizeRound(slot.round ?? slot["轮次"] ?? slot.phase ?? slot.stage),
    subType,
    anchorSource: readString(slot, ["anchorSource", "anchor 来源", "anchor", "锚点", "source"], ""),
    ratio: "1:1",
    intent,
  };
}

function normalizeOptions(options: unknown): OpenClawPlanfEcomImagePlan["options"] {
  const rawOptions = Array.isArray(options) ? options : [];
  const normalized = rawOptions.flatMap((option, index) => {
    if (!isRecord(option)) {
      return [];
    }

    const fallbackId = ["A", "B", "C", "D"][index];
    const id = readString(option, ["id", "key"], fallbackId).slice(0, 1).toUpperCase();

    if (id !== "A" && id !== "B" && id !== "C" && id !== "D") {
      return [];
    }

    return [{
      id,
      label: readString(option, ["label", "title", "text"], id === "A" ? "确认编排，开始生成" : "调整编排"),
    }];
  });

  return normalized.length > 0
    ? normalized as OpenClawPlanfEcomImagePlan["options"]
    : [
        { id: "A", label: "确认编排，开始生成" },
        { id: "B", label: "调整某张图的方向 / 文案" },
      ];
}

export function normalizeOpenClawEcomCreativeDoc(value: unknown): OpenClawPlanfEcomImagePlan {
  if (!isRecord(value)) {
    throw new Error("creative-doc must be an object");
  }

  if (value.type !== "ecom-image-plan" && value.type !== "ecom-detail-page-plan") {
    throw new Error("creative-doc must be an ecom image plan");
  }

  const rawDomain = typeof value.domain === "string" ? value.domain.trim() : "";
  const normalizedDomain = rawDomain.toLowerCase().replaceAll("_", "-");
  const acceptsEcomDomain = normalizedDomain === "ecom-image" ||
    normalizedDomain === "ecommerce-image" ||
    normalizedDomain === "ecommerce" ||
    normalizedDomain === "ecom" ||
    normalizedDomain.includes("ecom");

  if (rawDomain && !acceptsEcomDomain) {
    throw new Error(`creative-doc domain must be ecom-image, got ${rawDomain || "missing"}`);
  }

  if (!isRecord(value.meta) || !Array.isArray(value.imageSlots)) {
    throw new Error("creative-doc is missing meta, imageSlots, or options");
  }

  const meta = value.meta as Record<string, unknown>;
  const deliveryRounds = normalizeRound(meta.deliveryRounds);
  const totalImages = readNumber(meta, ["totalImages", "imageCount", "count"], value.imageSlots.length);

  return {
    ...value,
    domain: "ecom-image",
    checkpoint: true,
    meta: {
      ...meta,
      productName: readString(meta, ["productName", "产品", "product"], "未命名产品"),
      category: readString(meta, ["category", "类目"], "general"),
      platform: readString(meta, ["platform", "平台"], "taobao"),
      imageSet: readString(meta, ["imageSet", "图集"], "full-set"),
      anchorMode: readString(meta, ["anchorMode", "锚点"], "user-upload"),
      amazonMode: Boolean(meta.amazonMode),
      mainRatio: "1:1",
      totalImages,
      deliveryRounds,
      styleMode: readString(meta, ["styleMode", "styleLayer"], "default"),
      extraConstraints: readString(meta, ["extraConstraints", "constraints", "notes"], ""),
    },
    imageSlots: value.imageSlots.map(normalizeImageSlot),
    options: normalizeOptions(value.options),
  } as OpenClawPlanfEcomImagePlan;
}

function ensureWorkflow(value: unknown): GLWorkflow {
  if (!isRecord(value)) {
    throw new Error("workflow must be an object");
  }

  if (value.version === "gl-workflow-v1") {
    return ensureGLWorkflow(value);
  }

  return rhWorkflowToGLWorkflow(value);
}

function ensureGLWorkflow(value: Record<string, unknown>): GLWorkflow {
  if (value.version !== "gl-workflow-v1") {
    throw new Error("workflow.version must be gl-workflow-v1");
  }

  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("workflow must include nodes and edges arrays");
  }

  for (const node of value.nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || !isRecord(node.data)) {
      throw new Error("workflow node must include id and data");
    }

    if (node.data.from !== "agent") {
      throw new Error(`workflow node ${node.id} must include data.from="agent"`);
    }

    if (typeof node.data.agentNodeType !== "string" || !node.data.agentNodeType.trim()) {
      throw new Error(`workflow node ${node.id} must include data.agentNodeType`);
    }

    if ("toolsType" in node.data) {
      throw new Error(`workflow node ${node.id} must not include toolsType`);
    }
  }

  return value as GLWorkflow;
}

function readRequiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context} must include ${key}`);
  }

  return value.trim();
}

function copyOptionalRhFields(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

function rhWorkflowToGLWorkflow(value: Record<string, unknown>): GLWorkflow {
  const name = readRequiredString(value, "name", "workflow");

  if (!Array.isArray(value.nodes)) {
    throw new Error("workflow.nodes must be an array");
  }

  if (!Array.isArray(value.edges)) {
    throw new Error("workflow.edges must be an array");
  }

  const autoRun = value.autoRun !== false;
  const nodes: GLWorkflow["nodes"] = value.nodes.map((node, index) => {
    if (!isRecord(node)) {
      throw new Error("workflow nodes must be objects");
    }

    const context = `workflow node ${index + 1}`;
    const id = readRequiredString(node, "id", context);
    const rhType = readRequiredString(node, "type", `workflow node ${id}`);
    const glType = RH_TO_GL_NODE_TYPE[rhType];

    if (!glType) {
      throw new Error(`workflow node ${id} has unsupported type ${rhType}`);
    }

    const subType = readRequiredString(node, "subType", `workflow node ${id}`);
    const from = readRequiredString(node, "from", `workflow node ${id}`);

    if (from !== "agent") {
      throw new Error(`workflow node ${id} must include from: "agent"`);
    }

    const agentNodeType = readRequiredString(node, "agentNodeType", `workflow node ${id}`);
    const title = readRequiredString(node, "title", `workflow node ${id}`);
    const content = rhType === "rh-video" && subType === "video-hd"
      ? readString(node, ["content"], "")
      : readRequiredString(node, "content", `workflow node ${id}`);
    const data: Record<string, unknown> = {
      from,
      agentNodeType,
      rhType,
      subType,
      autoRun,
    };

    if (glType === "text") {
      data.text = content;
    } else {
      data.prompt = content;
      data.effectivePromptOverride = content;
    }

    if (glType === "image_generation") {
      data.aspectRatio = readString(node, ["aspectRatio"], DEFAULT_IMAGE_ASPECT_RATIO);
    }

    copyOptionalRhFields(node, data, [
      "aspectRatio",
      "duration",
      "sourceNodeId",
      "editAction",
      "referenceBindings",
      "assetRegistry",
      "group",
    ]);

    if ("toolsType" in node || "toolsType" in data) {
      throw new Error(`workflow node ${id} must not include toolsType`);
    }

    return {
      id,
      type: glType,
      role: agentNodeType,
      title,
      data,
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GLWorkflow["edges"] = value.edges.map((edge, index) => {
    if (!isRecord(edge)) {
      throw new Error("workflow edges must be objects");
    }

    const source = readRequiredString(edge, "source", `workflow edge ${index + 1}`);
    const target = readRequiredString(edge, "target", `workflow edge ${index + 1}`);
    const id = typeof edge.id === "string" && edge.id.trim()
      ? edge.id.trim()
      : `edge-${source}-${target}`;

    if (!nodeIds.has(target)) {
      throw new Error(`workflow edge ${id} has unknown target ${target}`);
    }

    return {
      id,
      source,
      target,
      role: readString(edge, ["role"], "reference"),
    };
  });
  const edgeKeys = new Set(edges.map((edge) => `${edge.source}\u0000${edge.target}`));
  const edgeIds = new Set(edges.map((edge) => edge.id));

  for (const node of nodes) {
    const sourceNodeId = typeof node.data.sourceNodeId === "string"
      ? node.data.sourceNodeId.trim()
      : "";

    if (!sourceNodeId || edgeKeys.has(`${sourceNodeId}\u0000${node.id}`)) {
      continue;
    }

    const baseId = `edge-${sourceNodeId}-${node.id}`;
    let id = baseId;
    let suffix = 2;

    while (edgeIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    edges.push({
      id,
      source: sourceNodeId,
      target: node.id,
      role: "reference",
    });
    edgeKeys.add(`${sourceNodeId}\u0000${node.id}`);
    edgeIds.add(id);
  }

  return {
    version: "gl-workflow-v1",
    source: "openclaw",
    intent: {
      type: "ecom-image",
      styleMode: "default",
      packageMode: nodes.length > 1 ? "full-set-8" : "single",
      request: name,
    },
    nodes,
    edges,
    meta: {
      rulesRoot: "rules/planf-canvas",
      loadedRules: [],
    },
  };
}

export function buildOpenClawEcomConfirmMessage(input: OpenClawPlanfEcomConfirmInput): string {
  return [
    "你是 GenLink 内置电商图规则执行主体，用户可见品牌必须始终是 GenLink。",
    "必须从当前 OpenClaw workspace 的 ./AGENTS.md 开始，并读取 ./BOOTSTRAP.md、./IDENTITY.md、./phase-policy.md 与 ./skills/ecom-image/SKILL.md；不要只凭常识回答。",
    "输出主协议前必须读取并执行 ./skills/_shared/self-check.md；engineer 装配 workflow-json 前必须读取并执行 ./skills/engineer/SKILL.md 与 ./skills/engineer/validation.md。",
    "内部可使用 RH / PlanF Canvas canonical schema，但不要对用户自称 RH、RunningHub 或 PlanF。",
    "当前阶段是 ecom-image Step 2：基于用户已提交的 form-fields 输出 creative-doc。",
    "阶段门禁：本轮只允许输出一个 creative-doc fence，type 必须是 ecom-image-plan 或 ecom-detail-page-plan。",
    "禁止输出 workflow-json、<tool_call>、create_workflow、Prompt Pack；禁止创建画布节点；禁止跳过 checkpoint。",
    "creative-doc 必须包含 meta、imageSlots、options，并显式保留 anchorMode、deliveryRounds、checkpoint=true、checkpointPrompt。",
    "imageSlots 每一项必须包含 index、slot、round、subType、anchorSource、ratio、intent；slot 和 intent 禁止为空，round 必须是 1 或 2。",
    "options 必须包含 A=确认编排开始生成，以及 B/C/D 至少一个调整选项，等待用户确认后才能进入 Prompt Pack / workflow-json。",
    "",
    `session=${JSON.stringify(input.session)}`,
    `values=${JSON.stringify(input.values)}`,
  ].join("\n");
}

export function buildOpenClawEcomWorkflowMessage(input: EcomProtocolInput): string {
  const repairLines = input.previousText || input.previousValidationError
    ? [
        `[SYSTEM NOTICE] Your previous workflow-json failed validation. It failed GenLink validation: ${input.previousValidationError ?? "response did not contain a parseable RH workflow-json fence"}.`,
        "Rewrite the entire create_workflow payload now. Do not explain, apologize, summarize rules, or say you will read files.",
        "The current OpenClaw CLI runtime has no client tool bridge; per rules/planf-canvas/TOOLS.md fallback, output exactly one ```workflow-json fence. Do not output <tool_call> in this runtime. No natural-language text before or after it.",
        "The workflow payload must be: {\"name\":\"...\",\"nodes\":[...],\"edges\":[...],\"autoRun\":true}.",
        "All nodes must follow RH canonical schema: id, type, subType, from:\"agent\", agentNodeType, title, content. Every rh-image node must include aspectRatio; use 1:1 when no stronger platform/module rule applies. Do not write version/source/intent/data/position/toolsType/modelCode/resolution.",
        "Every edge.source must be either a node id from this workflow, a sourceNodeId from referenceNodeMap, or anchor.nodeId. Never invent source ids.",
        `previousOpenClawText=${JSON.stringify((input.previousText ?? "").slice(0, 12_000))}`,
        "",
      ]
    : [];

  return [
    "你是 GenLink 内置电商图规则执行主体，用户可见品牌必须始终是 GenLink。",
    "必须从当前 OpenClaw workspace 的 ./AGENTS.md 开始，并读取 ./BOOTSTRAP.md、./IDENTITY.md、./phase-policy.md 与 ./skills/ecom-image/SKILL.md；不要只凭常识回答。",
    "内部可使用 RH / PlanF Canvas canonical schema，但不要对用户自称 RH、RunningHub 或 PlanF。",
    "当前阶段是 ecom-image Step 3/Step 4：按 anchorMode 生成 Prompt Pack，并交给 engineer 装配 workflow-json。",
    "必须严格消费用户已经确认的 confirmedPlan；不要重新规划 imageSlots、anchorMode、deliveryRounds 或图位数量。",
    "输出格式硬要求：当前 OpenClaw CLI runtime 没有 client tool bridge，所以按 rules/planf-canvas/TOOLS.md 的 fallback 路径输出。只输出一个 ```workflow-json fence；本运行时不要输出 <tool_call>。禁止普通说明文本，禁止 creative-doc，禁止 Markdown 列表；不要同时输出两种主协议。",
    "workflow-json 顶层必须使用 RH canonical schema：{name,nodes,edges,autoRun}，不要写 version/source/intent/data/position。",
    "每个节点必须包含 id、type、subType、from:\"agent\"、agentNodeType、title、content；禁止 toolsType。图片节点 type=\"rh-image\"，视频节点 type=\"rh-video\"。",
    "Every rh-image node must include aspectRatio. 电商主图默认 1:1；详情页按模块/平台比例写 3:4、4:5 或 1:1；用户明确指定比例时优先用户比例。不要写 resolution。",
    "按 skills/_shared/self-check.md 先做 Self-Check；按 skills/engineer/validation.md 做 Delivery Validation。若任一事实层规则失败，先自修复；仍失败则输出 Engineering Blocker，不得输出 workflow-json。",
    "user-upload 模式：优先使用 referenceNodeMap 中的真实 sourceNodeId；不得虚构 sourceNodeId 或 edge.source。每个图片节点都必须写 sourceNodeId 指向上传产品图真实 nodeId，subType 必须为 image-image，editAction 建议为 redraw，edges 必须从该上传源图分别连接到每个图片节点。",
    "white-bg-first 第二轮必须使用 anchor.nodeId 作为真实 edge.source，并保留 anchor.outputUrl 的产品外观锚点。",
    ...repairLines,
    "",
    `session=${JSON.stringify(input.session)}`,
    `values=${JSON.stringify(input.values)}`,
    `confirmedPlan=${JSON.stringify(input.plan ?? null)}`,
    `referenceNodeMap=${JSON.stringify(input.referenceNodeMap ?? [])}`,
    `anchor=${JSON.stringify(input.anchor ?? null)}`,
  ].join("\n");
}

export function parseOpenClawEcomCreativeDoc(
  text: string,
  values?: OpenClawPlanfEcomConfirmInput["values"],
): OpenClawPlanfEcomConfirmResult {
  const fenced = extractFence(text, "creative-doc");
  const raw = fenced ? parseJson(fenced) : extractJsonObject(text);
  const plan = normalizeOpenClawEcomCreativeDoc(raw);

  return {
    ok: true,
    summary: `${plan.meta.productName} 的电商图编排方案已由 OpenClaw 生成，等待确认后进入 Prompt Pack / workflow-json。`,
    protocol: {
      name: "creative-doc",
      type: plan.type,
    },
    plan,
    values: values ?? {
      productName: plan.meta.productName,
      category: plan.meta.category,
      platform: plan.meta.platform,
      imageSet: plan.meta.imageSet,
      styleMode: plan.meta.styleMode,
    },
  };
}

export function parseOpenClawEcomWorkflow(text: string): GLWorkflow {
  const fenced = extractFence(text, "workflow-json");
  const raw = readToolCallWorkflow(text) ??
    (fenced ? parseJson(fenced) : extractJsonObject(text));

  return ensureWorkflow(raw);
}
