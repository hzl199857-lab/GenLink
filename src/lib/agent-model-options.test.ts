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
const { isAgentModelId } = require("./agent-model-options.ts") as typeof import("./agent-model-options");

const agentModelOptionIds = AGENT_MODEL_OPTIONS.map((option) => option.id as string);

test("Agent model options contain only the approved Gemini models", () => {
  assert.deepEqual(AGENT_MODEL_OPTIONS, [
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  ]);
  assert.deepEqual(agentModelOptionIds, ["gemini-3.5-flash", "gemini-3.1-pro"]);
  assert.equal(isAgentModelId("gemini-3.5-flash"), true);
  assert.equal(isAgentModelId("gpt-5.5"), false);
});
