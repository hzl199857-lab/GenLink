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

const restore = require("./update-refresh-restore.ts") as typeof import("./update-refresh-restore");
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function installStorage() {
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage } });
  return sessionStorage;
}

test("isolates refresh restore state and active mode by user", () => {
  installStorage();
  restore.writeUpdateRefreshAppMode("user-a", "canvas");
  restore.writeUpdateRefreshRestoreState("user-a", { mode: "canvas", projectId: "project-a" });

  assert.equal(restore.readUpdateRefreshAppMode("user-a"), "canvas");
  assert.equal(restore.readUpdateRefreshAppMode("user-b"), null);
  assert.equal(restore.readUpdateRefreshRestoreState("user-a")?.projectId, "project-a");
  assert.equal(restore.readUpdateRefreshRestoreState("user-b"), null);
});

test("clearing one user's restore state leaves another user's state intact", () => {
  installStorage();
  restore.writeUpdateRefreshRestoreState("user-a", { mode: "library" });
  restore.writeUpdateRefreshRestoreState("user-b", { mode: "canvas", projectId: "project-b" });

  restore.clearUpdateRefreshRestoreState("user-a");

  assert.equal(restore.readUpdateRefreshRestoreState("user-a"), null);
  assert.equal(restore.readUpdateRefreshRestoreState("user-b")?.projectId, "project-b");
});
