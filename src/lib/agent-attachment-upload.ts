import type { AgentTaskAttachment } from "@/types/agent";

type ImageDimensions = {
  width: number;
  height: number;
};

export type AgentImageAttachmentUploadKind = "original" | "preview" | "semantic";

export type AgentImageDerivativeOptions = {
  maxEdge: number;
  mimeType: string;
  quality: number;
};

export type CreateHostedAgentImageAttachmentDeps = {
  createAttachmentId: () => string;
  createPreviewUrl: (file: File) => string;
  releasePreviewUrl?: (url: string) => void;
  readImageDataUrl: (file: File) => Promise<string>;
  readImageDimensions: (url: string) => Promise<ImageDimensions>;
  createDerivativeDataUrl?: (
    dataUrl: string,
    options: AgentImageDerivativeOptions,
  ) => Promise<string>;
  uploadImageDataUrl: (
    dataUrl: string,
    fileName?: string,
    kind?: AgentImageAttachmentUploadKind,
  ) => Promise<string>;
};

export async function dataUrlToImageBlob(dataUrl: string): Promise<Blob> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    throw new Error("Only base64 image data URLs can be uploaded");
  }

  const mimeType = match[1];

  if (!mimeType.toLowerCase().startsWith("image/")) {
    throw new Error("Only image data URLs can be uploaded");
  }

  const response = await fetch(dataUrl);

  return await response.blob();
}

const PREVIEW_DERIVATIVE_OPTIONS: AgentImageDerivativeOptions = {
  maxEdge: 768,
  mimeType: "image/jpeg",
  quality: 0.86,
};

const SEMANTIC_DERIVATIVE_OPTIONS: AgentImageDerivativeOptions = {
  maxEdge: 2048,
  mimeType: "image/jpeg",
  quality: 0.9,
};

export async function createHostedAgentImageAttachment(
  file: File,
  deps: CreateHostedAgentImageAttachmentDeps,
): Promise<AgentTaskAttachment> {
  const previewUrl = deps.createPreviewUrl(file);
  let thumbnailUrl: string | undefined;

  try {
    const [dataUrl, dimensions] = await Promise.all([
      deps.readImageDataUrl(file),
      deps.readImageDimensions(previewUrl),
    ]);
    const originalUpload = deps.uploadImageDataUrl(dataUrl, file.name, "original");
    const previewUpload = deps.createDerivativeDataUrl
      ? deps.createDerivativeDataUrl(dataUrl, PREVIEW_DERIVATIVE_OPTIONS)
          .then((previewDataUrl) =>
            deps.uploadImageDataUrl(previewDataUrl, file.name, "preview"),
          )
      : Promise.resolve<string | undefined>(undefined);
    const semanticDataUrl = deps.createDerivativeDataUrl
      ? deps.createDerivativeDataUrl(dataUrl, SEMANTIC_DERIVATIVE_OPTIONS)
      : Promise.resolve(dataUrl);
    const semanticUpload = semanticDataUrl.then((nextDataUrl) => (
      deps.createDerivativeDataUrl
        ? deps.uploadImageDataUrl(nextDataUrl, file.name, "semantic")
        : undefined
    ));
    const [imageUrl, resolvedThumbnailUrl, semanticImageUrl] = await Promise.all([
      originalUpload,
      previewUpload,
      semanticUpload,
    ]);
    const plannerImageDataUrl = await semanticDataUrl;
    thumbnailUrl = resolvedThumbnailUrl;

    if (thumbnailUrl && thumbnailUrl !== previewUrl) {
      deps.releasePreviewUrl?.(previewUrl);
    }

    return {
      id: deps.createAttachmentId(),
      kind: "image",
      name: file.name,
      mimeType: file.type || "image/*",
      imageUrl,
      hostedImageUrl: imageUrl,
      originalImageUrl: imageUrl,
      previewUrl: thumbnailUrl ?? previewUrl,
      thumbnailUrl,
      semanticImageUrl: semanticImageUrl ?? imageUrl,
      plannerImageDataUrl,
      width: dimensions.width || undefined,
      height: dimensions.height || undefined,
      sizeBytes: file.size,
      status: "ready",
    };
  } catch (error) {
    deps.releasePreviewUrl?.(previewUrl);
    throw error;
  }
}
