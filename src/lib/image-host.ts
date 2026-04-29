import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { VibeApiError } from "@/lib/vibe";

const OSS_POLICY_EXPIRES_IN_MS = 5 * 60 * 1000;
const OSS_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    throw new VibeApiError(400, "Only base64 data URLs can be uploaded");
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function normalizeFileName(fileName?: string, mimeType?: string): string {
  const trimmed = fileName?.trim();

  if (trimmed) {
    return trimmed.replace(/[^\w.\-]+/g, "_");
  }

  const extension = mimeType?.split("/")[1]?.toLowerCase() || "png";
  return `genlink-upload.${extension === "jpeg" ? "jpg" : extension}`;
}

function resolveOssConfig() {
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const publicBaseUrl = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();

  if (!bucket || !region || !accessKeyId || !accessKeySecret) {
    throw new VibeApiError(
      500,
      "Aliyun OSS is not configured. Please set ALIYUN_OSS_BUCKET, ALIYUN_OSS_REGION, ALIYUN_OSS_ACCESS_KEY_ID, and ALIYUN_OSS_ACCESS_KEY_SECRET.",
    );
  }

  return {
    bucket,
    region,
    accessKeyId,
    accessKeySecret,
    host: `https://${bucket}.oss-${region}.aliyuncs.com`,
    publicBaseUrl: publicBaseUrl || `https://${bucket}.oss-${region}.aliyuncs.com`,
  };
}

function buildObjectKey(fileName?: string, mimeType?: string): string {
  const normalizedFileName = normalizeFileName(fileName, mimeType);
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `genlink/${year}/${month}/${randomUUID()}-${normalizedFileName}`;
}

export async function uploadImageDataUrl(
  dataUrl: string,
  fileName?: string,
): Promise<string> {
  const { mimeType, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, "base64");

  if (bytes.byteLength === 0) {
    throw new VibeApiError(400, "Image data is empty");
  }

  if (bytes.byteLength > OSS_MAX_UPLOAD_BYTES) {
    throw new VibeApiError(400, "Image is too large to upload");
  }

  const config = resolveOssConfig();
  const objectKey = buildObjectKey(fileName, mimeType);
  const expiration = new Date(Date.now() + OSS_POLICY_EXPIRES_IN_MS).toISOString();
  const policy = {
    expiration,
    conditions: [
      ["content-length-range", 0, OSS_MAX_UPLOAD_BYTES],
      ["eq", "$key", objectKey],
      ["eq", "$success_action_status", "200"],
      ["eq", "$Content-Type", mimeType],
      ["eq", "$Content-Disposition", "inline"],
    ],
  };

  const policyBase64 = Buffer.from(JSON.stringify(policy)).toString("base64");
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(policyBase64)
    .digest("base64");

  const formData = new FormData();
  formData.append("key", objectKey);
  formData.append("OSSAccessKeyId", config.accessKeyId);
  formData.append("policy", policyBase64);
  formData.append("Signature", signature);
  formData.append("success_action_status", "200");
  formData.append("Content-Type", mimeType);
  formData.append("Content-Disposition", "inline");
  formData.append(
    "file",
    new Blob([bytes], { type: mimeType }),
    normalizeFileName(fileName, mimeType),
  );

  const response = await fetch(config.host, {
    method: "POST",
    body: formData,
  });

  const text = (await response.text()).trim();

  if (!response.ok) {
    throw new VibeApiError(
      response.status,
      text || "Aliyun OSS upload failed",
    );
  }

  return `${config.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;
}
