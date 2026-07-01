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
  NodeContextMenu,
  getNodeContextMenuPosition,
} = require("./NodeContextMenu.tsx") as typeof import("./NodeContextMenu");

const allEnabled = {
  canAddToConversation: true,
  canCopyContent: true,
  canSaveAs: true,
  canRename: true,
  canCopyNode: true,
  canDelete: true,
};

test("renders node context actions in the requested order", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  const addToConversation = html.indexOf("\u6dfb\u52a0\u5230\u5bf9\u8bdd");
  const copy = html.indexOf("\u590d\u5236");
  const saveAs = html.indexOf("\u53e6\u5b58\u4e3a");
  const rename = html.indexOf("\u91cd\u547d\u540d");
  const copyNode = html.indexOf("\u590d\u5236\u8282\u70b9");
  const saveAsset = html.indexOf("\u5b58\u4e3a\u8d44\u4ea7");
  const deleteItem = html.indexOf("\u5220\u9664");

  assert.notEqual(addToConversation, -1);
  assert.ok(addToConversation < copy);
  assert.ok(copy < saveAs);
  assert.ok(saveAs < rename);
  assert.ok(rename < copyNode);
  assert.ok(copyNode < saveAsset);
  assert.ok(saveAsset < deleteItem);
});

test("keeps save-as-asset visible but disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  assert.match(html, /\u5b58\u4e3a\u8d44\u4ea7/);
  assert.match(html, /data-action="save-as-asset"[^>]*disabled=""/);
});

test("does not render show-in-file-manager", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  assert.doesNotMatch(html, /\u6587\u4ef6\u7ba1\u7406\u5668/);
});

test("renders unavailable actions as disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      canAddToConversation: false,
      canCopyContent: false,
      canSaveAs: false,
      canRename: false,
      canCopyNode: true,
      canDelete: true,
    }),
  );

  const disabledMatches = html.match(/aria-disabled="true"/g) ?? [];
  assert.equal(disabledMatches.length, 5);
});

test("clamps node context menu inside the viewport", () => {
  assert.deepEqual(
    getNodeContextMenuPosition({
      x: 900,
      y: 700,
      viewportWidth: 920,
      viewportHeight: 720,
    }),
    { x: 716, y: 464 },
  );
});
