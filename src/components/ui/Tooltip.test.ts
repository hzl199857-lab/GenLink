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
const { Tooltip } = require("./Tooltip.tsx") as typeof import("./Tooltip");

test("renders actionable tooltip as a button when click handler is provided", () => {
  const html = renderToStaticMarkup(
    React.createElement(Tooltip, {
      label: "点击重命名",
      side: "bottom",
      onClick: () => {},
    }),
  );

  assert.match(html, /^<button\b/);
  assert.match(html, /type="button"/);
  assert.match(html, /点击重命名/);
  assert.doesNotMatch(html, /pointer-events-none/);
});

test("renders passive tooltip as non-interactive text by default", () => {
  const html = renderToStaticMarkup(
    React.createElement(Tooltip, {
      label: "提示",
    }),
  );

  assert.match(html, /^<span\b/);
  assert.match(html, /pointer-events-none/);
});
