import { randomUUID } from "node:crypto";

import {
  createPlanfEcomWorkflowResponse,
  type PlanfEcomPackageMode,
  type PlanfEcomStyleMode,
} from "../planf-ecom";
import type { CanvasAgentAction } from "../../types/agent";

export type PlanfEcomPresetId =
  | "full-set-8"
  | "detail-page-pack"
  | "amazon-adapter"
  | "ugc-lifestyle"
  | "editorial-stylist"
  | "ecom-planner";

export type OpenClawPlanfEcomOption = {
  label: string;
  value: string;
};

export type OpenClawPlanfEcomFieldSource =
  | "user_explicit"
  | "model_suggested"
  | "default_guess";

export type OpenClawPlanfEcomField =
  | {
      id: string;
      label: string;
      type: "text";
      value: string;
      required: boolean;
      placeholder?: string;
      source?: OpenClawPlanfEcomFieldSource;
    }
  | {
      id: string;
      label: string;
      type: "select";
      value: string;
      options: OpenClawPlanfEcomOption[];
      required: boolean;
      hint?: string;
      source?: OpenClawPlanfEcomFieldSource;
    }
  | {
      id: string;
      label: string;
      type: "multi-select";
      value: string[];
      options: OpenClawPlanfEcomOption[];
      required: boolean;
      maxSelected: number;
      minSelected?: number;
      source?: OpenClawPlanfEcomFieldSource;
    }
  | {
      id: string;
      label: string;
      type: "text";
      value: string;
      required: boolean;
      placeholder?: string;
      source?: OpenClawPlanfEcomFieldSource;
    }
  | {
      id: string;
      label: string;
      type: "upload";
      value: string;
      accept: "image";
      required: boolean;
      hint: string;
      source?: OpenClawPlanfEcomFieldSource;
    };

export type OpenClawPlanfEcomSession = {
  sessionId: string;
  route: "ecomImageTrack";
  phase: "collecting";
  preset: PlanfEcomPresetId;
  request: string;
  referenceImageCount: number;
  stateHeader: string;
  protocol: {
    name: "form-fields";
    trigger: string;
    responsePath: string;
  };
  agent: {
    title: string;
    subtitle: string;
  };
  message: string;
  thinkingSteps: Array<{
    label: string;
    detail: string;
  }>;
  fields: OpenClawPlanfEcomField[];
};

export type OpenClawPlanfEcomStartInput = {
  request: string;
  preset: PlanfEcomPresetId;
  referenceImageCount?: number;
};

export type OpenClawPlanfEcomConfirmInput = {
  session: OpenClawPlanfEcomSession;
  values: {
    productName: string;
    category?: string;
    platform?: string;
    sellingPoints?: string[];
    sellingPointsText?: string;
    imageSet?: string;
    styleMode?: string;
    styleLayer?: string;
  };
};

export type OpenClawPlanfEcomAnchorInput = OpenClawPlanfEcomConfirmInput & {
  anchor: {
    nodeId: string;
    outputUrl: string;
  };
};

export type OpenClawPlanfEcomImagePlan = {
  type: "ecom-image-plan" | "ecom-detail-page-plan";
  title: string;
  domain: "ecom-image";
  phase: 1;
  totalPhases: 2;
  checkpoint: true;
  checkpointPrompt: string;
  meta: {
    productName: string;
    category: string;
    platform: string;
    imageSet: "full-set" | "detail" | "main";
    anchorMode: "user-upload" | "white-bg-first" | "single-shot";
    amazonMode: boolean;
    mainRatio: "1:1";
    totalImages: number;
    deliveryRounds: 1 | 2;
    styleMode: "default" | "ugc" | "stylist";
    extraConstraints: string;
  };
  imageSlots: Array<{
    index: number;
    slot: string;
    round: 1 | 2;
    subType: "image-image" | "text-image";
    anchorSource: string;
    ratio: "1:1";
    intent: string;
  }>;
  options: Array<{
    id: "A" | "B" | "C" | "D";
    label: string;
  }>;
};

export type OpenClawPlanfEcomConfirmResult = {
  ok: true;
  summary: string;
  protocol: {
    name: "creative-doc";
    type: OpenClawPlanfEcomImagePlan["type"];
  };
  plan: OpenClawPlanfEcomImagePlan;
  values: OpenClawPlanfEcomConfirmInput["values"];
};

