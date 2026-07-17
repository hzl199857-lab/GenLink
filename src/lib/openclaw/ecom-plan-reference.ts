import type { AgentPanelMessage } from "@/types/agent";
import type {
  OpenClawPlanfEcomImagePlan,
} from "./planf-ecom-session";

type EcomReferenceSession = {
  referenceImageCount: number;
};

type EcomReferenceValues = {
  imageSet?: string;
};

type EcomPlanReferenceModeShape = {
  checkpointPrompt: string;
  meta: {
    imageSet: string;
    anchorMode: string;
    deliveryRounds: number;
    extraConstraints?: string;
  };
  imageSlots: Array<{
    round: number;
    subType: string;
    anchorSource: string;
  }>;
};

type AgentPanelEcomPlan = Extract<
  AgentPanelMessage,
  { type: "planf_ecom_plan" }
>["plan"];

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
  const anchorMode = session.referenceImageCount > 0
    ? "user-upload"
    : imageSet === "main" ? "single-shot" : "white-bg-first";
  const deliveryRounds: 1 | 2 = anchorMode === "white-bg-first" ? 2 : 1;
  const referenceConstraint = session.referenceImageCount > 0
    ? `参考图数量：${session.referenceImageCount}，必须保持产品身份、结构、颜色与参考图一致`
    : "当前任务没有上传产品参考图";

  return {
    ...plan,
    checkpointPrompt: `编排已出（${anchorMode}，${deliveryRounds} 轮交付），下一步？A 确认开始生成 / B 调整某张方向 / C 只要其中某几张 / D 换风格`,
    meta: {
      ...plan.meta,
      anchorMode,
      deliveryRounds,
      extraConstraints: [(plan.meta.extraConstraints ?? "").trim(), referenceConstraint]
        .filter(Boolean)
        .join("；"),
    },
    imageSlots: plan.imageSlots.map((slot, index) => {
      if (anchorMode === "user-upload") {
        return {
          ...slot,
          round: 1,
          subType: "image-image",
          anchorSource: "上传产品图",
        };
      }

      if (anchorMode === "white-bg-first") {
        return {
          ...slot,
          round: index === 0 ? 1 : 2,
          subType: index === 0 ? "text-image" : "image-image",
          anchorSource: index === 0 ? "独立主锚白底" : "第 1 轮主锚白底真实 nodeId",
        };
      }

      return {
        ...slot,
        round: 1,
        subType: "text-image",
        anchorSource: "独立生成",
      };
    }),
  };
}
