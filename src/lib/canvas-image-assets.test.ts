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
  createHostedCanvasImageData,
  createPendingCanvasImageData,
  getCanvasImageDisplayUrls,
  hasTransientCanvasImageMedia,
  sanitizeCanvasImageMediaForPersistence,
} = require("./canvas-image-assets.ts") as typeof import("./canvas-image-assets");

test("orders image display URLs from preview to hosted source with duplicates removed", () => {
  assert.deepEqual(
    getCanvasImageDisplayUrls({
      imageUrl: "https://oss.example.com/original.png",
      hostedImageUrl: "https://oss.example.com/original.png",
      previewUrl: "blob:fresh-preview",
    }),
    ["blob:fresh-preview", "https://oss.example.com/original.png"],
  );

  assert.deepEqual(
    getCanvasImageDisplayUrls({ imageUrl: "output:missing.png" }),
    [],
  );
});

test("removes browser object URLs from persisted image data", () => {
  const data = sanitizeCanvasImageMediaForPersistence({
    imageUrl: "blob:original",
    hostedImageUrl: "https://oss.example.com/original.png",
    previewUrl: "blob:preview",
    semanticImageUrl: "blob:semantic",
    status: "idle" as const,
  });

  assert.deepEqual(data, {
    imageUrl: "https://oss.example.com/original.png",
    hostedImageUrl: "https://oss.example.com/original.png",
    previewUrl: undefined,
    semanticImageUrl: undefined,
    status: "idle",
  });
  assert.equal(hasTransientCanvasImageMedia(data), false);
});

test("persists project-backed images by output file and marks interrupted uploads", () => {
  assert.equal(
    sanitizeCanvasImageMediaForPersistence({
      imageUrl: "blob:project-preview",
      previewUrl: "blob:project-preview",
      generatedOutputFileName: "reference.png",
    }).imageUrl,
    "output:reference.png",
  );

  assert.deepEqual(
    sanitizeCanvasImageMediaForPersistence({
      imageUrl: "blob:pending",
      previewUrl: "blob:pending",
      status: "generating" as const,
      statusMessage: "Uploading...",
    }),
    {
      imageUrl: "",
      hostedImageUrl: undefined,
      previewUrl: undefined,
      semanticImageUrl: undefined,
      status: "error",
      statusMessage: undefined,
      errorMessage: "图片上传未完成，请重新上传",
    },
  );
});

test("creates pending canvas image data from a local preview URL", () => {
  const file = new File(["image-bytes"], "paste.png", { type: "image/png" });

  const imageData = createPendingCanvasImageData(file, {
    previewUrl: "blob:local-preview",
    dimensions: { width: 3840, height: 2160 },
    now: () => "2026-06-13T11:00:00.000Z",
  });

  assert.deepEqual(imageData, {
    title: "paste.png",
    imageUrl: "blob:local-preview",
    previewUrl: "blob:local-preview",
    fileName: "paste.png",
    prompt: "paste.png",
    generatedAt: "2026-06-13T11:00:00.000Z",
    width: 3840,
    height: 2160,
    sizeBytes: file.size,
    status: "generating",
    errorMessage: undefined,
  });
});