const PRESET_TO_MODE: Record<PlanfEcomPresetId, {
  packageMode: PlanfEcomPackageMode;
  styleMode: PlanfEcomStyleMode;
  defaultPlatform: string;
  defaultPlatformValue: string;
  agentTitle: string;
  agentSubtitle: string;
  categoryDefault: string;
  styleModeDefault: "default" | "ugc" | "stylist";
  imageSetDefault: "full-set" | "detail" | "main";
  messageWithoutProduct: string;
  messageWithProduct: (productName: string, referenceImageCount: number) => string;
  thinkingSteps: (referenceImageCount: number) => OpenClawPlanfEcomSession["thinkingSteps"];
}> = {
  "full-set-8": {
    packageMode: "full-set-8",
    styleMode: "default",
    defaultPlatform: "淘宝/天猫",
    defaultPlatformValue: "taobao",
    agentTitle: "电商主图设计师",
    agentSubtitle: "E-Commerce Image Director",
    categoryDefault: "home_living",
    styleModeDefault: "default",
    imageSetDefault: "full-set",
    messageWithoutProduct: "我会先按「全套 8 图」拆成主图、卖点、细节、场景、规格、操作、对比和收束图。先确认产品身份和卖点，再创建画布工作流。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的参考图我已经纳入约束" : ""}。这次会按 8 张电商套图拆任务，确认下面信息后再生成 GL workflow-json。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "意图解析", detail: "识别为全套电商主图任务，需要一次性规划 8 个差异化图片节点。" },
      { label: "路由锁定", detail: "route=ecomImageTrack，nextAction=ecom-image，进入 GenLink 电商图规则。" },
      { label: "规则加载", detail: "加载 skills/ecom-image/SKILL.md 与 _shared/image-aesthetic.md。" },
      { label: "参考图处理", detail: referenceImageCount > 0 ? `发现 ${referenceImageCount} 张参考图，后续节点必须保持产品身份、结构和颜色一致。` : "没有参考图，将以用户补充的产品信息作为产品身份约束。" },
      { label: "节点策略", detail: "确认后创建 8 个 image-generation 节点，并按主图/卖点/细节/场景等角色写入提示词。" },
    ],
  },
  "detail-page-pack": {
    packageMode: "detail-page-pack",
    styleMode: "detail-page",
    defaultPlatform: "淘宝/天猫",
    defaultPlatformValue: "taobao",
    agentTitle: "详情页视觉策划",
    agentSubtitle: "E-Commerce Detail Page Planner",
    categoryDefault: "home_living",
    styleModeDefault: "default",
    imageSetDefault: "detail",
    messageWithoutProduct: "我会先按详情页逻辑整理首屏、三段卖点、细节和收束图，不会直接秒建节点。先确认产品、卖点和页面侧重点。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的参考图会作为详情页视觉锚点" : ""}。这次优先做详情页卖点结构，确认后再生成画布工作流。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "意图解析", detail: "识别为详情页强化包，不是普通单张主图。" },
      { label: "路由锁定", detail: "route=ecomImageTrack，phase=triage，先生成详情页视觉计划。" },
      { label: "规则加载", detail: "加载 ecom-image/SKILL.md 与 _shared/image-professional-delivery.md。" },
      { label: "参考图处理", detail: referenceImageCount > 0 ? `发现 ${referenceImageCount} 张参考图，将用于统一产品外观和细节可信度。` : "没有参考图，需要用户补齐产品名、类目和核心卖点。" },
      { label: "节点策略", detail: "确认后按详情页首屏、卖点 1/2/3、收束图创建 5 个图像节点。" },
    ],
  },
  "amazon-adapter": {
    packageMode: "amazon-adapter",
    styleMode: "default",
    defaultPlatform: "亚马逊",
    defaultPlatformValue: "amazon",
    agentTitle: "Amazon 图集适配专家",
    agentSubtitle: "Amazon Listing Image Adapter",
    categoryDefault: "general",
    styleModeDefault: "default",
    imageSetDefault: "full-set",
    messageWithoutProduct: "我会按 Amazon 主图、Lifestyle、Feature callout、Dimension、A+ 和 Comparison 来拆，不会套用淘宝图逻辑。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的参考图会用于保证产品一致性" : ""}。这次走 Amazon 适配，重点是白底合规、英文信息和 A+ 版式。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "意图解析", detail: "识别为 Amazon listing 图集，需要平台合规和英文信息结构。" },
      { label: "路由锁定", detail: "route=ecomImageTrack，并启用 amazonMode add-on。" },
      { label: "规则加载", detail: "加载 ecom-image/SKILL.md，叠加 Amazon 白底、A+、英文 callout 约束。" },
      { label: "参考图处理", detail: referenceImageCount > 0 ? `发现 ${referenceImageCount} 张参考图，主图与附图都需要保持同一产品外观。` : "没有参考图，将通过产品名和类目收敛主体描述。" },
      { label: "节点策略", detail: "确认后创建 6 个节点：白底主图、Lifestyle、Feature、Dimension、A+、Comparison。" },
    ],
  },
  "ugc-lifestyle": {
    packageMode: "ugc-lifestyle",
    styleMode: "ugc",
    defaultPlatform: "小红书",
    defaultPlatformValue: "xiaohongshu",
    agentTitle: "UGC 种草图导演",
    agentSubtitle: "UGC Lifestyle Image Director",
    categoryDefault: "apparel",
    styleModeDefault: "ugc",
    imageSetDefault: "full-set",
    messageWithoutProduct: "我会把方向切到素人、手机摄影、生活化种草，不走商业精修大片。先确认产品和使用场景。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的参考图会作为产品身份边界" : ""}。这次走 UGC 生活化路线，重点是真实、随拍、社媒可发。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "意图解析", detail: "识别为 UGC 生活方式图，不使用传统棚拍精修逻辑。" },
      { label: "路由锁定", detail: "route=ecomImageTrack，styleMode=ugc。" },
      { label: "规则加载", detail: "加载 ecom-image/references/ugc-style.md，切换到 iPhone/social realism。" },
      { label: "参考图处理", detail: referenceImageCount > 0 ? `发现 ${referenceImageCount} 张参考图，产品形态保持一致，场景与人物可以重构。` : "没有参考图，需要用产品名和类目约束主体。" },
      { label: "节点策略", detail: "确认后创建 5 个节点：手持/开箱、生活使用、细节近拍、种草封面、差异构图。" },
    ],
  },
  "editorial-stylist": {
    packageMode: "editorial-stylist",
    styleMode: "stylist",
    defaultPlatform: "通用",
    defaultPlatformValue: "general",
    agentTitle: "AI 造型师 / 视觉编辑",
    agentSubtitle: "Editorial Fashion Stylist",
    categoryDefault: "apparel",
    styleModeDefault: "stylist",
    imageSetDefault: "full-set",
    messageWithoutProduct: "我会按造型师和编辑大片逻辑处理：先定 Muse Profile、Archetype 和视觉调性，再创建画布节点。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的参考图会作为产品造型边界" : ""}。这次走 Editorial 大片路线，确认信息后再拆 5 个视觉 archetype。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "意图解析", detail: "识别为造型大片路线，目标是品牌调性和高转化视觉资产。" },
      { label: "路由锁定", detail: "route=ecomImageTrack，styleMode=stylist。" },
      { label: "规则加载", detail: "加载 ecom-image/references/fashion-stylist.md，进入 Muse Profile / Archetype 逻辑。" },
      { label: "参考图处理", detail: referenceImageCount > 0 ? `发现 ${referenceImageCount} 张参考图，保持产品身份，同时重构人物、服化道和光影。` : "没有参考图，需要通过产品名和类目先确定造型边界。" },
      { label: "节点策略", detail: "确认后创建 5 个节点：Hero Muse、三组 Archetype、Editorial 收束大片。" },
    ],
  },
  "ecom-planner": {
    packageMode: "full-set-8",
    styleMode: "default",
    defaultPlatform: "淘宝/天猫",
    defaultPlatformValue: "taobao",
    agentTitle: "电商套图企划师",
    agentSubtitle: "E-Commerce Planning Director",
    categoryDefault: "digital3c",
    styleModeDefault: "default",
    imageSetDefault: "full-set",
    messageWithoutProduct: "我会先基于产品图、可选竞品对标图和你的 brief，整理 3 套差异化电商套图企划方向。",
    messageWithProduct: (productName, referenceImageCount) =>
      `收到，${productName}${referenceImageCount > 0 ? " 的产品图和参考图会进入企划判断" : ""}。我会先生成 3 套可选择的套图企划方向。`,
    thinkingSteps: (referenceImageCount) => [
      { label: "资产清点", detail: "区分产品图和竞品对标图，产品图用于锁定产品 DNA，对标图只参考风格、光影和版式。" },
      { label: "企划推演", detail: "从平台、任务类型、卖点、人群和风格倾向推演 A/B/C 三套差异化方向。" },
      { label: "对标图处理", detail: referenceImageCount > 0 ? `检测到 ${referenceImageCount} 张附件，将在规则运行时作为视觉参考上下文。` : "未检测到附件，套图企划需要先上传产品图。" },
      { label: "红线审查", detail: "不编造未提供的参数、认证、尺寸或功效，保持产品外观和品牌识别一致。" },
      { label: "下一步", detail: "用户选中某套企划后，再转成 GenLink 画布工作流。" },
    ],
  },
};

