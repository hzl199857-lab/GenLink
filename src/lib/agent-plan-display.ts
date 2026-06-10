import { getImageModelLabel } from "./image-generation-options";
import type { AgentImageGenerationPreference, AgentPanelMessage } from "../types/agent";

export type PlanfEcomPlanStatus = Extract<
  AgentPanelMessage,
  { type: "planf_ecom_plan" }
>["status"];

export type PlanfEcomImageSummary = {
  modelLabel: string;
  aspectRatio: string;
  quality: string;
  taskLabel: string;
};

export function getPlanfEcomImageSummary(input: {
  preference: Required<AgentImageGenerationPreference>;
  taskCount: number;
}): PlanfEcomImageSummary {
  return {
    modelLabel: getImageModelLabel(input.preference.model),
    aspectRatio: input.preference.aspectRatio,
    quality: input.preference.quality,
    taskLabel: `${input.taskCount} 个任务`,
  };
}

export function getPlanfEcomSlotKey(input: {
  messageId: string;
  slotIndex: number;
  slotId: number;
}): string {
  return `${input.messageId}:${input.slotId}:${input.slotIndex}`;
}

export function getPlanfEcomPlanStatusLabel(status: PlanfEcomPlanStatus): string {
  switch (status) {
    case "waiting_confirmation":
      return "已确认";
    case "adjusting":
      return "需调整";
    case "submitted":
      return "已提交";
    case "completed":
      return "已创建";
    case "error":
      return "需重试";
  }
}
