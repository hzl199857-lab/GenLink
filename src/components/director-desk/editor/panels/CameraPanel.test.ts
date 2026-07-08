import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const transpileTypeScriptModule = (module: NodeModule, filename: string) => {
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

require.extensions[".ts"] = transpileTypeScriptModule;
require.extensions[".tsx"] = transpileTypeScriptModule;

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { DirectorDeskCaptureToast } = require("./CameraPanel.tsx") as typeof import("./CameraPanel");

test("renders the director desk canvas sent toast", () => {
  const html = renderToStaticMarkup(
    React.createElement(DirectorDeskCaptureToast, {
      onClose: () => {},
    }),
  );

  assert.match(html, /role="status"/);
  assert.match(html, /截图已添加到画布/u);
  assert.match(html, /aria-label="关闭提示"/u);
  assert.match(html, /director-canvas-toast-close/);
});