const CATEGORY_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "数码 3C", value: "digital3c" },
  { label: "家用电器", value: "appliance" },
  { label: "服饰内衣", value: "apparel" },
  { label: "鞋靴箱包", value: "shoebag" },
  { label: "钟表珠宝", value: "watchjewelry" },
  { label: "美妆护肤", value: "beauty" },
  { label: "个护健康", value: "personal_care" },
  { label: "家居日用", value: "home_living" },
  { label: "其他/通用", value: "general" },
];

const PLATFORM_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "淘宝/天猫", value: "taobao" },
  { label: "京东", value: "jd" },
  { label: "拼多多", value: "pdd" },
  { label: "亚马逊", value: "amazon" },
  { label: "抖音小店", value: "douyin" },
  { label: "小红书", value: "xiaohongshu" },
  { label: "视频号小店", value: "weixin" },
  { label: "通用", value: "general" },
];

const IMAGE_SET_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "完整 8 图套图", value: "full-set" },
  { label: "仅平台主图（白底图）", value: "main" },
  { label: "详情页（模块化 SOP）", value: "detail" },
];

const STYLE_MODE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "通用商业精修（默认）", value: "default" },
  { label: "UGC 生活化上身图（素人种草）", value: "ugc" },
  { label: "造型师 / Editorial 大片（高转化模特图）", value: "stylist" },
];

