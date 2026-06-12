import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
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

const { areCanvasNodesSynced, shouldShowProjectLibraryEntryLoader } =
  require("./project-open-transition.ts") as typeof import("./project-open-transition");

test("shows project library entry loader until project count is known", () => {
  assert.equal(shouldShowProjectLibraryEntryLoader(null), true);
});

test("does not show project library entry loader for first use with no projects", () => {
  assert.equal(shouldShowProjectLibraryEntryLoader(0), false);
});

test("shows project library entry loader when stored projects exist", () => {
  assert.equal(shouldShowProjectLibraryEntryLoader(2), true);
});

test("treats an empty canvas as already synced", () => {
  assert.equal(areCanvasNodesSynced([], []), true);
});

test("waits until every canvas node is rendered by ReactFlow", () => {
  assert.equal(areCanvasNodesSynced(["a", "b"], ["a"]), false);
  assert.equal(areCanvasNodesSynced(["a", "b"], ["b", "a", "c"]), true);
});

test("keeps entry loader visible until the minimum display time has elapsed", () => {
  const { shouldKeepEntryLoaderVisible } =
    require("./project-open-transition.ts") as typeof import("./project-open-transition");

  assert.equal(shouldKeepEntryLoaderVisible({ visibleForMs: 120, minVisibleMs: 650 }), true);
  assert.equal(shouldKeepEntryLoaderVisible({ visibleForMs: 800, minVisibleMs: 650 }), false);
});
