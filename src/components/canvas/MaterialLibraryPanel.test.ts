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
