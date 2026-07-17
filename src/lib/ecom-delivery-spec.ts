export type PlanfEcomPackageMode =
  | "single"
  | "full-set-8"
  | "detail-page-pack"
  | "amazon-adapter"
  | "ugc-lifestyle"
  | "editorial-stylist";

export type EcomDeliveryPresetId =
  | "full-set-8"
  | "detail-page-pack"
  | "amazon-adapter"
  | "ugc-lifestyle"
  | "editorial-stylist"
  | "ecom-planner";

export type EcomImageSet = "full-set" | "detail" | "main";
export type EcomDeliveryStyleMode = "default" | "ugc" | "stylist";
export type EcomImageAspectRatio = "1:1" | "3:4" | "4:5";

export type EcomDeliverySlot = {
  slot: string;
  intent: string;
  ratio: EcomImageAspectRatio;
};

export type EcomDeliverySpec = {
  packageMode: PlanfEcomPackageMode;
  imageSet: EcomImageSet;
  styleMode: EcomDeliveryStyleMode;
  primaryRatio: EcomImageAspectRatio;
  includesWhiteBackground: boolean;
  slots: EcomDeliverySlot[];
};

const PACKAGE_SLOTS: Record<PlanfEcomPackageMode, readonly EcomDeliverySlot[]> = {
  single: [
    {
      slot: "白底图（平台主图）",
      intent: "纯白背景完整展示产品外观，作为平台合规主图和产品身份锚点。",
      ratio: "1:1",
    },
  ],
  "full-set-8": [
    { slot: "白底图（主锚）", intent: "纯白背景商品全貌，作为整套产品一致性锚点。", ratio: "1:1" },
    { slot: "场景图 A（具象）", intent: "真实生活使用场景，增强用户代入感。", ratio: "1:1" },
    { slot: "场景图 B（抽象）", intent: "品牌化氛围场景，提升整体视觉调性。", ratio: "1:1" },
    { slot: "卖点图 1（左右布局）", intent: "核心卖点和参数文案区。", ratio: "1:1" },
    { slot: "卖点图 2（上下布局）", intent: "次要卖点和使用收益说明。", ratio: "1:1" },
    { slot: "卖点图 3（中心环绕）", intent: "第三卖点、系列或配件关系展示。", ratio: "1:1" },
    { slot: "用户使用图", intent: "真实用户使用场景，强化可信度。", ratio: "1:1" },
    { slot: "细节图", intent: "微距展示材质、结构和核心工艺。", ratio: "1:1" },
  ],
  "detail-page-pack": [
    { slot: "首屏 KV", intent: "第一眼建立产品定位、核心利益点和视觉记忆。", ratio: "3:4" },
    { slot: "核心卖点模块 1", intent: "解释第一购买理由及其可信证明。", ratio: "3:4" },
    { slot: "核心卖点模块 2", intent: "解释第二购买理由、结构或使用收益。", ratio: "3:4" },
    { slot: "细节/材质模块", intent: "通过材质、结构和工艺细节建立品质信任。", ratio: "1:1" },
    { slot: "使用场景/收束模块", intent: "用目标用户场景完成价值收束。", ratio: "4:5" },
  ],
  "amazon-adapter": [
    { slot: "Amazon 白底主图", intent: "严格纯白背景，完整清晰展示产品全貌。", ratio: "1:1" },
    { slot: "Lifestyle 场景图", intent: "欧美家庭或商业使用场景。", ratio: "1:1" },
    { slot: "Feature callout 1", intent: "英文短文案突出第一核心功能。", ratio: "1:1" },
    { slot: "Feature callout 2", intent: "英文短文案解释第二功能或使用收益。", ratio: "1:1" },
    { slot: "Dimension 图", intent: "英文尺寸、比例和配件关系说明。", ratio: "1:1" },
    { slot: "A+ 品牌模块图", intent: "品牌化排版、产品细节和信任信息。", ratio: "1:1" },
    { slot: "Comparison 图", intent: "英文卖点对比和套装价值。", ratio: "1:1" },
  ],
  "ugc-lifestyle": [
    { slot: "白底图（主锚）", intent: "纯白背景完整展示产品外观，锁定后续 UGC 图的产品身份。", ratio: "1:1" },
    { slot: "Mirror Selfie 镜面自拍", intent: "真实手机镜面自拍，产品在身上或手中清晰可见。", ratio: "1:1" },
    { slot: "Candid Street Snap 街拍抓拍", intent: "自然街景抓拍，保持素人感和真实动作。", ratio: "1:1" },
    { slot: "0.5x 超广角", intent: "iPhone 0.5x 近距离构图，产品位于有冲击力的前景。", ratio: "1:1" },
    { slot: "Direct Flash 直闪", intent: "直接闪光灯和轻胶片质感的生活瞬间。", ratio: "1:1" },
    { slot: "Lifestyle Seated 坐姿生活场景", intent: "咖啡馆、家居或餐桌中的放松生活场景。", ratio: "1:1" },
  ],
  "editorial-stylist": [
    { slot: "白底图（主锚）", intent: "纯白背景完整展示产品外观，锁定编辑大片中的产品身份。", ratio: "1:1" },
    { slot: "Archetype 1 编辑大片", intent: "第一类客群与审美人设的全身编辑大片。", ratio: "1:1" },
    { slot: "Archetype 2 编辑大片", intent: "第二类客群与差异化视觉气质的全身大片。", ratio: "1:1" },
    { slot: "Archetype 3 编辑大片", intent: "第三类客群与场景叙事的半身或全身大片。", ratio: "1:1" },
    { slot: "Archetype 4 编辑大片", intent: "第四类客群与独立造型语言的编辑大片。", ratio: "1:1" },
    { slot: "Archetype 5 产品特写", intent: "以产品为主角的高级感细节特写和收束大片。", ratio: "1:1" },
  ],
};