const LANGUAGE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "中文", value: "zh" },
  { label: "英文", value: "en" },
  { label: "中英双语", value: "zh-en" },
  { label: "AI 根据平台决定", value: "auto" },
];

const COPY_MODE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "我提供文案，AI 负责排版和视觉化", value: "user-copy" },
  { label: "AI 根据产品信息起草一版，我确认", value: "ai-draft" },
  { label: "我有粗略卖点，AI 润色成详情页文案", value: "ai-polish" },
];

const STYLE_DIRECTION_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "高端极简", value: "premium-minimal" },
  { label: "科技感 / 参数感", value: "tech-spec" },
  { label: "温馨生活方式", value: "warm-lifestyle" },
  { label: "强促销 / 高转化", value: "promo-conversion" },
  { label: "亚马逊 A+ 简洁专业", value: "amazon-a-plus" },
  { label: "AI 根据产品和平台决定", value: "auto" },
];

const UGC_CONSTRUCT_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "Mirror Selfie 镜面自拍", value: "mirror_selfie" },
  { label: "Candid Street Snap 街拍抓拍", value: "street_snap" },
  { label: "0.5x 超广角", value: "super_wide" },
  { label: "Direct Flash 直闪", value: "direct_flash" },
  { label: "Lifestyle Seated 坐着生活场景", value: "lifestyle_seated" },
];

const MODEL_AGE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "18-25 校园 / 初入职场", value: "18-25" },
  { label: "25-35 都市青年", value: "25-35" },
  { label: "35-45 已婚 / 妈妈", value: "35-45" },
  { label: "45+ 银发轻熟", value: "45+" },
];

const SCENE_VIBE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "日常居家", value: "home" },
  { label: "通勤街景", value: "street" },
  { label: "咖啡馆 / 餐厅", value: "cafe" },
  { label: "户外 / 自然", value: "outdoor" },
  { label: "派对 / 夜场", value: "party" },
];

const ARCHETYPE_COUNT_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "3 个 Archetype（精简套图，约 4 张）", value: "3" },
  { label: "5 个 Archetype（完整 5 大片，约 6 张）", value: "5" },
  { label: "7 个 Archetype（深度多人设套图，约 8 张）", value: "7" },
];

const AESTHETIC_VIBE_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "Minimalist 极简", value: "minimalist" },
  { label: "Edgy 锐感", value: "edgy" },
  { label: "Romantic 浪漫", value: "romantic" },
  { label: "Athleisure 运动休闲", value: "athleisure" },
  { label: "Bohemian 波西米亚", value: "bohemian" },
  { label: "Preppy 学院", value: "preppy" },
  { label: "Dark Academia 暗黑学院", value: "dark_academia" },
  { label: "Old Money 老钱", value: "old_money" },
];

const ENVIRONMENT_OPTIONS: OpenClawPlanfEcomOption[] = [
  { label: "Raw Concrete 工业混凝土", value: "raw_concrete" },
  { label: "Warm Sandstone 暖沙岩", value: "warm_sandstone" },
  { label: "Gallery White 画廊白", value: "gallery_white" },
  { label: "Mid-Century Modern Interior 中世纪现代室内", value: "midcentury_interior" },
  { label: "Glass Architecture 玻璃建筑", value: "glass_architecture" },
  { label: "AI 帮我搭配", value: "auto" },
];

function extractProductName(request: string): string {
  const match = request.match(/(?:产品是|产品|product)\s*[:：]\s*([^\n\r；;]+)/i);

  return match?.[1]?.trim() || "";
}

