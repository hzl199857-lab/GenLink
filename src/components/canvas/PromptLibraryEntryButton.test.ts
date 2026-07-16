import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./PromptLibraryEntryButton.tsx", import.meta.url),
  "utf8",
);

test("renders the prompt library as a high-contrast icon button", () => {
  assert.match(source, /aria-label="提示词库"/);
  assert.match(source, /<BookOpen size=\{16\}/);
  assert.match(source, /bg-\[#1b1c20\]/);
  assert.match(source, /focus-visible:ring-2/);
  assert.doesNotMatch(source, /\bborder(?:-[^\s"]+)?\b/);
});
