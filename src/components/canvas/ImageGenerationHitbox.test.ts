import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasSource = readFileSync(new URL("./InfiniteCanvas.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("does not use a transparent React Flow hitbox for image generation nodes", () => {
  assert.doesNotMatch(canvasSource, /gl-image-generation-hitbox/);
  assert.doesNotMatch(cssSource, /gl-image-generation-hitbox/);
});

test("uses the visible image generation card as the canvas bounds", () => {
  assert.doesNotMatch(canvasSource, /stageHeight\s*=\s*IMAGE_GENERATION_MAX_CARD_EDGE/);
  assert.doesNotMatch(canvasSource, /Math\.round\(\(IMAGE_GENERATION_MAX_CARD_EDGE - dimensions\.width\) \/ 2\)/);
  assert.doesNotMatch(canvasSource, /Math\.max\(IMAGE_GENERATION_MAX_CARD_EDGE, dimensions\.width\)/);
  assert.match(canvasSource, /if \(node\.type === 'image_generation'\)[\s\S]*?width: dimensions\.width,[\s\S]*?height: dimensions\.height,/);
});

test("group bounds reserve room above image generation titles", () => {
  assert.match(canvasSource, /const IMAGE_GENERATION_GROUP_TOP_RESERVE = 56;/);
  assert.match(canvasSource, /function getNodeGroupBounds/);
  assert.match(canvasSource, /if \(node\.type === 'image_generation'\)[\s\S]*?y: bounds\.y - IMAGE_GENERATION_GROUP_TOP_RESERVE,[\s\S]*?height: bounds\.height \+ IMAGE_GENERATION_GROUP_TOP_RESERVE,/);
  assert.match(canvasSource, /getBoundsForRects\(nodes\.map\(\(node\) => getNodeGroupBounds\(node\)\)\)/);
});

test("image generation crop and annotation start at the visible card origin", () => {
  assert.doesNotMatch(canvasSource, /cardStageH/);
  assert.match(canvasSource, /const cardTopOffset = 0;/);
  assert.match(canvasSource, /const cardLeftOffset = 0;/);
});

test("other generated media nodes use visible card bounds where applicable", () => {
  assert.match(canvasSource, /if \(node\.type === 'video_generation'\)[\s\S]*?const dimensions = resolveAspectDrivenCardDimensions\(data\.ratio\);[\s\S]*?x: node\.position\.x,[\s\S]*?y: node\.position\.y,[\s\S]*?width: dimensions\.width,[\s\S]*?height: dimensions\.height,/);
  assert.match(canvasSource, /if \(node\.type === 'audio_generation'\)[\s\S]*?x: node\.position\.x,[\s\S]*?y: node\.position\.y,[\s\S]*?width: UPLOADED_AUDIO_CARD_WIDTH,[\s\S]*?height: UPLOADED_AUDIO_CARD_HEIGHT,/);
  assert.match(canvasSource, /width: Math\.max\(VIDEO_UPSCALE_PANEL_WIDTH, dimensions\.width\),/);
  assert.doesNotMatch(canvasSource, /Math\.max\(VIDEO_UPSCALE_NODE_WIDTH, VIDEO_UPSCALE_PANEL_WIDTH, dimensions\.width\)/);
});
