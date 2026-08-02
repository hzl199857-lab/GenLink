import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { ProjectSnapshot } from "../types/canvas";
import type { CanvasDocument, ProjectManifest } from "../types/canvas";

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
const projectStorage = require("./project-storage.ts") as typeof import("./project-storage") & {
  persistProjectSnapshotFiles?: (
    projectHandle: FileSystemDirectoryHandle,
    manifest: ProjectManifest,
    activeCanvas: CanvasDocument,
    mutation?:
      | { type: "rename"; canvasId: string; name: string; updatedAt: string }
      | { type: "delete"; canvasId: string; updatedAt: string },
    sharedManifestBase?: Pick<
      ProjectManifest,
      "name" | "materialFolders" | "materials" | "thumbnailFileName"
    >,
  ) => Promise<ProjectManifest>;
};

class MemoryFileHandle {
  readonly kind = "file" as const;
  readonly name: string;
  private readonly files: Map<string, string>;

  constructor(name: string, files: Map<string, string>) {
    this.name = name;
    this.files = files;
  }

  async getFile(): Promise<File> {
    return new File([this.files.get(this.name) ?? ""], this.name, { type: "application/json" });
  }

  async createWritable() {
    return {
      write: async (content: string) => {
        this.files.set(this.name, content);
      },
      close: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory" as const;
  readonly name: string;
  private readonly files = new Map<string, string>();
  private readonly directories = new Map<string, MemoryDirectoryHandle>();
  private readonly readErrors = new Map<string, Error>();
  private readonly fileReadCounts = new Map<string, number>();
  private permissionState: PermissionState = "granted";
  private permissionRequestCount = 0;

  constructor(name: string) {
    this.name = name;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permissionState;
  }

  async requestPermission(): Promise<PermissionState> {
    this.permissionRequestCount += 1;
    return this.permissionState;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    if (!options?.create) {
      const readError = this.readErrors.get(name);
      if (readError) {
        throw readError;
      }
      this.fileReadCounts.set(name, (this.fileReadCounts.get(name) ?? 0) + 1);
    }
    if (!this.files.has(name) && !options?.create) {
      throw new Error(`Missing file: ${name}`);
    }
    if (!this.files.has(name)) {
      this.files.set(name, "");
    }
    return new MemoryFileHandle(name, this.files);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) {
      return existing;
    }
    if (!options?.create) {
      throw new Error(`Missing directory: ${name}`);
    }
    const directory = new MemoryDirectoryHandle(name);
    this.directories.set(name, directory);
    return directory;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw new Error(`Missing entry: ${name}`);
    }
  }

  async *entries(): AsyncGenerator<[string, MemoryFileHandle | MemoryDirectoryHandle]> {
    for (const [name] of this.files) {
      yield [name, new MemoryFileHandle(name, this.files)];
    }
    for (const entry of this.directories) {
      yield entry;
    }
  }

  async *values(): AsyncGenerator<MemoryFileHandle | MemoryDirectoryHandle> {
    for await (const [, entry] of this.entries()) {
      yield entry;
    }
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    this.files.set(name, JSON.stringify(value, null, 2));
  }

  async writeText(name: string, value: string): Promise<void> {
    this.files.set(name, value);
  }

  readText(name: string): string | undefined {
    return this.files.get(name);
  }

  async readJson<T>(name: string): Promise<T> {
    const content = this.files.get(name);
    if (content === undefined) {
      throw new Error(`Missing file: ${name}`);
    }
    return JSON.parse(content) as T;
  }

  hasFile(name: string): boolean {
    return this.files.has(name);
  }

  failRead(name: string, error: Error): void {
    this.readErrors.set(name, error);
  }

  getFileReadCount(name: string): number {
    return this.fileReadCounts.get(name) ?? 0;
  }

  setPermissionState(state: PermissionState): void {
    this.permissionState = state;
  }

  getPermissionRequestCount(): number {
    return this.permissionRequestCount;
  }
}

