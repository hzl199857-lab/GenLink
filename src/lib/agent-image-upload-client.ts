"use client";

import {
  createHostedAgentImageAttachment,
  dataUrlToImageBlob,
  type AgentImageAttachmentUploadKind,
  type AgentImageDerivativeOptions,
  type CreateHostedAgentImageAttachmentDeps,
} from "@/lib/agent-attachment-upload";
import { uploadImageAsset } from "@/lib/browser-oss-upload";
import { getBrowserImageDisplayUrl } from "@/lib/image-display-url";
import type { AgentTaskAttachment } from "@/types/agent";

function readImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = getBrowserImageDisplayUrl(url);
  });
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result) {
        resolve(reader.result);
        return;
      }

      reject(new Error("图片文件无效"));
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function createImageDerivativeDataUrl(
  dataUrl: string,
  options: AgentImageDerivativeOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;

      if (!sourceWidth || !sourceHeight) {
        reject(new Error("图片尺寸无效"));
        return;
      }

      const scale = Math.min(
        1,
        options.maxEdge / Math.max(sourceWidth, sourceHeight),
      );
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("无法创建图片预处理画布"));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(options.mimeType, options.quality));
    };
    image.onerror = () => reject(new Error("图片预处理失败"));
    image.src = dataUrl;
  });
}

async function uploadAgentImageDataUrl(
  dataUrl: string,
  fileName?: string,
  kind: AgentImageAttachmentUploadKind = "original",
): Promise<string> {
  const folderByKind: Record<AgentImageAttachmentUploadKind, string> = {
    original: "references",
    preview: "references/previews",
    semantic: "references/semantic",
  };
  const blob = await dataUrlToImageBlob(dataUrl);
  const result = await uploadImageAsset({
    data: blob,
    contentType: blob.type || "image/png",
    fileName,
    folder: folderByKind[kind],
  });

  return result.hostedUrl;
}

export async function createBrowserAgentImageAttachment(
  file: File,
  overrides: Partial<CreateHostedAgentImageAttachmentDeps> = {},
): Promise<AgentTaskAttachment> {
  return createHostedAgentImageAttachment(file, {
    createAttachmentId: () => crypto.randomUUID(),
    createPreviewUrl: (sourceFile) => URL.createObjectURL(sourceFile),
    releasePreviewUrl: (url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    },
    readImageDataUrl: readImageFileAsDataUrl,
    readImageDimensions,
    createDerivativeDataUrl: createImageDerivativeDataUrl,
    uploadImageDataUrl: uploadAgentImageDataUrl,
    ...overrides,
  });
}
