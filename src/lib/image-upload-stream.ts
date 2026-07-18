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

function parseContentLength(request: Request, maxBytes: number): number | undefined {
  const requestUrl = new URL(request.url);
  const rawHeader = request.headers.get("content-length") ?? requestUrl.searchParams.get("size");

  if (rawHeader === null) {
    return undefined;
  }

  const rawValue = rawHeader.trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new ImageUploadStreamError(400, "缺少有效的图片大小");
  }

  const value = Number(rawValue);

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

function createLimitedBody(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
  onLimitExceeded: () => void,
  onEmpty: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let receivedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();

        if (result.done) {
          if (receivedBytes === 0) {
            onEmpty();
            controller.error(new ImageUploadStreamError(400, "图片内容不能为空"));
            return;
          }

          controller.close();
          return;
        }

        receivedBytes += result.value.byteLength;

        if (receivedBytes > maxBytes) {
          onLimitExceeded();
          await reader.cancel("Image upload size limit exceeded");
          controller.error(new ImageUploadStreamError(413, "单张图片不能超过 100MB"));
          return;
        }

        controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

export async function forwardImageUploadRequest(
  request: Request,
  deps: ImageUploadStreamDependencies,
): Promise<{ imageUrl: string }> {
  const maxBytes = deps.maxBytes ?? MAX_STREAM_IMAGE_UPLOAD_BYTES;
  const contentLength = parseContentLength(request, maxBytes);
  const contentType = parseContentType(request);

  if (!request.body) {
    throw new ImageUploadStreamError(400, "图片内容不能为空");
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
  let limitExceeded = false;
  let bodyWasEmpty = false;

  if (request.signal.aborted) {
    abortUpstream();
  } else {
    request.signal.addEventListener("abort", abortUpstream, { once: true });
  }

  const body = createLimitedBody(request.body, maxBytes, () => {
    limitExceeded = true;
    upstreamController.abort(new ImageUploadStreamError(413, "单张图片不能超过 100MB"));
  }, () => {
    bodyWasEmpty = true;
    upstreamController.abort(new ImageUploadStreamError(400, "图片内容不能为空"));
  });
  const headers = {
    ...target.headers,
    ...(contentLength === undefined ? {} : { "Content-Length": String(contentLength) }),
  };
  const init: StreamingRequestInit = {
    method: "PUT",
    headers,
    body,
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
    if (limitExceeded) {
      throw new ImageUploadStreamError(413, "单张图片不能超过 100MB", { cause: error });
    }

    if (bodyWasEmpty) {
      throw new ImageUploadStreamError(400, "图片内容不能为空", { cause: error });
    }

    if (request.signal.aborted) {
      throw new ImageUploadStreamError(499, "图片上传已取消", { cause: error });
    }

    if (error instanceof ImageUploadStreamError) {
      throw error;
    }

    throw new ImageUploadStreamError(502, "OSS 图片上传失败", { cause: error });
  } finally {
    request.signal.removeEventListener("abort", abortUpstream);
  }
}
