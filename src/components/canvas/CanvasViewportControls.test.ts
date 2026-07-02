import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("canvas zoom slider blocks pane and group drag mouse handling", () => {
  const sliderMatch = source.match(
    /<input\s+[^>]*type="range"[\s\S]*?aria-label="[^"]*"/,
  );

  assert.ok(sliderMatch, "expected the canvas zoom range input to render");
  const sliderMarkup = sliderMatch[0];

  assert.match(sliderMarkup, /data-canvas-menu-ignore="true"/);
  assert.match(sliderMarkup, /group-frame-no-drag/);
  assert.match(sliderMarkup, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("canvas viewport controls expose a grid snap toggle", () => {
  assert.match(source, /aria-label=\{gridSnapLabel\}/);
  assert.match(source, /aria-pressed=\{gridSnapEnabled\}/);
  assert.match(source, /onToggleGridSnap/);
  assert.match(source, /<Grid3x3 size=\{15\}/);
});

test("grid snap is applied after node and group drag ends", () => {
  assert.match(source, /function snapCanvasPositionToGrid/);
  assert.match(source, /const CANVAS_SNAP_GRID_SIZE = 24;/);
  assert.match(source, /snapCanvasPositionToGrid\(node\.position\)/);
  assert.match(source, /snapGroupToGrid\(groupId\)/);
});

test("grid snap is applied during node drag for stepped movement", () => {
  assert.match(source, /function applyGridSnapToNodeChanges/);
  assert.match(source, /gridSnapEnabledRef\.current/);
  assert.match(source, /snapCanvasPositionToGrid\(change\.position\)/);
  assert.match(source, /applyGridSnapToNodeChanges\(changes\)/);
});

test("alignment guides are shown while grid snap dragging", () => {
  assert.match(source, /type CanvasAlignmentGuide/);
  assert.match(source, /function getCanvasAlignmentGuides/);
  assert.match(source, /CanvasAlignmentGuidesOverlay/);
  assert.match(source, /setAlignmentGuides\(getCanvasAlignmentGuides/);
});

test("alignment guides use main card bounds instead of selection bounds", () => {
  assert.match(source, /function getAlignmentGuideNodeBounds/);

  const guideFunction = source.match(
    /function getCanvasAlignmentGuides[\s\S]*?\n}\n\nfunction clampLightboxZoomLevel/,
  )?.[0] ?? "";

  assert.match(guideFunction, /getAlignmentGuideNodeBounds\(draggingNode\)/);
  assert.match(guideFunction, /getAlignmentGuideNodeBounds\(node\)/);
  assert.doesNotMatch(guideFunction, /getEstimatedNodeBounds/);
});