function installMemoryProjectDatabase(
  record: Record<string, unknown> | Record<string, unknown>[],
  options?: {
    databaseName?: string;
    deleteError?: Error;
    getErrorCount?: number;
    indexError?: Error;
    keyReadError?: Error;
    openError?: Error;
    openBlocked?: boolean;
    ownerIndexExists?: boolean;
    showDirectoryPicker?: boolean;
    onOpen?: (databaseName: string, version?: number) => void;
  },
): () => void {
  const originalWindow = globalThis.window;
  const initialRecords = Array.isArray(record) ? record : [record];
  const recordsByDatabase = new Map<string, Map<string, Record<string, unknown>>>([
    [
      options?.databaseName ?? "genlink-project-library",
      new Map(initialRecords.map((item) => [String(item.id), item])),
    ],
  ]);
  let remainingGetErrors = options?.getErrorCount ?? 0;
  const successRequest = <T>(result: T): IDBRequest<T> => {
    const request = { result, error: null } as IDBRequest<T>;
    queueMicrotask(() => request.onsuccess?.(new Event("success")));
    return request;
  };
  const errorRequest = <T>(error: Error): IDBRequest<T> => {
    const request = { result: undefined, error } as unknown as IDBRequest<T>;
    queueMicrotask(() => request.onerror?.(new Event("error")));
    return request;
  };
  const createKeyCursorRequest = (
    entries: Array<[IDBValidKey, IDBValidKey]>,
  ): IDBRequest<IDBCursor | null> => {
    const request = {
      result: null as IDBCursor | null,
      error: null,
      onsuccess: null as ((event: Event) => unknown) | null,
      onerror: null as ((event: Event) => unknown) | null,
    };
    let index = 0;
    const advance = () => {
      const entry = entries[index];
      request.result = entry
        ? {
            primaryKey: entry[0],
            key: entry[1],
            continue: () => {
              index += 1;
              queueMicrotask(advance);
            },
          } as unknown as IDBCursor
        : null;
      request.onsuccess?.(new Event("success"));
    };
    queueMicrotask(advance);
    return request as unknown as IDBRequest<IDBCursor | null>;
  };
  const createDatabase = (
    records: Map<string, Record<string, unknown>>,
  ): IDBDatabase => {
    const store = {
      indexNames: { contains: () => options?.ownerIndexExists !== false },
      index: () => {
        if (options?.indexError) {
          throw options.indexError;
        }

        return {
          getAll: (ownerUserId: string) => successRequest(
            [...records.values()].filter((item) => item.ownerUserId === ownerUserId),
          ),
          getAllKeys: (ownerUserId: string) => successRequest(
            [...records.entries()]
              .filter(([, item]) => item.ownerUserId === ownerUserId)
              .map(([id]) => id),
          ),
          openKeyCursor: () => createKeyCursorRequest(
            [...records.entries()]
              .filter(([, item]) => typeof item.ownerUserId === "string")
              .map(([id, item]) => [id, item.ownerUserId as string]),
          ),
        };
      },
      openKeyCursor: () => createKeyCursorRequest(
        [...records.keys()].map((id) => [id, id]),
      ),
      getAllKeys: () => options?.keyReadError
        ? errorRequest<IDBValidKey[]>(options.keyReadError)
        : successRequest([...records.keys()]),
      getAll: () => successRequest([...records.values()]),
      get: (id: string) => {
        if (remainingGetErrors > 0) {
          remainingGetErrors -= 1;
          return errorRequest(new Error("Internal error."));
        }

        return successRequest(records.get(id));
      },
      getKey: (id: string) => successRequest(records.has(id) ? id : undefined),
      put: (value: Record<string, unknown>) => {
        records.set(String(value.id), value);
        return successRequest(undefined);
      },
      delete: (id: string) => {
        if (options?.deleteError) {
          return errorRequest(options.deleteError);
        }

        records.delete(id);
        return successRequest(undefined);
      },
      clear: () => {
        records.clear();
        return successRequest(undefined);
      },
    } as unknown as IDBObjectStore;

    return {
      objectStoreNames: { contains: () => true },
      transaction: () => {
        const transaction = {
          error: null,
          objectStore: () => store,
        } as unknown as IDBTransaction;
        Object.defineProperty(transaction, "oncomplete", {
          configurable: true,
          set(handler: ((event: Event) => unknown) | null) {
            if (handler) {
              queueMicrotask(() => handler(new Event("complete")));
            }
          },
        });
        return transaction;
      },
      close: () => {},
    } as unknown as IDBDatabase;
  };
  const indexedDB = {
    open: (databaseName: string, version?: number) => {
      options?.onOpen?.(databaseName, version);

      if (options?.openError) {
        const request = {
          result: undefined,
          error: options.openError,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onerror?.(new Event("error")));
        return request;
      }

      if (options?.openBlocked) {
        const request = {
          result: undefined,
          error: null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onblocked?.(
          new Event("blocked") as IDBVersionChangeEvent,
        ));
        return request;
      }

      let records = recordsByDatabase.get(databaseName);

      if (!records) {
        records = new Map();
        recordsByDatabase.set(databaseName, records);
      }

      const database = createDatabase(records);
      const request = { result: database, error: null } as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    },
  } as unknown as IDBFactory;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      indexedDB,
      ...(options?.showDirectoryPicker === false
        ? {}
        : { showDirectoryPicker: () => Promise.reject(new Error("unused")) }),
    },
  });
  return () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  };
}

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

function makeCanvas(
  id: string,
  name: string,
  updatedAt = "2026-07-19T12:00:00.000Z",
): CanvasDocument {
  return {
    version: 1,
    id,
    name,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt,
  };
}

function makeManifest(
  canvases: Array<{ id: string; name: string; updatedAt?: string }>,
): ProjectManifest {
  return {
    version: 2,
    id: "project-1",
    name: "项目",
    canvases: canvases.map((canvas) => ({
      ...canvas,
      fileName: `${canvas.id}.json`,
      createdAt: "2026-07-19T12:00:00.000Z",
      updatedAt: canvas.updatedAt ?? "2026-07-19T12:00:00.000Z",
    })),
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  };
}

test("removes canvas documents that are no longer present in the manifest", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson("canvas-b.json", makeCanvas("canvas-b", "画布 B"));

  const manifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B" },
  ]);
  await projectDirectory.writeJson("project.json", manifest);
  const storedManifest = await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifest,
    makeCanvas("canvas-b", "画布 B"),
    { type: "delete", canvasId: "canvas-a", updatedAt: "2026-07-19T13:00:00.000Z" },
  );

  assert.equal(canvasDirectory.hasFile("canvas-a.json"), false);
  assert.deepEqual(storedManifest.canvases.map((canvas) => canvas.id), ["canvas-b"]);
  assert.deepEqual(
    await projectDirectory.readJson<ProjectManifest>("project.json"),
    storedManifest,
  );
});

test("updates a non-active canvas document when its manifest name changes", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson("canvas-b.json", makeCanvas("canvas-b", "旧名称"));

  const previousManifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "旧名称" },
  ]);
  await projectDirectory.writeJson("project.json", previousManifest);
  const manifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "新名称" },
  ]);
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifest,
    makeCanvas("canvas-a", "画布 A"),
    {
      type: "rename",
      canvasId: "canvas-b",
      name: "新名称",
      updatedAt: manifest.canvases[1]!.updatedAt,
    },
  );

  const renamedCanvas = await canvasDirectory.readJson<CanvasDocument>("canvas-b.json");
  assert.equal(renamedCanvas.name, "新名称");
});

test("updates a non-active canvas document when only its metadata timestamp changes", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const previousUpdatedAt = "2026-07-19T12:00:00.000Z";
  const nextUpdatedAt = "2026-07-19T13:00:00.000Z";
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson(
    "canvas-b.json",
    makeCanvas("canvas-b", "画布 B", previousUpdatedAt),
  );
  await projectDirectory.writeJson("project.json", makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B", updatedAt: previousUpdatedAt },
  ]));

  const manifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B", updatedAt: nextUpdatedAt },
  ]);
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifest,
    makeCanvas("canvas-a", "画布 A"),
    {
      type: "rename",
      canvasId: "canvas-b",
      name: "画布 B",
      updatedAt: nextUpdatedAt,
    },
  );

  const updatedCanvas = await canvasDirectory.readJson<CanvasDocument>("canvas-b.json");
  assert.equal(updatedCanvas.name, "画布 B");
  assert.equal(updatedCanvas.updatedAt, nextUpdatedAt);
});

