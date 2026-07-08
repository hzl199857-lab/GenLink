import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../../types/canvas.ts", import.meta.url),
  "utf8",
);
const storageSource = readFileSync(
  new URL("../../lib/project-storage.ts", import.meta.url),
  "utf8",
);

test("material items preserve explicit display dimensions", () => {
  assert.match(typesSource, /displayWidth\?: number;/);
  assert.match(typesSource, /displayHeight\?: number;/);
  assert.match(storageSource, /displayWidth: typeof record\.displayWidth === "number" \? record\.displayWidth : undefined,/);
  assert.match(storageSource, /displayHeight: typeof record\.displayHeight === "number" \? record\.displayHeight : undefined,/);
});

test("applying a material writes a canvas display size for the image node", () => {
  assert.match(canvasSource, /const displayDimensions = resolveImageNodeCardDimensions\(\{[\s\S]*?width,[\s\S]*?height,[\s\S]*?displayWidth: item\.displayWidth,[\s\S]*?displayHeight: item\.displayHeight,[\s\S]*?\}\);/);
  assert.match(canvasSource, /displayWidth: displayDimensions\.width,/);
  assert.match(canvasSource, /displayHeight: displayDimensions\.height,/);
});

test("saving canvas image nodes to materials carries their current display size", () => {
  assert.match(canvasSource, /function createMaterialSourceFromImageNodeData[\s\S]*?displayWidth: data\.displayWidth,[\s\S]*?displayHeight: data\.displayHeight,/);
  assert.match(canvasSource, /function createMaterialSourceFromUploadedImageData[\s\S]*?displayWidth: data\.displayWidth,[\s\S]*?displayHeight: data\.displayHeight,/);
});

test("replacing an image node clears stale explicit display dimensions", () => {
  assert.match(canvasSource, /updateNodeData<'image'>\(id, \{[\s\S]*?width: next\.width,[\s\S]*?height: next\.height,[\s\S]*?displayWidth: undefined,[\s\S]*?displayHeight: undefined,/);
  assert.match(canvasSource, /updateNodeData<'uploaded_image'>\(id, \{[\s\S]*?\.\.\.next,[\s\S]*?displayWidth: undefined,[\s\S]*?displayHeight: undefined,/);
});
