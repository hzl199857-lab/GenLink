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
  getAgentVisionImageIndexByAttachmentId,
  getAgentVisionImages,
  getAgentVisionVideos,
} = require("./agent-vision-images.ts") as typeof import("./agent-vision-images");

test("prefers semantic image URLs for agent vision input", () => {
  const images = getAgentVisionImages([
    {
      id: "att-1",
      kind: "image",
      name: "curtain.png",
      mimeType: "image/png",
      imageUrl: "https://oss.example.com/original/curtain.png",
      hostedImageUrl: "https://oss.example.com/original/curtain.png",
      previewUrl: "https://oss.example.com/preview/curtain.png",
      semanticImageUrl: "https://oss.example.com/semantic/curtain.png",
      status: "ready",
    },
  ]);

  assert.deepEqual(images, [
    {
      attachmentId: "att-1",
      url: "https://oss.example.com/semantic/curtain.png",
    },
  ]);
});

test("falls back to hosted or original URLs for older attachments", () => {
  const images = getAgentVisionImages([
    {
      id: "att-hosted",
      kind: "image",
      name: "hosted.png",
      mimeType: "image/png",
      imageUrl: "data:image/png;base64,old",
      hostedImageUrl: "https://oss.example.com/original/hosted.png",
      previewUrl: "blob:hosted-preview",
      status: "ready",
    },
    {
      id: "att-original",
      kind: "image",
      name: "original.png",
      mimeType: "image/png",
      imageUrl: "https://oss.example.com/original/original.png",
      previewUrl: "blob:original-preview",
      status: "ready",
    },
  ]);

  assert.deepEqual(images, [
    {
      attachmentId: "att-hosted",
      url: "https://oss.example.com/original/hosted.png",
    },
    {
      attachmentId: "att-original",
      url: "https://oss.example.com/original/original.png",
    },
  ]);
});

test("ignores local preview-only attachments and indexes visible images", () => {
  const attachments = [
    {
      id: "att-local",
      kind: "image" as const,
      name: "local.png",
      mimeType: "image/png",
      imageUrl: "blob:local",
      previewUrl: "blob:local-preview",
      status: "ready" as const,
    },
    {
      id: "att-vision",
      kind: "image" as const,
      name: "vision.png",
      mimeType: "image/png",
      imageUrl: "https://oss.example.com/original/vision.png",
      previewUrl: "https://oss.example.com/preview/vision.png",
      semanticImageUrl: "https://oss.example.com/semantic/vision.png",
      status: "ready" as const,
    },
  ];

  assert.deepEqual(getAgentVisionImages(attachments), [
    {
      attachmentId: "att-vision",
      url: "https://oss.example.com/semantic/vision.png",
    },
  ]);
  assert.equal(getAgentVisionImageIndexByAttachmentId(attachments).get("att-local"), undefined);
  assert.equal(getAgentVisionImageIndexByAttachmentId(attachments).get("att-vision"), 1);
});

test("separates remote video inputs from image inputs", () => {
  const image = {
    id: "att-image",
    kind: "image" as const,
    name: "image.png",
    mimeType: "image/png",
    mediaUrl: "https://cdn.example/image.png",
    imageUrl: "https://cdn.example/image.png",
    previewUrl: "https://cdn.example/image.png",
    status: "ready" as const,
  };
  const video = {
    id: "att-video",
    kind: "video" as const,
    name: "video.mp4",
    mimeType: "video/mp4",
    mediaUrl: "https://cdn.example/video.mp4",
    videoUrl: "https://cdn.example/video.mp4",
    previewUrl: "https://cdn.example/video.mp4",
    status: "ready" as const,
  };

  assert.deepEqual(getAgentVisionImages([image, video]), [
    { attachmentId: "att-image", url: "https://cdn.example/image.png" },
  ]);
  assert.deepEqual(getAgentVisionVideos([image, video, { ...video, id: "att-video-copy" }]), [
    { attachmentId: "att-video", url: "https://cdn.example/video.mp4" },
  ]);
});
