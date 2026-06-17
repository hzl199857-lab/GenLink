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

const { getCompleteRegisterCode } = require("./register-code.ts") as typeof import("./register-code");

test("returns the complete six digit register code", () => {
  assert.equal(getCompleteRegisterCode(["1", "1", "5", "4", "0", "6"]), "115406");
});

test("does not return incomplete register codes", () => {
  assert.equal(getCompleteRegisterCode(["1", "1", "5", "4", "0", ""]), null);
});

test("does not return non-numeric register codes", () => {
  assert.equal(getCompleteRegisterCode(["1", "1", "5", "4", "0", "a"]), null);
});
