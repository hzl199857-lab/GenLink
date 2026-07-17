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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  createAgentAttachmentFromCanvasNode,
  createMaterialSourceFromCanvasNode,
} = require("./media-sources.ts") as typeof import("./media-sources");

const uploadedImage: CanvasNode = {
  id: "image-1",
  type: "uploaded_image",
  position: { x: 0, y: 0 },
  data: {
    title: "产品图",
    imageUrl: "https://origin.example/product.png",
    hostedImageUrl: "https://cdn.example/product.png",
    fileName: "product.png",
    width: 800,
    height: 600,
    sizeBytes: 1234,
  },
};

const generatedVideo: CanvasNode = {
  id: "video-generation-1",
  type: "video_generation",
  position: { x: 0, y: 0 },
  data: {
    title: "广告视频",
    videoUrl: "https://origin.example/ad.mp4",
    hostedVideoUrl: "https://cdn.example/ad.mp4",
    generatedOutputFileName: "ad.mp4",
    duration: 8,
  },
};

const uploadedVideo: CanvasNode = {
  id: "video-1",
  type: "video",
  position: { x: 0, y: 0 },
  data: {
    title: "实拍视频",
    videoUrl: "https://origin.example/shot.mp4",
    hostedVideoUrl: "https://cdn.example/shot.mp4",
    fileName: "shot.mp4",
    outputFileName: "shot.mp4",
    width: 1920,
    height: 1080,
    durationSeconds: 12,
    mimeType: "video/mp4",
    sizeBytes: 5678,
  },
};

const uploadedAudio: CanvasNode = {
  id: "audio-1",
  type: "audio",
  position: { x: 0, y: 0 },
  data: {
    title: "旁白",
    audioUrl: "https://origin.example/voice.mp3",
    hostedAudioUrl: "https://cdn.example/voice.mp3",
    fileName: "voice.mp3",
    outputFileName: "voice.mp3",
    durationSeconds: 20,
    mimeType: "audio/mpeg",
    sizeBytes: 9876,
  },
};

test("creates Agent attachments from image nodes only", () => {
  assert.deepEqual(createAgentAttachmentFromCanvasNode(uploadedImage), {
    id: "node-image-1",
    kind: "image",
    name: "产品图",
    mimeType: "image/*",
    mediaUrl: "https://cdn.example/product.png",
    imageUrl: "https://cdn.example/product.png",
    hostedImageUrl: "https://cdn.example/product.png",
    originalImageUrl: "https://cdn.example/product.png",
    previewUrl: "https://cdn.example/product.png",
    thumbnailUrl: "https://cdn.example/product.png",
    semanticImageUrl: undefined,
    width: 800,
    height: 600,
    sizeBytes: 1234,
    status: "ready",
    sourceNodeId: "image-1",
  });

  assert.equal(createAgentAttachmentFromCanvasNode(generatedVideo), null);
  assert.equal(createAgentAttachmentFromCanvasNode(uploadedVideo), null);
  assert.equal(createAgentAttachmentFromCanvasNode(uploadedAudio), null);
});

test("creates material sources from image, video, and audio nodes", () => {
  assert.equal(createMaterialSourceFromCanvasNode(uploadedImage)?.kind, "image");

  const video = createMaterialSourceFromCanvasNode(uploadedVideo);
  assert.equal(video?.kind, "video");
  assert.equal(video?.mediaUrl, "https://cdn.example/shot.mp4");
  assert.equal(video?.durationSeconds, 12);

  const generated = createMaterialSourceFromCanvasNode(generatedVideo);
  assert.equal(generated?.kind, "video");
  assert.equal(generated?.mediaUrl, "https://cdn.example/ad.mp4");
  assert.equal(generated?.durationSeconds, 8);

  const audio = createMaterialSourceFromCanvasNode(uploadedAudio);
  assert.equal(audio?.kind, "audio");
  assert.equal(audio?.mediaUrl, "https://cdn.example/voice.mp3");
  assert.equal(audio?.durationSeconds, 20);
});
