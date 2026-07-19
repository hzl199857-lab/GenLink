import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { CanvasNode, ProjectSnapshot } from "../../types/canvas";

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
  duplicateCanvasDocument,
  getDuplicateCanvasName,
  getNextCanvasName,
  migrateLegacyProjectSnapshot,
} = require("./multi-canvas.ts") as typeof import("./multi-canvas");

const NOW = "2026-07-19T12:00:00.000Z";

test("allocates the first available numbered canvas name", () => {
  assert.equal(getNextCanvasName(["画布 1", "画布 3", "概念设计"]), "画布 2");
});

test("allocates a stable duplicate name", () => {
  assert.equal(
    getDuplicateCanvasName("画布 1", ["画布 1", "画布 1 副本", "画布 1 副本 2"]),
    "画布 1 副本 3",
  );
});

test("wraps a legacy project snapshot in canvas 1 without moving shared materials", () => {
  const legacy: ProjectSnapshot = {
    id: "project-1",
    name: "测试项目",
    nodes: [{
      id: "node-1",
      type: "text",
      position: { x: 12, y: 24 },
      data: { text: "hello" },
    }],
    edges: [],
    groups: [{ id: "group-1", nodeIds: ["node-1"], x: 0, y: 0, width: 320, height: 180 }],
    materialFolders: [{ id: "folder-1", name: "共享", category: "其他", createdAt: NOW }],
    materials: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  const migrated = migrateLegacyProjectSnapshot(legacy, {
    canvasId: "canvas-1",
    now: NOW,
  });

  assert.equal(migrated.manifest.version, 2);
  assert.equal(migrated.manifest.canvases[0]?.name, "画布 1");
  assert.deepEqual(migrated.manifest.materialFolders, legacy.materialFolders);
  assert.equal("nodes" in migrated.manifest, false);
  assert.deepEqual(migrated.canvas.nodes, legacy.nodes);
  assert.deepEqual(migrated.canvas.groups, legacy.groups);
  assert.deepEqual(migrated.canvas.viewport, { x: 0, y: 0, zoom: 1 });
});

test("duplicates graph ids and rewrites graph references", () => {
  const sourceNode: CanvasNode = {
    id: "node-a",
    type: "text",
    position: { x: 1, y: 2 },
    data: { text: "node-a" },
  };
  const source = {
    version: 1 as const,
    id: "canvas-a",
    name: "画布 1",
    nodes: [sourceNode],
    edges: [{ id: "edge-a", source: "node-a", target: "node-a" }],
    groups: [{ id: "group-a", name: "组", nodeIds: ["node-a"], x: 0, y: 0, width: 100, height: 100 }],
    viewport: { x: 10, y: 20, zoom: 0.8 },
    createdAt: NOW,
    updatedAt: NOW,
  };

  let nextId = 0;
  const copy = duplicateCanvasDocument(source, {
    id: "canvas-b",
    name: "画布 1 副本",
    now: NOW,
    createId: () => `copy-${++nextId}`,
  });

  assert.equal(copy.id, "canvas-b");
  assert.equal(copy.name, "画布 1 副本");
  assert.notEqual(copy.nodes[0]?.id, source.nodes[0]?.id);
  assert.equal(copy.edges[0]?.source, copy.nodes[0]?.id);
  assert.equal(copy.edges[0]?.target, copy.nodes[0]?.id);
  assert.deepEqual(copy.groups?.[0]?.nodeIds, [copy.nodes[0]?.id]);
  assert.equal((copy.nodes[0]?.data as { text: string }).text, copy.nodes[0]?.id);
  assert.deepEqual(copy.viewport, source.viewport);
});
