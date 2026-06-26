import 'server-only';

import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { VibeApiError } from '@/lib/vibe';

const OSS_UPLOAD_URL_EXPIRES_SECONDS = 10 * 60;
const MAX_FILE_STEM_LENGTH = 80;

const ALIYUN_VIDEO_OSS_BUCKET = process.env.ALIYUN_VIDEO_OSS_BUCKET?.trim() ?? '';
function normalizeAliyunOssRegion(region: string): string {
  const trimmed = region.trim();

  if (!trimmed || trimmed.startsWith('oss-') || trimmed.includes('.')) {
    return trimmed;
  }

  return `oss-${trimmed}`;
}

const ALIYUN_VIDEO_OSS_REGION = normalizeAliyunOssRegion(
  process.env.ALIYUN_VIDEO_OSS_REGION?.trim() ?? '',
);
const ALIYUN_VIDEO_OSS_ACCESS_KEY_ID =
  process.env.ALIYUN_VIDEO_OSS_ACCESS_KEY_ID?.trim() ||
  process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim() ||
  '';
const ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET =
  process.env.ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET?.trim() ||
  process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim() ||
  '';
const ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL =
  process.env.ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ?? '';

function isVideoOssConfigured(): boolean {
  return Boolean(
    ALIYUN_VIDEO_OSS_BUCKET &&
      ALIYUN_VIDEO_OSS_REGION &&
      ALIYUN_VIDEO_OSS_ACCESS_KEY_ID &&
      ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET,
  );
}

function getMissingVideoOssConfigKeys(): string[] {
  const missing: string[] = [];

  if (!ALIYUN_VIDEO_OSS_BUCKET) missing.push('ALIYUN_VIDEO_OSS_BUCKET');
  if (!ALIYUN_VIDEO_OSS_REGION) missing.push('ALIYUN_VIDEO_OSS_REGION');
  if (!ALIYUN_VIDEO_OSS_ACCESS_KEY_ID && !process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim()) {
    missing.push('ALIYUN_VIDEO_OSS_ACCESS_KEY_ID or ALIYUN_OSS_ACCESS_KEY_ID');
  }
  if (!ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET && !process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim()) {
    missing.push('ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET or ALIYUN_OSS_ACCESS_KEY_SECRET');
  }

  return missing;
}

function normalizeObjectFolder(folder?: string): string {
  const normalized = folder
    ?.trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/');

  return normalized || 'references/videos';
}

function normalizeFileStem(fileName?: string): string {
  const trimmed = fileName?.trim();

  if (!trimmed) {
    return 'media';
  }

  const parsed = path.parse(trimmed);
  const stem = parsed.name || 'media';
  const normalized = stem.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

  return (normalized || 'media').slice(0, MAX_FILE_STEM_LENGTH);
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/quicktime') return 'mov';
  if (normalized === 'video/webm') return 'webm';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'audio/x-wav') return 'wav';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';

  return normalized.split('/')[1]?.replace(/[^\w]+/g, '') || 'bin';
}

function getVideoOssEndpoint(): string {
  return `https://${ALIYUN_VIDEO_OSS_BUCKET}.${ALIYUN_VIDEO_OSS_REGION}.aliyuncs.com`;
}

function getVideoOssPublicBaseUrl(): string {
  return ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL || getVideoOssEndpoint();
}

function createOssSignature(params: {
  method: string;
  contentType: string;
  expires: number;
  objectKey: string;
}): string {
  const canonicalizedResource = `/${ALIYUN_VIDEO_OSS_BUCKET}/${params.objectKey}`;
  const stringToSign = [
    params.method,
    '',
    params.contentType,
    String(params.expires),
    canonicalizedResource,
  ].join('\n');

  return createHmac('sha1', ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET)
    .update(stringToSign)
    .digest('base64');
}

export function createAliyunMediaUploadTarget(params: {
  contentType: string;
  fileName?: string;
  folder?: string;
}): {
  uploadUrl: string;
  mediaUrl: string;
  headers: Record<string, string>;
  objectKey: string;
} {
  if (!isVideoOssConfigured()) {
    const missing = getMissingVideoOssConfigKeys();
    throw new VibeApiError(
      500,
      `Aliyun video OSS is not configured${missing.length ? `: ${missing.join(', ')}` : ''}`,
    );
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
    OSSAccessKeyId: ALIYUN_VIDEO_OSS_ACCESS_KEY_ID,
    Expires: String(expires),
    Signature: signature,
  });
  const encodedObjectKey = objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return {
    uploadUrl: `${getVideoOssEndpoint()}/${encodedObjectKey}?${query.toString()}`,
    mediaUrl: `${getVideoOssPublicBaseUrl()}/${encodedObjectKey}`,
    headers: {
      'Content-Type': contentType,
    },
    objectKey,
  };
}
