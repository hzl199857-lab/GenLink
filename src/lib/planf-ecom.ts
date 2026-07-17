import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CanvasAgentAction } from "../types/agent";
import {
  getEcomPackageSlots,
  type PlanfEcomPackageMode,
} from "./ecom-delivery-spec";

export type PlanfEcomStyleMode = "default" | "detail-page" | "ugc" | "stylist";
export type { PlanfEcomPackageMode } from "./ecom-delivery-spec";

export type PlanfEcomPromptInput = {
  request: string;
  styleMode?: PlanfEcomStyleMode;
  packageMode?: PlanfEcomPackageMode;
  product?: string;
  platform?: string;
  aspectRatio?: string;
  extraConstraints?: string;
  rulesRoot?: string;
};

export type PlanfRuleDocument = {
  label: string;
  relativePath: string;
  content: string;
};

export type PlanfEcomPromptResult = {
  prompt: string;
  styleMode: PlanfEcomStyleMode;
  rulesRoot: string;
  loadedRules: Array<{
    label: string;
    relativePath: string;
    length: number;
  }>;
};

export type PlanfEcomFinalPromptResult = {
  prompt: string;
  styleMode: PlanfEcomStyleMode;
  source: "offline-template";
  rulesRoot: string;
  loadedRules: PlanfEcomPromptResult["loadedRules"];
};

export type GLWorkflowSource = "planf" | "manual" | "openclaw" | "mcp";

export type GLWorkflowNodeType =
  | "text"
  | "image_generation"
  | "uploaded_image"
  | "video_generation"
  | "video_upscale"
  | "video"
  | "ai_text_result"
  | "image"
  | "panorama-360";

export type GLWorkflowNode = {
  id: string;
  type: GLWorkflowNodeType;
  role: string;
  title: string;
  data: Record<string, unknown>;
};

export type GLWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  role: string;
};

export type GLWorkflow = {
  version: "gl-workflow-v1";
  source: GLWorkflowSource;
  intent: {
    type: "ecom-image";
    styleMode: PlanfEcomStyleMode;
    packageMode: PlanfEcomPackageMode;
    request: string;
    platform?: string;
    aspectRatio?: string;
  };
  nodes: GLWorkflowNode[];
  edges: GLWorkflowEdge[];
  meta: {
    rulesRoot: string;
    loadedRules: PlanfEcomPromptResult["loadedRules"];
  };
};

export type PlanfEcomWorkflowResponse = {
  ok: true;
  summary: string;
  workflow: GLWorkflow;
  actions: CanvasAgentAction[];
};

const DEFAULT_RULES_ROOT = path.join(process.cwd(), "rules", "planf-canvas");
const MAX_RULE_CHARS = 12_000;

const BASE_RULES: Array<{ label: string; relativePath: string }> = [
  { label: "总控", relativePath: "AGENTS.md" },
  { label: "电商图技能", relativePath: "skills/ecom-image/SKILL.md" },
  { label: "分析压缩", relativePath: "skills/analyst/SKILL.md" },
  { label: "提示词生成", relativePath: "skills/prompter/SKILL.md" },
  { label: "工程交付", relativePath: "skills/engineer/SKILL.md" },
  { label: "图片审美", relativePath: "skills/_shared/image-aesthetic.md" },
  {
    label: "专业图片交付",
    relativePath: "skills/_shared/image-professional-delivery.md",
  },
  {
    label: "电商品类参考",
    relativePath: "skills/ecom-image/references/categories.md",
  },
];

const STYLE_RULES: Record<PlanfEcomStyleMode, Array<{ label: string; relativePath: string }>> = {
  default: [],
  "detail-page": [
    {
      label: "详情页 SOP",
      relativePath: "skills/ecom-image/references/detail-page-sop.md",
    },
  ],
  ugc: [
    {
      label: "UGC 风格",
      relativePath: "skills/ecom-image/references/ugc-style.md",
    },
  ],
  stylist: [
    {
      label: "造型大片",
      relativePath: "skills/ecom-image/references/fashion-stylist.md",
    },
  ],
};

