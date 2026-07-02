import type { AgentTaskAttachment } from "../../types/agent";
import type { CanvasNode } from "../../types/canvas";

export type NodeExport =
  | {
      kind: "url";
      url: string;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: "text";
      text: string;
      fileName: string;
      mimeType: string;
    };

export type NodeClipboardContent =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "image";
      url: string;
    };

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function sanitizeFileStem(value?: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "output";
  }

  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "output";
}

function inferExtension(format?: string, mimeType?: string): string {
  const normalizedFormat = format?.trim().toLowerCase();

  if (normalizedFormat) {
    return normalizedFormat === "jpeg" ? "jpg" : normalizedFormat;
  }

  switch (mimeType?.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/webm":
      return "webm";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
      return "ogg";
    default:
      return "png";
  }
}

function extensionFromFileName(fileName?: string): string | null {
  const match = fileName?.trim().match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function fileNameWithExtension(node: CanvasNode, fallback: string, extension: string): string {
  const stem = sanitizeFileStem(getNodeTitle(node) || fallback);
  return stem.toLowerCase().endsWith(`.${extension}`) ? stem : `${stem}.${extension}`;
}

function imageUrlFromNode(node: CanvasNode): string {
  if (node.type === "image_generation") {
    return clean(node.data.generatedHostedImageUrl) || clean(node.data.generatedImageUrl);
  }

  if (node.type === "image") {
    return clean(node.data.hostedImageUrl) || clean(node.data.imageUrl);
  }

  if (node.type === "uploaded_image") {
    return clean(node.data.hostedImageUrl) || clean(node.data.imageUrl);
  }

  if (node.type === "panorama-360") {
    const panorama = node.data.panorama360Node.panorama;
    return clean(panorama.generatedHostedImageUrl) || clean(panorama.generatedImageUrl);
  }

  return "";
}

function videoUrlFromNode(node: CanvasNode): string {
  if (node.type === "video_generation" || node.type === "video_upscale") {
    return clean(node.data.hostedVideoUrl) || clean(node.data.videoUrl);
  }

  if (node.type === "video") {
    return clean(node.data.hostedVideoUrl) || clean(node.data.videoUrl);
  }

  return "";
}

function audioUrlFromNode(node: CanvasNode): string {
  if (node.type === "audio_generation") {
    return clean(node.data.hostedAudioUrl) || clean(node.data.audioUrl);
  }

  if (node.type === "audio") {
    return clean(node.data.hostedAudioUrl) || clean(node.data.audioUrl);
  }

  return "";
}

export function getNodeTitle(node: CanvasNode): string {
  if ("title" in node.data && typeof node.data.title === "string") {
    return node.data.title.trim();
  }

  if (node.type === "audio_generation") {
    return clean(node.data.songTitle) || clean(node.data.generatedAudioTitle);
  }

  return "";
}

export function isNodeRenameable(node: CanvasNode): boolean {
  return "title" in node.data || node.type === "audio_generation";
}

export function createAgentAttachmentFromNode(node: CanvasNode): AgentTaskAttachment | null {
  const imageUrl = imageUrlFromNode(node);

  if (!imageUrl) {
    return null;
  }

  const name = getNodeTitle(node) || node.id;
  const width =
    node.type === "image_generation"
      ? node.data.generatedImageWidth
      : node.type === "image" || node.type === "uploaded_image"
        ? node.data.width
        : undefined;
  const height =
    node.type === "image_generation"
      ? node.data.generatedImageHeight
      : node.type === "image" || node.type === "uploaded_image"
        ? node.data.height
        : undefined;
  const sizeBytes =
    node.type === "image_generation"
      ? node.data.generatedImageSizeBytes
      : node.type === "image" || node.type === "uploaded_image"
        ? node.data.sizeBytes
        : undefined;

  return {
    id: `node-${node.id}`,
    kind: "image",
    name,
    mimeType: "image/*",
    imageUrl,
    hostedImageUrl: imageUrl,
    originalImageUrl: imageUrl,
    previewUrl: imageUrl,
    thumbnailUrl: imageUrl,
    semanticImageUrl:
      node.type === "image" || node.type === "uploaded_image"
        ? node.data.semanticImageUrl
        : undefined,
    width,
    height,
    sizeBytes,
    status: "attached",
    sourceNodeId: node.id,
  };
}

export function getNodeClipboardContent(node: CanvasNode): NodeClipboardContent | null {
  if (node.type === "text") {
    const text = clean(node.data.text);
    return text ? { kind: "text", text } : null;
  }

  if (node.type === "storyboard_script") {
    const text = clean(node.data.rawJson) || clean(node.data.prompt);
    return text ? { kind: "text", text } : null;
  }

  if (node.type === "ai_text_result") {
    const text = clean(node.data.content);
    return text ? { kind: "text", text } : null;
  }

  const imageUrl = imageUrlFromNode(node);

  if (imageUrl) {
    return { kind: "image", url: imageUrl };
  }

  const mediaUrl = videoUrlFromNode(node) || audioUrlFromNode(node);

  if (mediaUrl) {
    return { kind: "text", text: mediaUrl };
  }

  if (
    node.type === "image_generation" ||
    node.type === "video_generation" ||
    node.type === "audio_generation"
  ) {
    const text = clean(node.data.prompt);
    return text ? { kind: "text", text } : null;
  }

  return null;
}

export function getNodeClipboardText(node: CanvasNode): string | null {
  const content = getNodeClipboardContent(node);
  return content?.kind === "text" ? content.text : null;
}

function textExport(node: CanvasNode, text: string, fallback: string): NodeExport | null {
  const nextText = clean(text);

  if (!nextText) {
    return null;
  }

  return {
    kind: "text",
    text: nextText,
    fileName: fileNameWithExtension(node, fallback, "txt"),
    mimeType: "text/plain;charset=utf-8",
  };
}

export function getNodeExport(node: CanvasNode): NodeExport | null {
  if (node.type === "text") {
    return textExport(node, node.data.text, "text");
  }

  if (node.type === "storyboard_script") {
    return textExport(node, clean(node.data.rawJson) || clean(node.data.prompt), "storyboard");
  }

  if (node.type === "ai_text_result") {
    return textExport(node, node.data.content, "text-result");
  }

  const imageUrl = imageUrlFromNode(node);

  if (imageUrl) {
    const generatedFormat = node.type === "image_generation"
      ? node.data.generatedImageFormat
      : undefined;
    const extension = extensionFromFileName(
      node.type === "uploaded_image" ? node.data.fileName : undefined,
    ) ?? inferExtension(generatedFormat, "image/png");

    return {
      kind: "url",
      url: imageUrl,
      fileName: fileNameWithExtension(node, "image", extension),
      mimeType: extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`,
    };
  }

  const videoUrl = videoUrlFromNode(node);

  if (videoUrl) {
    const extension = extensionFromFileName(
      node.type === "video" ? node.data.fileName : undefined,
    ) ?? "mp4";

    return {
      kind: "url",
      url: videoUrl,
      fileName: fileNameWithExtension(node, "video", extension),
      mimeType: extension === "webm" ? "video/webm" : "video/mp4",
    };
  }

  const audioUrl = audioUrlFromNode(node);

  if (audioUrl) {
    const extension = extensionFromFileName(
      node.type === "audio" ? node.data.fileName : undefined,
    ) ?? "mp3";

    return {
      kind: "url",
      url: audioUrl,
      fileName: fileNameWithExtension(node, "audio", extension),
      mimeType: extension === "wav" ? "audio/wav" : extension === "ogg" ? "audio/ogg" : "audio/mpeg",
    };
  }

  return null;
}
