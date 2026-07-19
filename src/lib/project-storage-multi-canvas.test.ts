import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { ProjectSnapshot } from "../types/canvas";

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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  buildCanvasDocumentFromSnapshot,
  buildProjectManifestFromSnapshot,
  mergeProjectManifestAndCanvas,
} = require("./project-snapshot.ts") as typeof import("./project-snapshot");

const snapshot: ProjectSnapshot = {
  id: "project-1",
  name: "项目",
  nodes: [{ id: "node-1", type: "text", position: { x: 1, y: 2 }, data: { text: "hello" } }],
  edges: [],
  groups: [],
  materialFolders: [],
  materials: [],
  createdAt: "2026-07-19T12:00:00.000Z",
  updatedAt: "2026-07-19T12:00:00.000Z",
  version: 2 as const,
  activeCanvasId: "canvas-1",
  canvases: [{
    id: "canvas-1",
    name: "画布 1",
    fileName: "canvas-1.json",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  }],
  viewport: { x: 10, y: 20, zoom: 0.75 },
};

test("separates shared project manifest data from active canvas graph data", () => {
  const manifest = buildProjectManifestFromSnapshot(snapshot);
  const canvas = buildCanvasDocumentFromSnapshot(snapshot);

  assert.equal("nodes" in manifest, false);
  assert.equal(manifest.canvases.length, 1);
  assert.deepEqual(canvas.nodes, snapshot.nodes);
  assert.deepEqual(canvas.viewport, snapshot.viewport);
});

test("merges a manifest and canvas document into the runtime snapshot", () => {
  const manifest = buildProjectManifestFromSnapshot(snapshot);
  const canvas = buildCanvasDocumentFromSnapshot(snapshot);
  const merged = mergeProjectManifestAndCanvas(manifest, canvas);

  assert.equal(merged.activeCanvasId, canvas.id);
  assert.deepEqual(merged.nodes, canvas.nodes);
  assert.deepEqual(merged.canvases, manifest.canvases);
  assert.deepEqual(merged.viewport, canvas.viewport);
});
