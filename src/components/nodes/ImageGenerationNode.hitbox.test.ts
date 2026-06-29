import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./ImageGenerationNode.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("./ImageGenerationNodeToolbar.tsx", import.meta.url), "utf8");

test("keeps transparent image generation stage out of the pointer hitbox", () => {
  assert.doesNotMatch(source, /cardStageHeight/);
  assert.match(source, /style=\{\{\s*width: `\$\{cardDimensions\.width\}px`,\s*height: `\$\{cardDimensions\.height\}px`,\s*\}\}/);
  assert.match(source, /className="relative group node-connectable-root"/);
  assert.doesNotMatch(source, /className="relative mx-auto pointer-events-none"/);
  assert.match(source, /node-visible-title[^"]*pointer-events-none/);
  assert.match(source, /<ImageIcon size=\{24\} className="pointer-events-auto" \/>/);
  assert.match(source, /className="pointer-events-auto text-\[22px\]/);
  assert.match(source, /node-connectable-card[^']*pointer-events-auto/);
});

test("keeps image generation toolbar wrapper pass-through outside actual controls", () => {
  assert.match(toolbarSource, /className="pointer-events-none absolute left-1\/2/);
  assert.match(toolbarSource, /className="pointer-events-auto flex items-center/);
  assert.match(toolbarSource, /className="group\/tooltip pointer-events-auto relative"/);
});
