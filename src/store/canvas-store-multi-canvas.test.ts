import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import type { CanvasNode, ProjectSnapshot } from "../types/canvas";

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
const projectSnapshot = require("../lib/project-snapshot.ts") as typeof import("../lib/project-snapshot");
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

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

test("passes the last confirmed shared UI baseline into each save", async () => {
  installBrowserStorage();
  const initial = {
    ...makeSnapshot("canvas-a"),
    materialFolders: [{
      id: "folder-1",
      name: "初始文件夹",
      category: "人物" as const,
      createdAt: project.createdAt,
    }],
    materials: [{
      id: "material-1",
      name: "初始素材",
      category: "人物" as const,
      folderId: "folder-1",
      imageUrl: "output/initial.png",
      createdAt: project.createdAt,
    }],
    thumbnailFileName: "initial-thumbnail.png",
  };
  const sharedBaselines: unknown[] = [];
  let saveCount = 0;
  projectStorage.loadProjectSnapshot = async () => initial;
  projectStorage.hydrateProjectSnapshotPreviewUrls = async (_project, snapshot) => ({ snapshot, previewUrls: [] });
  projectStorage.saveProjectSnapshot = (async (
    _project: unknown,
    snapshot: ProjectSnapshot,
    _userId: string,
    _mutation?: unknown,
    sharedManifestBase?: unknown,
  ) => {
    sharedBaselines.push(sharedManifestBase);
    saveCount += 1;
    return {
      project,
      snapshot: saveCount === 1
        ? {
            ...snapshot,
            // This remote material was persisted but is not adopted into the current UI state.
            materials: [{
              ...initial.materials[0]!,
              id: "material-from-disk",
              name: "磁盘并发素材",
            }],
          }
        : snapshot,
    };
  }) as typeof projectStorage.saveProjectSnapshot;

  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  await canvasStore.useCanvasStore.getState().loadProject(project);
  const firstLocalMaterials = [{
    ...initial.materials[0]!,
    name: "第一次本地修改",
  }];
  canvasStore.useCanvasStore.setState({ materials: firstLocalMaterials, dirty: true });
  await canvasStore.useCanvasStore.getState().saveProject();
  canvasStore.useCanvasStore.getState().setProjectName(initial.name);
  assert.equal(canvasStore.useCanvasStore.getState().dirty, false);

  const secondLocalMaterials = [{
    ...firstLocalMaterials[0]!,
    name: "第二次本地修改",
  }];
  canvasStore.useCanvasStore.setState({ materials: secondLocalMaterials, dirty: true });
  await canvasStore.useCanvasStore.getState().saveProject();

  const firstBaseline = sharedBaselines[0] as {
    name: string;
    materialFolders: typeof initial.materialFolders;
    materials: typeof initial.materials;
    thumbnailFileName: string;
  };
  assert.equal(firstBaseline.name, initial.name);
  assert.deepEqual(firstBaseline.materialFolders, initial.materialFolders);
  assert.deepEqual(
    firstBaseline.materials.map(({ id, name }) => ({ id, name })),
    initial.materials.map(({ id, name }) => ({ id, name })),
  );
  assert.equal(firstBaseline.thumbnailFileName, initial.thumbnailFileName);

  const secondBaseline = sharedBaselines[1] as typeof firstBaseline;
  assert.equal(secondBaseline.name, initial.name);
  assert.deepEqual(secondBaseline.materialFolders, initial.materialFolders);
  assert.deepEqual(
    secondBaseline.materials.map(({ id, name }) => ({ id, name })),
    firstLocalMaterials.map(({ id, name }) => ({ id, name })),
  );
  assert.equal(secondBaseline.thumbnailFileName, initial.thumbnailFileName);
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
  const canvasMutations: unknown[] = [];
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
  projectStorage.saveProjectSnapshot = (async (_project, snapshot, _userId, mutation?: unknown) => {
    if (mutation) {
      canvasMutations.push(mutation);
    }
    return { project, snapshot };
  }) as typeof projectStorage.saveProjectSnapshot;

  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  await canvasStore.useCanvasStore.getState().loadProject(project);
  const duplicateId = await canvasStore.useCanvasStore.getState().duplicateCanvas("canvas-a");
  const duplicatedNodeId = canvasStore.useCanvasStore.getState().nodes[0]?.id;

  assert.notEqual(duplicateId, "canvas-a");
  assert.notEqual(duplicatedNodeId, "node-canvas-a");
  assert.equal(canvasStore.useCanvasStore.getState().materials.length, 1);

  await canvasStore.useCanvasStore.getState().renameCanvas(duplicateId, "方案 B");
  const renameMutation = canvasMutations.at(-1) as Record<string, unknown> | undefined;
  assert.equal(renameMutation?.type, "rename");
  assert.equal(renameMutation?.canvasId, duplicateId);
  assert.equal(renameMutation?.name, "方案 B");
  assert.match(String(renameMutation?.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    canvasStore.useCanvasStore.getState().projectCanvases.find((item) => item.id === duplicateId)?.name,
    "方案 B",
  );

  await canvasStore.useCanvasStore.getState().deleteCanvas("canvas-a");
  const deleteMutation = canvasMutations.at(-1) as Record<string, unknown> | undefined;
  assert.equal(deleteMutation?.type, "delete");
  assert.equal(deleteMutation?.canvasId, "canvas-a");
  assert.match(String(deleteMutation?.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(canvasStore.useCanvasStore.getState().projectCanvases.map((item) => item.id), [duplicateId]);
  assert.equal(canvasStore.useCanvasStore.getState().materials.length, 1);
});

test("stale canvas rename cannot roll old metadata into a new canvas context", async () => {
  installBrowserStorage();
  const saveStarted = deferred<ProjectSnapshot>();
  const saveResult = deferred<{ project: typeof project; snapshot: ProjectSnapshot }>();
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => {
    saveStarted.resolve(snapshot);
    return saveResult.promise;
  };
  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  canvasStore.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    projectName: project.name,
    projectCanvases: canvases,
    activeCanvasId: "canvas-a",
    nodes: makeSnapshot("canvas-a").nodes,
  });

  const operation = canvasStore.useCanvasStore.getState().renameCanvas("canvas-a", "Renamed A");
  const savedSnapshot = await saveStarted.promise;
  const targetCanvases = [{
    id: "canvas-target",
    name: "Target Canvas",
    fileName: "canvas-target.json",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }];
  canvasStore.useCanvasStore.setState({
    currentProject: { ...project, id: "project-target", name: "Target Project" },
    projectId: "project-target",
    activeCanvasId: "canvas-target",
    projectCanvases: targetCanvases,
  });
  saveResult.resolve({ project, snapshot: savedSnapshot });

  await assert.rejects(operation, canvasStore.isStaleCanvasUserScopeError);
  const state = canvasStore.useCanvasStore.getState();
  assert.equal(state.projectId, "project-target");
  assert.equal(state.activeCanvasId, "canvas-target");
  assert.deepEqual(state.projectCanvases, targetCanvases);
});

test("save completion keeps later edits dirty and records the persisted snapshot signature", async () => {
  installBrowserStorage();
  const saveStarted = deferred<ProjectSnapshot>();
  const saveResult = deferred<{ project: typeof project; snapshot: ProjectSnapshot }>();
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => {
    saveStarted.resolve(snapshot);
    return saveResult.promise;
  };
  const initialNode = {
    id: "node-initial",
    type: "text" as const,
    position: { x: 0, y: 0 },
    data: { text: "initial" },
  };
  const laterNode = {
    ...initialNode,
    id: "node-later",
    data: { text: "edited while saving" },
  };
  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  canvasStore.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    projectName: project.name,
    projectCreatedAt: project.createdAt,
    projectCanvases: canvases,
    activeCanvasId: "canvas-a",
    nodes: [initialNode],
    dirty: true,
  });

  const operation = canvasStore.useCanvasStore.getState().saveProject();
  const persistedSnapshot = await saveStarted.promise;
  canvasStore.useCanvasStore.setState({ nodes: [laterNode], dirty: true });
  saveResult.resolve({
    project,
    snapshot: { ...persistedSnapshot, updatedAt: "2026-07-20T08:00:00.000Z" },
  });

  await operation;
  const state = canvasStore.useCanvasStore.getState();
  assert.deepEqual(state.nodes, [laterNode]);
  assert.equal(state.dirty, true);
  assert.equal(
    state.lastSavedSignature,
    projectSnapshot.getProjectSnapshotSignature(persistedSnapshot),
  );
  assert.notEqual(
    state.lastSavedSignature,
    projectSnapshot.getProjectSnapshotSignature({ ...persistedSnapshot, nodes: [laterNode] }),
  );
});

