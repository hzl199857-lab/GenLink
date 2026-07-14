import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const agentPanel = readFileSync(
  resolve(process.cwd(), "src/components/canvas/CanvasAgentPanel.tsx"),
  "utf8",
);
const canvasStore = readFileSync(
  resolve(process.cwd(), "src/store/canvas-store.ts"),
  "utf8",
);
const infiniteCanvas = readFileSync(
  resolve(process.cwd(), "src/components/canvas/InfiniteCanvas.tsx"),
  "utf8",
);

test("Agent image attachments use the shared browser image uploader", () => {
  assert.match(agentPanel, /import \{ uploadImageAsset \} from ['"]@\/lib\/browser-oss-upload['"]/);
  assert.match(agentPanel, /await uploadImageAsset\(\{/);
  assert.doesNotMatch(agentPanel, /\/api\/image-hosting\/upload-url/);
});

test("canvas image persistence uses the shared uploader without a private OSS PUT", () => {
  const start = canvasStore.indexOf("async function uploadImageBlobToOss");
  const end = canvasStore.indexOf("async function uploadVideoBlobToOss");

  assert.ok(start >= 0, "uploadImageBlobToOss is missing");
  assert.ok(end > start, "uploadVideoBlobToOss must follow the image helper");

  const imageUploadHelper = canvasStore.slice(start, end);

  assert.match(imageUploadHelper, /uploadImageAsset\(\{/);
  assert.doesNotMatch(imageUploadHelper, /image-hosting\/upload-url/);
  assert.doesNotMatch(imageUploadHelper, /method:\s*["']PUT["']/);
});

test("generic canvas media uploads route image files through the shared uploader", () => {
  const start = infiniteCanvas.indexOf("async function uploadMediaFileToOss");
  const end = infiniteCanvas.indexOf("async function uploadMediaFileViaServer");

  assert.ok(start >= 0, "uploadMediaFileToOss is missing");
  assert.ok(end > start, "uploadMediaFileViaServer must follow the media helper");

  const mediaUploadHelper = infiniteCanvas.slice(start, end);

  assert.match(
    mediaUploadHelper,
    /if \(file\.type\.startsWith\(['"]image\/['"]\)\) \{[\s\S]*uploadImageAsset\(\{/,
  );
});
