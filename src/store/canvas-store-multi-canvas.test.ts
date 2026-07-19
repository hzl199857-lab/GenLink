import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import type { ProjectSnapshot } from "../types/canvas";

const require = createRequire(import.meta.url);
const Module = require("node:module") as typeof import("node:module") & {
  _resolveFilename(request: string, parent: NodeModule | undefined, isMain: boolean, options?: unknown): string;
};
const ts = require("typescript") as typeof import("typescript");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  return originalResolveFilename.call(
    this,
    request.startsWith("@/") ? path.join(process.cwd(), "src", request.slice(2)) : request,
    parent,
    isMain,
    options,
  );
};
require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const projectStorage = require("../lib/project-storage.ts") as typeof import("../lib/project-storage");
const canvasStore = require("./canvas-store.ts") as typeof import("./canvas-store");
const originalWindow = globalThis.window;
const originalLoadProjectSnapshot = projectStorage.loadProjectSnapshot;
const originalHydrateProjectSnapshot = projectStorage.hydrateProjectSnapshotPreviewUrls;
const originalSaveProjectSnapshot = projectStorage.saveProjectSnapshot;

const project = {
  id: "project-a",
  ownerUserId: "user-a",
  name: "Project A",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  directoryName: "Project A",
  projectHandle: {} as FileSystemDirectoryHandle,
  parentHandle: {} as FileSystemDirectoryHandle,
};
const canvases = [
  { id: "canvas-a", name: "画布 1", fileName: "canvas-a.json", createdAt: project.createdAt, updatedAt: project.updatedAt },
  { id: "canvas-b", name: "画布 2", fileName: "canvas-b.json", createdAt: project.createdAt, updatedAt: project.updatedAt },
];

function makeSnapshot(canvasId: string): ProjectSnapshot {
  return {
    version: 2,
    id: project.id,
    name: project.name,
    canvases,
    activeCanvasId: canvasId,
    nodes: [{ id: `node-${canvasId}`, type: "text", position: { x: 0, y: 0 }, data: { text: canvasId } }],
    edges: [],
    groups: [],
    viewport: canvasId === "canvas-a" ? { x: 1, y: 2, zoom: 1 } : { x: 30, y: 40, zoom: 0.8 },
    materialFolders: [],
    materials: [],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function installBrowserStorage() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: new MemoryStorage(),
      setTimeout,
      clearTimeout,
    },
  });
}

afterEach(() => {
  projectStorage.loadProjectSnapshot = originalLoadProjectSnapshot;
  projectStorage.hydrateProjectSnapshotPreviewUrls = originalHydrateProjectSnapshot;
  projectStorage.saveProjectSnapshot = originalSaveProjectSnapshot;
  canvasStore.useCanvasStore.getState().setActiveUserId(null);
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("saves the active canvas before switching and restores the target canvas", async () => {
  installBrowserStorage();
  const saved: ProjectSnapshot[] = [];
  projectStorage.loadProjectSnapshot = async (_project, _userId, canvasId) => makeSnapshot(canvasId ?? "canvas-a");
  projectStorage.hydrateProjectSnapshotPreviewUrls = async (_project, snapshot) => ({ snapshot, previewUrls: [] });
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => {
    saved.push(snapshot);
    return { project, snapshot };
  };

  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  await canvasStore.useCanvasStore.getState().loadProject(project);
  canvasStore.useCanvasStore.setState({
    nodes: [{ id: "edited-a", type: "text", position: { x: 0, y: 0 }, data: { text: "edited" } }],
    dirty: true,
  });

  await canvasStore.useCanvasStore.getState().switchCanvas("canvas-b");

  assert.equal(saved[0]?.activeCanvasId, "canvas-a");
  assert.deepEqual(saved[0]?.nodes.map((node) => node.id), ["edited-a"]);
  assert.equal(canvasStore.useCanvasStore.getState().activeCanvasId, "canvas-b");
  assert.deepEqual(canvasStore.useCanvasStore.getState().nodes.map((node) => node.id), ["node-canvas-b"]);
  assert.deepEqual(canvasStore.useCanvasStore.getState().activeCanvasViewport, { x: 30, y: 40, zoom: 0.8 });
});

test("creates a blank canvas and prevents deleting the final canvas", async () => {
  installBrowserStorage();
  projectStorage.loadProjectSnapshot = async () => ({ ...makeSnapshot("canvas-a"), canvases: [canvases[0]] });
  projectStorage.hydrateProjectSnapshotPreviewUrls = async (_project, snapshot) => ({ snapshot, previewUrls: [] });
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => ({ project, snapshot });

  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  await canvasStore.useCanvasStore.getState().loadProject(project);
  await assert.rejects(
    canvasStore.useCanvasStore.getState().deleteCanvas("canvas-a"),
    /最后一个画布不能删除/,
  );

  const createdCanvasId = await canvasStore.useCanvasStore.getState().createCanvas();
  const state = canvasStore.useCanvasStore.getState();

  assert.equal(state.activeCanvasId, createdCanvasId);
  assert.equal(state.projectCanvases.length, 2);
  assert.equal(state.projectCanvases[1]?.name, "画布 2");
  assert.deepEqual(state.nodes, []);
  assert.deepEqual(state.activeCanvasViewport, { x: 0, y: 0, zoom: 1 });
});

test("duplicates, renames, and deletes canvases without removing shared materials", async () => {
  installBrowserStorage();
  const initial = {
    ...makeSnapshot("canvas-a"),
    canvases: [canvases[0]],
    materials: [{
      id: "material-1",
      name: "共享素材",
      category: "其他" as const,
      imageUrl: "https://cdn.test/material.png",
      createdAt: project.createdAt,
    }],
  };
  projectStorage.loadProjectSnapshot = async () => initial;
  projectStorage.hydrateProjectSnapshotPreviewUrls = async (_project, snapshot) => ({ snapshot, previewUrls: [] });
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => ({ project, snapshot });

  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  await canvasStore.useCanvasStore.getState().loadProject(project);
  const duplicateId = await canvasStore.useCanvasStore.getState().duplicateCanvas("canvas-a");
  const duplicatedNodeId = canvasStore.useCanvasStore.getState().nodes[0]?.id;

  assert.notEqual(duplicateId, "canvas-a");
  assert.notEqual(duplicatedNodeId, "node-canvas-a");
  assert.equal(canvasStore.useCanvasStore.getState().materials.length, 1);

  await canvasStore.useCanvasStore.getState().renameCanvas(duplicateId, "方案 B");
  assert.equal(
    canvasStore.useCanvasStore.getState().projectCanvases.find((item) => item.id === duplicateId)?.name,
    "方案 B",
  );

  await canvasStore.useCanvasStore.getState().deleteCanvas("canvas-a");
  assert.deepEqual(canvasStore.useCanvasStore.getState().projectCanvases.map((item) => item.id), [duplicateId]);
  assert.equal(canvasStore.useCanvasStore.getState().materials.length, 1);
});
