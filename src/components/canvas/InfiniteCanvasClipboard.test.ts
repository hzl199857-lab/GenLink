import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("defers node paste until the ClipboardEvent exposes external content", () => {
  const clipboardSection = source.slice(source.indexOf("const clipboardShortcutRef = useRef"));
  const keyDownHandler = clipboardSection.match(
    /const handleKeyDown = \(event: KeyboardEvent\) => \{[\s\S]*?window\.addEventListener\('keydown'/,
  )?.[0] ?? "";

  assert.match(keyDownHandler, /pendingPasteWithUpstreamRef\.current = event\.shiftKey;/);
  assert.doesNotMatch(keyDownHandler, /shortcuts\.handlePasteNodes\(/);
  assert.doesNotMatch(keyDownHandler, /shortcuts\.handlePasteNodesWithUpstream\(/);
});

test("prioritizes external clipboard images before the internal node buffer", () => {
  const clipboardSection = source.slice(source.indexOf("const clipboardShortcutRef = useRef"));
  const pasteHandler = clipboardSection.match(
    /const handlePaste = \(event: ClipboardEvent\) => \{[\s\S]*?window\.addEventListener\('paste'/,
  )?.[0] ?? "";
  const imagePasteIndex = pasteHandler.indexOf("getClipboardImageFiles(event.clipboardData)");
  const upstreamPasteIndex = pasteHandler.indexOf("shortcuts.handlePasteNodesWithUpstream()");
  const nodePasteIndex = pasteHandler.indexOf("shortcuts.handlePasteNodes()");

  assert.ok(imagePasteIndex >= 0, "expected external clipboard images to be inspected");
  assert.ok(upstreamPasteIndex > imagePasteIndex, "expected image paste before upstream node paste");
  assert.ok(nodePasteIndex > imagePasteIndex, "expected image paste before node paste");
  assert.match(pasteHandler, /if \(isTypingTarget\(event\.target\)\) \{\s*return;\s*\}/);
  assert.match(pasteHandler, /if \(!isCanvasNodeClipboard\(event\.clipboardData\)\) \{\s*return;\s*\}/);
});

test("marks keyboard node copies so stale external clipboard content cannot win later", () => {
  const clipboardSection = source.slice(source.indexOf("const clipboardShortcutRef = useRef"));
  const copyHandler = clipboardSection.match(
    /const handleCopy = \(event: ClipboardEvent\) => \{[\s\S]*?window\.addEventListener\('copy'/,
  )?.[0] ?? "";

  assert.match(copyHandler, /shortcuts\.handleCopySelectedNodes\(\)/);
  assert.match(copyHandler, /markCanvasNodeClipboard\(event\.clipboardData\)/);
  assert.match(copyHandler, /event\.preventDefault\(\);/);
});