test("save completion preserves a viewport changed while the save was pending", async () => {
  installBrowserStorage();
  const saveStarted = deferred<ProjectSnapshot>();
  const saveResult = deferred<{ project: typeof project; snapshot: ProjectSnapshot }>();
  projectStorage.saveProjectSnapshot = async (_project, snapshot) => {
    saveStarted.resolve(snapshot);
    return saveResult.promise;
  };
  const initialViewport = { x: 1, y: 2, zoom: 1 };
  const laterViewport = { x: 120, y: 80, zoom: 0.75 };
  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");
  canvasStore.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    projectName: project.name,
    projectCreatedAt: project.createdAt,
    projectCanvases: canvases,
    activeCanvasId: "canvas-a",
    activeCanvasViewport: initialViewport,
    nodes: makeSnapshot("canvas-a").nodes,
    dirty: true,
  });

  const operation = canvasStore.useCanvasStore.getState().saveProject();
  const persistedSnapshot = await saveStarted.promise;
  canvasStore.useCanvasStore.setState({ activeCanvasViewport: laterViewport, dirty: true });
  saveResult.resolve({ project, snapshot: persistedSnapshot });

  await operation;
  const state = canvasStore.useCanvasStore.getState();
  assert.deepEqual(state.activeCanvasViewport, laterViewport);
  assert.equal(state.dirty, true);

  canvasStore.useCanvasStore.getState().setProjectName(project.name);
  assert.equal(canvasStore.useCanvasStore.getState().dirty, true);
});

