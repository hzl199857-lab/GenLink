'use client';

import {
  inferExtension,
  readImageOutputBlob,
  sanitizeFileStem,
} from '@/lib/project-storage';
import type { ImageGenerationNodeData } from '@/types/canvas';

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type SaveFileHandle = {
  createWritable(): Promise<FileSystemWritableFileStream>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function buildGeneratedImageFileName(
  data: ImageGenerationNodeData,
  extension: string,
): string {
  const existingFileName = data.generatedOutputFileName?.trim();

  if (existingFileName) {
    return existingFileName;
  }

  const stem = sanitizeFileStem(data.title || 'image');
  const timestamp = data.generatedAt
    ? data.generatedAt.replace(/[:.]/g, '-')
    : new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${stem}.${extension}`;
}

function getImageMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

function downloadBlobWithAnchor(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function downloadImageGenerationResult(
  data: ImageGenerationNodeData,
): Promise<'saved' | 'cancelled'> {
  const imageUrl =
    data.generatedHostedImageUrl?.trim() ||
    data.generatedImageUrl?.trim();

  if (!imageUrl) {
    throw new Error('当前卡片没有可下载的图片');
  }

  const saveFilePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  const extension = inferExtension(data.generatedImageFormat);
  const fileName = buildGeneratedImageFileName(data, extension);

  if (!saveFilePicker) {
    const blob = await readImageOutputBlob(imageUrl, data.generatedOutputFileName || data.title);
    downloadBlobWithAnchor(blob, fileName);
    return 'saved';
  }

  try {
    const fileHandle = await saveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: 'Image',
          accept: {
            [getImageMimeType(extension)]: [`.${extension}`],
          },
        },
      ],
    });
    const blob = await readImageOutputBlob(imageUrl, data.generatedOutputFileName || data.title);
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (error) {
    if (isAbortError(error)) {
      return 'cancelled';
    }

    throw error;
  }
}