export function resolvePlanfRulesRoot(rulesRoot?: string): string {
  return path.resolve(
    /* turbopackIgnore: true */
    rulesRoot?.trim() ||
      process.env.PLANF_RULES_ROOT?.trim() ||
      DEFAULT_RULES_ROOT,
  );
}

export function inferPlanfEcomStyleMode(
  request: string,
  explicitMode?: PlanfEcomStyleMode,
): PlanfEcomStyleMode {
  if (explicitMode) {
    return explicitMode;
  }

  if (/详情页|详情|卖点图|长图|套图/.test(request)) {
    return "detail-page";
  }

  if (/UGC|种草|小红书|生活化|素人|iphone|iPhone/.test(request)) {
    return "ugc";
  }

  if (/大片|造型|服装|女装|男装|穿搭|editorial|Editorial/.test(request)) {
    return "stylist";
  }

  return "default";
}

export function inferPlanfEcomPackageMode(
  request: string,
  explicitMode?: PlanfEcomPackageMode,
): PlanfEcomPackageMode {
  if (explicitMode) {
    return explicitMode;
  }

  if (/8图|八图|全套/.test(request)) {
    return "full-set-8";
  }

  if (/亚马逊|Amazon|amazon|A\+/.test(request)) {
    return "amazon-adapter";
  }

  if (/详情页|详情|卖点图|强化包/.test(request)) {
    return "detail-page-pack";
  }

  if (/UGC|种草|生活化|素人|iPhone|iphone/.test(request)) {
    return "ugc-lifestyle";
  }

  if (/造型师|大片|Editorial|editorial|Muse|模特/.test(request)) {
    return "editorial-stylist";
  }

  return "single";
}

function readRuleDocument(
  rulesRoot: string,
  label: string,
  relativePath: string,
): PlanfRuleDocument | undefined {
  const absolutePath = path.join(
    /* turbopackIgnore: true */
    rulesRoot,
    relativePath,
  );

  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const content = readFileSync(absolutePath, "utf8").trim();

  if (!content) {
    return undefined;
  }

  return {
    label,
    relativePath,
    content:
      content.length > MAX_RULE_CHARS
        ? `${content.slice(0, MAX_RULE_CHARS)}\n\n[规则内容已截断，保留前 ${MAX_RULE_CHARS} 字符用于本次生成。]`
        : content,
  };
}

export function loadPlanfEcomRules(
  styleMode: PlanfEcomStyleMode,
  rulesRoot?: string,
): { rulesRoot: string; documents: PlanfRuleDocument[] } {
  const resolvedRoot = resolvePlanfRulesRoot(rulesRoot);
  const seen = new Set<string>();
  const entries = [...BASE_RULES, ...STYLE_RULES[styleMode]];
  const documents = entries.flatMap((entry) => {
    const normalized = entry.relativePath.replaceAll("\\", "/");

    if (seen.has(normalized)) {
      return [];
    }

    seen.add(normalized);
    const document = readRuleDocument(resolvedRoot, entry.label, entry.relativePath);
    return document ? [document] : [];
  });

  return {
    rulesRoot: resolvedRoot,
    documents,
  };
}

