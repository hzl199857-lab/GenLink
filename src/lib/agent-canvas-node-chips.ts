import type { AgentPanelMessage } from "@/types/agent";
import { formatAgentCanvasNodeChipTitle } from "./agent-chat-display";

export type AgentCanvasNodeChip = {
  id: string;
  title: string;
  typeLabel: string;
  nodeId?: string;
};

export function getAgentCanvasNodeChips(
  message: Extract<AgentPanelMessage, { type: "execution_plan" }>,
): AgentCanvasNodeChip[] {
  if (message.groupId) {
    const generationCount = message.imageGenerationNodeIds?.length || 0;

    return [{
      id: `${message.id}-${message.groupId}`,
      nodeId: message.imageGenerationNodeId ?? message.imageGenerationNodeIds?.[0],
      title: formatAgentCanvasNodeChipTitle({
        title: message.groupName || message.plan.title,
        userPrompt: message.userPrompt,
        promptPreview: message.plan.promptPreview,
        fallback: "批量生成组",
      }),
      typeLabel: generationCount > 0 ? `${generationCount} 个生成任务` : "分组",
    }];
  }

  let imageGenerationIndex = 0;

  return message.actions
    .filter((action) => (
      action.type === "create_text_node" ||
      action.type === "create_uploaded_image_node" ||
      action.type === "create_image_generation_node"
    ))
    .map((action, index) => {
      const mappedNodeId = message.nodeIdMap?.[action.clientActionId];

      if (action.type === "create_text_node") {
        return {
          id: `${message.id}-${action.clientActionId}-${index}`,
          nodeId: mappedNodeId,
          title: formatAgentCanvasNodeChipTitle({
            title: action.title || message.plan.title,
            userPrompt: message.userPrompt,
            promptPreview: action.text || message.plan.promptPreview,
            fallback: "提示词",
          }),
          typeLabel: "文本节点",
        };
      }

      if (action.type === "create_uploaded_image_node") {
        const attachment = message.attachments.find((item) => item.id === action.attachmentId);

        return {
          id: `${message.id}-${action.clientActionId}-${index}`,
          nodeId: mappedNodeId,
          title: action.title || attachment?.name || "上传图片",
          typeLabel: "图片节点",
        };
      }

      const fallbackNodeId = message.imageGenerationNodeIds?.[imageGenerationIndex];
      imageGenerationIndex += 1;

      return {
        id: `${message.id}-${action.clientActionId}-${index}`,
        nodeId: mappedNodeId ?? fallbackNodeId,
        title: formatAgentCanvasNodeChipTitle({
          title: message.plan.title,
          userPrompt: message.userPrompt,
          promptPreview: action.prompt || message.plan.promptPreview,
          fallback: "图像生成",
        }),
        typeLabel: message.attachments.length > 0 ? "图生图" : "文生图",
      };
    });
}