function readOptionLabel(options: OpenClawPlanfEcomOption[], value?: string): string {
  return options.find((option) => option.value === value)?.label || value || "";
}

function resolveImageSet(
  preset: PlanfEcomPresetId,
  value?: string,
): "full-set" | "detail" | "main" {
  if (preset === "detail-page-pack" || value === "detail") {
    return "detail";
  }

  if (value === "main") {
    return "main";
  }

  return "full-set";
}

function resolveStyleMode(value?: string): "default" | "ugc" | "stylist" {
  return value === "ugc" || value === "stylist" ? value : "default";
}

function buildPlanImageSlots(params: {
  imageSet: "full-set" | "detail" | "main";
  anchorMode: "user-upload" | "white-bg-first" | "single-shot";
  deliveryRounds: 1 | 2;
  preset: PlanfEcomPresetId;
}): OpenClawPlanfEcomImagePlan["imageSlots"] {
  if (params.imageSet === "main") {
    return [{
      index: 1,
      slot: "白底图（平台主图）",
      round: 1,
      subType: params.anchorMode === "user-upload" ? "image-image" : "text-image",
      anchorSource: params.anchorMode === "user-upload" ? "上传产品图" : "独立生成",
      ratio: "1:1",
      intent: "纯白背景展示产品全貌，保证平台主图合规。",
    }];
  }

  if (params.imageSet === "detail") {
    return [
      "首屏 KV",
      "核心卖点模块 1",
      "核心卖点模块 2",
      "细节/材质模块",
      "使用场景/收束模块",
    ].map((slot, index) => ({
      index: index + 1,
      slot,
      round: params.deliveryRounds === 2 && index > 0 ? 2 : 1,
      subType: index === 0 && params.anchorMode !== "user-upload" ? "text-image" : "image-image",
      anchorSource: params.anchorMode === "user-upload"
        ? "上传产品图"
        : index === 0 ? "独立主锚白底" : "第 1 轮主锚白底真实 nodeId",
      ratio: "1:1",
      intent: `${slot}，承载详情页文案策略和模块化视觉表达。`,
    }));
  }

  const slots = [
    ["白底图（主锚）", "纯白背景商品全貌，作为整套产品一致性锚点。"],
    ["场景图 A（具象）", "真实生活使用场景，增强代入感。"],
    ["场景图 B（抽象）", "高级质感场景，提升品牌调性。"],
    ["卖点图 1（左右布局）", "核心卖点 + 参数文案区。"],
    ["卖点图 2（上下布局）", "次卖点 + 文案说明。"],
    ["卖点图 3（中心环绕）", "第三卖点或系列展示。"],
    ["用户使用图", "真实用户使用场景，强化可信度。"],
    ["细节图", "微距特写材质、工艺或核心部件。"],
  ] as const;

  return slots.map(([slot, intent], index) => ({
    index: index + 1,
    slot,
    round: params.deliveryRounds === 2 && index > 0 ? 2 : 1,
    subType: index === 0 && params.anchorMode !== "user-upload" ? "text-image" : "image-image",
    anchorSource: params.anchorMode === "user-upload"
      ? "上传产品图"
      : index === 0 ? "独立主锚白底" : "第 1 轮主锚白底真实 nodeId",
    ratio: "1:1",
    intent,
  }));
}

