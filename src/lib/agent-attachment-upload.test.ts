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
  createHostedAgentImageAttachment,
  dataUrlToImageBlob,
} = require("./agent-attachment-upload.ts") as typeof import("./agent-attachment-upload");

test("converts base64 image data URLs into uploadable blobs", async () => {
  const blob = await dataUrlToImageBlob("data:image/png;base64,aW1hZ2UtYnl0ZXM=");

  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 11);
});

test("uses hosted URL as the agent attachment image URL", async () => {
  const file = new File(["image-bytes"], "curtain.png", { type: "image/png" });
  const uploads: Array<{ dataUrl: string; fileName?: string; kind?: string }> = [];
  const attachment = await createHostedAgentImageAttachment(file, {
    createAttachmentId: () => "agent-attachment-1",
    createPreviewUrl: () => "blob:preview",
    readImageDataUrl: async () => "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
    readImageDimensions: async () => ({ width: 4096, height: 3072 }),
    createDerivativeDataUrl: async (dataUrl, options) => {
      assert.equal(dataUrl, "data:image/png;base64,aW1hZ2UtYnl0ZXM=");
      return `data:${options.mimeType};max=${options.maxEdge}`;
    },
    uploadImageDataUrl: async (dataUrl, fileName, kind) => {
      uploads.push({ dataUrl, fileName, kind });
      return `https://oss.example.com/${kind}/curtain.png`;
    },
  });

  assert.deepEqual(attachment, {
    id: "agent-attachment-1",
    kind: "image",
    name: "curtain.png",
    mimeType: "image/png",
    imageUrl: "https://oss.example.com/original/curtain.png",
    hostedImageUrl: "https://oss.example.com/original/curtain.png",
    originalImageUrl: "https://oss.example.com/original/curtain.png",
    previewUrl: "https://oss.example.com/preview/curtain.png",
    thumbnailUrl: "https://oss.example.com/preview/curtain.png",
    semanticImageUrl: "https://oss.example.com/semantic/curtain.png",
    width: 4096,
    height: 3072,
    sizeBytes: file.size,
    status: "ready",
  });
  assert.deepEqual(uploads, [
    {
      dataUrl: "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
      fileName: "curtain.png",
      kind: "original",
    },
    {
      dataUrl: "data:image/jpeg;max=768",
      fileName: "curtain.png",
      kind: "preview",
    },
    {
      dataUrl: "data:image/jpeg;max=2048",
      fileName: "curtain.png",
      kind: "semantic",
    },
  ]);
});

test("keeps reading dimensions from the browser preview URL", async () => {
  const file = new File(["image-bytes"], "fabric.webp", { type: "image/webp" });
  let dimensionsUrl = "";

  await createHostedAgentImageAttachment(file, {
    createAttachmentId: () => "agent-attachment-2",
    createPreviewUrl: () => "blob:fabric-preview",
    readImageDataUrl: async () => "data:image/webp;base64,aW1hZ2UtYnl0ZXM=",
    readImageDimensions: async (url) => {
      dimensionsUrl = url;
      return { width: 1200, height: 1800 };
    },
    createDerivativeDataUrl: async () => "data:image/jpeg;base64,variant",
    uploadImageDataUrl: async (_dataUrl, _fileName, kind) => `https://oss.example.com/${kind}/fabric.webp`,
  });

  assert.equal(dimensionsUrl, "blob:fabric-preview");
});

test("falls back to browser preview when derivative generation is omitted", async () => {
  const file = new File(["image-bytes"], "small.png", { type: "image/png" });
  const attachment = await createHostedAgentImageAttachment(file, {
    createAttachmentId: () => "agent-attachment-3",
    createPreviewUrl: () => "blob:small-preview",
    readImageDataUrl: async () => "data:image/png;base64,c21hbGw=",
    readImageDimensions: async () => ({ width: 320, height: 240 }),
    uploadImageDataUrl: async () => "https://oss.example.com/original/small.png",
  });

  assert.equal(attachment.imageUrl, "https://oss.example.com/original/small.png");
  assert.equal(attachment.hostedImageUrl, "https://oss.example.com/original/small.png");
  assert.equal(attachment.previewUrl, "blob:small-preview");
  assert.equal(attachment.thumbnailUrl, undefined);
  assert.equal(attachment.semanticImageUrl, "https://oss.example.com/original/small.png");
});
