import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

const require = createRequire(import.meta.url);
const Module = require("node:module") as typeof import("node:module") & {
  _resolveFilename(request: string, parent: NodeModule | undefined, isMain: boolean, options?: unknown): string;
};
const ts = require("typescript");
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
  const output = ts.transpileModule(require("node:fs").readFileSync(filename, "utf8"), {
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

const canvas = require("./canvas-store.ts") as typeof import("./canvas-store");
const originalWindow = globalThis.window;

afterEach(() => {
  canvas.useCanvasStore.setState({ activeUserId: null });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("clears canvas memory when the authenticated account changes", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({
    projectId: "project-a",
    projectName: "Private project",
    nodes: [{ id: "node-a", type: "text", position: { x: 0, y: 0 }, data: { title: "Private", text: "Private" } }],
    undoStack: [{ projectName: "Private project", nodes: [], edges: [], groups: [], materialFolders: [], materials: [] }],
  });

  canvas.useCanvasStore.getState().setActiveUserId("user-b");

  const state = canvas.useCanvasStore.getState();
  assert.equal(state.activeUserId, "user-b");
  assert.equal(state.projectId, null);
  assert.equal(state.projectName, "Untitled");
  assert.deepEqual(state.nodes, []);
  assert.deepEqual(state.undoStack, []);
});

test("scopes model settings to the active user and migrates legacy once", () => {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  localStorage.setItem(canvas.CANVAS_TEXT_API_PROVIDER_STORAGE_KEY, "comfly");

  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  assert.equal(canvas.readStoredSelectedApiProvider("text"), "comfly");
  canvas.persistSelectedModel({ kind: "text", provider: "grsai", model: "model-a" });

  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  assert.equal(canvas.readStoredSelectedApiProvider("text"), "vibe");
  assert.notEqual(canvas.readStoredSelectedModel("text", "fallback"), "model-a");
});