function buildEcomImagePlan(input: OpenClawPlanfEcomConfirmInput): OpenClawPlanfEcomImagePlan {
  const presetConfig = PRESET_TO_MODE[input.session.preset];
  const productName = input.values.productName.trim();
  const platformValue = input.values.platform || presetConfig.defaultPlatformValue;
  const categoryValue = input.values.category || presetConfig.categoryDefault;
  const imageSet = resolveImageSet(input.session.preset, input.values.imageSet);
  const styleMode = resolveStyleMode(input.values.styleMode || presetConfig.styleModeDefault);
  const platform = readOptionLabel(PLATFORM_OPTIONS, platformValue);
  const category = readOptionLabel(CATEGORY_OPTIONS, categoryValue);
  const anchorMode = input.session.referenceImageCount > 0
    ? "user-upload"
    : imageSet === "main" ? "single-shot" : "white-bg-first";
  const deliveryRounds = anchorMode === "white-bg-first" ? 2 : 1;
  const imageSlots = buildPlanImageSlots({
    imageSet,
    anchorMode,
    deliveryRounds,
    preset: input.session.preset,
  });
  const sellingPoints = [
    ...(input.values.sellingPoints ?? []),
    input.values.sellingPointsText?.trim(),
  ].filter((item): item is string => Boolean(item));
  const extraConstraints = [
    sellingPoints.length ? `核心卖点：${sellingPoints.join("、")}` : undefined,
    input.values.styleLayer ? `风格补充：${input.values.styleLayer}` : undefined,
    input.session.referenceImageCount > 0
      ? `参考图数量：${input.session.referenceImageCount}，保持产品身份、结构、颜色与参考图一致`
      : "未上传产品图，按规则先做主锚白底再扇出",
  ].filter((item): item is string => Boolean(item)).join("；");

  return {
    type: imageSet === "detail" ? "ecom-detail-page-plan" : "ecom-image-plan",
    title: `${productName} 电商主图集编排`,
    domain: "ecom-image",
    phase: 1,
    totalPhases: 2,
    checkpoint: true,
    checkpointPrompt: `编排已出（${anchorMode}，${deliveryRounds} 轮交付），下一步？A 确认开始生成 / B 调整某张方向 / C 只要其中某几张 / D 换风格`,
    meta: {
      productName,
      category,
      platform,
      imageSet,
      anchorMode,
      amazonMode: input.session.preset === "amazon-adapter" || platformValue === "amazon",
      mainRatio: "1:1",
      totalImages: imageSlots.length,
      deliveryRounds,
      styleMode,
      extraConstraints,
    },
    imageSlots,
    options: [
      { id: "A", label: "确认编排，开始生成" },
      { id: "B", label: "调整某张图的方向 / 文案" },
      { id: "C", label: "只要其中某几张（去掉其他）" },
      { id: "D", label: "换一个场景方向 / 风格" },
    ],
  };
}

function buildBaseFields(
  input: OpenClawPlanfEcomStartInput,
  productName: string,
  presetConfig: (typeof PRESET_TO_MODE)[PlanfEcomPresetId],
): OpenClawPlanfEcomField[] {
  const fields: OpenClawPlanfEcomField[] = [
    {
      id: "productName",
      label: "产品 / 品牌名",
      type: "text",
      value: productName,
      required: true,
      placeholder: "如：戴森 V12 吸尘器、小白牙儿童牙膏...",
    },
    {
      id: "productAsset",
      label: "产品图（强烈建议上传）",
      type: "upload",
      value: "",
      accept: "image",
      required: false,
      hint: "上传后作为产品一致性锚点；未上传时会先生成主锚白底，再扇出其余产品图。",
    },
    {
      id: "category",
      label: "类目",
      type: "select",
      value: presetConfig.categoryDefault,
      options: CATEGORY_OPTIONS,
      required: true,
    },
    {
      id: "platform",
      label: "投放平台",
      type: "select",
      value: presetConfig.defaultPlatformValue,
      options: PLATFORM_OPTIONS,
      required: true,
    },
  ];

  if (input.preset === "detail-page-pack") {
    fields.push(
      {
        id: "language",
        label: "详情页语种",
        type: "select",
        value: presetConfig.defaultPlatformValue === "amazon" ? "en" : "auto",
        options: LANGUAGE_OPTIONS,
        required: true,
      },
      {
        id: "copyMode",
        label: "文案模式",
        type: "select",
        value: "ai-draft",
        options: COPY_MODE_OPTIONS,
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点 / 用户已有卖点文案",
        type: "text",
        value: "",
        required: false,
        placeholder: "如：12000Pa 大吸力 / 紫外线杀菌 / 无线轻量化；也可以粘贴完整卖点文案",
      },
      {
        id: "styleDirection",
        label: "视觉风格",
        type: "select",
        value: "auto",
        options: STYLE_DIRECTION_OPTIONS,
        required: false,
      },
    );
  } else {
    fields.push(
      {
        id: "sellingPoints",
        label: "核心卖点（1-3 条，会进入卖点图）",
        type: "text",
        value: "",
        required: false,
        placeholder: "如：便携低音 / 防水防尘 / 长续航 / 蓝牙稳定连接",
      },
      {
        id: "imageSet",
        label: "图集范围",
        type: "select",
        value: presetConfig.imageSetDefault,
        options: IMAGE_SET_OPTIONS,
        required: false,
      },
      {
        id: "styleMode",
        label: "风格层",
        type: "select",
        value: presetConfig.styleModeDefault,
        options: STYLE_MODE_OPTIONS,
        required: false,
        hint: "UGC / 造型师会自动把 full-set 重写为 1 白底 + 5 风格化大片。",
      },
      {
        id: "mainColor",
        label: "品牌主色（如有）",
        type: "text",
        value: "",
        required: false,
        placeholder: "如：深蓝 #2A5C8F、橙色 #FF6B35",
      },
    );
  }

  if (input.preset === "ugc-lifestyle") {
    fields.push(
      {
        id: "ugcConstructPriority",
        label: "重点构图（多选，会进入 5 图变体）",
        type: "multi-select",
        value: ["mirror_selfie", "street_snap", "direct_flash"],
        options: UGC_CONSTRUCT_OPTIONS,
        required: false,
        maxSelected: 5,
      },
      {
        id: "modelAge",
        label: "素人模特年龄段",
        type: "select",
        value: "25-35",
        options: MODEL_AGE_OPTIONS,
        required: false,
      },
      {
        id: "sceneVibe",
        label: "场景氛围",
        type: "select",
        value: "street",
        options: SCENE_VIBE_OPTIONS,
        required: false,
      },
    );
  }

  if (input.preset === "editorial-stylist") {
    fields.push(
      {
        id: "archetypeCount",
        label: "Archetype 数量",
        type: "select",
        value: "5",
        options: ARCHETYPE_COUNT_OPTIONS,
        required: false,
      },
      {
        id: "aestheticVibePreference",
        label: "偏好 Aesthetic Vibe（多选，会进入 Archetype 设计）",
        type: "multi-select",
        value: ["minimalist", "old_money"],
        options: AESTHETIC_VIBE_OPTIONS,
        required: false,
        maxSelected: 8,
      },
      {
        id: "environmentPreference",
        label: "环境偏好",
        type: "select",
        value: "auto",
        options: ENVIRONMENT_OPTIONS,
        required: false,
      },
    );
  }

  return fields;
}

