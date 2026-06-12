import { parseReferenceMentions } from "@/lib/prompt-mentions";
import type { CanvasRuntimeSnapshot } from "@/lib/canvas/runtime-snapshot";
import type {
  AgentCanvasSnapshot,
  AgentMessageSummary,
  AgentRunSummary,
  AgentTaskAttachment,
  AgentTaskContext,
} from "@/types/agent";

export type BuildAgentTaskContextInput = {
  project: {
    id?: string;
    name: string;
  };
  message: string;
  attachments: AgentTaskAttachment[];
  recentRuns?: AgentRunSummary[];
  recentMessages?: AgentMessageSummary[];
  canvasSnapshot?: AgentCanvasSnapshot;
  canvasRuntimeSnapshot?: CanvasRuntimeSnapshot;
};

export function getReferencedAgentAttachmentIds(
  message: string,
  attachments: AgentTaskAttachment[],
): string[] {
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const referencedIds: string[] = [];
  const seen = new Set<string>();

  for (const mention of parseReferenceMentions(message)) {
    if (!attachmentIds.has(mention.nodeId) || seen.has(mention.nodeId)) {
      continue;
    }

    seen.add(mention.nodeId);
    referencedIds.push(mention.nodeId);
  }

  return referencedIds;
}

export function buildAgentTaskContext({
  project,
  message,
  attachments,
  recentRuns,
  recentMessages,
  canvasSnapshot,
  canvasRuntimeSnapshot,
}: BuildAgentTaskContextInput): AgentTaskContext {
  return {
    project,
    input: {
      message,
      attachments,
      referencedAttachmentIds: getReferencedAgentAttachmentIds(message, attachments),
    },
    executionTarget: {
      createOnCanvas: true,
      placement: "viewport_center_right",
      confirmationMode: "workflow_auto_apply",
    },
    ...(canvasSnapshot
      ? {
          canvasSummary: {
            nodeCount: canvasSnapshot.nodes.length,
            edgeCount: canvasSnapshot.edges.length,
            groupCount: canvasSnapshot.groupCount,
            ...(canvasRuntimeSnapshot
              ? {
                  pendingCount: canvasRuntimeSnapshot.summary.pendingCount,
                  runningCount: canvasRuntimeSnapshot.summary.runningCount,
                  finishedCount: canvasRuntimeSnapshot.summary.finishedCount,
                  failedCount: canvasRuntimeSnapshot.summary.failedCount,
                }
              : {}),
          },
        }
      : {}),
    ...(canvasRuntimeSnapshot ? { canvasRuntimeSnapshot } : {}),
    ...(recentRuns?.length ? { recentRuns } : {}),
    ...(recentMessages?.length ? { recentMessages } : {}),
  };
}
