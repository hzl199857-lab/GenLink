import type { AgentPanelMessage } from "@/types/agent";
import { resolveEcomDeliverySpec } from "../ecom-delivery-spec";
import type {
  OpenClawPlanfEcomImagePlan,
} from "./planf-ecom-session";

type EcomReferenceSession = {
  referenceImageCount: number;
  preset?: string;
};

type EcomReferenceValues = {
  imageSet?: string;
  styleMode?: string;
  platform?: string;
};

type EcomPlanReferenceModeShape = {
  checkpointPrompt: string;
  meta: {
    imageSet: string;
    styleMode: string;
    platform: string;
    anchorMode: string;
    deliveryRounds: number;
    totalImages: number;
    mainRatio?: string;
    extraConstraints?: string;
  };
  imageSlots: Array<{
    index: number;
    slot: string;
    round: number;
    subType: string;
    anchorSource: string;
    ratio: string;
    intent: string;
  }>;
};

type AgentPanelEcomPlan = Extract<
  AgentPanelMessage,
  { type: "planf_ecom_plan" }
>["plan"];

const PLATFORM_LABELS: Record<string, string> = {
  taobao: "淘宝/天猫",
  jd: "京东",
  pdd: "拼多多",
  amazon: "亚马逊",
  douyin: "抖音小店",
  xiaohongshu: "小红书",
  rednote: "小红书",
  weixin: "视频号小店",
  general: "通用",
};

export function reconcileOpenClawEcomPlanReferenceMode(
  plan: OpenClawPlanfEcomImagePlan,
  session: EcomReferenceSession,
  values?: EcomReferenceValues,
): OpenClawPlanfEcomImagePlan;
export function reconcileOpenClawEcomPlanReferenceMode(
  plan: AgentPanelEcomPlan,
  session: EcomReferenceSession,
  values?: EcomReferenceValues,
): AgentPanelEcomPlan;
export function reconcileOpenClawEcomPlanReferenceMode(
  plan: EcomPlanReferenceModeShape,
  session: EcomReferenceSession,
  values?: EcomReferenceValues,
): EcomPlanReferenceModeShape {
  const imageSet = values?.imageSet?.trim() || plan.meta.imageSet;
  const styleMode = values?.styleMode?.trim() || plan.meta.styleMode;
  const platform = values?.platform?.trim() || plan.meta.platform;
  const deliverySpec = resolveEcomDeliverySpec({
    preset: session.preset,
    imageSet,
    styleMode,
    platform,
  });
  const anchorMode = session.referenceImageCount > 0
    ? "user-upload"
    : deliverySpec.imageSet === "main" ? "single-shot" : "white-bg-first";
  const deliveryRounds: 1 | 2 = anchorMode === "white-bg-first" ? 2 : 1;
  const referenceConstraint = session.referenceImageCount > 0
    ? `参考图数量：${session.referenceImageCount}，必须保持产品身份、结构、颜色与参考图一致`
    : "当前任务没有上传产品参考图";
  const modelSlotsMatchSpec = plan.imageSlots.length === deliverySpec.slots.length &&
    plan.meta.imageSet === deliverySpec.imageSet &&
    plan.meta.styleMode === deliverySpec.styleMode;

  return {
    ...plan,
    checkpointPrompt: `编排已出（${anchorMode}，${deliveryRounds} 轮交付），下一步？A 确认开始生成 / B 调整某张方向 / C 只要其中某几张 / D 换风格`,
    meta: {
      ...plan.meta,
      imageSet: deliverySpec.imageSet,
      styleMode: deliverySpec.styleMode,
      platform: PLATFORM_LABELS[platform.toLowerCase()] ?? platform,
      anchorMode,
      deliveryRounds,
      totalImages: deliverySpec.slots.length,
      mainRatio: deliverySpec.primaryRatio,
      extraConstraints: [(plan.meta.extraConstraints ?? "").trim(), referenceConstraint]
        .filter(Boolean)
        .join("；"),
    },
    imageSlots: deliverySpec.slots.map((canonicalSlot, index) => {
      const modelSlot = modelSlotsMatchSpec ? plan.imageSlots[index] : undefined;
      const slot = {
        ...canonicalSlot,
        slot: modelSlot?.slot?.trim() || canonicalSlot.slot,
        intent: modelSlot?.intent?.trim() || canonicalSlot.intent,
      };

      if (anchorMode === "user-upload") {
        return {
          index: index + 1,
          ...slot,
          round: 1,
          subType: "image-image",
          anchorSource: "上传产品图",
        };
      }

      if (anchorMode === "white-bg-first") {
        const isIncludedWhiteBackground = deliverySpec.includesWhiteBackground && index === 0;

        return {
          index: index + 1,
          ...slot,
          round: isIncludedWhiteBackground ? 1 : 2,
          subType: isIncludedWhiteBackground ? "text-image" : "image-image",
          anchorSource: isIncludedWhiteBackground ? "独立主锚白底" : "第 1 轮主锚白底真实 nodeId",
        };
      }

      return {
        index: index + 1,
        ...slot,
        round: 1,
        subType: "text-image",
        anchorSource: "独立生成",
      };
    }),
  };
}
