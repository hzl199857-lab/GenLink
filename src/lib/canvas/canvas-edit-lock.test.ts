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
  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  buildCanvasDeepLink,
  buildCanvasEditLockKey,
  isCanvasEditLeaseStale,
  parseCanvasLockMessage,
} = require("./canvas-edit-lock.ts") as typeof import("./canvas-edit-lock");

test("builds stable project and canvas lock keys", () => {
  assert.equal(
    buildCanvasEditLockKey("project / 1", "canvas / 2"),
    "genlink:canvas-edit:project%20%2F%201:canvas%20%2F%202",
  );
});

test("builds a deep link for the selected project canvas", () => {
  assert.equal(
    buildCanvasDeepLink("project-1", "canvas-2", "https://genlink.test/"),
    "https://genlink.test/?app=canvas&projectId=project-1&canvasId=canvas-2",
  );
});

test("marks an expired lease as stale", () => {
  assert.equal(isCanvasEditLeaseStale({ heartbeatAt: 1_000 }, 20_000, 15_000), true);
  assert.equal(isCanvasEditLeaseStale({ heartbeatAt: 10_000 }, 20_000, 15_000), false);
});

test("accepts only scoped canvas lock messages", () => {
  assert.deepEqual(parseCanvasLockMessage({
    type: "released",
    projectId: "project-1",
    canvasId: "canvas-1",
    ownerId: "window-1",
  }), {
    type: "released",
    projectId: "project-1",
    canvasId: "canvas-1",
    ownerId: "window-1",
  });
  assert.equal(parseCanvasLockMessage({ type: "released", projectId: "project-1" }), null);
});