export function buildPlanfEcomPrompt(input: PlanfEcomPromptInput): PlanfEcomPromptResult {
  const request = input.request.trim();

  if (!request) {
    throw new Error("request is required");
  }

  const styleMode = inferPlanfEcomStyleMode(request, input.styleMode);
  const loaded = loadPlanfEcomRules(styleMode, input.rulesRoot);
  const ruleDigest = loaded.documents
    .map(
      (document) =>
        `### ${document.label} (${document.relativePath})\n${document.content}`,
    )
    .join("\n\n---\n\n");

  const prompt = [
    "你是 GenLink 的电商图片创作智能体，底层采用 RH / PlanF Canvas 兼容协议。",
    "请严格依据下方规则库摘要，把用户需求转成可直接用于生图模型的最终提示词。",
    "",
    "输出要求：",
    "1. 只输出最终生图提示词，不输出解释、方案、JSON 或 Markdown。",
    "2. 保留用户明确给出的产品、平台、比例、材质、文字、禁忌和参考图约束。",
    "3. 如果用户需求缺少信息，用专业电商图默认值补齐，不要反问。",
    "4. 提示词需要包含主体、构图、场景/背景、光线、材质细节、商业质感、镜头语言、画面比例和负面约束。",
    "5. 如果涉及详情页或套图，请生成当前这一次最适合执行的单张图提示词，并体现其在套图中的角色。",
    "",
    `任务类型：电商图片 / ${styleMode}`,
    input.product ? `产品：${input.product}` : undefined,
    input.platform ? `平台：${input.platform}` : undefined,
    input.aspectRatio ? `画面比例：${input.aspectRatio}` : undefined,
    input.extraConstraints ? `额外约束：${input.extraConstraints}` : undefined,
    `用户需求：${request}`,
    "",
    "规则库摘要：",
    ruleDigest || "未读取到规则文件，请按通用高质量电商图规则生成。",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");

  return {
    prompt,
    styleMode,
    rulesRoot: loaded.rulesRoot,
    loadedRules: loaded.documents.map((document) => ({
      label: document.label,
      relativePath: document.relativePath,
      length: document.content.length,
    })),
  };
}

export function buildOfflinePlanfEcomFinalPrompt(
  input: PlanfEcomPromptInput,
): PlanfEcomFinalPromptResult {
  const request = input.request.trim();

  if (!request) {
    throw new Error("request is required");
  }

  const styleMode = inferPlanfEcomStyleMode(request, input.styleMode);
  const loaded = loadPlanfEcomRules(styleMode, input.rulesRoot);
  const productLine = input.product?.trim() || request;
  const platformLine = input.platform?.trim() || "主流电商平台";
  const ratioLine = input.aspectRatio?.trim();
  const styleLine =
    styleMode === "detail-page"
      ? "详情页卖点图，单张画面承担套图中的核心卖点解释角色"
      : styleMode === "ugc"
        ? "生活化种草图，真实自然但保持商业质感"
        : styleMode === "stylist"
          ? "电商造型大片，强调穿搭、版型、面料和高级编辑感"
          : "高转化电商主图，干净明确，突出产品价值";
  const extraLine = input.extraConstraints?.trim()
    ? `硬性约束：${input.extraConstraints.trim()}。`
    : "";

  return {
    source: "offline-template",
    styleMode,
    rulesRoot: loaded.rulesRoot,
    loadedRules: loaded.documents.map((document) => ({
      label: document.label,
      relativePath: document.relativePath,
      length: document.content.length,
    })),
    prompt: [
      `为${platformLine}生成一张${styleLine}。`,
      `主体产品：${productLine}。`,
      ratioLine
        ? `画面比例：${ratioLine}，构图稳定，主体居中或黄金分割布局，留出平台安全边距。`
        : "构图稳定，主体居中或采用黄金分割布局，留出平台安全边距；画面比例由当前交付图位规格决定。",
      "画面要求：高端商业摄影质感，真实材质纹理清晰，产品轮廓准确，细节锐利，色彩干净耐看，背景服务于产品，不喧宾夺主。",
      "光线与镜头：柔和棚拍主光结合自然补光，层次分明，低噪点，高动态范围，真实景深，专业电商摄影。",
      "转化重点：突出产品卖点、使用场景和品质感，让用户一眼理解产品价值。",
      extraLine,
      "负面约束：不要廉价影楼风，不要夸张促销字，不要错误文字，不要多余水印，不要畸形人体，不要产品变形，不要杂乱背景，不要低清晰度，不要过度磨皮，不要塑料质感。",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function buildPlanfEcomWorkflow(input: PlanfEcomPromptInput): GLWorkflow {
  const finalPrompt = buildOfflinePlanfEcomFinalPrompt(input);
  const request = input.request.trim();
  const packageMode = inferPlanfEcomPackageMode(request, input.packageMode);
  const deliverySlots = getEcomPackageSlots(packageMode, input.platform);
  const imageNodes: GLWorkflowNode[] = deliverySlots.map((deliverySlot, index) => {
    const number = index + 1;
    const aspectRatio = input.aspectRatio?.trim() || deliverySlot.ratio;
    const prompt = [
      finalPrompt.prompt,
      `第${number}张 / ${deliverySlots.length}：${deliverySlot.intent}`,
      `本张画面比例必须为 ${aspectRatio}。`,
      "本张图必须和同套其他图片保持产品身份、材质、颜色、品牌调性一致，但构图和信息重点要明显差异化。",
    ].join(" ");

    return {
      id: `image-${number}`,
      type: "image_generation",
      role: "ecom_image_generation",
      title: packageMode === "single" ? "GenLink 电商图工作流" : `GenLink 电商图 ${number}`,
      data: {
        from: "agent",
        agentNodeType: "ecom_image_generation",
        prompt,
        effectivePromptOverride: prompt,
        provider: "vibe",
        aspectRatio,
        parallelCount: 1,
        status: "idle",
        packageMode,
        packageRole: deliverySlot.slot,
        packageIndex: number,
        packageTotal: deliverySlots.length,
      },
    };
  });

  return {
    version: "gl-workflow-v1",
    source: "planf",
    intent: {
      type: "ecom-image",
      styleMode: finalPrompt.styleMode,
      packageMode,
      request,
      platform: input.platform,
      aspectRatio: input.aspectRatio,
    },
    nodes: [
      {
        id: "prompt-1",
        type: "text",
        role: "prompt_brief",
        title: "电商图需求",
        data: {
          from: "agent",
          agentNodeType: "prompt_brief",
          text: request,
          platform: input.platform,
          aspectRatio: input.aspectRatio,
          extraConstraints: input.extraConstraints,
        },
      },
      ...imageNodes,
    ],
    edges: imageNodes.map((node) => ({
      id: `edge-prompt-1-${node.id}`,
      source: "prompt-1",
      target: node.id,
      role: "drives_generation",
    })),
    meta: {
      rulesRoot: finalPrompt.rulesRoot,
      loadedRules: finalPrompt.loadedRules,
    },
  };
}

export function glWorkflowToCanvasAgentActions(
  workflow: GLWorkflow,
): CanvasAgentAction[] {
  const creatableNodeIds = new Set<string>();
  const actions: CanvasAgentAction[] = [];

  for (const node of workflow.nodes) {
    if (node.type === "text") {
      actions.push({
        type: "create_text_node",
        clientActionId: node.id,
        text: String(node.data.text || ""),
        title: node.title,
      });
      creatableNodeIds.add(node.id);
      continue;
    }

    if (node.type === "image_generation") {
      actions.push({
        type: "create_image_generation_node",
        clientActionId: node.id,
        prompt: String(node.data.prompt || ""),
        options: {
          aspectRatio:
            typeof node.data.aspectRatio === "string"
              ? node.data.aspectRatio
              : undefined,
          quality:
            typeof node.data.quality === "string" ? node.data.quality : undefined,
          model: typeof node.data.model === "string" ? node.data.model : undefined,
          provider:
            typeof node.data.provider === "string"
              ? node.data.provider
              : undefined,
          runningHubChannel:
            node.data.runningHubChannel === "official" ||
            node.data.runningHubChannel === "low-cost"
              ? node.data.runningHubChannel
              : undefined,
        },
      });
      creatableNodeIds.add(node.id);
    }
  }

  for (const edge of workflow.edges) {
    if (!creatableNodeIds.has(edge.source) || !creatableNodeIds.has(edge.target)) {
      continue;
    }

    actions.push({
      type: "connect_nodes",
      sourceRef: { kind: "created", clientActionId: edge.source },
      targetRef: { kind: "created", clientActionId: edge.target },
    });
  }

  return actions;
}

export function createPlanfEcomWorkflowResponse(
  input: PlanfEcomPromptInput,
): PlanfEcomWorkflowResponse {
  const workflow = buildPlanfEcomWorkflow(input);

  return {
    ok: true,
    summary: "已生成 GenLink 电商图工作流",
    workflow,
    actions: glWorkflowToCanvasAgentActions(workflow),
  };
}
