import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { ProjectSnapshot } from "@/types/canvas";

const require = createRequire(import.meta.url);
const Module = require("node:module") as typeof import("node:module") & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: unknown,
  ) => string;
};
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(process.cwd(), "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
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
  PROJECT_DB_VERSION,
  PROJECT_OWNERSHIP_ERROR,
  assertProjectOwner,
  buildCreatedProjectSnapshot,
  parseLegacyProjectSnapshotText,
  pickLegacyProjectSnapshotFile,
  rebuildProjectLibraryIndex,
} = require("./project-storage.ts") as typeof import("./project-storage");

test("upgrades project storage to the owner-aware schema", () => {
  assert.equal(PROJECT_DB_VERSION, 2);
});

test("accepts records owned by the active user", () => {
  assert.doesNotThrow(() => assertProjectOwner({ ownerUserId: "user-a" }, "user-a"));
});

test("rejects cross-owner access without leaking owner details", () => {
  assert.throws(
    () => assertProjectOwner({ ownerUserId: "private-user-id" }, "user-b"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "该项目属于其他用户，无法覆盖");
      assert.equal(error.message.includes("private-user-id"), false);
      assert.equal(error.message, PROJECT_OWNERSHIP_ERROR);
      return true;
    },
  );
});

test("rejects blank active user IDs", () => {
  assert.throws(
    () => assertProjectOwner({ ownerUserId: "" }, "  "),
    new Error("该项目属于其他用户，无法覆盖"),
  );
});

test("reads legacy single-file project snapshots", () => {
  const parsed = parseLegacyProjectSnapshotText(JSON.stringify({
    id: "legacy-project",
    name: "旧项目",
    nodes: [],
    edges: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  assert.equal(parsed.id, "legacy-project");
  assert.equal(parsed.name, "旧项目");
});

test("directs current multi-canvas manifests to directory import", () => {
  assert.throws(
    () => parseLegacyProjectSnapshotText(JSON.stringify({
      version: 2,
      id: "current-project",
      name: "新项目",
      canvases: [],
    })),
    /选择包含 canvases 文件夹的完整项目目录/,
  );
});

test("rebuilding the browser index does not touch project directories", async () => {
  const originalWindow = globalThis.window;
  let deletedDatabaseName = "";
  const indexedDB = {
    deleteDatabase: (name: string) => {
      deletedDatabaseName = name;
      const request = { error: null } as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    },
  } as unknown as IDBFactory;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { indexedDB, showDirectoryPicker: () => Promise.reject(new Error("unused")) },
  });

  try {
    await rebuildProjectLibraryIndex();
    assert.equal(deletedDatabaseName, "genlink-project-library-v2");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("picks and reads a legacy project.json file", async () => {
  const originalWindow = globalThis.window;
  const file = new File([JSON.stringify({
    id: "legacy-picked",
    name: "选择的旧项目",
    nodes: [],
    edges: [],
  })], "project.json", { type: "application/json" });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      indexedDB: {},
      showDirectoryPicker: () => Promise.reject(new Error("unused")),
      showOpenFilePicker: async () => [{ getFile: async () => file }],
    },
  });

  try {
    const snapshot = await pickLegacyProjectSnapshotFile();
    assert.equal(snapshot.id, "legacy-picked");
    assert.equal(snapshot.name, "选择的旧项目");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("creates a formal project snapshot without clearing the canvas draft", () => {
  const sourceSnapshot: ProjectSnapshot = {
    id: "draft-project",
    name: "未命名项目",
    nodes: [
      {
        id: "text-1",
        type: "text",
        position: { x: 12, y: 24 },
        data: { text: "首页 Agent 已生成的节点" },
      },
    ],
    edges: [{ id: "edge-1", source: "text-1", target: "text-1" }],
    groups: [
      {
        id: "group-1",
        name: "首屏方案",
        nodeIds: ["text-1"],
        x: 0,
        y: 0,
        width: 480,
        height: 320,
      },
    ],
    materialFolders: [
      {
        id: "folder-1",
        name: "参考图",
        category: "风格",
        createdAt: "2026-07-16T09:00:00.000Z",
      },
    ],
    materials: [
      {
        id: "material-1",
        name: "参考图",
        category: "风格",
        folderId: "folder-1",
        imageUrl: "https://cdn.test/reference.png",
        hostedImageUrl: "https://cdn.test/reference.png",
        createdAt: "2026-07-16T09:00:00.000Z",
      },
    ],
    thumbnailFileName: "output/cover.png",
    createdAt: "2026-07-16T09:00:00.000Z",
    updatedAt: "2026-07-16T09:30:00.000Z",
  };

  const result = buildCreatedProjectSnapshot({
    projectName: "正式项目",
    sourceSnapshot,
    id: "project-new",
    timestamp: "2026-07-16T10:00:00.000Z",
  });

  assert.equal(result.id, "project-new");
  assert.equal(result.name, "正式项目");
  assert.equal(result.createdAt, "2026-07-16T10:00:00.000Z");
  assert.equal(result.updatedAt, "2026-07-16T10:00:00.000Z");
  assert.deepEqual(result.nodes, sourceSnapshot.nodes);
  assert.deepEqual(result.edges, sourceSnapshot.edges);
  assert.deepEqual(result.groups, sourceSnapshot.groups);
  assert.deepEqual(result.materialFolders, sourceSnapshot.materialFolders);
  assert.deepEqual(result.materials, sourceSnapshot.materials);
  assert.equal(result.thumbnailFileName, sourceSnapshot.thumbnailFileName);
});
