import {
  createReferenceMentionToken,
  parseReferenceMentions,
} from "./prompt-mentions";
import type { AgentTaskAttachment, CanvasAgentAction } from "@/types/agent";

export type AgentActionValidationResult =
  | { ok: true }
  | { ok: false; error: string };

type RestorableReferenceMention = {
  id: string;
  label: string;
  token: string;
  ordinal: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getReferenceMentionOrdinal(label: string, fallbackOrdinal: number): number {
  const match = label.match(/(?:\u56fe\u7247|\u53c2\u8003\u56fe)\s*(\d+)/);
  const parsedOrdinal = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

  return Number.isFinite(parsedOrdinal) && parsedOrdinal > 0
    ? parsedOrdinal
    : fallbackOrdinal;
}

function getRestorableReferenceMentions(
  prompt: string,
  attachments: AgentTaskAttachment[],
): RestorableReferenceMention[] {
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const mentions: RestorableReferenceMention[] = [];
  const seen = new Set<string>();

  for (const mention of parseReferenceMentions(prompt)) {
    if (!attachmentIds.has(mention.nodeId) || seen.has(mention.nodeId)) {
      continue;
    }

    seen.add(mention.nodeId);
    const attachment = attachments.find((item) => item.id === mention.nodeId);
    const attachmentOrdinal = attachment
      ? attachments.findIndex((item) => item.id === attachment.id) + 1
      : mentions.length + 1;
    const ordinal = getReferenceMentionOrdinal(mention.label, attachmentOrdinal);
    const label = mention.label.trim() || `\u56fe\u7247${ordinal}`;
    const canvasReferenceId = attachment?.sourceNodeId?.trim() || mention.nodeId;

    mentions.push({
      id: canvasReferenceId,
      label,
      token: createReferenceMentionToken(canvasReferenceId, label),
      ordinal,
    });
  }

  return mentions;
}

function restoreReferenceMentionLabels(
  value: string,
  mentions: RestorableReferenceMention[],
): string {
  let next = value;

  for (const mention of mentions) {
    const replacements = [
      `\u53c2\u8003\u56fe${mention.ordinal}`,
      `\u56fe\u7247${mention.ordinal}`,
      `@${mention.label}`,
    ];

    for (const replacement of replacements) {
      next = next.replace(
        new RegExp(`(?<!@)${escapeRegExp(replacement)}`, "g"),
        mention.token,
      );
    }
  }

  const missingMentions = mentions.filter((mention) => !next.includes(mention.token));

  if (!missingMentions.length) {
    return next;
  }

  return `\u53c2\u8003\u56fe\uff1a${missingMentions.map((mention) => mention.token).join("\u3001")}\u3002${next}`;
}

export function restoreReferenceMentionLabelsInActions(
  actions: CanvasAgentAction[],
  prompt: string,
  attachments: AgentTaskAttachment[],
): CanvasAgentAction[] {
  const mentions = getRestorableReferenceMentions(prompt, attachments);

  if (!mentions.length) {
    return actions;
  }

  return actions.map((action) => {
    if (action.type === "create_image_generation_node") {
      return {
        ...action,
        prompt: restoreReferenceMentionLabels(action.prompt, mentions),
      };
    }

    if (action.type === "create_text_node") {
      return {
        ...action,
        text: restoreReferenceMentionLabels(action.text, mentions),
      };
    }

    return action;
  });
}

function dedupeSourceNodeIds(sourceNodeIds: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const sourceNodeId of sourceNodeIds) {
    const trimmed = sourceNodeId.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

function getMentionedSourceNodeIds(
  prompt: string,
  allowedSourceNodeIds: Set<string>,
): string[] {
  return dedupeSourceNodeIds(
    parseReferenceMentions(prompt)
      .map((mention) => mention.nodeId)
      .filter((nodeId) => allowedSourceNodeIds.has(nodeId)),
  );
}

function relabelPromptMentionsByConnectionOrder(
  prompt: string,
  sourceNodeIds: string[],
): string {
  let next = prompt;

  sourceNodeIds.forEach((sourceNodeId, index) => {
    for (const mention of parseReferenceMentions(next)) {
      if (mention.nodeId !== sourceNodeId) {
        continue;
      }

      next = next.replace(
        createReferenceMentionToken(mention.nodeId, mention.label),
        createReferenceMentionToken(sourceNodeId, `\u56fe\u7247${index + 1}`),
      );
    }
  });

  return next;
}

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

export function attachExistingSourceReferencesToImageActions(
  actions: CanvasAgentAction[],
  sourceNodeIds: string[],
): CanvasAgentAction[] {
  const realSourceNodeIds = dedupeSourceNodeIds(sourceNodeIds);
  const realSourceNodeIdSet = new Set(realSourceNodeIds);
  const imageActionIds = new Set(actions.flatMap((action) => (
    action.type === "create_image_generation_node" ? [action.clientActionId] : []
  )));

  if (!realSourceNodeIds.length || !imageActionIds.size) {
    return actions;
  }

  const sanitizedActions = actions.filter((action) => {
    if (
      action.type !== "connect_nodes" ||
      action.sourceRef.kind !== "existing" ||
      action.targetRef.kind !== "created" ||
      !imageActionIds.has(action.targetRef.clientActionId)
    ) {
      return true;
    }

    return realSourceNodeIds.includes(action.sourceRef.nodeId);
  });
  const actionsWithoutImageReferenceConnections = sanitizedActions.filter((action) => !(
    action.type === "connect_nodes" &&
    action.sourceRef.kind === "existing" &&
    action.targetRef.kind === "created" &&
    imageActionIds.has(action.targetRef.clientActionId)
  ));
  const imageReferenceOrderByActionId = new Map<string, string[]>();
  const referenceConnections: CanvasAgentAction[] = [];

  for (const action of sanitizedActions) {
    if (action.type !== "create_image_generation_node") {
      continue;
    }

    const mentionedSourceNodeIds = getMentionedSourceNodeIds(action.prompt, realSourceNodeIdSet);
    imageReferenceOrderByActionId.set(
      action.clientActionId,
      mentionedSourceNodeIds.length ? mentionedSourceNodeIds : realSourceNodeIds,
    );
  }

  for (const imageActionId of imageActionIds) {
    const sourceNodeIdsForImage = imageReferenceOrderByActionId.get(imageActionId) ?? realSourceNodeIds;

    for (const sourceNodeId of sourceNodeIdsForImage) {
      referenceConnections.push({
        type: "connect_nodes",
        sourceRef: { kind: "existing", nodeId: sourceNodeId },
        targetRef: { kind: "created", clientActionId: imageActionId },
      });
    }
  }

  const relabeledActions = actionsWithoutImageReferenceConnections.map((action) => {
    if (action.type !== "create_image_generation_node") {
      return action;
    }

    const sourceNodeIdsForImage = imageReferenceOrderByActionId.get(action.clientActionId) ?? realSourceNodeIds;

    return {
      ...action,
      prompt: relabelPromptMentionsByConnectionOrder(action.prompt, sourceNodeIdsForImage),
    };
  });

  return referenceConnections.length ? [...relabeledActions, ...referenceConnections] : relabeledActions;
}
