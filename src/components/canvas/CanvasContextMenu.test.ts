import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  CanvasContextMenu,
  getCanvasContextMenuPosition,
  getCanvasContextMenuShortcuts,
} = require("./CanvasContextMenu.tsx") as typeof import("./CanvasContextMenu");

test("renders blank-canvas actions in menu order", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 24,
      y: 36,
      canUndo: true,
      canRedo: true,
      canPaste: true,
      platform: "windows",
    }),
  );

  const uploadIndex = html.indexOf("\u4e0a\u4f20");
  const addNodeIndex = html.indexOf("\u6dfb\u52a0\u8282\u70b9");
  const undoIndex = html.indexOf("\u64a4\u9500");
  const redoIndex = html.indexOf("\u91cd\u505a");
  const pasteIndex = html.indexOf("\u7c98\u8d34");

  assert.notEqual(uploadIndex, -1);
  assert.notEqual(addNodeIndex, -1);
  assert.notEqual(undoIndex, -1);
  assert.notEqual(redoIndex, -1);
  assert.notEqual(pasteIndex, -1);
  assert.ok(uploadIndex < addNodeIndex);
  assert.ok(addNodeIndex < undoIndex);
  assert.ok(undoIndex < redoIndex);
  assert.ok(redoIndex < pasteIndex);
});

test("returns platform-specific canvas context menu shortcuts", () => {
  assert.deepEqual(getCanvasContextMenuShortcuts("windows"), {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    paste: "Ctrl+V",
  });

  assert.deepEqual(getCanvasContextMenuShortcuts("mac"), {
    undo: "\u2318Z",
    redo: "\u21e7\u2318Z",
    paste: "\u2318V",
  });
});

test("renders unavailable edit actions as disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 24,
      y: 36,
      canUndo: false,
      canRedo: false,
      canPaste: false,
      platform: "windows",
    }),
  );

  const disabledMatches = html.match(/aria-disabled="true"/g) ?? [];
  const opacityMatches = html.match(/opacity-40/g) ?? [];

  assert.equal(disabledMatches.length, 3);
  assert.equal(opacityMatches.length, 3);
});

test("renders ordinary buttons without ARIA menu semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 24,
      y: 36,
      canUndo: true,
      canRedo: true,
      canPaste: true,
      platform: "windows",
    }),
  );

  assert.doesNotMatch(html, /role="menu"/);
  assert.doesNotMatch(html, /role="menuitem"/);
});

test("renders clamped position with fallback viewport dimensions", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 2000,
      y: 2000,
      canUndo: true,
      canRedo: true,
      canPaste: true,
      platform: "windows",
    }),
  );

  assert.match(html, /left:820px/);
  assert.match(html, /top:564px/);
});

test("clamps canvas context menu position inside the viewport", () => {
  assert.deepEqual(
    getCanvasContextMenuPosition({
      x: 490,
      y: 390,
      viewportWidth: 500,
      viewportHeight: 400,
    }),
    { x: 296, y: 196 },
  );
});
