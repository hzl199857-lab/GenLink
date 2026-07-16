import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./MaterialLibraryPanel.tsx", import.meta.url),
  "utf8",
);

test("material preview stays reachable while moving from row to preview card", () => {
  assert.match(source, /MATERIAL_LIBRARY_PREVIEW_HIDE_DELAY_MS/);
  assert.match(source, /scheduleHidePreview/);
  assert.match(source, /cancelHidePreview/);
  assert.match(source, /onMouseEnter=\{cancelHidePreview\}/);
  assert.match(source, /onMouseLeave=\{scheduleHidePreview\}/);
});

test("material rows and previews branch by media kind", () => {
  assert.match(source, /getMaterialKind\(item\)/);
  assert.match(source, /getMaterialMediaUrl\(item\)/);
  assert.match(source, /materialKind === 'image'[\s\S]*?<NextImage/);
  assert.match(source, /materialKind === 'video'[\s\S]*?<Video/);
  assert.match(source, /<AudioLines/);
});

test("video and audio previews play with browser-safe fallback behavior", () => {
  assert.match(source, /<video[\s\S]*?autoPlay[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsInline/);
  assert.match(source, /<audio[\s\S]*?ref=\{audioPreviewRef\}/);
  assert.match(source, /void audio\.play\(\)\.then\([\s\S]*?setAudioBlocked\(false\)[\s\S]*?setAudioBlocked\(true\)/);
  assert.match(source, /aria-label="播放音频预览"/);
  assert.match(source, /audio\.pause\(\)[\s\S]*?audio\.currentTime = 0/);
});