export function startPlanfEcomSession(
  input: OpenClawPlanfEcomStartInput,
): OpenClawPlanfEcomSession {
  const request = input.request.trim();
  const presetConfig = PRESET_TO_MODE[input.preset];
  const productName = extractProductName(request);

  return {
    sessionId: randomUUID(),
    route: "ecomImageTrack",
    phase: "collecting",
    preset: input.preset,
    request,
    referenceImageCount: input.referenceImageCount ?? 0,
    stateHeader: "【State】phase=triage | nextAction=ecom-image | route=ecomImageTrack",
    protocol: {
      name: "form-fields",
      trigger: "本地 RH 兼容协议模板已生成结构化询问表单。模型规则生成成功时会替换为模型输出字段。",
      responsePath: "用户提交表单后回填产品、类目、平台、卖点和风格参数，再激活 ecom-image/SKILL.md §8 Step 2。",
    },
    agent: {
      title: presetConfig.agentTitle,
      subtitle: presetConfig.agentSubtitle,
    },
    message: productName
      ? presetConfig.messageWithProduct(productName, input.referenceImageCount ?? 0)
      : presetConfig.messageWithoutProduct,
    thinkingSteps: presetConfig.thinkingSteps(input.referenceImageCount ?? 0),
    fields: buildBaseFields(input, productName, presetConfig),
  };
}

export function confirmPlanfEcomSession(input: OpenClawPlanfEcomConfirmInput): OpenClawPlanfEcomConfirmResult {
  const plan = buildEcomImagePlan(input);

  return {
    ok: true,
    summary: `${plan.meta.productName} 的电商图编排方案已生成，等待确认后再进入 Prompt Pack / workflow-json。`,
    protocol: {
      name: "creative-doc",
      type: plan.type,
    },
    plan,
    values: input.values,
  };
}

