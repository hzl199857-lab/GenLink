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
const { AddNodeMenu } = require("./AddNodeMenu.tsx") as typeof import("./AddNodeMenu");

test("groups add-node actions into generation, function, and resource sections", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddNodeMenu, {
      x: 24,
      y: 36,
    }),
  );

  const generationIndex = html.indexOf("\u751f\u6210\u8282\u70b9");
  const functionIndex = html.indexOf("\u529f\u80fd\u8282\u70b9");
  const resourceIndex = html.indexOf("\u4e0a\u4f20\u8d44\u6e90");

  assert.notEqual(generationIndex, -1);
  assert.notEqual(functionIndex, -1);
  assert.notEqual(resourceIndex, -1);
  assert.ok(generationIndex < functionIndex);
  assert.ok(functionIndex < resourceIndex);
  assert.match(html, /\u4e0a\u4f20\u6587\u4ef6/u);
});

test("renders hover detail descriptions for add-node actions", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddNodeMenu, {
      x: 24,
      y: 36,
    }),
  );

  assert.match(html, /\u63d0\u793a\u8bcd\u3001\u8bf4\u660e\u3001\u6587\u6848/u);
  assert.match(html, /\u751f\u56fe\u3001\u53c2\u8003\u56fe\u3001\u6d77\u62a5/u);
  assert.match(html, /\u56fe\u7247\u3001\u89c6\u9891\u3001\u97f3\u9891\u6587\u4ef6/u);
});

test("renders the director console entry as a function node action", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddNodeMenu, {
      x: 24,
      y: 36,
    }),
  );

  const functionIndex = html.indexOf("\u529f\u80fd\u8282\u70b9");
  const directorIndex = html.indexOf("\u5bfc\u6f14\u53f0");

  assert.notEqual(directorIndex, -1);
  assert.ok(functionIndex < directorIndex);
  assert.match(html, /\u642d\u5efa\u573a\u666f\u5e76\u8fdb\u884c\u591a\u89c6\u89d2\u622a\u56fe/u);
});

test("uses expandable hover and keyboard focus animation classes", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddNodeMenu, {
      x: 24,
      y: 36,
    }),
  );

  assert.match(html, /hover:min-h-\[46px\]/);
  assert.match(html, /focus-visible:min-h-\[46px\]/);
  assert.match(html, /group-hover:opacity-100/);
  assert.match(html, /group-focus-visible:opacity-100/);
});

test("renders above the canvas header without covering full-screen edit overlays", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddNodeMenu, {
      x: 24,
      y: 36,
    }),
  );

  assert.match(html, /z-\[75\]/);
  assert.doesNotMatch(html, /z-\[65\]/);
});
