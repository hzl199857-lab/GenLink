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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const { getProjectSaveIntent } =
  require("./project-save-intent.ts") as typeof import("./project-save-intent");

test("opens the save dialog for an unsaved canvas", () => {
  assert.equal(getProjectSaveIntent(null), "open-save-dialog");
});

test("saves an attached project directly", () => {
  assert.equal(getProjectSaveIntent({ id: "project-1" }), "save-project");
});
