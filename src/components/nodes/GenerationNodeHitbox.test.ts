import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const audioSource = readFileSync(new URL("./AudioGenerationNode.tsx", import.meta.url), "utf8");
const videoSource = readFileSync(new URL("./VideoGenerationNode.tsx", import.meta.url), "utf8");
const videoPromptBarSource = readFileSync(new URL("./VideoGenerationPromptBar.tsx", import.meta.url), "utf8");
const upscaleSource = readFileSync(new URL("./VideoUpscaleNode.tsx", import.meta.url), "utf8");

test("audio generation node uses the visible result card as its hitbox", () => {
  assert.doesNotMatch(audioSource, /cardStageHeight/);
  assert.doesNotMatch(audioSource, /className="relative mx-auto"/);
  assert.doesNotMatch(audioSource, /width: `\$\{MAX_CARD_EDGE\}px`/);
  assert.match(audioSource, /style=\{\{\s*width: `\$\{RESULT_CARD_WIDTH\}px`,\s*height: `\$\{RESULT_CARD_HEIGHT\}px`,\s*\}\}/);
  assert.match(audioSource, /node-visible-title[^"]*pointer-events-none/);
  assert.match(audioSource, /node-connectable-card[^']*pointer-events-auto/);
});

test("video generation node uses the visible video card as its hitbox", () => {
  assert.doesNotMatch(videoSource, /cardStageHeight/);
  assert.doesNotMatch(videoSource, /className="relative mx-auto"/);
  assert.doesNotMatch(videoSource, /width: `\$\{MAX_CARD_EDGE\}px`/);
  assert.match(videoSource, /width: `\$\{resolvedCardDimensions\.width\}px`,\s*height: `\$\{resolvedCardDimensions\.height\}px`/);
  assert.match(videoSource, /node-visible-title[^"]*pointer-events-none/);
  assert.match(videoSource, /node-connectable-card[^']*pointer-events-auto/);
});

test("video generation prompt expand control stays above the prompt input hit area", () => {
  assert.match(videoPromptBarSource, /className="group absolute right-4 top-4 z-10"/);
});

test("video generation prompt clips text while expanding", () => {
  assert.match(videoPromptBarSource, /className="relative overflow-hidden"/);
});

test("video upscale node keeps the root hitbox on the visible video card", () => {
  assert.doesNotMatch(upscaleSource, /style=\{\{ width: CARD_WIDTH \}\}/);
  assert.doesNotMatch(upscaleSource, /cardLeftOffset=\{\(CARD_WIDTH - resolvedCardDimensions\.width\) \/ 2\}/);
  assert.match(upscaleSource, /const nodeWidth = resolvedCardDimensions\.width;/);
  assert.match(upscaleSource, /style=\{\{\s*width: nodeWidth,\s*\}\}/);
});
