import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

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

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const { getSafeAuthReturnPath } =
  require("./auth-dialog-return.ts") as typeof import("./auth-dialog-return");

test("keeps internal authentication return paths", () => {
  assert.equal(getSafeAuthReturnPath("/?app=library"), "/?app=library");
});

test("rejects external and missing authentication return paths", () => {
  assert.equal(getSafeAuthReturnPath("https://example.com"), "/");
  assert.equal(getSafeAuthReturnPath("//example.com"), "/");
  assert.equal(getSafeAuthReturnPath(null), "/");
});
