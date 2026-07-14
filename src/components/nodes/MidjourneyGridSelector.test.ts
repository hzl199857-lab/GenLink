import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./MidjourneyGridSelector.tsx", import.meta.url), "utf8");
const nodeSource = readFileSync(new URL("./ImageGenerationNode.tsx", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("../canvas/InfiniteCanvas.tsx", import.meta.url), "utf8");

test("renders four accessible quadrants in visual order", () => {
  assert.match(source, /const QUADRANTS = \[1, 2, 3, 4\] as const/);
  assert.match(source, /grid grid-cols-2 grid-rows-2/);
  assert.match(source, /选择\$\{label\}图片并生成高清图/);
  assert.match(source, /onSelect\(quadrant\)/);
});

test("prevents grid selection from opening or dragging the image card", () => {
  assert.match(source, /nodrag nopan/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /disabled=\{disabled \|\| hasPending\}/);
  assert.match(source, /pendingQuadrant === quadrant/);
});

test("keeps pending upscale feedback visible without hover", () => {
  assert.match(source, /const hasPending = pendingQuadrant !== undefined/);
  assert.match(source, /正在高清放大/);
  assert.match(source, /aria-busy=\{pending\}/);
  assert.match(source, /hasPending[\s\S]*?opacity-60/);
});

test("keeps the top-left quadrant badge idle-only without a loading spinner", () => {
  const badgeStart = source.indexOf("{!pending ? (");
  const overlayStart = source.indexOf("pointer-events-none absolute inset-0", badgeStart);
  const badgeSource = source.slice(badgeStart, overlayStart);

  assert.ok(badgeStart >= 0);
  assert.ok(overlayStart > badgeStart);
  assert.match(badgeSource, /^\{!pending \? \(/);
  assert.match(badgeSource, /\{quadrant\}/);
  assert.doesNotMatch(badgeSource, /animate-spin/);
});

test("keeps selector UI in the node and only wires the store action in the canvas adapter", () => {
  assert.match(nodeSource, /<MidjourneyGridSelector/);
  assert.doesNotMatch(canvasSource, /grid-cols-2 grid-rows-2/);
  assert.match(
    canvasSource,
    /onMidjourneyUpscale=\{\(quadrant\) => upscaleMidjourneyGridImage\(id, quadrant\)\}/,
  );
});
