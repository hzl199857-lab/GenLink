import type { AgentTaskAttachment, CanvasAgentAction } from "@/types/agent";

export type AgentActionValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateCanvasAgentActions(
  actions: CanvasAgentAction[],
  attachments: AgentTaskAttachment[],
): AgentActionValidationResult {
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const createdActionIds = new Set<string>();

  for (const action of actions) {
    if (action.type === "run_image_generation") {
      return {
        ok: false,
        error: "图片生成必须由用户点击确认生成后触发",
      };
    }

    if (action.type === "create_text_node") {
      if (createdActionIds.has(action.clientActionId)) {
        return {
          ok: false,
          error: `重复的 action id: ${action.clientActionId}`,
        };
      }

      createdActionIds.add(action.clientActionId);
      continue;
    }

    if (action.type === "create_uploaded_image_node") {
      return {
        ok: false,
        error: "第一版 Agent 源图节点必须在计划前创建",
      };
    }

    if (action.type === "create_image_generation_node") {
      if (createdActionIds.has(action.clientActionId)) {
        return {
          ok: false,
          error: `重复的 action id: ${action.clientActionId}`,
        };
      }

      createdActionIds.add(action.clientActionId);
      continue;
    }

    if (action.type === "connect_nodes") {
      if (action.sourceRef.kind === "created" && !createdActionIds.has(action.sourceRef.clientActionId)) {
        return {
          ok: false,
          error: `连线引用了尚未创建的 action: ${action.sourceRef.clientActionId}`,
        };
      }

      if (action.targetRef.kind === "created" && !createdActionIds.has(action.targetRef.clientActionId)) {
        return {
          ok: false,
          error: `连线引用了尚未创建的 action: ${action.targetRef.clientActionId}`,
        };
      }

      continue;
    }

    const unreachable: never = action;
    return {
      ok: false,
      error: `不支持的 action: ${JSON.stringify(unreachable)}`,
    };
  }

  const referencedSourceNodeIds = new Set(
    actions.flatMap((action) => (
      action.type === "connect_nodes" && action.sourceRef.kind === "existing"
        ? [action.sourceRef.nodeId]
        : []
    )),
  );
  const allowedSourceNodeIds = new Set(
    attachments.flatMap((attachment) => attachment.sourceNodeId ? [attachment.sourceNodeId] : []),
  );

  for (const nodeId of referencedSourceNodeIds) {
    if (!allowedSourceNodeIds.has(nodeId)) {
      return {
        ok: false,
        error: "Agent action 引用了不属于本次任务附件的源图节点",
      };
    }
  }

  for (const attachment of attachments) {
    if (!attachmentIds.has(attachment.id)) {
      return {
        ok: false,
        error: "附件引用无效",
      };
    }
  }

  return { ok: true };
}
