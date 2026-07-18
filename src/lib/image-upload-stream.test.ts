import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  ImageUploadStreamError,
  MAX_STREAM_IMAGE_UPLOAD_BYTES,
  forwardImageUploadRequest,
} = require("./image-upload-stream.ts") as typeof import("./image-upload-stream");

type TargetInput = Parameters<
  Parameters<typeof forwardImageUploadRequest>[1]["createUploadTarget"]
>[0];

function createImageRequest(
  bytes: Uint8Array,
  options: {
    contentLength?: string | null;
    contentType?: string;
    fileName?: string;
    folder?: string;
    signal?: AbortSignal;
  } = {},
): Request {
  const contentType = options.contentType ?? "image/png";
  const url = new URL("https://genlink.example/api/image-hosting/upload-stream");

  if (options.fileName) url.searchParams.set("fileName", options.fileName);
  if (options.folder) url.searchParams.set("folder", options.folder);

  const headers = new Headers({ "Content-Type": contentType });
  const contentLength = options.contentLength === undefined
    ? String(bytes.byteLength)
    : options.contentLength;

  if (contentLength !== null) {
    headers.set("Content-Length", contentLength);
  }

  return new Request(url, {
    method: "POST",
    headers,
    body: new Blob([bytes as unknown as BlobPart], { type: contentType }),
    signal: options.signal,
  });
}

function hasStatus(status: number) {
  return (error: unknown) =>
    error instanceof ImageUploadStreamError && error.status === status;
}

function createDeps(options: {
  maxBytes?: number;
  upstreamStatus?: number;
  networkError?: Error;
} = {}) {
  const calls = {
    createTarget: [] as TargetInput[],
    uploadUrl: "",
    uploadedBytes: [] as number[],
  };
  const createUploadTarget = (input: TargetInput) => {
    calls.createTarget.push(input);

    return {
      uploadUrl: "https://bucket.oss-cn-guangzhou-internal.aliyuncs.com/object?signature=secret",
      imageUrl: "https://cdn.example/references/product.png",
      headers: { "Content-Type": input.contentType },
    };
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.uploadUrl = input.toString();

    if (options.networkError) {
      throw options.networkError;
    }

    const uploaded = new Uint8Array(
      await new Response(init?.body as BodyInit).arrayBuffer(),
    );
    calls.uploadedBytes = [...uploaded];

    return new Response(null, { status: options.upstreamStatus ?? 200 });
  };

  return {
    calls,
    deps: {
      createUploadTarget,
      fetchImpl,
      maxBytes: options.maxBytes,
    },
  };
}

test("rejects non-image uploads", async () => {
  const { deps } = createDeps();
  const request = createImageRequest(new Uint8Array([1, 2, 3]), {
    contentType: "text/plain",
  });

  await assert.rejects(forwardImageUploadRequest(request, deps), hasStatus(400));
});

test("rejects invalid and empty content lengths when they are provided", async () => {
  for (const contentLength of ["four", "0", "-1"]) {
    const { deps } = createDeps();
    const request = createImageRequest(new Uint8Array([1]), { contentLength });

    await assert.rejects(forwardImageUploadRequest(request, deps), hasStatus(400));
  }
});

test("streams uploads without Content-Length through chunked proxy hops", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { calls, deps } = createDeps();

  const result = await forwardImageUploadRequest(
    createImageRequest(bytes, { contentLength: null }),
    deps,
  );

  assert.deepEqual(result, {
    imageUrl: "https://cdn.example/references/product.png",
  });
  assert.deepEqual(calls.uploadedBytes, [...bytes]);
});

test("rejects declared uploads above 100MB before creating a target", async () => {
  const { calls, deps } = createDeps();
  const request = createImageRequest(new Uint8Array([1]), {
    contentLength: String(MAX_STREAM_IMAGE_UPLOAD_BYTES + 1),
  });

  await assert.rejects(forwardImageUploadRequest(request, deps), hasStatus(413));
  assert.equal(calls.createTarget.length, 0);
});

test("streams image bytes to an internal OSS target", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { calls, deps } = createDeps();
  const result = await forwardImageUploadRequest(
    createImageRequest(bytes, {
      fileName: "商品 主图.png",
      folder: "references/original",
    }),
    deps,
  );

  assert.deepEqual(result, {
    imageUrl: "https://cdn.example/references/product.png",
  });
  assert.deepEqual(calls.uploadedBytes, [...bytes]);
  assert.deepEqual(calls.createTarget[0], {
    contentType: "image/png",
    fileName: "商品 主图.png",
    folder: "references/original",
    useInternalEndpoint: true,
  });
  assert.match(calls.uploadUrl, /-internal\.aliyuncs\.com/);
});

test("rejects when actual streamed bytes exceed the maximum", async () => {
  const { deps } = createDeps({ maxBytes: 3 });
  const request = createImageRequest(new Uint8Array([1, 2, 3, 4]), {
    contentLength: "3",
  });

  await assert.rejects(forwardImageUploadRequest(request, deps), hasStatus(413));
});

test("returns a sanitized upstream error for OSS failures", async () => {
  const failedResponse = createDeps({ upstreamStatus: 503 });
  await assert.rejects(
    forwardImageUploadRequest(
      createImageRequest(new Uint8Array([1])),
      failedResponse.deps,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ImageUploadStreamError);
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /signature=secret/);
      return true;
    },
  );

  const networkFailure = createDeps({ networkError: new Error("socket closed") });
  await assert.rejects(
    forwardImageUploadRequest(
      createImageRequest(new Uint8Array([1])),
      networkFailure.deps,
    ),
    hasStatus(502),
  );
});

test("propagates request cancellation to the OSS request", async () => {
  const controller = new AbortController();
  let upstreamAborted = false;
  const request = createImageRequest(new Uint8Array([1, 2, 3]), {
    signal: controller.signal,
  });
  const promise = forwardImageUploadRequest(request, {
    createUploadTarget: () => ({
      uploadUrl: "https://internal.example/upload",
      imageUrl: "https://cdn.example/image.png",
      headers: { "Content-Type": "image/png" },
    }),
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          upstreamAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }),
  });

  controller.abort();

  await assert.rejects(promise, hasStatus(499));
  assert.equal(upstreamAborted, true);
});
