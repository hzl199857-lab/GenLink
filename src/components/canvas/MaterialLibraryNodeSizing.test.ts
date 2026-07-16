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
  assert.match(canvasSource, /const displayDimensions = resolveImageNodeCardDimensions\(\{[\s\S]*?width,[\s\S]*?height,[\s\S]*?displayWidth: sourceDisplayDimensions\?\.width \?\? item\.displayWidth,[\s\S]*?displayHeight: sourceDisplayDimensions\?\.height \?\? item\.displayHeight,[\s\S]*?\}\);/);
  assert.match(canvasSource, /displayWidth: displayDimensions\.width,/);
  assert.match(canvasSource, /displayHeight: displayDimensions\.height,/);
});

test("applying legacy materials resolves missing natural image dimensions before creating the node", () => {
  assert.match(canvasSource, /async function createImageNodeFromMaterial/);
  assert.match(canvasSource, /const resolvedDimensions = !hasMaterialImageDimensions\(item\)[\s\S]*?await readImageDimensionsFromUrl\(imageUrl\)\.catch\(\(\) => null\)/);
  assert.match(canvasSource, /const width = resolvedDimensions\?\.width \|\| item\.width \|\| 320;/);
  assert.match(canvasSource, /await createImageNodeFromMaterial\(item, position, sourceDisplayDimensions\)/);
});

test("applying materials branches to the matching canvas node kind", () => {
  assert.match(canvasSource, /getMaterialKind\(item\) === 'image'/);
  assert.match(canvasSource, /createCanvasNodeFromMaterial\(item, position\)/);
  assert.doesNotMatch(
    canvasSource,
    /const sourceDisplayDimensions = resolveMaterialSourceDisplayDimensions\(item, storeNodes\);\s*const node = await createImageNodeFromMaterial/,
  );
});

test("material upload accepts and reads images, videos, and audio", () => {
  assert.match(canvasSource, /ref=\{materialUploadInputRef\}[\s\S]*?accept="image\/\*,video\/\*,audio\/\*"/);
  assert.match(canvasSource, /handleMaterialUploadInputChange[\s\S]*?readImageFile\(file/);
  assert.match(canvasSource, /handleMaterialUploadInputChange[\s\S]*?readVideoFile\(file\)/);
  assert.match(canvasSource, /handleMaterialUploadInputChange[\s\S]*?readAudioFile\(file\)/);
});

test("saving image generation nodes to materials carries the current card display size", () => {
  assert.match(canvasSource, /function createMaterialSourceFromImageGenerationData\(\s*data: ImageGenerationNodeData,\s*displayDimensions\?: \{ width: number; height: number \},\s*\)/);
  assert.match(canvasSource, /displayWidth: displayDimensions\?\.width,/);
  assert.match(canvasSource, /displayHeight: displayDimensions\?\.height,/);
  assert.match(canvasSource, /const source = createMaterialSourceFromImageGenerationData\(imageData, cardDimensions\);/);
});

test("applying legacy image-generation materials reuses the matching source node card size", () => {
  assert.match(canvasSource, /function resolveMaterialSourceDisplayDimensions\(\s*item: MaterialLibraryItem,\s*nodes: CanvasNode\[],\s*\): \{ width: number; height: number \} \| undefined/);
  assert.match(canvasSource, /candidate\.type !== 'image_generation'/);
  assert.match(canvasSource, /resolveImageGenerationCardDimensions\(data, referenceImages\)/);
  assert.match(canvasSource, /const sourceDisplayDimensions = getMaterialKind\(item\) === 'image'[\s\S]*?resolveMaterialSourceDisplayDimensions\(item, storeNodes\)/);
  assert.match(canvasSource, /createImageNodeFromMaterial\(item, position, sourceDisplayDimensions\)/);
});

test("saving canvas image nodes to materials carries their current display size", () => {
  assert.match(canvasSource, /function createMaterialSourceFromImageNodeData[\s\S]*?displayWidth: data\.displayWidth,[\s\S]*?displayHeight: data\.displayHeight,/);
  assert.match(canvasSource, /function createMaterialSourceFromUploadedImageData[\s\S]*?displayWidth: data\.displayWidth,[\s\S]*?displayHeight: data\.displayHeight,/);
});

test("replacing an image node clears stale explicit display dimensions", () => {
  assert.match(canvasSource, /updateNodeData<'image'>\(id, \{[\s\S]*?width: next\.width,[\s\S]*?height: next\.height,[\s\S]*?displayWidth: undefined,[\s\S]*?displayHeight: undefined,/);
  assert.match(canvasSource, /updateNodeData<'uploaded_image'>\(id, \{[\s\S]*?\.\.\.next,[\s\S]*?displayWidth: undefined,[\s\S]*?displayHeight: undefined,/);
});
