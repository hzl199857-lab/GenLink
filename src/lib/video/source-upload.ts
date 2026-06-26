import type { VideoNodeData } from "@/types/canvas";

type UploadUrlResponse =
  | {
      ok: true;
      result: {
        uploadUrl: string;
        mediaUrl: string;
        headers: Record<string, string>;
      };
    }
  | {
      ok: false;
      error: string;
    };

function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

async function uploadBlobForProcessing(blob: Blob, fileName?: string): Promise<string> {
  let uploadResponse: Response;

  try {
    uploadResponse = await fetch("/api/media-hosting/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentType: blob.type || "video/mp4",
        fileName: fileName || "video.mp4",
        folder: "processing/videos",
      }),
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to video upload service: ${error instanceof Error ? error.message : "Failed to fetch"}`,
    );
  }

  const uploadJson = await readUploadUrlResponse(uploadResponse);

  if (!uploadResponse.ok || !uploadJson.ok) {
    throw new Error("error" in uploadJson ? uploadJson.error : "Failed to create upload URL");
  }

  let putResponse: Response;

  try {
    putResponse = await fetch(uploadJson.result.uploadUrl, {
      method: "PUT",
      headers: uploadJson.result.headers,
      body: blob,
    });
  } catch (error) {
    throw new Error(
      `Failed to upload source video to OSS: ${error instanceof Error ? error.message : "Failed to fetch"}`,
    );
  }

  if (!putResponse.ok) {
    throw new Error("Failed to upload source video for processing");
  }

  return uploadJson.result.mediaUrl;
}

async function readUploadUrlResponse(response: Response): Promise<UploadUrlResponse> {
  const fallback = response.ok
    ? "Upload URL response was invalid"
    : `Failed to create upload URL (${response.status})`;
  const text = await response.text().catch(() => "");

  if (!text.trim()) {
    return { ok: false, error: fallback };
  }

  try {
    return JSON.parse(text) as UploadUrlResponse;
  } catch {
    return { ok: false, error: fallback };
  }
}

export async function ensureVideoProcessingSourceUrl(video: VideoNodeData): Promise<string> {
  const directUrl = video.hostedVideoUrl?.trim() || video.videoUrl.trim();

  if (!directUrl) {
    throw new Error("当前视频节点没有可裁剪的视频源");
  }

  if (isHttpsUrl(directUrl)) {
    return directUrl;
  }

  const response = await fetch(directUrl);

  if (!response.ok) {
    throw new Error("无法读取当前视频源，请重新上传或生成视频后再试");
  }

  const blob = await response.blob();
  return uploadBlobForProcessing(blob, video.fileName || video.title || "video.mp4");
}
