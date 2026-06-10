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

const { AGENT_MODEL_OPTIONS } = require("./agent-model-options.ts") as typeof import("./agent-model-options");

test("includes gemini 3.5 flash in agent model options", () => {
  assert.deepEqual(
    AGENT_MODEL_OPTIONS.find((option) => option.id === "gemini-3.5-flash"),
    { id: "gemini-3.5-flash", label: "gemini-3.5-flash" },
  );
});

test("does not include automatic agent model selection", () => {
  assert.equal(AGENT_MODEL_OPTIONS.some((option) => option.id === "auto"), false);
});