test("does not read unchanged non-active canvas documents during a normal save", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const previousManifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B" },
  ]);
  await projectDirectory.writeJson("project.json", previousManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson("canvas-b.json", makeCanvas("canvas-b", "画布 B"));

  const manifest = { ...previousManifest, updatedAt: "2026-07-19T13:00:00.000Z" };
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifest,
    makeCanvas("canvas-a", "画布 A"),
  );

  assert.deepEqual(await projectDirectory.readJson<ProjectManifest>("project.json"), manifest);
  assert.equal(canvasDirectory.hasFile("canvas-b.json"), true);
  assert.equal(canvasDirectory.getFileReadCount("canvas-b.json"), 0);
});

test("a stale normal save preserves shared fields from the latest disk manifest", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const staleManifest = makeManifest([{ id: "canvas-a", name: "画布 A" }]);
  const latestManifest: ProjectManifest = {
    ...staleManifest,
    name: "最新项目名称",
    materialFolders: [{
      id: "folder-latest",
      name: "最新素材文件夹",
      category: "人物",
      createdAt: "2026-07-19T13:00:00.000Z",
    }],
    materials: [{
      id: "material-latest",
      name: "最新素材",
      category: "人物",
      folderId: "folder-latest",
      imageUrl: "output/latest.png",
      createdAt: "2026-07-19T13:00:00.000Z",
    }],
    thumbnailFileName: "latest-thumbnail.png",
    updatedAt: "2026-07-19T13:00:00.000Z",
  };
  await projectDirectory.writeJson("project.json", latestManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));

  const storedManifest = await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    { ...staleManifest, updatedAt: "2026-07-19T14:00:00.000Z" },
    makeCanvas("canvas-a", "画布 A", "2026-07-19T14:00:00.000Z"),
  );

  assert.equal(storedManifest.name, latestManifest.name);
  assert.deepEqual(storedManifest.materialFolders, latestManifest.materialFolders);
  assert.deepEqual(storedManifest.materials, latestManifest.materials);
  assert.equal(storedManifest.thumbnailFileName, latestManifest.thumbnailFileName);
});

test("public saves keep a disk project rename across consecutive saves", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const parentDirectory = new MemoryDirectoryHandle("parent");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const staleManifest = makeManifest([{ id: "canvas-a", name: "画布 A" }]);
  const latestManifest = { ...staleManifest, name: "磁盘新项目名" };
  await projectDirectory.writeJson("project.json", latestManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  const project = {
    id: staleManifest.id,
    ownerUserId: "user-a",
    name: staleManifest.name,
    createdAt: staleManifest.createdAt,
    updatedAt: staleManifest.updatedAt,
    directoryName: "project",
    projectHandle: projectDirectory as unknown as FileSystemDirectoryHandle,
    parentHandle: parentDirectory as unknown as FileSystemDirectoryHandle,
  };
  const restoreWindow = installMemoryProjectDatabase(project);
  const staleSnapshot: ProjectSnapshot = {
    ...staleManifest,
    activeCanvasId: "canvas-a",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const staleSharedBase = {
    name: staleManifest.name,
    materialFolders: staleManifest.materialFolders,
    materials: staleManifest.materials,
    thumbnailFileName: staleManifest.thumbnailFileName,
  };

  try {
    const firstSave = await projectStorage.saveProjectSnapshot(
      project,
      staleSnapshot,
      "user-a",
      undefined,
      staleSharedBase,
    );
    assert.equal(firstSave.snapshot.name, latestManifest.name);
    assert.equal(firstSave.project.name, latestManifest.name);

    const secondSharedBase = {
      name: firstSave.snapshot.name,
      materialFolders: firstSave.snapshot.materialFolders,
      materials: firstSave.snapshot.materials,
      thumbnailFileName: firstSave.snapshot.thumbnailFileName,
    };
    const secondSave = await projectStorage.saveProjectSnapshot(
      firstSave.project,
      firstSave.snapshot,
      "user-a",
      undefined,
      secondSharedBase,
    );

    assert.equal(secondSave.snapshot.name, latestManifest.name);
    assert.equal(secondSave.project.name, latestManifest.name);
    assert.equal(
      (await projectDirectory.readJson<ProjectManifest>("project.json")).name,
      latestManifest.name,
    );
  } finally {
    restoreWindow();
  }
});

test("public save can explicitly remove a thumbnail from the shared manifest", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const parentDirectory = new MemoryDirectoryHandle("parent");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const diskManifest: ProjectManifest = {
    ...makeManifest([{ id: "canvas-a", name: "画布 A" }]),
    thumbnailFileName: "old-thumbnail.png",
  };
  await projectDirectory.writeJson("project.json", diskManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  const project = {
    id: diskManifest.id,
    ownerUserId: "user-a",
    name: diskManifest.name,
    createdAt: diskManifest.createdAt,
    updatedAt: diskManifest.updatedAt,
    directoryName: "project",
    projectHandle: projectDirectory as unknown as FileSystemDirectoryHandle,
    parentHandle: parentDirectory as unknown as FileSystemDirectoryHandle,
  };
  const restoreWindow = installMemoryProjectDatabase(project);
  const snapshot: ProjectSnapshot = {
    ...diskManifest,
    thumbnailFileName: undefined,
    activeCanvasId: "canvas-a",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  try {
    const saved = await projectStorage.saveProjectSnapshot(
      project,
      snapshot,
      "user-a",
      undefined,
      {
        name: diskManifest.name,
        materialFolders: diskManifest.materialFolders,
        materials: diskManifest.materials,
        thumbnailFileName: diskManifest.thumbnailFileName,
      },
    );
    const storedManifest = await projectDirectory.readJson<ProjectManifest>("project.json");

    assert.equal(saved.snapshot.thumbnailFileName, undefined);
    assert.equal(storedManifest.thumbnailFileName, undefined);
    assert.equal(Object.hasOwn(storedManifest, "thumbnailFileName"), false);
  } finally {
    restoreWindow();
  }
});

test("shared manifest fields merge independently from their last saved baseline", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const baseline: ProjectManifest = {
    ...makeManifest([{ id: "canvas-a", name: "画布 A" }]),
    name: "基线项目",
    materialFolders: [{
      id: "folder-base",
      name: "基线文件夹",
      category: "人物",
      createdAt: "2026-07-19T12:00:00.000Z",
    }],
    materials: [{
      id: "material-base",
      name: "基线素材",
      category: "人物",
      folderId: "folder-base",
      imageUrl: "output/base.png",
      createdAt: "2026-07-19T12:00:00.000Z",
    }],
    thumbnailFileName: "base-thumbnail.png",
  };
  const diskManifest: ProjectManifest = {
    ...baseline,
    name: "磁盘项目名",
    materialFolders: [{
      id: "folder-disk",
      name: "磁盘文件夹",
      category: "场景",
      createdAt: "2026-07-19T13:00:00.000Z",
    }],
    materials: [{
      id: "material-disk",
      name: "磁盘素材",
      category: "场景",
      folderId: "folder-disk",
      imageUrl: "output/disk.png",
      createdAt: "2026-07-19T13:00:00.000Z",
    }],
    thumbnailFileName: "disk-thumbnail.png",
    updatedAt: "2026-07-19T13:00:00.000Z",
  };
  const localMaterials = [{
    id: "material-local",
    name: "本地素材",
    category: "物品" as const,
    imageUrl: "output/local.png",
    createdAt: "2026-07-19T14:00:00.000Z",
  }];
  const incomingManifest: ProjectManifest = {
    ...baseline,
    materials: localMaterials,
    updatedAt: "2026-07-19T14:00:00.000Z",
  };
  await projectDirectory.writeJson("project.json", diskManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));

  const storedManifest = await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    incomingManifest,
    makeCanvas("canvas-a", "画布 A", incomingManifest.updatedAt),
    undefined,
    baseline,
  );

  assert.equal(storedManifest.name, diskManifest.name);
  assert.deepEqual(storedManifest.materialFolders, diskManifest.materialFolders);
  assert.deepEqual(storedManifest.materials, localMaterials);
  assert.equal(storedManifest.thumbnailFileName, diskManifest.thumbnailFileName);
});

