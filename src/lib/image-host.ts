import 'server-only';

import { createHmac } from 'node:crypto';
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
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 5 * 60_000;
const OSS_UPLOAD_URL_EXPIRES_SECONDS = 10 * 60;

const IS_SERVERLESS = Boolean(process.env.VERCEL);
const ALIYUN_OSS_BUCKET = process.env.ALIYUN_OSS_BUCKET?.trim() ?? '';
function normalizeAliyunOssRegion(region: string): string {
  const trimmed = region.trim();

  if (!trimmed || trimmed.startsWith('oss-') || trimmed.includes('.')) {
    return trimmed;
  }

  return `oss-${trimmed}`;
}

const ALIYUN_OSS_REGION = normalizeAliyunOssRegion(
  process.env.ALIYUN_OSS_REGION?.trim() ?? '',
);
const ALIYUN_OSS_ACCESS_KEY_ID = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim() ?? '';
const ALIYUN_OSS_ACCESS_KEY_SECRET = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim() ?? '';
const ALIYUN_OSS_PUBLIC_BASE_URL = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
const ALIYUN_OSS_INTERNAL_ENDPOINT =
  process.env.ALIYUN_OSS_INTERNAL_ENDPOINT?.trim().replace(/\/+$/, '') ?? '';
const REFERENCE_IMAGE_UPLOAD_MODE =
  process.env.NEXT_PUBLIC_REFERENCE_IMAGE_UPLOAD_MODE?.trim().toLowerCase() ?? '';
const IMAGE_HOST_TIMING_LOG_PREFIX = '[GenLink image host timing]';

type SaveImageOptions = {
  forceOss?: boolean;
};

function logImageHostTiming(
  stage: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) {
  console.info(
    IMAGE_HOST_TIMING_LOG_PREFIX,
    JSON.stringify({
      stage,
      durationMs: Date.now() - startedAt,
      ...(extra ?? {}),
    }),
  );
}

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

function isAliyunOssConfigured(): boolean {
  return Boolean(
    ALIYUN_OSS_BUCKET &&
      ALIYUN_OSS_REGION &&
      ALIYUN_OSS_ACCESS_KEY_ID &&
      ALIYUN_OSS_ACCESS_KEY_SECRET,
  );
}

function normalizeObjectFolder(folder?: string): string {
  const normalized = folder
    ?.trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/');

  return normalized || 'images';
}

function getOssEndpoint(): string {
  return `https://${ALIYUN_OSS_BUCKET}.${ALIYUN_OSS_REGION}.aliyuncs.com`;
}

function getServerOssEndpoint(): string {
  if (!ALIYUN_OSS_INTERNAL_ENDPOINT) {
    return getOssEndpoint();
  }

  const endpoint = new URL(ALIYUN_OSS_INTERNAL_ENDPOINT);

  if (
    endpoint.pathname === '/' &&
    /^oss-[a-z0-9-]+(?:-internal)?\.aliyuncs\.com$/i.test(endpoint.hostname)
  ) {
    endpoint.hostname = `${ALIYUN_OSS_BUCKET}.${endpoint.hostname}`;
  }

  return endpoint.toString().replace(/\/+$/, '');
}

function getOssPublicBaseUrl(): string {
  return ALIYUN_OSS_PUBLIC_BASE_URL || getOssEndpoint();
}

function createOssSignature(params: {
  method: string;
  contentType: string;
  expires: number;
  objectKey: string;
}): string {
  const canonicalizedResource = `/${ALIYUN_OSS_BUCKET}/${params.objectKey}`;
  const stringToSign = [
    params.method,
    '',
    params.contentType,
    String(params.expires),
    canonicalizedResource,
  ].join('\n');

  return createHmac('sha1', ALIYUN_OSS_ACCESS_KEY_SECRET)
    .update(stringToSign)
    .digest('base64');
}