test("hydrated blob previews do not make an unchanged loaded project dirty", async () => {
  installBrowserStorage();
  const persistedNode: Extract<CanvasNode, { type: "uploaded_image" }> = {
    id: "uploaded-image",
    type: "uploaded_image",
    position: { x: 0, y: 0 },
    data: {
      imageUrl: "output:asset.png",
      outputFileName: "asset.png",
      fileName: "asset.png",
      width: 640,
      height: 480,
    },
  };
  const hydratedNode: Extract<CanvasNode, { type: "uploaded_image" }> = {
    ...persistedNode,
    data: {
      ...persistedNode.data,
      imageUrl: "blob:asset-preview",
      hostedImageUrl: "blob:asset-preview",
    },
  };
  const persistedSnapshot: ProjectSnapshot = {
    ...makeSnapshot("canvas-a"),
    nodes: [persistedNode],
  };
  const hydratedSnapshot: ProjectSnapshot = {
    ...persistedSnapshot,
    nodes: [hydratedNode],
  };
  projectStorage.loadProjectSnapshot = async () => persistedSnapshot;
  projectStorage.hydrateProjectSnapshotPreviewUrls = async () => ({
    snapshot: hydratedSnapshot,
    previewUrls: ["blob:asset-preview"],
  });
  canvasStore.useCanvasStore.getState().setActiveUserId("user-a");

  await canvasStore.useCanvasStore.getState().loadProject(project);
  assert.equal(canvasStore.useCanvasStore.getState().dirty, false);

  canvasStore.useCanvasStore.getState().setProjectName(project.name);
  assert.equal(canvasStore.useCanvasStore.getState().dirty, false);
});