test("an explicit shared field removal overrides only that disk field", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const baseline: ProjectManifest = {
    ...makeManifest([{ id: "canvas-a", name: "画布 A" }]),
    name: "基线项目",
    materials: [{
      id: "material-base",
      name: "基线素材",
      category: "人物",
      imageUrl: "output/base.png",
      createdAt: "2026-07-19T12:00:00.000Z",
    }],
    thumbnailFileName: "base-thumbnail.png",
  };
  const diskManifest: ProjectManifest = {
    ...baseline,
    name: "磁盘项目名",
    materials: [{
      id: "material-disk",
      name: "磁盘素材",
      category: "场景",
      imageUrl: "output/disk.png",
      createdAt: "2026-07-19T13:00:00.000Z",
    }],
    thumbnailFileName: "disk-thumbnail.png",
  };
  const incomingManifest: ProjectManifest = {
    ...baseline,
    materials: undefined,
    thumbnailFileName: undefined,
    updatedAt: "2026-07-19T14:00:00.000Z",
  };
  await projectDirectory.writeJson("project.json", diskManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));

  const storedManifest = await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    incomingManifest,
    makeCanvas("canvas-a", "画布 A", incomingManifest.updatedAt),
    undefined,
    baseline,
  );

  assert.equal(storedManifest.name, diskManifest.name);
  assert.equal(storedManifest.materials, undefined);
  assert.equal(storedManifest.thumbnailFileName, undefined);
  assert.equal(Object.hasOwn(storedManifest, "materials"), false);
  assert.equal(Object.hasOwn(storedManifest, "thumbnailFileName"), false);
});

test("a stale normal save preserves a disk rename while updating active canvas content", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const staleManifest = makeManifest([{ id: "canvas-a", name: "旧名称" }]);
  await projectDirectory.writeJson("project.json", staleManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "旧名称"));

  const renameUpdatedAt = "2026-07-19T13:00:00.000Z";
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    staleManifest,
    makeCanvas("canvas-a", "旧名称"),
    { type: "rename", canvasId: "canvas-a", name: "磁盘新名称", updatedAt: renameUpdatedAt },
  );

  const saveUpdatedAt = "2026-07-19T14:00:00.000Z";
  const staleSaveManifest = makeManifest([
    { id: "canvas-a", name: "旧名称", updatedAt: saveUpdatedAt },
  ]);
  staleSaveManifest.updatedAt = saveUpdatedAt;
  const staleActiveCanvas: CanvasDocument = {
    ...makeCanvas("canvas-a", "旧名称", saveUpdatedAt),
    nodes: [{
      id: "node-from-stale-window",
      type: "text",
      position: { x: 10, y: 20 },
      data: { text: "仍应保存的新内容" },
    }],
  };
  const storedManifest = await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    staleSaveManifest,
    staleActiveCanvas,
  );

  const storedMetadata = storedManifest.canvases.find((canvas) => canvas.id === "canvas-a")!;
  const storedCanvas = await canvasDirectory.readJson<CanvasDocument>("canvas-a.json");
  assert.equal(storedMetadata.name, "磁盘新名称");
  assert.equal(storedMetadata.updatedAt, saveUpdatedAt);
  assert.equal(storedCanvas.name, "磁盘新名称");
  assert.equal(storedCanvas.updatedAt, saveUpdatedAt);
  assert.deepEqual(storedCanvas.nodes, staleActiveCanvas.nodes);
});

test("a stale save preserves canvases created by another window", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const initialManifest = makeManifest([{ id: "canvas-a", name: "画布 A" }]);
  await projectDirectory.writeJson("project.json", initialManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));

  const manifestWithNewCanvas = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B" },
  ]);
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifestWithNewCanvas,
    makeCanvas("canvas-b", "画布 B"),
  );
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    initialManifest,
    makeCanvas("canvas-a", "画布 A", "2026-07-19T14:00:00.000Z"),
  );

  const storedManifest = await projectDirectory.readJson<ProjectManifest>("project.json");
  assert.deepEqual(storedManifest.canvases.map((canvas) => canvas.id), ["canvas-a", "canvas-b"]);
  assert.equal(canvasDirectory.hasFile("canvas-b.json"), true);
});

