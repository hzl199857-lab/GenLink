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
  const uploadResponse = await fetch("/api/media-hosting/upload-url", {
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
  const uploadJson = (await uploadResponse.json()) as UploadUrlResponse;

  if (!uploadResponse.ok || !uploadJson.ok) {
    throw new Error("error" in uploadJson ? uploadJson.error : "Failed to create upload URL");
  }

  const putResponse = await fetch(uploadJson.result.uploadUrl, {
    method: "PUT",
    headers: uploadJson.result.headers,
    body: blob,
  });

  if (!putResponse.ok) {
    throw new Error("Failed to upload source video for processing");
  }

  return uploadJson.result.mediaUrl;
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
