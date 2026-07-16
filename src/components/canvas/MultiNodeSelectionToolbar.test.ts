import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./InfiniteCanvas.tsx", import.meta.url), "utf8");
const overlay = source.match(
  /function MultiNodeSelectionOverlay[\s\S]*?\n}\n\nconst CanvasMiniMap/,
)?.[0] ?? "";

test("multi-selection toolbar exposes the approved media actions", () => {
  assert.match(overlay, />布局</);
  assert.match(overlay, /icon=\{MessageSquarePlus\}[\s\S]*?加入对话/);
  assert.match(overlay, /icon=\{Library\}[\s\S]*?保存到素材库/);
  assert.match(overlay, /agentAttachmentCount/);
  assert.match(overlay, /materialSourceCount/);
  assert.doesNotMatch(overlay, /icon=\{Plus\} compact/);
});

test("multi-selection toolbar delegates layout, conversation, and material actions", () => {
  assert.match(source, /onLayout: \(nodeIds: string\[\], mode: CanvasLayoutMode\) => void/);
  assert.match(source, /onAddToConversation: \(nodeIds: string\[\]\) => void/);
  assert.match(source, /onSaveToMaterialLibrary: \(nodeIds: string\[\]\) => void/);
});
