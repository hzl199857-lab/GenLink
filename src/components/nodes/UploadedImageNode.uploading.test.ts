import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const uploadedImageNodeSource = readFileSync(
  resolve(process.cwd(), "src/components/nodes/UploadedImageNode.tsx"),
  "utf8",
);
const infiniteCanvasSource = readFileSync(
  resolve(process.cwd(), "src/components/canvas/InfiniteCanvas.tsx"),
  "utf8",
);

test("renders a full-card Chinese loading state while an image uploads", () => {
  assert.match(uploadedImageNodeSource, /data-upload-state="uploading"/);
  assert.match(uploadedImageNodeSource, /role="status"/);
  assert.match(uploadedImageNodeSource, /aria-live="polite"/);
  assert.match(uploadedImageNodeSource, /absolute inset-0[^'\"]*bg-black\/55[^'\"]*backdrop-blur/);
  assert.match(uploadedImageNodeSource, /LoaderCircle/);
  assert.match(uploadedImageNodeSource, /animate-spin/);
  assert.match(uploadedImageNodeSource, /上传中\.\.\./u);
  assert.doesNotMatch(uploadedImageNodeSource, /statusMessage \|\| 'Uploading\.\.\.'/);
  assert.match(uploadedImageNodeSource, /errorMessage \|\| '上传失败'/u);
});

test("hides the replace action until the image upload is stable", () => {
  assert.match(
    uploadedImageNodeSource,
    /const canReplace = Boolean\(onReplace\) && !isGenerating;/,
  );
});

test("hides image toolbars while their local previews are still uploading", () => {
  const uploadingGuards = infiniteCanvasSource.match(
    /const isUploading = [^;]+status === 'generating';/g,
  );
  const guardedToolbars = infiniteCanvasSource.match(
    /visible=\{isActive && !isUploading\}/g,
  );

  assert.equal(uploadingGuards?.length, 2);
  assert.equal(guardedToolbars?.length, 2);
});