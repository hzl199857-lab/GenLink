export const REFERENCE_MENTION_TOKEN_PREFIX = "[[ref:";

const REFERENCE_MENTION_TOKEN_PATTERN = /\[\[ref:([^:\]]+):([^\]]*)\]\]/g;

export type ReferenceMention = {
  nodeId: string;
  label: string;
};

function decodeReferenceMentionPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createReferenceMentionToken(nodeId: string, label: string): string {
  return `[[ref:${encodeURIComponent(nodeId)}:${encodeURIComponent(label)}]]`;
}

export function parseReferenceMentions(value: string | undefined): ReferenceMention[] {
  if (!value?.includes(REFERENCE_MENTION_TOKEN_PREFIX)) {
    return [];
  }

  const mentions: ReferenceMention[] = [];

  for (const match of value.matchAll(REFERENCE_MENTION_TOKEN_PATTERN)) {
    const nodeId = decodeReferenceMentionPart(match[1] || "").trim();

    if (!nodeId) {
      continue;
    }

    mentions.push({
      nodeId,
      label: decodeReferenceMentionPart(match[2] || "").trim(),
    });
  }

  return mentions;
}

export function stripReferenceMentionTokens(
  value: string | undefined,
  referenceOrder: Array<{ id: string }> = [],
): string {
  if (!value?.trim()) {
    return "";
  }

  const orderByNodeId = new Map(
    referenceOrder.map((reference, index) => [reference.id, index + 1]),
  );
  const fallbackOrderByNodeId = new Map<string, number>();

  return value
    .replace(REFERENCE_MENTION_TOKEN_PATTERN, (_match, nodeId: string) => {
      const decodedNodeId = decodeReferenceMentionPart(nodeId).trim();
      const orderedIndex = orderByNodeId.get(decodedNodeId);

      if (orderedIndex) {
        return `参考图${orderedIndex}`;
      }

      const fallbackIndex =
        fallbackOrderByNodeId.get(decodedNodeId) ??
        fallbackOrderByNodeId.size + 1;

      fallbackOrderByNodeId.set(decodedNodeId, fallbackIndex);
      return `参考图${fallbackIndex}`;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function reconcileReferenceMentionTokens(
  value: string | undefined,
  referenceOrder: Array<{ id: string; label?: string }> = [],
): string {
  if (!value?.includes(REFERENCE_MENTION_TOKEN_PREFIX)) {
    return value ?? "";
  }

  const referenceById = new Map(
    referenceOrder.map((reference, index) => [
      reference.id,
      reference.label?.trim() || `\u56fe\u7247${index + 1}`,
    ]),
  );

  return value
    .replace(REFERENCE_MENTION_TOKEN_PATTERN, (_match, nodeId: string) => {
      const decodedNodeId = decodeReferenceMentionPart(nodeId).trim();
      const nextLabel = referenceById.get(decodedNodeId);

      return nextLabel ? createReferenceMentionToken(decodedNodeId, nextLabel) : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectMentionedReferences<T extends { id: string }>(
  references: T[],
  prompt: string | undefined,
): T[] {
  const mentions = parseReferenceMentions(prompt);

  if (!mentions.length) {
    return references;
  }

  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const selected: T[] = [];
  const selectedIds = new Set<string>();

  for (const mention of mentions) {
    const reference = referenceById.get(mention.nodeId);

    if (!reference || selectedIds.has(reference.id)) {
      continue;
    }

    selectedIds.add(reference.id);
    selected.push(reference);
  }

  return selected;
}
