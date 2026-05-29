import type {
  CreateVideoClipJobRequest,
  CreateVideoClipJobResponse,
  VideoClipJobStatusResponse,
} from "@/lib/video/clip-types";

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 45 * 60_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T;

  if (!response.ok) {
    const error = json && typeof json === "object" && "error" in json
      ? String((json as { error?: unknown }).error)
      : "Video processing request failed";
    throw new Error(error);
  }

  return json;
}

export async function createVideoClipJob(
  body: CreateVideoClipJobRequest,
): Promise<string> {
  const response = await fetch("/api/video/clip-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await readJsonResponse<CreateVideoClipJobResponse>(response);

  if (!json.ok || !json.jobId) {
    throw new Error(json.error || "Video processing job was not created");
  }

  return json.jobId;
}

export async function pollVideoClipJob(
  jobId: string,
  onProgress?: (status: VideoClipJobStatusResponse) => void,
): Promise<Extract<VideoClipJobStatusResponse, { ok: true }>> {
  const startedAt = Date.now();

  for (;;) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error("Video processing timed out");
    }

    const response = await fetch(`/api/video/clip-jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    const status = await readJsonResponse<VideoClipJobStatusResponse>(response);
    onProgress?.(status);

    if (!status.ok) {
      throw new Error(status.error || "Video processing failed");
    }

    if (status.status === "done" || status.status === "completed") {
      return status;
    }

    await wait(POLL_INTERVAL_MS);
  }
}
