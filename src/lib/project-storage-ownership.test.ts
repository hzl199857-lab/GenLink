import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

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