export function createPlanfEcomWorkflowFromPlan(input: OpenClawPlanfEcomConfirmInput) {
  const presetConfig = PRESET_TO_MODE[input.session.preset];
  const plan = buildEcomImagePlan(input);
  const productName = input.values.productName.trim();
  const sellingPoints = input.values.sellingPoints?.filter(Boolean) ?? [];
  const sellingPointsText = input.values.sellingPointsText?.trim();
  const platformValue = input.values.platform || presetConfig.defaultPlatformValue;
  const categoryValue = input.values.category;
  const styleModeValue = input.values.styleMode || presetConfig.styleModeDefault;
  const platform = readOptionLabel(PLATFORM_OPTIONS, platformValue);
  const category = readOptionLabel(CATEGORY_OPTIONS, categoryValue);
  const styleModeLabel = readOptionLabel(STYLE_MODE_OPTIONS, styleModeValue);
  const sellingPointLabels = sellingPoints.map((point) => (
    point
  ));
  const extraConstraints = [
    category ? `类目：${category}` : undefined,
    sellingPointLabels.length ? `核心卖点：${sellingPointLabels.join("、")}` : undefined,
    sellingPointsText ? `核心卖点补充：${sellingPointsText}` : undefined,
    input.values.imageSet ? `图集范围：${readOptionLabel(IMAGE_SET_OPTIONS, input.values.imageSet)}` : undefined,
    styleModeLabel ? `风格层：${styleModeLabel}` : undefined,
    input.values.styleLayer ? `风格补充：${input.values.styleLayer}` : undefined,
    plan.meta.anchorMode === "white-bg-first"
      ? "当前为 white-bg-first 第 1 轮：只生成 #1 主锚白底图，等待用户选择真实 nodeId 后再扇出其余图片"
      : undefined,
    input.session.referenceImageCount > 0
      ? `参考图数量：${input.session.referenceImageCount}，必须保持产品身份、结构、颜色与参考图一致`
      : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join("；");

  return createPlanfEcomWorkflowResponse({
    request: `${input.session.request}；确认产品：${productName}`,
    product: productName,
    platform,
    styleMode: presetConfig.styleMode,
    packageMode: plan.meta.anchorMode === "white-bg-first" ? "single" : presetConfig.packageMode,
    aspectRatio: "1:1",
    extraConstraints,
  });
}

export function createPlanfEcomWorkflowFromAnchor(input: OpenClawPlanfEcomAnchorInput) {
  const presetConfig = PRESET_TO_MODE[input.session.preset];
  const plan = buildEcomImagePlan(input);
  const productName = input.values.productName.trim();
  const sellingPoints = input.values.sellingPoints?.filter(Boolean) ?? [];
  const sellingPointsText = input.values.sellingPointsText?.trim();
  const platformValue = input.values.platform || presetConfig.defaultPlatformValue;
  const categoryValue = input.values.category;
  const styleModeValue = input.values.styleMode || presetConfig.styleModeDefault;
  const platform = readOptionLabel(PLATFORM_OPTIONS, platformValue);
  const category = readOptionLabel(CATEGORY_OPTIONS, categoryValue);
  const styleModeLabel = readOptionLabel(STYLE_MODE_OPTIONS, styleModeValue);
  const extraConstraints = [
    category ? `类目：${category}` : undefined,
    sellingPoints.length ? `核心卖点：${sellingPoints.join("、")}` : undefined,
    sellingPointsText ? `核心卖点补充：${sellingPointsText}` : undefined,
    input.values.imageSet ? `图集范围：${readOptionLabel(IMAGE_SET_OPTIONS, input.values.imageSet)}` : undefined,
    styleModeLabel ? `风格层：${styleModeLabel}` : undefined,
    input.values.styleLayer ? `风格补充：${input.values.styleLayer}` : undefined,
    `white-bg-first 第 2 轮：#1 主锚白底已由用户确认，anchorNodeId=${input.anchor.nodeId}，anchorOutputUrl=${input.anchor.outputUrl}`,
    `其余图片必须以 anchorOutputUrl=${input.anchor.outputUrl} 为唯一产品外观锚点，保留主锚图中产品的全部外观特征、结构、颜色、材质、品牌识别和比例，不要重新发明产品。`,
  ]
    .filter((item): item is string => Boolean(item))
    .join("；");
  const response = createPlanfEcomWorkflowResponse({
    request: `${input.session.request}；确认产品：${productName}；使用已确认主锚白底扇出其余图`,
    product: productName,
    platform,
    styleMode: presetConfig.styleMode,
    packageMode: presetConfig.packageMode,
    aspectRatio: "1:1",
    extraConstraints,
  });
  const workflow = {
    ...response.workflow,
    nodes: response.workflow.nodes.filter((node) => node.id !== "image-1"),
    edges: response.workflow.edges.filter((edge) => edge.source !== "image-1" && edge.target !== "image-1"),
  };
  const actionsWithoutAnchorImage = response.actions.filter((action) => {
    if (action.type === "create_image_generation_node") {
      return action.clientActionId !== "image-1";
    }

    if (action.type === "connect_nodes") {
      const sourceIsAnchorImage = action.sourceRef.kind === "created" && action.sourceRef.clientActionId === "image-1";
      const targetIsAnchorImage = action.targetRef.kind === "created" && action.targetRef.clientActionId === "image-1";

      return !sourceIsAnchorImage && !targetIsAnchorImage;
    }

    return true;
  });
  const imageActionIds = actionsWithoutAnchorImage
    .filter((action) => action.type === "create_image_generation_node")
    .map((action) => action.clientActionId);
  const anchorConnections: CanvasAgentAction[] = imageActionIds.map((clientActionId) => ({
    type: "connect_nodes",
    sourceRef: { kind: "existing", nodeId: input.anchor.nodeId },
    targetRef: { kind: "created", clientActionId },
  }));

  return {
    ...response,
    summary: `${plan.meta.productName} 的主锚白底已确认，正在扇出其余 ${imageActionIds.length} 张电商图 workflow。`,
    workflow,
    actions: [...actionsWithoutAnchorImage, ...anchorConnections],
  };
}