export function createAliyunOssUploadTarget(params: {
  contentType: string;
  fileName?: string;
  folder?: string;
  useInternalEndpoint?: boolean;
}): {
  uploadUrl: string;
  imageUrl: string;
  headers: Record<string, string>;
  objectKey: string;
} {
  if (!isAliyunOssConfigured()) {
    throw new VibeApiError(500, 'Aliyun OSS is not configured');
  }

  const contentType = params.contentType.trim() || 'application/octet-stream';
  const extension = extensionFromMimeType(contentType);
  const stem = normalizeFileStem(params.fileName);
  const folder = normalizeObjectFolder(params.folder);
  const objectKey = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${stem}.${extension}`;
  const expires = Math.floor(Date.now() / 1000) + OSS_UPLOAD_URL_EXPIRES_SECONDS;
  const signature = createOssSignature({
    method: 'PUT',
    contentType,
    expires,
    objectKey,
  });
  const query = new URLSearchParams({
    OSSAccessKeyId: ALIYUN_OSS_ACCESS_KEY_ID,
    Expires: String(expires),
    Signature: signature,
  });
  const encodedObjectKey = objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return {
    uploadUrl: `${params.useInternalEndpoint ? getServerOssEndpoint() : getOssEndpoint()}/${encodedObjectKey}?${query.toString()}`,
    imageUrl: `${getOssPublicBaseUrl()}/${encodedObjectKey}`,
    headers: {
      'Content-Type': contentType,
    },
    objectKey,
  };
}

async function saveImageBytes(
  bytes: Buffer,
  mimeType: string,
  fileName?: string,
  folder = 'generated',
  options: SaveImageOptions = {},
): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new VibeApiError(400, 'Image data is empty');
  }

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new VibeApiError(400, 'Image is too large to save');
  }

  if (options.forceOss && !isAliyunOssConfigured()) {
    throw new VibeApiError(500, 'Aliyun OSS is not configured');
  }

  if (
    isAliyunOssConfigured() &&
    (options.forceOss || IS_SERVERLESS || REFERENCE_IMAGE_UPLOAD_MODE === 'oss')
  ) {
    const target = createAliyunOssUploadTarget({
      contentType: mimeType,
      fileName,
      folder,
      useInternalEndpoint: true,
    });
    const response = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: target.headers,
      body: new Uint8Array(bytes),
    });

    if (!response.ok) {
      throw new VibeApiError(
        response.status,
        `Failed to upload image to OSS (${response.status})`,
      );
    }

    return target.imageUrl;
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
  folder?: string,
  options?: SaveImageOptions,
): Promise<string> {
  const startedAt = Date.now();
  const { mimeType, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');

  const imageUrl = await saveImageBytes(bytes, mimeType, fileName, folder, options);
  logImageHostTiming('saveImageDataUrl', startedAt, {
    bytes: bytes.byteLength,
    mimeType,
    target: imageUrl.includes('.aliyuncs.com/') ? 'oss' : 'local-or-data',
  });
  return imageUrl;
}

export async function saveRemoteImageUrl(
  imageUrl: string,
  fileName?: string,
  folder?: string,
  options?: SaveImageOptions,
): Promise<string> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const fetchStartedAt = Date.now();
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/*',
      },
      signal: controller.signal,
    });
    logImageHostTiming('saveRemoteImageUrl.fetch', fetchStartedAt, {
      status: response.status,
    });

    if (!response.ok) {
      throw new VibeApiError(response.status, `Failed to fetch image (${response.status})`);
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';

    if (!mimeType.startsWith('image/')) {
      throw new VibeApiError(400, 'URL did not return an image');
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    const saveStartedAt = Date.now();
    const hostedImageUrl = await saveImageBytes(bytes, mimeType, fileName, folder, options);
    logImageHostTiming('saveRemoteImageUrl.save', saveStartedAt, {
      bytes: bytes.byteLength,
      mimeType,
      target: hostedImageUrl.includes('.aliyuncs.com/') ? 'oss' : 'local-or-data',
    });
    logImageHostTiming('saveRemoteImageUrl', startedAt, {
      bytes: bytes.byteLength,
      mimeType,
    });
    return hostedImageUrl;
  } finally {
    clearTimeout(timeout);
  }
}