function normalizeImageSet(preset: string | undefined, imageSet: string | undefined): EcomImageSet {
  if (preset === "detail-page-pack" || imageSet === "detail") {
    return "detail";
  }

  if (imageSet === "main") {
    return "main";
  }

  return "full-set";
}

function normalizeStyleMode(
  preset: string | undefined,
  styleMode: string | undefined,
): EcomDeliveryStyleMode {
  if (styleMode === "ugc" || styleMode === "stylist") {
    return styleMode;
  }

  if (preset === "ugc-lifestyle") {
    return "ugc";
  }

  if (preset === "editorial-stylist") {
    return "stylist";
  }

  return "default";
}

function isRednotePlatform(platform: string | undefined): boolean {
  const value = platform?.trim().toLowerCase() ?? "";

  return value === "xiaohongshu" ||
    value === "rednote" ||
    value === "xhs" ||
    value.includes("小红书");
}

function resolvePackageMode(input: {
  preset?: string;
  imageSet: EcomImageSet;
  styleMode: EcomDeliveryStyleMode;
}): PlanfEcomPackageMode {
  if (input.imageSet === "main") {
    return "single";
  }

  if (input.imageSet === "detail") {
    return "detail-page-pack";
  }

  if (input.styleMode === "ugc") {
    return "ugc-lifestyle";
  }

  if (input.styleMode === "stylist") {
    return "editorial-stylist";
  }

  return input.preset === "amazon-adapter" ? "amazon-adapter" : "full-set-8";
}

export function resolveEcomDeliverySpec(input: {
  preset?: string;
  imageSet?: string;
  styleMode?: string;
  platform?: string;
}): EcomDeliverySpec {
  const imageSet = normalizeImageSet(input.preset, input.imageSet);
  const styleMode = normalizeStyleMode(input.preset, input.styleMode);
  const packageMode = resolvePackageMode({ preset: input.preset, imageSet, styleMode });
  const rednote = isRednotePlatform(input.platform);
  const primaryRatio: EcomImageAspectRatio = rednote ? "3:4" : "1:1";
  const slots = PACKAGE_SLOTS[packageMode].map((slot) => ({
    ...slot,
    ratio: packageMode === "detail-page-pack"
      ? rednote ? "3:4" : slot.ratio
      : primaryRatio,
  }));

  return {
    packageMode,
    imageSet,
    styleMode,
    primaryRatio,
    includesWhiteBackground: packageMode !== "detail-page-pack",
    slots,
  };
}

export function getEcomPackageSlots(
  packageMode: PlanfEcomPackageMode,
  platform?: string,
): EcomDeliverySlot[] {
  return resolveEcomDeliverySpec({
    preset: packageMode,
    imageSet: packageMode === "single" ? "main" : packageMode === "detail-page-pack" ? "detail" : "full-set",
    styleMode: packageMode === "ugc-lifestyle" ? "ugc" : packageMode === "editorial-stylist" ? "stylist" : "default",
    platform,
  }).slots;
}

export function getEcomFanoutImageCount(spec: EcomDeliverySpec): number {
  return Math.max(0, spec.slots.length - (spec.includesWhiteBackground ? 1 : 0));
}