test("an explicit deletion cannot be undone by a stale save", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const initialManifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B" },
  ]);
  await projectDirectory.writeJson("project.json", initialManifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson("canvas-b.json", makeCanvas("canvas-b", "画布 B"));

  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    initialManifest,
    makeCanvas("canvas-a", "画布 A"),
    { type: "delete", canvasId: "canvas-b", updatedAt: "2026-07-19T13:00:00.000Z" },
  );
  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    initialManifest,
    makeCanvas("canvas-a", "画布 A", "2026-07-19T14:00:00.000Z"),
  );

  const storedManifest = await projectDirectory.readJson<
    ProjectManifest & { deletedCanvasIds?: string[] }
  >("project.json");
  assert.deepEqual(storedManifest.canvases.map((canvas) => canvas.id), ["canvas-a"]);
  assert.deepEqual(storedManifest.deletedCanvasIds, ["canvas-b"]);
  assert.equal(canvasDirectory.hasFile("canvas-b.json"), false);
});

test("orphan cleanup compares referenced canvas file names case-insensitively", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const manifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "画布 B" },
  ]);
  manifest.canvases[0]!.fileName = "Canvas-A.json";
  await projectDirectory.writeJson("project.json", manifest);
  await canvasDirectory.writeJson("canvas-a.json", makeCanvas("canvas-a", "画布 A"));
  await canvasDirectory.writeJson("canvas-b.json", makeCanvas("canvas-b", "画布 B"));

  await projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    manifest,
    makeCanvas("canvas-b", "画布 B", "2026-07-19T13:00:00.000Z"),
  );

  assert.equal(canvasDirectory.hasFile("canvas-a.json"), true);
});

test("manifest permission and parse failures propagate without writing", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");

  for (const failure of [
    { name: "permission", configure: (directory: MemoryDirectoryHandle) => {
      directory.failRead("project.json", new DOMException("Denied", "NotAllowedError"));
    } },
    { name: "parse", configure: (directory: MemoryDirectoryHandle) => {
      void directory.writeText("project.json", "{broken");
    } },
  ]) {
    const projectDirectory = new MemoryDirectoryHandle(`project-${failure.name}`);
    const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
    const originalCanvas = makeCanvas("canvas-a", "旧内容");
    await projectDirectory.writeJson("project.json", makeManifest([{ id: "canvas-a", name: "画布 A" }]));
    await canvasDirectory.writeJson("canvas-a.json", originalCanvas);
    failure.configure(projectDirectory);

    await assert.rejects(projectStorage.persistProjectSnapshotFiles!(
      projectDirectory as unknown as FileSystemDirectoryHandle,
      makeManifest([{ id: "canvas-a", name: "画布 A" }]),
      makeCanvas("canvas-a", "新内容"),
    ));
    assert.deepEqual(await canvasDirectory.readJson<CanvasDocument>("canvas-a.json"), originalCanvas);
  }
});

test("project listing keeps records that need a user permission gesture", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const parentDirectory = new MemoryDirectoryHandle("projects");
  projectDirectory.setPermissionState("prompt");
  const restoreWindow = installMemoryProjectDatabase({
    id: "project-1",
    ownerUserId: "user-1",
    name: "项目",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "project",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  });

  try {
    const projects = await projectStorage.listProjectLibrary("user-1");

    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.id, "project-1");
    assert.equal(projects[0]?.thumbnailUrl, undefined);
    assert.equal(projectDirectory.getPermissionRequestCount(), 0);
    assert.equal(projectDirectory.getFileReadCount("project.json"), 0);
  } finally {
    restoreWindow();
  }
});

test("project listing does not require the directory picker API", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project-no-picker");
  const parentDirectory = new MemoryDirectoryHandle("projects-no-picker");
  projectDirectory.setPermissionState("prompt");
  const restoreWindow = installMemoryProjectDatabase({
    id: "project-no-picker",
    ownerUserId: "user-no-picker",
    name: "Project without picker",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "project-no-picker",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, { showDirectoryPicker: false });

  try {
    const projects = await projectStorage.listProjectLibrary("user-no-picker");
    assert.deepEqual(projects.map((project) => project.id), ["project-no-picker"]);
  } finally {
    restoreWindow();
  }
});

test("project listing opens existing databases without forcing a schema upgrade", async () => {
  const openedVersions: Array<number | undefined> = [];
  const restoreWindow = installMemoryProjectDatabase([], {
    onOpen: (_databaseName, version) => openedVersions.push(version),
  });

  try {
    await projectStorage.listProjectLibrary("user-unversioned-open");
    assert.ok(openedVersions.length >= 2);
    assert.deepEqual(openedVersions, openedVersions.map(() => undefined));
  } finally {
    restoreWindow();
  }
});

test("project listing falls back to a key cursor when getAllKeys fails", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project-key-fallback");
  const parentDirectory = new MemoryDirectoryHandle("projects-key-fallback");
  projectDirectory.setPermissionState("prompt");
  const restoreWindow = installMemoryProjectDatabase({
    id: "project-key-fallback",
    ownerUserId: "user-key-fallback",
    name: "Project key fallback",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "project-key-fallback",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, {
    keyReadError: new DOMException("Internal error.", "UnknownError"),
  });

  try {
    const projects = await projectStorage.listProjectLibrary("user-key-fallback");
    assert.deepEqual(projects.map((project) => project.id), ["project-key-fallback"]);
  } finally {
    restoreWindow();
  }
});

test("project listing stays usable when the origin IndexedDB backend cannot open", async () => {
  const restoreWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
  });

  try {
    assert.deepEqual(
      await projectStorage.listProjectLibrary("user-broken-indexeddb"),
      [],
    );
  } finally {
    restoreWindow();
  }
});

test("project listing settles when an IndexedDB open is blocked", async () => {
  const restoreWindow = installMemoryProjectDatabase([], { openBlocked: true });

  try {
    assert.deepEqual(
      await projectStorage.listProjectLibrary("user-blocked-indexeddb"),
      [],
    );
  } finally {
    restoreWindow();
  }
});

