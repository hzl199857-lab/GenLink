import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
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

class QuotaStorage extends MemoryStorage {
  private readonly failures = new Map<string, number>();

  failNextWrite(key: string) {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
  }

  override setItem(key: string, value: string) {
    const remaining = this.failures.get(key) ?? 0;
    if (remaining > 0) {
      this.failures.set(key, remaining - 1);
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }

    super.setItem(key, value);
  }
}

const history = require("./agent-history.ts") as typeof import("./agent-history");
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function installStorage(): MemoryStorage;
function installStorage<T extends MemoryStorage>(storage: T): T;
function installStorage(storage: MemoryStorage = new MemoryStorage()) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  return storage;
}

test("isolates agent threads and drafts by authenticated user", () => {
  installStorage();

  history.saveAgentThread({
    userId: "user-a",
    projectId: "project-1",
    projectName: "Project",
    messages: [{ id: "m-a", role: "user", type: "text", content: "A", createdAt: new Date().toISOString() }],
  });
  history.saveAgentDraft("user-a", "project-1", "Project", "draft-a");

  assert.equal(history.listAgentThreads("user-a", "project-1", "Project").length, 1);
  assert.equal(history.listAgentThreads("user-b", "project-1", "Project").length, 0);
  assert.equal(history.loadAgentDraft("user-a", "project-1", "Project"), "draft-a");
  assert.equal(history.loadAgentDraft("user-b", "project-1", "Project"), "");
});

test("isolates agent threads and drafts by canvas", () => {
  installStorage();

  history.saveAgentThread({
    userId: "user-a",
    projectId: "project-1",
    projectName: "Project",
    canvasId: "canvas-a",
    messages: [{ id: "m-a", role: "user", type: "text", content: "A", createdAt: new Date().toISOString() }],
  });
  history.saveAgentDraft("user-a", "project-1", "Project", "draft-a", "canvas-a");
  history.saveAgentDraft("user-a", "project-1", "Project", "draft-b", "canvas-b");

  assert.equal(history.listAgentThreads("user-a", "project-1", "Project", "canvas-a").length, 1);
  assert.equal(history.listAgentThreads("user-a", "project-1", "Project", "canvas-b").length, 0);
  assert.equal(history.loadAgentDraft("user-a", "project-1", "Project", "canvas-a"), "draft-a");
  assert.equal(history.loadAgentDraft("user-a", "project-1", "Project", "canvas-b"), "draft-b");

  history.deleteAgentThreadsForCanvas("user-a", "project-1", "Project", "canvas-a");
  assert.equal(history.listAgentThreads("user-a", "project-1", "Project", "canvas-a").length, 0);
  assert.equal(history.loadAgentDraft("user-a", "project-1", "Project", "canvas-a"), "");
});

test("allows only one user to claim legacy agent history", () => {
  const storage = installStorage();
  storage.setItem("genlink.canvasAgentThreads.v1", JSON.stringify({
    version: 1,
    threads: [{
      id: "legacy-thread",
      projectId: "project-1",
      projectName: "Project",
      title: "Legacy",
      messages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
  }));

  assert.equal(history.listAgentThreads("user-a", "project-1", "Project").length, 1);
  assert.equal(history.listAgentThreads("user-b", "project-1", "Project").length, 0);
});

test("keeps legacy agent history readable when scoped migration exceeds storage quota", () => {
  const storage = installStorage(new QuotaStorage());
  storage.setItem("genlink.canvasAgentThreads.v1", JSON.stringify({
    version: 1,
    threads: [{
      id: "legacy-thread",
      projectId: "project-1",
      projectName: "Project",
      title: "Legacy",
      messages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
  }));
  storage.failNextWrite(
    "genlink.user.user-a.genlink.canvasAgentThreads.v1",
  );

  assert.doesNotThrow(() => {
    assert.equal(
      history.listAgentThreads("user-a", "project-1", "Project").length,
      1,
    );
  });
});

test("does not throw when an agent draft cannot be persisted because storage is full", () => {
  const storage = installStorage(new QuotaStorage());
  storage.failNextWrite(
    "genlink.user.user-a.genlink.canvasAgentDrafts.v1",
  );

  assert.doesNotThrow(() => {
    history.saveAgentDraft("user-a", "project-1", "Project", "draft-a");
  });
});

test("does not save an empty or previous-user draft before the current scope hydrates", () => {
  installStorage();
  const draftHelpers = history as typeof history & {
    createAgentDraftScopeKey?: (userId: string, projectId: string | undefined, projectName: string) => string;
    canSaveAgentDraftForScope?: (hydratedScopeKey: string | null, currentScopeKey: string) => boolean;
  };
  assert.equal(typeof draftHelpers.createAgentDraftScopeKey, "function");
  assert.equal(typeof draftHelpers.canSaveAgentDraftForScope, "function");

  history.saveAgentDraft("user-a", "project-1", "Project", "draft-a");
  history.saveAgentDraft("user-b", "project-1", "Project", "draft-b");
  const userAScope = draftHelpers.createAgentDraftScopeKey!("user-a", "project-1", "Project");
  const userBScope = draftHelpers.createAgentDraftScopeKey!("user-b", "project-1", "Project");

  assert.equal(draftHelpers.canSaveAgentDraftForScope!(null, userAScope), false);
  assert.equal(draftHelpers.canSaveAgentDraftForScope!(userAScope, userBScope), false);
  assert.equal(history.loadAgentDraft("user-a", "project-1", "Project"), "draft-a");
  assert.equal(history.loadAgentDraft("user-b", "project-1", "Project"), "draft-b");
  assert.equal(draftHelpers.canSaveAgentDraftForScope!(userBScope, userBScope), true);
});

test("CanvasAgentPanel saves drafts only after the active scope hydrates", () => {
  const sourceText = readFileSync(
    path.join(process.cwd(), "src/components/canvas/CanvasAgentPanel.tsx"),
    "utf8",
  );

  assert.match(sourceText, /hydratedDraftScopeRef/);
  assert.match(sourceText, /canSaveAgentDraftForScope\([\s\S]*?saveAgentDraft/);
  assert.match(sourceText, /createAgentDraftScopeKey\(userId, projectId, projectName, canvasId\)/);
  assert.doesNotMatch(sourceText, /canvasId:\s*['"]default['"]/);
});
