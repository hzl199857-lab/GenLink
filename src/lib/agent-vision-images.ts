import type { AgentTaskAttachment } from "@/types/agent";

export type AgentVisionImage = {
  attachmentId: string;
  url: string;
};

const MAX_AGENT_VISION_IMAGES = 8;

function isRemoteOrDataImageUrl(value: string | undefined): value is string {
  const trimmed = value?.trim();

  return Boolean(trimmed && (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")));
}

function getAttachmentVisionUrl(attachment: AgentTaskAttachment): string | undefined {
  const candidates = [
    attachment.semanticImageUrl,
    attachment.hostedImageUrl,
    attachment.originalImageUrl,
    attachment.imageUrl,
  ];

  return candidates.find(isRemoteOrDataImageUrl)?.trim();
}

export function getAgentVisionImages(
  attachments: AgentTaskAttachment[],
): AgentVisionImage[] {
  const images: AgentVisionImage[] = [];
  const seenUrls = new Set<string>();

  for (const attachment of attachments) {
    const url = getAttachmentVisionUrl(attachment);

    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    images.push({
      attachmentId: attachment.id,
      url,
    });

    if (images.length >= MAX_AGENT_VISION_IMAGES) {
      break;
    }
  }

  return images;
}

export function getAgentVisionImageIndexByAttachmentId(
  attachments: AgentTaskAttachment[],
): Map<string, number> {
  return new Map(
    getAgentVisionImages(attachments).map((image, index) => [
      image.attachmentId,
      index + 1,
    ]),
  );
}