test("bulk import remains usable in-session when IndexedDB persistence fails", async () => {
  const openedDatabases: string[] = [];
  const parentDirectory = new MemoryDirectoryHandle("downloads-session-fallback");
  const projectDirectory = await parentDirectory.getDirectoryHandle(
    "session-project",
    { create: true },
  );
  await projectDirectory.writeJson("project.json", {
    id: "session-project",
    name: "Session project",
    nodes: [],
    edges: [],
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  });
  const restoreWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
    onOpen: (databaseName) => openedDatabases.push(databaseName),
  });

  try {
    await projectStorage.listProjectLibrary("user-session-fallback");
    const openCountBeforeImport = openedDatabases.length;
    const imported = await projectStorage.importProjectsFromParentDirectory(
      parentDirectory as unknown as FileSystemDirectoryHandle,
      "user-session-fallback",
    );
    const openCountAfterImport = openedDatabases.length;
    const ownProjects = await projectStorage.listProjectLibrary("user-session-fallback");
    const otherProjects = await projectStorage.listProjectLibrary("other-session-user");

    assert.deepEqual(imported.projects.map((project) => project.id), ["session-project"]);
    assert.equal(openCountAfterImport, openCountBeforeImport);
    assert.deepEqual(ownProjects.map((project) => project.id), ["session-project"]);
    assert.deepEqual(otherProjects, []);
  } finally {
    restoreWindow();
  }
});

test("creating a project keeps its files when IndexedDB persistence fails", async () => {
  const parentDirectory = new MemoryDirectoryHandle("create-session-fallback");
  const restoreWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
  });

  try {
    const created = await projectStorage.createProjectAtParentDirectory({
      parentHandle: parentDirectory as unknown as FileSystemDirectoryHandle,
      projectName: "Created project",
      userId: "user-create-session-fallback",
    });
    const projectDirectory = await parentDirectory.getDirectoryHandle("Created project");
    const projects = await projectStorage.listProjectLibrary(
      "user-create-session-fallback",
    );

    assert.equal(projectDirectory.hasFile("project.json"), true);
    assert.deepEqual(projects.map((project) => project.id), [created.project.id]);
  } finally {
    restoreWindow();
  }
});

test("duplicating a project never overwrites an unindexed disk directory", async () => {
  const parentDirectory = new MemoryDirectoryHandle("duplicate-parent");
  const sourceDirectory = await parentDirectory.getDirectoryHandle("Project", { create: true });
  await sourceDirectory.writeJson("project.json", {
    id: "duplicate-source",
    name: "Project",
    nodes: [],
    edges: [],
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  });
  const existingCopyName = "Project - \u526f\u672c";
  const existingCopy = await parentDirectory.getDirectoryHandle(existingCopyName, {
    create: true,
  });
  await existingCopy.writeText("sentinel.txt", "keep");
  const sourceRecord = {
    id: "duplicate-source",
    ownerUserId: "user-duplicate-disk-check",
    name: "Project",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "Project",
    projectHandle: sourceDirectory,
    parentHandle: parentDirectory,
  };
  const restoreWindow = installMemoryProjectDatabase(sourceRecord);

  try {
    const duplicate = await projectStorage.duplicateProjectDirectory(
      sourceRecord as unknown as import("./project-storage").ProjectHandleRecord,
      "user-duplicate-disk-check",
    );

    assert.equal(existingCopy.readText("sentinel.txt"), "keep");
    assert.equal(duplicate.directoryName, "Project - \u526f\u672c 2");
  } finally {
    restoreWindow();
  }
});

test("a newer durable record is never overwritten by an older session record", async () => {
  const sessionParent = new MemoryDirectoryHandle("session-newer-parent");
  const sessionProject = await sessionParent.getDirectoryHandle("shared-project", {
    create: true,
  });
  await sessionProject.writeJson("project.json", {
    id: "shared-newer-project",
    name: "Older session project",
    nodes: [],
    edges: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  });
  const restoreBrokenWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
  });

  await projectStorage.importProjectsFromParentDirectory(
    sessionParent as unknown as FileSystemDirectoryHandle,
    "user-newer-durable",
  );
  restoreBrokenWindow();

  const durableProject = new MemoryDirectoryHandle("shared-project");
  durableProject.setPermissionState("prompt");
  const durableParent = new MemoryDirectoryHandle("durable-newer-parent");
  const restoreHealthyWindow = installMemoryProjectDatabase({
    id: "shared-newer-project",
    ownerUserId: "user-newer-durable",
    name: "Newer durable project",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    directoryName: "shared-project",
    projectHandle: durableProject,
    parentHandle: durableParent,
  });

  try {
    const firstRead = await projectStorage.listProjectLibrary("user-newer-durable");
    const secondRead = await projectStorage.listProjectLibrary("user-newer-durable");

    assert.equal(firstRead[0]?.name, "Newer durable project");
    assert.equal(secondRead[0]?.name, "Newer durable project");
  } finally {
    restoreHealthyWindow();
  }
});

test("a recovered ownership conflict cannot remove either rename directory", async () => {
  const sessionParent = new MemoryDirectoryHandle("rename-conflict-parent");
  const sessionProject = await sessionParent.getDirectoryHandle("Original", { create: true });
  await sessionProject.writeJson("project.json", {
    id: "rename-conflict-project",
    name: "Original",
    nodes: [],
    edges: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  });
  const restoreBrokenWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
  });
  const imported = await projectStorage.importProjectsFromParentDirectory(
    sessionParent as unknown as FileSystemDirectoryHandle,
    "user-rename-conflict",
  );
  restoreBrokenWindow();

  const otherProject = new MemoryDirectoryHandle("other-project");
  const otherParent = new MemoryDirectoryHandle("other-parent");
  const restoreHealthyWindow = installMemoryProjectDatabase({
    id: "rename-conflict-project",
    ownerUserId: "other-user",
    name: "Other project",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    directoryName: "other-project",
    projectHandle: otherProject,
    parentHandle: otherParent,
  });

  try {
    await assert.rejects(
      projectStorage.renameProjectDirectory(
        imported.projects[0]!,
        "Renamed",
        "user-rename-conflict",
      ),
      new Error(projectStorage.PROJECT_OWNERSHIP_ERROR),
    );
    assert.equal(
      await sessionParent.getDirectoryHandle("Original"),
      sessionProject,
    );
    await assert.rejects(sessionParent.getDirectoryHandle("Renamed"), /Missing directory/);
  } finally {
    restoreHealthyWindow();
  }
});

