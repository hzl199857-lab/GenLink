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
