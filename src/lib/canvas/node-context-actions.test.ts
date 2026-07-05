import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { CanvasNode } from "../../types/canvas";

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

  (module as NodeModule & { _compile(source: string, filename: string): void })
    ._compile(output.outputText, filename);
};

const {
  createAgentAttachmentFromNode,
  getNodeClipboardContent,
  getNodeClipboardText,
  getNodeExport,
  getNodeTitle,
  isNodeRenameable,
} = require("./node-context-actions.ts") as typeof import("./node-context-actions");

const imageNode: CanvasNode = {
  id: "image-1",
  type: "image",
  position: { x: 0, y: 0 },
  data: {
    title: "Product Shot",
    imageUrl: "https://example.com/image.png",
    hostedImageUrl: "https://cdn.example.com/image.png",
    prompt: "product image",
    width: 640,
    height: 480,
    generatedAt: "2026-07-01T00:00:00.000Z",
  },
};

const textNode: CanvasNode = {
  id: "text-1",
  type: "text",
  position: { x: 0, y: 0 },
  data: {
    title: "Brief",
    text: "Line one\nLine two",
  },
};

const videoNode: CanvasNode = {
  id: "video-1",
  type: "video",
  position: { x: 0, y: 0 },
  data: {
    title: "Motion",
    videoUrl: "https://example.com/video.mp4",
    hostedVideoUrl: "https://cdn.example.com/video.mp4",
    fileName: "motion.mp4",
    width: 1920,
    height: 1080,
  },
};

test("creates Agent image attachment only from image-capable nodes", () => {
  const attachment = createAgentAttachmentFromNode(imageNode);

  assert.equal(attachment?.sourceNodeId, "image-1");
  assert.equal(attachment?.kind, "image");
  assert.equal(attachment?.imageUrl, "https://cdn.example.com/image.png");
  assert.equal(attachment?.width, 640);
  assert.equal(createAgentAttachmentFromNode(textNode), null);
});

test("gets clipboard content from text, image, and media nodes", () => {
  assert.deepEqual(getNodeClipboardContent(textNode), {
    kind: "text",
    text: "Line one\nLine two",
  });
  assert.deepEqual(getNodeClipboardContent(imageNode), {
    kind: "image",
    url: "https://cdn.example.com/image.png",
  });
  assert.deepEqual(getNodeClipboardContent(videoNode), {
    kind: "text",
    text: "https://cdn.example.com/video.mp4",
  });
});

test("keeps legacy clipboard text helper for text-copyable nodes only", () => {
  assert.equal(getNodeClipboardText(textNode), "Line one\nLine two");
  assert.equal(getNodeClipboardText(videoNode), "https://cdn.example.com/video.mp4");
  assert.equal(getNodeClipboardText(imageNode), null);
});

test("gets export metadata for text and image nodes", () => {
  assert.deepEqual(getNodeExport(textNode), {
    kind: "text",
    text: "Line one\nLine two",
    fileName: "brief.txt",
    mimeType: "text/plain;charset=utf-8",
  });

  assert.deepEqual(getNodeExport(imageNode), {
    kind: "url",
    url: "https://cdn.example.com/image.png",
    fileName: "product-shot.png",
    mimeType: "image/png",
  });
});

test("resolves node titles and renameability", () => {
  assert.equal(getNodeTitle(textNode), "Brief");
  assert.equal(isNodeRenameable(textNode), true);
});