test("a durable ownership read failure cannot delete a session project directory", async () => {
  const sessionParent = new MemoryDirectoryHandle("delete-owner-check-parent");
  const sessionProject = await sessionParent.getDirectoryHandle("Delete owner check", {
    create: true,
  });
  await sessionProject.writeJson("project.json", {
    id: "delete-owner-check-project",
    name: "Delete owner check",
    nodes: [],
    edges: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  });
  const restoreBrokenWindow = installMemoryProjectDatabase([], {
    openError: new DOMException("Internal error.", "UnknownError"),
  });
  const imported = await projectStorage.importProjectsFromParentDirectory(
    sessionParent as unknown as FileSystemDirectoryHandle,
    "user-delete-owner-check",
  );
  restoreBrokenWindow();

  const otherProject = new MemoryDirectoryHandle("other-delete-owner-check");
  const otherParent = new MemoryDirectoryHandle("other-delete-owner-check-parent");
  const restoreHealthyWindow = installMemoryProjectDatabase({
    id: "delete-owner-check-project",
    ownerUserId: "other-user",
    name: "Other owner project",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    directoryName: "other-delete-owner-check",
    projectHandle: otherProject,
    parentHandle: otherParent,
  }, { getErrorCount: 1 });

  try {
    await assert.rejects(
      projectStorage.deleteProjectDirectory(
        imported.projects[0]!,
        "user-delete-owner-check",
      ),
      (error: unknown) => (
        error instanceof Error &&
        error.name === projectStorage.PROJECT_LIBRARY_INDEX_ERROR_NAME
      ),
    );
    assert.equal(
      await sessionParent.getDirectoryHandle("Delete owner check"),
      sessionProject,
    );
  } finally {
    restoreHealthyWindow();
  }
});

test("a failed durable delete stays hidden and retries after database recovery", async () => {
  const parentDirectory = new MemoryDirectoryHandle("delete-tombstone-parent");
  const projectDirectory = await parentDirectory.getDirectoryHandle("Delete me", {
    create: true,
  });
  const projectRecord = {
    id: "delete-tombstone-project",
    ownerUserId: "user-delete-tombstone",
    name: "Delete me",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    directoryName: "Delete me",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  };
  const restoreFailingWindow = installMemoryProjectDatabase(projectRecord, {
    deleteError: new DOMException("Internal error.", "UnknownError"),
  });

  await projectStorage.deleteProjectDirectory(
    projectRecord as unknown as import("./project-storage").ProjectHandleRecord,
    "user-delete-tombstone",
  );
  assert.deepEqual(
    await projectStorage.listProjectLibrary("user-delete-tombstone"),
    [],
  );
  restoreFailingWindow();

  const restoreRecoveredWindow = installMemoryProjectDatabase(projectRecord);

  try {
    assert.deepEqual(
      await projectStorage.listProjectLibrary("user-delete-tombstone"),
      [],
    );
    assert.deepEqual(
      await projectStorage.listProjectLibrary("user-delete-tombstone"),
      [],
    );
  } finally {
    restoreRecoveredWindow();
  }
});

test("project listing skips an unreadable stored handle without failing the library", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const secondProjectDirectory = new MemoryDirectoryHandle("project-2");
  const parentDirectory = new MemoryDirectoryHandle("projects");
  const restoreWindow = installMemoryProjectDatabase([
    {
      id: "project-1",
      ownerUserId: "user-1",
      name: "损坏项目",
      createdAt: "2026-07-19T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:00.000Z",
      directoryName: "project",
      projectHandle: projectDirectory,
      parentHandle: parentDirectory,
    },
    {
      id: "project-2",
      ownerUserId: "user-1",
      name: "正常项目",
      createdAt: "2026-07-20T12:00:00.000Z",
      updatedAt: "2026-07-20T12:00:00.000Z",
      directoryName: "project-2",
      projectHandle: secondProjectDirectory,
      parentHandle: parentDirectory,
    },
  ], { getErrorCount: 1 });

  try {
    const projects = await projectStorage.listProjectLibrary("user-1");

    assert.deepEqual(projects.map((project) => project.id), ["project-2"]);
  } finally {
    restoreWindow();
  }
});

test("project listing falls back when the owner index cannot be read", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const parentDirectory = new MemoryDirectoryHandle("projects");
  projectDirectory.setPermissionState("prompt");
  const restoreWindow = installMemoryProjectDatabase({
    id: "project-1",
    ownerUserId: "user-1",
    name: "项目",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "project",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, {
    indexError: new DOMException("Internal error.", "UnknownError"),
  });

  try {
    const projects = await projectStorage.listProjectLibrary("user-1");
    assert.deepEqual(projects.map((project) => project.id), ["project-1"]);
  } finally {
    restoreWindow();
  }
});

test("project listing reads records left in the temporary v2 database", async () => {
  const projectDirectory = new MemoryDirectoryHandle("project");
  const parentDirectory = new MemoryDirectoryHandle("projects");
  await projectDirectory.writeJson("project.json", {
    id: "project-v2",
    name: "临时库项目",
    nodes: [],
    edges: [],
    groups: [],
    materialFolders: [],
    materials: [],
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  });
  const restoreWindow = installMemoryProjectDatabase({
    id: "project-v2",
    ownerUserId: "user-1",
    name: "临时库项目",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    directoryName: "project",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, {
    databaseName: "genlink-project-library-v2",
  });

  try {
    const projects = await projectStorage.listProjectLibrary("user-1");
    assert.deepEqual(projects.map((project) => project.id), ["project-v2"]);

    const loaded = await projectStorage.loadProjectSnapshot(projects[0]!, "user-1");
    assert.equal(loaded.id, "project-v2");
  } finally {
    restoreWindow();
  }
});

test("bulk import repairs an unreadable legacy record after explicit directory selection", async () => {
  const parentDirectory = new MemoryDirectoryHandle("下载");
  const projectDirectory = await parentDirectory.getDirectoryHandle("旧项目", { create: true });
  await projectDirectory.writeJson("project.json", {
    id: "legacy-project-1",
    name: "旧项目",
    nodes: [],
    edges: [],
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  });
  const restoreWindow = installMemoryProjectDatabase({
    id: "legacy-project-1",
    name: "旧项目",
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
    directoryName: "旧项目",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, { getErrorCount: 1 });

  try {
    const result = await projectStorage.importProjectsFromParentDirectory(
      parentDirectory as unknown as FileSystemDirectoryHandle,
      "user-1",
    );
    const projects = await projectStorage.listProjectLibrary("user-1");

    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0]?.id, "legacy-project-1");
    assert.equal(result.skippedCount, 0);
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.ownerUserId, "user-1");
  } finally {
    restoreWindow();
  }
});

