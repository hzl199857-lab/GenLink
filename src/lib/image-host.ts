import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  getLocalImageDirectory,
  LOCAL_IMAGE_ROUTE_PREFIX,
} from '@/lib/local-image-storage';
import { VibeApiError } from '@/lib/vibe';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_FILE_STEM_LENGTH = 80;

const IS_SERVERLESS = Boolean(process.env.VERCEL);

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    throw new VibeApiError(400, 'Only base64 data URLs can be uploaded');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';

  const fallback = normalized.split('/')[1]?.replace(/[^\w]+/g, '') || 'png';
  return fallback;
}

function normalizeFileStem(fileName?: string): string {
  const trimmed = fileName?.trim();

  if (!trimmed) {
    return 'generated-image';
  }

  const parsed = path.parse(trimmed);
  const stem = parsed.name || 'generated-image';
  const normalized = stem.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'generated-image';
  }

  return normalized.slice(0, MAX_FILE_STEM_LENGTH);
}

export { getLocalImageDirectory };

async function saveImageBytes(
  bytes: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new VibeApiError(400, 'Image data is empty');
  }

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new VibeApiError(400, 'Image is too large to save');
  }

  if (IS_SERVERLESS) {
    const base64 = bytes.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  const localImageDir = getLocalImageDirectory();

  await mkdir(localImageDir, { recursive: true });

  const extension = extensionFromMimeType(mimeType);
  const stem = normalizeFileStem(fileName);
  const savedFileName = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}-${stem}.${extension}`;
  const absolutePath = path.join(localImageDir, savedFileName);

  await writeFile(absolutePath, bytes);

  return `${LOCAL_IMAGE_ROUTE_PREFIX}/${encodeURIComponent(savedFileName)}`;
}

export async function saveImageDataUrl(
  dataUrl: string,
  fileName?: string,
): Promise<string> {
  if (IS_SERVERLESS) {
    return dataUrl;
  }

  const { mimeType, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');

  return saveImageBytes(bytes, mimeType, fileName);
}

export async function saveRemoteImageUrl(
  imageUrl: string,
  fileName?: string,
): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: {
      Accept: 'image/*',
    },
  });

  if (!response.ok) {
    throw new VibeApiError(response.status, `Failed to fetch image (${response.status})`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';

  if (!mimeType.startsWith('image/')) {
    throw new VibeApiError(400, 'URL did not return an image');
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  return saveImageBytes(bytes, mimeType, fileName);
}
