import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);
const promptButtonSource = readFileSync(
  new URL("./PromptLibraryEntryButton.tsx", import.meta.url),
  "utf8",
);
const accountSource = readFileSync(
  new URL("../hero/HomeAccountMenu.tsx", import.meta.url),
  "utf8",
);

test("the canvas account menu sits to the right of the prompt library", () => {
  assert.match(
    canvasSource,
    /fixed top-5 z-50 flex items-center gap-2[\s\S]*PromptLibraryEntryButton[\s\S]*HomeAccountMenu/,
  );
  assert.match(canvasSource, /style=\{\{ right: canvasTopActionsRightOffset \}\}/);
  assert.match(canvasSource, /placement="inline"/);
  assert.doesNotMatch(promptButtonSource, /fixed top-5|rightOffset/);
  assert.match(accountSource, /placement === "fixed"[\s\S]*: "relative"/);
});
