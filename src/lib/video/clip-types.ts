export type VideoClipJobKind = "cut" | "smart_clip";

export type VideoClipMode = "stable" | "balanced" | "sensitive";

export interface VideoClipSegmentResult {
  index: number;
  url: string;
  start?: number;
  end?: number;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mimeType?: string;
}

export type VideoClipJobStatusResponse =
  | {
      ok: true;
      jobId: string;
      status: "queued" | "running" | "completed" | "done";
      stage?: string;
      progress?: number;
      doneCount?: number;
      total?: number;
      segments?: VideoClipSegmentResult[];
    }
  | {
      ok: false;
      jobId?: string;
      status?: "error";
      error: string;
    };

export interface CreateVideoClipJobRequest {
  kind: VideoClipJobKind;
  sourceUrl: string;
  start?: number;
  end?: number;
  fps?: number;
  aiCredentials?: Array<{
    provider: "comfly" | "zhenzhen";
    apiKey: string;
  }>;
  options?: {
    mode?: VideoClipMode;
    maxSegments?: number;
    fps?: number;
  };
}

export interface CreateVideoClipJobResponse {
  ok: boolean;
  jobId?: string;
  error?: string;
}