test("creates original, preview, and semantic hosted canvas image data", async () => {
  const file = new File(["image-bytes"], "sofa.png", { type: "image/png" });
  const uploads: Array<{ dataUrl: string; fileName?: string; kind?: string }> = [];

  const imageData = await createHostedCanvasImageData(file, {
    now: () => "2026-06-13T08:00:00.000Z",
    readImageDataUrl: async () => "data:image/png;base64,aW1hZ2U=",
    readImageDimensions: async (dataUrl) => {
      assert.equal(dataUrl, "data:image/png;base64,aW1hZ2U=");
      return { width: 1600, height: 1200 };
    },
    createDerivativeDataUrl: async (dataUrl, options) => {
      assert.equal(dataUrl, "data:image/png;base64,aW1hZ2U=");
      return `data:${options.mimeType};max=${options.maxEdge}`;
    },
    uploadImageDataUrl: async (dataUrl, fileName, kind) => {
      uploads.push({ dataUrl, fileName, kind });
      return `https://oss.example.com/${kind}/sofa.png`;
    },
  });

  assert.deepEqual(imageData, {
    title: "sofa.png",
    imageUrl: "https://oss.example.com/original/sofa.png",
    hostedImageUrl: "https://oss.example.com/original/sofa.png",
    previewUrl: "https://oss.example.com/preview/sofa.png",
    semanticImageUrl: "https://oss.example.com/semantic/sofa.png",
    fileName: "sofa.png",
    prompt: "sofa.png",
    generatedAt: "2026-06-13T08:00:00.000Z",
    width: 1600,
    height: 1200,
    sizeBytes: file.size,
  });
  assert.deepEqual(uploads, [
    {
      dataUrl: "data:image/png;base64,aW1hZ2U=",
      fileName: "sofa.png",
      kind: "original",
    },
    {
      dataUrl: "data:image/jpeg;max=768",
      fileName: "sofa.png",
      kind: "preview",
    },
    {
      dataUrl: "data:image/jpeg;max=2048",
      fileName: "sofa.png",
      kind: "semantic",
    },
  ]);
});

test("uploads the original file directly when a file upload hook is provided", async () => {
  const file = new File(["large-image-bytes"], "large.png", { type: "image/png" });
  const dataUrlUploads: Array<{ dataUrl: string; fileName?: string; kind?: string }> = [];
  const directUploads: Array<{ fileName: string; size: number; kind?: string }> = [];

  const imageData = await createHostedCanvasImageData(file, {
    now: () => "2026-06-13T10:00:00.000Z",
    readImageDataUrl: async () => "data:image/png;base64,bGFyZ2U=",
    readImageDimensions: async () => ({ width: 4096, height: 4096 }),
    createDerivativeDataUrl: async (_dataUrl, options) => `data:${options.mimeType};max=${options.maxEdge}`,
    uploadOriginalImageFile: async (imageFile, kind) => {
      directUploads.push({ fileName: imageFile.name, size: imageFile.size, kind });
      return "https://oss.example.com/images/original/large.png";
    },
    uploadImageDataUrl: async (dataUrl, fileName, kind) => {
      dataUrlUploads.push({ dataUrl, fileName, kind });
      return `https://oss.example.com/images/${kind}/large.png`;
    },
  });

  assert.equal(imageData.imageUrl, "https://oss.example.com/images/original/large.png");
  assert.equal(imageData.hostedImageUrl, "https://oss.example.com/images/original/large.png");
  assert.deepEqual(directUploads, [
    {
      fileName: "large.png",
      size: file.size,
      kind: "original",
    },
  ]);
  assert.deepEqual(dataUrlUploads, [
    {
      dataUrl: "data:image/jpeg;max=768",
      fileName: "large.png",
      kind: "preview",
    },
    {
      dataUrl: "data:image/jpeg;max=2048",
      fileName: "large.png",
      kind: "semantic",
    },
  ]);
});

test("falls back to original hosted URL when derivative generation is unavailable", async () => {
  const file = new File(["small"], "small.webp", { type: "image/webp" });

  const imageData = await createHostedCanvasImageData(file, {
    now: () => "2026-06-13T09:00:00.000Z",
    readImageDataUrl: async () => "data:image/webp;base64,c21hbGw=",
    readImageDimensions: async () => ({ width: 320, height: 240 }),
    uploadImageDataUrl: async () => "https://oss.example.com/original/small.webp",
  });

  assert.equal(imageData.imageUrl, "https://oss.example.com/original/small.webp");
  assert.equal(imageData.hostedImageUrl, "https://oss.example.com/original/small.webp");
  assert.equal(imageData.previewUrl, "https://oss.example.com/original/small.webp");
  assert.equal(imageData.semanticImageUrl, "https://oss.example.com/original/small.webp");
});
