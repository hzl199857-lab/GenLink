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
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  getBrowserOssUploadPolicy,
  uploadReferenceImageBlobToOss,
  uploadImageAsset,
} = require("./browser-oss-upload.ts") as typeof import("./browser-oss-upload");

test("falls back to server image upload when direct OSS upload returns a network error", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const blob = new Blob(["image"], { type: "image/png" });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ url, init });

    if (url === "/api/image-hosting/upload-url") {
      return Response.json({
        ok: true,
        result: {
          uploadUrl: "https://bucket.oss-cn-hangzhou.aliyuncs.com/images/file.png?signature=1",
          imageUrl: "https://cdn.example.com/images/file.png",
          headers: { "Content-Type": "image/png" },
        },
      });
    }

    if (url.includes("aliyuncs.com")) {
      throw new TypeError("Failed to fetch");
    }

    if (url.startsWith("/api/image-hosting/upload-stream?")) {
      return Response.json({
        ok: true,
        result: { imageUrl: "https://cdn.example.com/images/file-server.png" },
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await uploadImageAsset({
    data: blob,
    contentType: "image/png",
    fileName: "file.png",
    folder: "images",
    fetchImpl,
  });

  assert.deepEqual(result, {
    hostedUrl: "https://cdn.example.com/images/file-server.png",
    mode: "server",
  });
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/image-hosting/upload-url",
    "https://bucket.oss-cn-hangzhou.aliyuncs.com/images/file.png?signature=1",
    "/api/image-hosting/upload-stream?fileName=file.png&folder=images",
  ]);
  assert.equal(calls[2]?.init?.body, blob);
  assert.equal(new Headers(calls[2]?.init?.headers).get("Content-Type"), "image/png");
});

test("uses server image upload immediately when policy is server", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const blob = new Blob(["image"], { type: "image/png" });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ url, init });

    if (url.startsWith("/api/image-hosting/upload-stream?")) {
      return Response.json({
        ok: true,
        result: { imageUrl: "https://cdn.example.com/images/file-server.png" },
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await uploadImageAsset({
    data: blob,
    contentType: "image/png",
    fileName: "file.png",
    folder: "images",
    policy: "server",
    fetchImpl,
  });

  assert.deepEqual(result, {
    hostedUrl: "https://cdn.example.com/images/file-server.png",
    mode: "server",
  });
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/image-hosting/upload-stream?fileName=file.png&folder=images",
  ]);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, blob);
  assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "image/png");
});

test("uploads reference image blobs with direct OSS fallback", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const blob = new Blob(["image"], { type: "image/png" });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ url, init });

    if (url === "/api/image-hosting/upload-url") {
      return Response.json({
        ok: true,
        result: {
          uploadUrl: "https://bucket.oss-cn-hangzhou.aliyuncs.com/references/file.png?signature=1",
          imageUrl: "https://cdn.example.com/references/file.png",
          headers: { "Content-Type": "image/png" },
        },
      });
    }

    if (url.includes("aliyuncs.com")) {
      throw new TypeError("Failed to fetch");
    }

    if (url.startsWith("/api/image-hosting/upload-stream?")) {
      return Response.json({
        ok: true,
        result: { imageUrl: "https://cdn.example.com/references/file-server.png" },
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await uploadReferenceImageBlobToOss({
    blob,
    fileName: "reference.png",
    fetchImpl,
  });

  assert.equal(result, "https://cdn.example.com/references/file-server.png");
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/image-hosting/upload-url",
    "https://bucket.oss-cn-hangzhou.aliyuncs.com/references/file.png?signature=1",
    "/api/image-hosting/upload-stream?fileName=reference.png&folder=references",
  ]);
  assert.equal(calls[2]?.init?.body, blob);
  assert.equal(new Headers(calls[2]?.init?.headers).get("Content-Type"), "image/png");
});

test("defaults to direct-with-fallback unless image upload mode is server", () => {
  assert.equal(getBrowserOssUploadPolicy("server"), "server");
  assert.equal(getBrowserOssUploadPolicy("SERVER"), "server");
  assert.equal(getBrowserOssUploadPolicy("direct"), "direct-with-fallback");
  assert.equal(getBrowserOssUploadPolicy(""), "direct-with-fallback");
});
