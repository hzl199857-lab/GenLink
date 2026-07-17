import type { AgentTaskAttachment } from "../../types/agent";
import type { CanvasNode, PendingMaterialSource } from "../../types/canvas";

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function stableUrl(...candidates: Array<string | undefined>): string {
  return candidates
    .map((value) => clean(value))
    .find((value) => value && !value.startsWith("blob:")) ?? "";
}

function nodeTitle(node: CanvasNode): string {
  if ("title" in node.data && typeof node.data.title === "string") {
    return node.data.title.trim();
  }

  if (node.type === "audio_generation") {
    return clean(node.data.songTitle) || clean(node.data.generatedAudioTitle);
  }

  return "";
}

function createImageAttachment(node: CanvasNode): AgentTaskAttachment | null {
  let mediaUrl = "";
  let previewUrl = "";
  let width: number | undefined;
  let height: number | undefined;
  let sizeBytes: number | undefined;
  let semanticImageUrl: string | undefined;

  if (node.type === "uploaded_image" || node.type === "image") {
    mediaUrl = stableUrl(node.data.hostedImageUrl, node.data.imageUrl);
    previewUrl = stableUrl(node.data.previewUrl, mediaUrl);
    width = node.data.width;
    height = node.data.height;
    sizeBytes = node.data.sizeBytes;
    semanticImageUrl = node.data.semanticImageUrl;
  } else if (node.type === "image_generation") {
    mediaUrl = stableUrl(node.data.generatedHostedImageUrl, node.data.generatedImageUrl);
    previewUrl = mediaUrl;
    width = node.data.generatedImageWidth;
    height = node.data.generatedImageHeight;
    sizeBytes = node.data.generatedImageSizeBytes;
  } else {
    return null;
  }

  if (!mediaUrl) {
    return null;
  }

  return {
    id: `node-${node.id}`,
    kind: "image",
    name: nodeTitle(node) || "Canvas image",
    mimeType: "image/*",
    mediaUrl,
    imageUrl: mediaUrl,
    hostedImageUrl: mediaUrl,
    originalImageUrl: mediaUrl,
    previewUrl: previewUrl || mediaUrl,
    thumbnailUrl: previewUrl || mediaUrl,
    semanticImageUrl,
    width,
    height,
    sizeBytes,
    status: "ready",
    sourceNodeId: node.id,
  };
}

function createVideoAttachment(node: CanvasNode): AgentTaskAttachment | null {
  let mediaUrl = "";
  let previewUrl = "";
  let width: number | undefined;
  let height: number | undefined;
  let sizeBytes: number | undefined;
  let durationSeconds: number | undefined;
  let mimeType = "video/mp4";

  if (node.type === "video_generation") {
    mediaUrl = stableUrl(node.data.hostedVideoUrl, node.data.videoUrl);
    previewUrl = mediaUrl;
    durationSeconds = node.data.duration;
  } else if (node.type === "video_upscale") {
    mediaUrl = stableUrl(node.data.hostedVideoUrl, node.data.videoUrl);
    previewUrl = mediaUrl;
    width = node.data.width;
    height = node.data.height;
    sizeBytes = node.data.sizeBytes;
  } else if (node.type === "video") {
    mediaUrl = stableUrl(node.data.hostedVideoUrl, node.data.videoUrl);
    previewUrl = stableUrl(node.data.previewUrl, mediaUrl);
    width = node.data.width;
    height = node.data.height;
    sizeBytes = node.data.sizeBytes;
    durationSeconds = node.data.durationSeconds;
    mimeType = node.data.mimeType || mimeType;
  } else {
    return null;
  }

  if (!mediaUrl) {
    return null;
  }

  return {
    id: `node-${node.id}`,
    kind: "video",
    name: nodeTitle(node) || "Canvas video",
    mimeType,
    mediaUrl,
    videoUrl: mediaUrl,
    previewUrl: previewUrl || mediaUrl,
    width,
    height,
    sizeBytes,
    durationSeconds,
    status: "ready",
    sourceNodeId: node.id,
  };
}

export function createAgentAttachmentFromCanvasNode(
  node: CanvasNode,
): AgentTaskAttachment | null {
  return createImageAttachment(node);
}

export function getAgentAttachmentDedupeKey(attachment: AgentTaskAttachment): string {
  return attachment.sourceNodeId
    ? `node:${attachment.sourceNodeId}`
    : `${attachment.kind}:${attachment.mediaUrl || attachment.previewUrl}`;
}

export function createMaterialSourceFromCanvasNode(
  node: CanvasNode,
): PendingMaterialSource | null {
  const attachment = createImageAttachment(node) ?? createVideoAttachment(node);

  if (attachment) {
    const outputFileName = node.type === "image_generation"
      ? node.data.generatedOutputFileName
      : node.type === "uploaded_image" || node.type === "video"
        ? node.data.outputFileName
        : node.type === "video_generation" || node.type === "video_upscale"
          ? node.data.generatedOutputFileName
          : undefined;

    return {
      defaultName: attachment.name,
      kind: attachment.kind,
      mediaUrl: attachment.mediaUrl,
      hostedMediaUrl: attachment.mediaUrl,
      previewUrl: attachment.previewUrl,
      imageUrl: attachment.mediaUrl || attachment.previewUrl,
      hostedImageUrl: attachment.kind === "image" ? attachment.hostedImageUrl : undefined,
      outputFileName,
      sourceNodeType: node.type,
      width: attachment.width,
      height: attachment.height,
      durationSeconds: attachment.kind === "video" ? attachment.durationSeconds : undefined,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  if (node.type !== "audio" && node.type !== "audio_generation") {
    return null;
  }

  const mediaUrl = stableUrl(node.data.hostedAudioUrl, node.data.audioUrl);

  if (!mediaUrl) {
    return null;
  }

  return {
    defaultName: nodeTitle(node) || "Canvas audio",
    kind: "audio",
    mediaUrl,
    hostedMediaUrl: mediaUrl,
    previewUrl: node.data.previewUrl || mediaUrl,
    imageUrl: mediaUrl,
    outputFileName: node.type === "audio" ? node.data.outputFileName : node.data.generatedOutputFileName,
    sourceNodeType: node.type,
    durationSeconds: node.data.durationSeconds,
    mimeType: node.data.mimeType || "audio/mpeg",
    sizeBytes: node.data.sizeBytes,
  };
}