test("bulk import repairs an unreadable legacy record without an owner index", async () => {
  const parentDirectory = new MemoryDirectoryHandle("legacy-no-index-parent");
  const projectDirectory = await parentDirectory.getDirectoryHandle(
    "legacy-no-index",
    { create: true },
  );
  await projectDirectory.writeJson("project.json", {
    id: "legacy-no-index",
    name: "Legacy no index",
    nodes: [],
    edges: [],
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  });
  const restoreWindow = installMemoryProjectDatabase({
    id: "legacy-no-index",
    name: "Legacy no index",
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
    directoryName: "legacy-no-index",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, {
    getErrorCount: 1,
    ownerIndexExists: false,
  });

  try {
    await projectStorage.importProjectsFromParentDirectory(
      parentDirectory as unknown as FileSystemDirectoryHandle,
      "user-legacy-no-index",
    );
    const projects = await projectStorage.listProjectLibrary("user-legacy-no-index");

    assert.deepEqual(projects.map((project) => project.id), ["legacy-no-index"]);
  } finally {
    restoreWindow();
  }
});

test("bulk import never overwrites an unverifiable owner without an owner index", async () => {
  const selectedParent = new MemoryDirectoryHandle("no-index-owner-parent");
  const selectedProject = await selectedParent.getDirectoryHandle(
    "no-index-owner-project",
    { create: true },
  );
  await selectedProject.writeJson("project.json", {
    id: "no-index-owner-project",
    name: "Selected project",
    nodes: [],
    edges: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const otherProject = new MemoryDirectoryHandle("other-no-index-project");
  otherProject.setPermissionState("prompt");
  const otherParent = new MemoryDirectoryHandle("other-no-index-parent");
  const restoreWindow = installMemoryProjectDatabase({
    id: "no-index-owner-project",
    ownerUserId: "other-user",
    name: "Other owner project",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    directoryName: "other-no-index-project",
    projectHandle: otherProject,
    parentHandle: otherParent,
  }, {
    getErrorCount: 1,
    ownerIndexExists: false,
  });

  try {
    await projectStorage.importProjectsFromParentDirectory(
      selectedParent as unknown as FileSystemDirectoryHandle,
      "current-user",
    );
    const currentProjects = await projectStorage.listProjectLibrary("current-user");
    const otherProjects = await projectStorage.listProjectLibrary("other-user");

    assert.deepEqual(currentProjects.map((project) => project.name), ["Selected project"]);
    assert.deepEqual(otherProjects.map((project) => project.name), ["Other owner project"]);
  } finally {
    restoreWindow();
  }
});

test("bulk import discovers a project inside one nested wrapper directory", async () => {
  const parentDirectory = new MemoryDirectoryHandle("下载");
  const wrapperDirectory = await parentDirectory.getDirectoryHandle("插插乐", { create: true });
  const projectDirectory = await wrapperDirectory.getDirectoryHandle("插插乐", { create: true });
  await projectDirectory.writeJson("project.json", {
    id: "nested-project-1",
    name: "插插乐",
    nodes: [],
    edges: [],
    groups: [],
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  });
  const restoreWindow = installMemoryProjectDatabase([]);

  try {
    const result = await projectStorage.importProjectsFromParentDirectory(
      parentDirectory as unknown as FileSystemDirectoryHandle,
      "user-1",
    );

    assert.deepEqual(result.projects.map((project) => project.id), ["nested-project-1"]);
    assert.equal(
      result.projects[0]?.parentHandle,
      wrapperDirectory as unknown as FileSystemDirectoryHandle,
    );
  } finally {
    restoreWindow();
  }
});

test("bulk import does not replace an unreadable project owned by another account", async () => {
  const parentDirectory = new MemoryDirectoryHandle("下载");
  const projectDirectory = await parentDirectory.getDirectoryHandle("其他账号项目", { create: true });
  await projectDirectory.writeJson("project.json", {
    id: "owned-project-1",
    name: "其他账号项目",
    nodes: [],
    edges: [],
  });
  const restoreWindow = installMemoryProjectDatabase({
    id: "owned-project-1",
    ownerUserId: "user-2",
    name: "其他账号项目",
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
    directoryName: "其他账号项目",
    projectHandle: projectDirectory,
    parentHandle: parentDirectory,
  }, { getErrorCount: 1 });

  try {
    await assert.rejects(
      projectStorage.importProjectsFromParentDirectory(
        parentDirectory as unknown as FileSystemDirectoryHandle,
        "user-1",
      ),
      new RegExp(projectStorage.PROJECT_OWNERSHIP_ERROR),
    );
  } finally {
    restoreWindow();
  }
});

test("preflight parses changed non-active documents before writing the active canvas", async () => {
  assert.equal(typeof projectStorage.persistProjectSnapshotFiles, "function");
  const projectDirectory = new MemoryDirectoryHandle("project");
  const canvasDirectory = await projectDirectory.getDirectoryHandle("canvases", { create: true });
  const previousManifest = makeManifest([
    { id: "canvas-a", name: "画布 A" },
    { id: "canvas-b", name: "旧名称" },
  ]);
  const originalActiveCanvas = makeCanvas("canvas-a", "画布 A");
  await projectDirectory.writeJson("project.json", previousManifest);
  await canvasDirectory.writeJson("canvas-a.json", originalActiveCanvas);
  await canvasDirectory.writeText("canvas-b.json", "{broken");

  await assert.rejects(projectStorage.persistProjectSnapshotFiles!(
    projectDirectory as unknown as FileSystemDirectoryHandle,
    makeManifest([
      { id: "canvas-a", name: "画布 A", updatedAt: "2026-07-19T13:00:00.000Z" },
      { id: "canvas-b", name: "新名称", updatedAt: "2026-07-19T13:00:00.000Z" },
    ]),
    makeCanvas("canvas-a", "画布 A", "2026-07-19T13:00:00.000Z"),
    {
      type: "rename",
      canvasId: "canvas-b",
      name: "新名称",
      updatedAt: "2026-07-19T13:00:00.000Z",
    },
  ));

  assert.deepEqual(
    await canvasDirectory.readJson<CanvasDocument>("canvas-a.json"),
    originalActiveCanvas,
  );
  assert.deepEqual(await projectDirectory.readJson<ProjectManifest>("project.json"), previousManifest);
});
