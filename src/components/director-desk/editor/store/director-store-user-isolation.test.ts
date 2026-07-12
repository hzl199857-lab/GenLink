import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
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

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { search: "" } },
});

const { useDirectorStore } = require("./directorStore.ts") as typeof import("./directorStore");

function legacyProject(backgroundColor: string) {
  return {
    version: 1 as const,
    scene: { backgroundColor },
    assets: [],
    objects: [],
    cameras: [],
    activeCameraId: null,
    panoramaAssetId: null,
  };
}

const legacyModel = {
  id: "legacy-model",
  kind: "prop" as const,
  sourceType: "model" as const,
  fileName: "legacy.glb",
  name: "Legacy model",
  url: "data:model/gltf-binary;base64,AA==",
  assetSource: "local" as const,
};

test("only the first director user can claim legacy scenes and local models", () => {
  storage.clear();
  storage.setItem("storyai-3d-director-desk-demo:legacy-node", JSON.stringify(legacyProject("#123456")));
  storage.setItem("storyai-3d-director-local-model-library", JSON.stringify([legacyModel]));

  useDirectorStore.getState().openScopedScene("legacy-node", "user-a");
  assert.equal(useDirectorStore.getState().project.scene.backgroundColor, "#123456");
  assert.equal(useDirectorStore.getState().project.assets.some((asset) => asset.id === legacyModel.id), true);

  useDirectorStore.getState().openScopedScene("legacy-node", "user-b");
  assert.notEqual(useDirectorStore.getState().project.scene.backgroundColor, "#123456");
  assert.equal(useDirectorStore.getState().project.assets.some((asset) => asset.id === legacyModel.id), false);
  assert.equal(storage.getItem("genlink.legacy-claimed.v1.storyai-3d-director-desk-demo:legacy-node"), "user-a");
  assert.equal(storage.getItem("genlink.legacy-claimed.v1.storyai-3d-director-local-model-library"), "user-a");
});

test("director scenes and local models stay isolated when switching users", () => {
  storage.clear();
  useDirectorStore.getState().openScopedScene("shared-node", "user-a");
  useDirectorStore.getState().updateScene({ backgroundColor: "#aa0000" });
  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "User A model",
    fileName: "a.glb",
    url: "data:model/gltf-binary;base64,QQ==",
    addToScene: false,
  });

  useDirectorStore.getState().openScopedScene("shared-node", "user-b");
  assert.notEqual(useDirectorStore.getState().project.scene.backgroundColor, "#aa0000");
  assert.equal(useDirectorStore.getState().project.assets.some((asset) => asset.name === "User A model"), false);
  useDirectorStore.getState().updateScene({ backgroundColor: "#0000bb" });

  useDirectorStore.getState().openScopedScene("shared-node", "user-a");
  assert.equal(useDirectorStore.getState().project.scene.backgroundColor, "#aa0000");
  assert.equal(useDirectorStore.getState().project.assets.some((asset) => asset.name === "User A model"), true);
});

test("director clipboard survives same-user scene changes but clears on account change and logout", () => {
  storage.clear();
  useDirectorStore.getState().openScopedScene("clipboard-node-a", "user-a");
  const sourceObject = useDirectorStore.getState().project.objects[0];
  assert.ok(sourceObject);
  useDirectorStore.getState().selectObject(sourceObject.id);
  useDirectorStore.getState().copySelectedObjects();
  useDirectorStore.getState().pasteClipboardObjects();
  assert.equal(useDirectorStore.getState().clipboard.length, 1);
  assert.equal(useDirectorStore.getState().clipboard[0]?.object.id, sourceObject.id);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 1);

  useDirectorStore.getState().openScopedScene("clipboard-node-b", "user-a");
  assert.equal(useDirectorStore.getState().clipboard.length, 1);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 1);

  useDirectorStore.getState().openScopedScene("clipboard-node-b", "user-b");
  assert.deepEqual(useDirectorStore.getState().clipboard, []);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 0);

  const userBObject = useDirectorStore.getState().project.objects[0];
  assert.ok(userBObject);
  useDirectorStore.getState().selectObject(userBObject.id);
  useDirectorStore.getState().copySelectedObjects();
  assert.equal(useDirectorStore.getState().clipboard.length, 1);

  useDirectorStore.getState().openScopedScene(null, null);
  assert.deepEqual(useDirectorStore.getState().clipboard, []);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 0);
});

test("director desk passes the authenticated user into scoped persistence", () => {
  const infiniteCanvas = readFileSync(path.join(process.cwd(), "src/components/canvas/InfiniteCanvas.tsx"), "utf8");
  const fullscreen = readFileSync(path.join(process.cwd(), "src/components/director-desk/DirectorDeskFullscreen.tsx"), "utf8");
  const stage = readFileSync(path.join(process.cwd(), "src/components/director-desk/DirectorDeskStage.tsx"), "utf8");

  assert.match(infiniteCanvas, /<DirectorDeskFullscreen[\s\S]*?userId=\{userId\}/);
  assert.match(fullscreen, /<DirectorDeskStage nodeId=\{nodeId\} userId=\{userId\}/);
  assert.match(stage, /directorStageScopeLifecycle\.activate\(nodeId, userId\)/);
});
