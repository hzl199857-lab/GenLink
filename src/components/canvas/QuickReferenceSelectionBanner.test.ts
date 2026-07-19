import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const componentPath = fileURLToPath(
  new URL("./QuickReferenceSelectionBanner.tsx", import.meta.url),
);

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  const source = readFileSync(filename, "utf8");
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
const bannerModule = existsSync(componentPath)
  ? require(componentPath) as typeof import("./QuickReferenceSelectionBanner")
  : null;
const infiniteCanvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("renders the persistent quick reference selection controls", () => {
  assert.ok(bannerModule, "expected QuickReferenceSelectionBanner to exist");

  const html = renderToStaticMarkup(
    React.createElement(bannerModule.QuickReferenceSelectionBanner, {
      onReturnToNode: () => {},
      onExit: () => {},
    }),
  );

  assert.match(html, /从画布选择参考/u);
  assert.match(html, /返回节点/u);
  assert.match(html, /退出/u);
  assert.match(html, /fixed/);
  assert.match(html, /bottom-6/);
  assert.match(html, /pointer-events-auto/);
});

test("wires the banner buttons to return and exit callbacks", () => {
  const source = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";

  assert.match(source, /onClick=\{onReturnToNode\}/);
  assert.match(source, /onClick=\{onExit\}/);
});

test("shows the banner only for node targets and returns without exiting", () => {
  assert.match(
    infiniteCanvasSource,
    /quickReferenceConnect\?\.targetKind === 'node'[\s\S]*?<QuickReferenceSelectionBanner/,
  );
  assert.match(
    infiniteCanvasSource,
    /const handleReturnToQuickReferenceTarget = useCallback\([\s\S]*?selectSingleNode\(targetNodeId\);[\s\S]*?focusSingleNodeViewport\(targetNodeId\);/,
  );
  assert.match(
    infiniteCanvasSource,
    /<QuickReferenceSelectionBanner[\s\S]*?onReturnToNode=\{handleReturnToQuickReferenceTarget\}[\s\S]*?onExit=\{stopQuickReferenceConnect\}/,
  );
});

test("does not show the legacy project message for node selection mode", () => {
  const startQuickReferenceConnect = infiniteCanvasSource.match(
    /const startQuickReferenceConnect = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/,
  )?.[0] ?? "";

  assert.match(
    startQuickReferenceConnect,
    /if \(mode\.targetKind === 'agent'\) \{\s*showProjectMessage\(/,
  );
});
