import type { AgentTaskAttachment } from "../types/agent";

function attachmentUrls(attachment: AgentTaskAttachment): string[] {
  return [
    attachment.mediaUrl,
    attachment.kind === "image" ? attachment.imageUrl : attachment.videoUrl,
    attachment.previewUrl,
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function mergeAgentAttachments(
  current: AgentTaskAttachment[],
  incoming: AgentTaskAttachment[],
): {
  attachments: AgentTaskAttachment[];
  addedCount: number;
  duplicateCount: number;
} {
  const attachments = [...current];
  const sourceNodeIds = new Set(
    current.flatMap((attachment) => attachment.sourceNodeId ? [attachment.sourceNodeId] : []),
  );
  const urls = new Set(current.flatMap(attachmentUrls));
  let addedCount = 0;
  let duplicateCount = 0;

  for (const attachment of incoming) {
    const duplicateNode = Boolean(
      attachment.sourceNodeId && sourceNodeIds.has(attachment.sourceNodeId),
    );
    const nextUrls = attachmentUrls(attachment);
    const duplicateUrl = nextUrls.some((url) => urls.has(url));

    if (duplicateNode || duplicateUrl) {
      duplicateCount += 1;
      continue;
    }

    attachments.push(attachment);
    addedCount += 1;

    if (attachment.sourceNodeId) {
      sourceNodeIds.add(attachment.sourceNodeId);
    }
    nextUrls.forEach((url) => urls.add(url));
  }

  return { attachments, addedCount, duplicateCount };
}
