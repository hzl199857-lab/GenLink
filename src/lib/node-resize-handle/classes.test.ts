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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  NODE_RESIZE_HANDLE_OUTER_CORNER_CLASS,
  NODE_RESIZE_HANDLE_INNER_CORNER_CLASS,
} = require("./classes.ts") as typeof import("./classes");

test("resize handle corner indicators are positioned outside the host card", () => {
  assert.match(NODE_RESIZE_HANDLE_OUTER_CORNER_CLASS, /left-\[2px\]/);
  assert.match(NODE_RESIZE_HANDLE_OUTER_CORNER_CLASS, /top-\[2px\]/);
  assert.match(NODE_RESIZE_HANDLE_INNER_CORNER_CLASS, /left-\[7px\]/);
  assert.match(NODE_RESIZE_HANDLE_INNER_CORNER_CLASS, /top-\[7px\]/);
});
