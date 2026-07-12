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

const { useDirectorStore } = require("./editor/store/directorStore.ts") as typeof import("./editor/store/directorStore");
const { createDirectorStageScopeLifecycle } = require("./directorStageScopeLifecycle.ts") as typeof import("./directorStageScopeLifecycle");

function createHarness() {
  const pendingMicrotasks: Array<() => void> = [];
  const events: string[] = [];
  const lifecycle = createDirectorStageScopeLifecycle(
    () => {
      const store = useDirectorStore.getState();
      return {
        openScopedScene(scopeId, userId) {
          events.push(`open:${scopeId ?? "null"}:${userId ?? "null"}`);
          store.openScopedScene(scopeId, userId);
        },
        saveLatestSnapshot() {
          events.push("save");
          store.saveLatestSnapshot();
        },
      };
    },
    (callback) => pendingMicrotasks.push(callback),
  );

  return {
    events,
    lifecycle,
    flushMicrotasks() {
      while (pendingMicrotasks.length > 0) {
        pendingMicrotasks.shift()?.();
      }
    },
  };
}

function resetDirectorStore() {
  storage.clear();
  useDirectorStore.getState().openScopedScene(null, null);
}

function copyAndPasteFirstObject() {
  const sourceObject = useDirectorStore.getState().project.objects[0];
  assert.ok(sourceObject);
  useDirectorStore.getState().selectObject(sourceObject.id);
  useDirectorStore.getState().copySelectedObjects();
  useDirectorStore.getState().pasteClipboardObjects();
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 1);
}

test("same-user effect cleanup saves the old scene and preserves clipboard for the next node", () => {
  resetDirectorStore();
  const harness = createHarness();
  const cleanupA = harness.lifecycle.activate("lifecycle-node-a", "user-a");
  copyAndPasteFirstObject();

  cleanupA();
  const cleanupB = harness.lifecycle.activate("lifecycle-node-b", "user-a");
  harness.flushMicrotasks();

  assert.deepEqual(harness.events.slice(1, 3), ["save", "open:lifecycle-node-b:user-a"]);
  assert.equal(useDirectorStore.getState().clipboard.length, 1);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 1);

  cleanupB();
  harness.flushMicrotasks();
});

test("effect cleanup clears clipboard before activating a different user", () => {
  resetDirectorStore();
  const harness = createHarness();
  const cleanupA = harness.lifecycle.activate("lifecycle-node", "user-a");
  copyAndPasteFirstObject();

  cleanupA();
  const cleanupB = harness.lifecycle.activate("lifecycle-node", "user-b");

  assert.deepEqual(harness.events.slice(1, 4), [
    "save",
    "open:null:null",
    "open:lifecycle-node:user-b",
  ]);
  assert.deepEqual(useDirectorStore.getState().clipboard, []);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 0);

  cleanupB();
  harness.flushMicrotasks();
});

test("real unmount saves immediately and clears clipboard when its microtask flushes", () => {
  resetDirectorStore();
  const harness = createHarness();
  const cleanup = harness.lifecycle.activate("unmount-node", "user-a");
  copyAndPasteFirstObject();

  cleanup();
  assert.equal(harness.events.at(-1), "save");
  assert.equal(useDirectorStore.getState().clipboard.length, 1);

  harness.flushMicrotasks();
  assert.equal(harness.events.at(-1), "open:null:null");
  assert.deepEqual(useDirectorStore.getState().clipboard, []);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 0);
});

test("Strict Mode cleanup and setup for the same scope does not clear clipboard", () => {
  resetDirectorStore();
  const harness = createHarness();
  const firstCleanup = harness.lifecycle.activate("strict-node", "user-a");
  copyAndPasteFirstObject();

  firstCleanup();
  const secondCleanup = harness.lifecycle.activate("strict-node", "user-a");
  harness.flushMicrotasks();

  assert.equal(harness.events.includes("open:null:null"), false);
  assert.equal(useDirectorStore.getState().clipboard.length, 1);
  assert.equal(useDirectorStore.getState().clipboardPasteCount, 1);

  secondCleanup();
  harness.flushMicrotasks();
});

test("DirectorDeskStage delegates effect setup and cleanup to the scope lifecycle", () => {
  const sourceText = readFileSync(path.join(process.cwd(), "src/components/director-desk/DirectorDeskStage.tsx"), "utf8");

  assert.match(sourceText, /directorStageScopeLifecycle\.activate\(nodeId, userId\)/);
});
