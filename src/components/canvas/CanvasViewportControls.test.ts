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
