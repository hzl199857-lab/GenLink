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

const { IMAGE_MODEL_OPTIONS_BY_PROVIDER } = require("./image-generation-options.ts") as typeof import("./image-generation-options");

test("exposes gpt-image-2-all only for Comfly", () => {
  assert.ok(
    IMAGE_MODEL_OPTIONS_BY_PROVIDER.comfly.some((option) => option.id === "gpt-image-2-all"),
  );

  for (const provider of ["vibe", "fucheers", "zhenzhen", "runninghub", "grsai"] as const) {
    assert.ok(
      !IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider].some((option) => option.id === "gpt-image-2-all"),
    );
  }
});

test("exposes Midjourney only for Comfly", () => {
  assert.ok(
    IMAGE_MODEL_OPTIONS_BY_PROVIDER.comfly.some((option) => option.id === "midjourney"),
  );

  for (const provider of ["vibe", "fucheers", "zhenzhen", "runninghub", "grsai"] as const) {
    assert.equal(
      IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider].some((option) => option.id === "midjourney"),
      false,
    );
  }
});
