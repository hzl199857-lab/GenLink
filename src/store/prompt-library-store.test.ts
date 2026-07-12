import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

import type { PromptLibraryEntry } from "@/features/prompt-library/types";

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

  (module as NodeModule & { _compile(code: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const promptLibrary = require("./prompt-library-store.ts") as typeof import("./prompt-library-store") & {
  deactivatePromptLibraryStore?: () => void;
};
const {
  createPromptLibraryState,
  hydratePromptLibraryForUser,
  usePromptLibraryStore,
} = promptLibrary;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

class DeferredReadStorage extends MemoryStorage {
  private readonly blockedKey: string;
  private scopedReadCount = 0;
  private readonly pendingRead = deferred<string | null>();
  readonly readStarted = deferred<void>();

  constructor(blockedKey: string) {
    super();
    this.blockedKey = blockedKey;
  }

  override getItem(key: string) {
    if (key === this.blockedKey && ++this.scopedReadCount === 2) {
      this.readStarted.resolve();
      return this.pendingRead.promise as unknown as string;
    }

    return super.getItem(key);
  }

  release(value: string | null) {
    this.pendingRead.resolve(value);
  }
}

const entry: PromptLibraryEntry = {
  id: "opennana-1",
  kind: "image",
  origin: "community",
  title: "OpenNana 示例",
  prompt: "Prompt body",
  excerpt: "Prompt body",
  category: "图像提示词",
  source: "OpenNana",
  tags: ["图像提示词"],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

test("toggles favorite prompts", () => {
  const state = createPromptLibraryState();

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), true);

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), false);
});

test("updates community cache", () => {
  const state = createPromptLibraryState();
  state.setCommunityCache([entry], "2026-07-04T01:00:00.000Z");

  assert.equal(state.communityPrompts.length, 1);
  assert.equal(state.communityPrompts[0].id, "opennana-1");
  assert.equal(state.communityFetchedAt, "2026-07-04T01:00:00.000Z");
});

test("hydrates prompt library data for one user at a time", async () => {
  const storage = new MemoryStorage();
  const originalWindow = globalThis.window;
  storage.setItem("prompt-library-storage", JSON.stringify({
    state: {
      favoritePrompts: { [entry.id]: entry },
      communityPrompts: [entry],
      communityFetchedAt: "2026-07-04T01:00:00.000Z",
    },
    version: 1,
  }));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    await hydratePromptLibraryForUser("user-a");
    assert.equal(Boolean(usePromptLibraryStore.getState().favoritePrompts[entry.id]), true);

    await hydratePromptLibraryForUser("user-b");
    assert.deepEqual(usePromptLibraryStore.getState().favoritePrompts, {});
    assert.deepEqual(usePromptLibraryStore.getState().communityPrompts, []);
  } finally {
    usePromptLibraryStore.setState({
      favoritePrompts: {},
      communityPrompts: [],
      communityFetchedAt: null,
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("deactivating prompt library clears memory without overwriting the signed-out user", async () => {
  const storage = new MemoryStorage();
  const originalWindow = globalThis.window;
  const scopedKey = "genlink.user.user-a.prompt-library-storage";
  const persisted = JSON.stringify({
    state: {
      favoritePrompts: { [entry.id]: entry },
      communityPrompts: [],
      communityFetchedAt: null,
    },
    version: 1,
  });
  storage.setItem(scopedKey, persisted);
  storage.setItem("genlink.legacy-claimed.v1.prompt-library-storage", "user-a");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

  try {
    assert.equal(typeof promptLibrary.deactivatePromptLibraryStore, "function");
    await hydratePromptLibraryForUser("user-a");
    assert.equal(Boolean(usePromptLibraryStore.getState().favoritePrompts[entry.id]), true);

    promptLibrary.deactivatePromptLibraryStore!();
    assert.deepEqual(usePromptLibraryStore.getState().favoritePrompts, {});
    assert.equal(storage.getItem(scopedKey), persisted);

    await hydratePromptLibraryForUser("user-a");
    assert.equal(Boolean(usePromptLibraryStore.getState().favoritePrompts[entry.id]), true);
  } finally {
    promptLibrary.deactivatePromptLibraryStore?.();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("late prompt hydration cannot refill the global store after deactivation", async () => {
  const scopedKey = "genlink.user.user-a.prompt-library-storage";
  const storage = new DeferredReadStorage(scopedKey);
  const originalWindow = globalThis.window;
  const persisted = JSON.stringify({
    state: {
      favoritePrompts: { [entry.id]: entry },
      communityPrompts: [entry],
      communityFetchedAt: "2026-07-04T01:00:00.000Z",
    },
    version: 1,
  });
  storage.setItem(scopedKey, persisted);
  storage.setItem("genlink.legacy-claimed.v1.prompt-library-storage", "user-a");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

  try {
    assert.equal(typeof promptLibrary.deactivatePromptLibraryStore, "function");
    const hydration = hydratePromptLibraryForUser("user-a");
    await storage.readStarted.promise;
    promptLibrary.deactivatePromptLibraryStore!();
    storage.release(persisted);
    await hydration;

    assert.deepEqual(usePromptLibraryStore.getState().favoritePrompts, {});
    assert.deepEqual(usePromptLibraryStore.getState().communityPrompts, []);
    assert.equal(storage.getItem(scopedKey), persisted);
  } finally {
    promptLibrary.deactivatePromptLibraryStore?.();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("home logout uses the prompt library deactivation flow", () => {
  const sourceText = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert.match(sourceText, /deactivatePromptLibraryStore\(\)/);
});
