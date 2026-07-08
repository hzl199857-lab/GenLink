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
const { DirectorDeskFullscreen } = require("./DirectorDeskFullscreen.tsx") as typeof import("./DirectorDeskFullscreen");

test("renders director desk as a fullscreen feature", () => {
  const html = renderToStaticMarkup(
    React.createElement(DirectorDeskFullscreen, {
      nodeId: "director-1",
      onClose: () => {},
    }),
  );

  assert.match(html, /data-director-node-id="director-1"/);
  assert.match(html, /aria-label="\u5173\u95ed\u5bfc\u6f14\u53f0"/u);
  assert.match(html, /3D\u5bfc\u6f14\u53f0/u);
  assert.match(html, /aria-label="\u89c6\u89d2\u5207\u6362"/u);
  assert.match(html, /\u5bfc\u6f14\u89c6\u89d2/u);
  assert.match(html, /\u673a\u4f4d\u89c6\u89d2/u);
});
