export const MAX_STREAM_IMAGE_UPLOAD_BYTES = 100 * 1024 * 1024;

export class ImageUploadStreamError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImageUploadStreamError";
    this.status = status;
  }
}

export type ImageUploadTargetInput = {
  contentType: string;
  fileName?: string;
  folder?: string;
  useInternalEndpoint: true;
};

export type ImageUploadTarget = {
  uploadUrl: string;
  imageUrl: string;
  headers: Record<string, string>;
};

export type ImageUploadStreamDependencies = {
  createUploadTarget: (input: ImageUploadTargetInput) => ImageUploadTarget;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

type StreamingRequestInit = RequestInit & {
  duplex: "half";
};

function summarizeUploadFailure(error: unknown): string {
  let current = error;
  let depth = 0;

  while (current instanceof Error && current.cause instanceof Error && depth < 3) {
    current = current.cause;
    depth += 1;
  }

  if (!(current instanceof Error)) {
    return "网络连接失败";
  }

  const reason = current.message.trim().replace(/\s+/g, " ");
  return reason ? reason.slice(0, 160) : "网络连接失败";
}

function parseContentLength(request: Request, maxBytes: number): number | undefined {
  const requestUrl = new URL(request.url);
  const rawHeader = request.headers.get("content-length");
  const rawSize = requestUrl.searchParams.get("size");
  const rawValue = rawSize ?? rawHeader;

  if (rawValue === null) {
    return undefined;
  }

  const trimmedValue = rawValue.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    throw new ImageUploadStreamError(400, "缺少有效的图片大小");
  }

  const value = Number(trimmedValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ImageUploadStreamError(400, "图片内容不能为空");
  }

  if (value > maxBytes) {
    throw new ImageUploadStreamError(413, "单张图片不能超过 100MB");
  }

  return value;
}

function parseContentType(request: Request): string {
  const value = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (!value.startsWith("image/")) {
    throw new ImageUploadStreamError(400, "只允许上传图片");
  }

  return value;
}

async function readLimitedBody(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let aborted = signal.aborted;
  const abortReader = () => {
    aborted = true;
    void reader.cancel(signal.reason);
  };

  signal.addEventListener("abort", abortReader, { once: true });

  try {
    while (true) {
      const result = await reader.read();

      if (aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The upload was cancelled", "AbortError");
      }

      if (result.done) {
        break;
      }

      receivedBytes += result.value.byteLength;

      if (receivedBytes > maxBytes) {
        await reader.cancel("Image upload size limit exceeded");
        throw new ImageUploadStreamError(413, "单张图片不能超过 100MB");
      }

      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", abortReader);
    reader.releaseLock();
  }

  if (receivedBytes === 0) {
    throw new ImageUploadStreamError(400, "图片内容不能为空");
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function forwardImageUploadRequest(
  request: Request,
  deps: ImageUploadStreamDependencies,
): Promise<{ imageUrl: string }> {
  const maxBytes = deps.maxBytes ?? MAX_STREAM_IMAGE_UPLOAD_BYTES;
  parseContentLength(request, maxBytes);
  const contentType = parseContentType(request);

  if (!request.body) {
    throw new ImageUploadStreamError(400, "图片内容不能为空");
  }

  let body: Uint8Array;

  try {
    body = await readLimitedBody(request.body, maxBytes, request.signal);
  } catch (error) {
    if (request.signal.aborted) {
      throw new ImageUploadStreamError(499, "图片上传已取消", { cause: error });
    }

    throw error;
  }
  const requestUrl = new URL(request.url);
  const fileName = requestUrl.searchParams.get("fileName")?.trim() || undefined;
  const folder = requestUrl.searchParams.get("folder")?.trim() || undefined;
  const target = deps.createUploadTarget({
    contentType,
    fileName,
    folder,
    useInternalEndpoint: true,
  });
  const upstreamController = new AbortController();
  const abortUpstream = () => upstreamController.abort(request.signal.reason);

  if (request.signal.aborted) {
    abortUpstream();
  } else {
    request.signal.addEventListener("abort", abortUpstream, { once: true });
  }

  const headers = {
    ...target.headers,
    "Content-Length": String(body.byteLength),
  };
  const init: StreamingRequestInit = {
    method: "PUT",
    headers,
    body: body as unknown as BodyInit,
    duplex: "half",
    signal: upstreamController.signal,
  };

  try {
    const response = await (deps.fetchImpl ?? fetch)(target.uploadUrl, init);

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageUploadStreamError(502, `OSS 图片上传失败（${response.status}）`);
    }

    return { imageUrl: target.imageUrl };
  } catch (error) {
    if (request.signal.aborted) {
      throw new ImageUploadStreamError(499, "图片上传已取消", { cause: error });
    }

    if (error instanceof ImageUploadStreamError) {
      throw error;
    }

    throw new ImageUploadStreamError(
      502,
      `OSS 图片上传失败：${summarizeUploadFailure(error)}`,
      { cause: error },
    );
  } finally {
    request.signal.removeEventListener("abort", abortUpstream);
  }
}
