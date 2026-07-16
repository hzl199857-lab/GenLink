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
  AGENT_MODEL_OPTIONS,
  getAgentModelOptions,
  isAgentModelId,
  isAgentModelSupportedByProvider,
  resolveAgentModelForProvider,
} = require("./agent-model-options.ts") as typeof import("./agent-model-options");

const agentModelOptionIds = AGENT_MODEL_OPTIONS.map((option) => option.id as string);

test("Agent model options preserve GPT and Gemini models", () => {
  assert.deepEqual(AGENT_MODEL_OPTIONS, [
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", family: "gemini" },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", family: "gemini" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", family: "gpt" },
    { id: "gpt-5.5", label: "GPT-5.5", family: "gpt" },
  ]);
  assert.deepEqual(agentModelOptionIds, [
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gpt-5.4-mini",
    "gpt-5.5",
  ]);
  assert.equal(isAgentModelId("gemini-3.5-flash"), true);
  assert.equal(isAgentModelId("gpt-5.5"), true);
});

test("filters Agent models by Provider compatibility", () => {
  assert.deepEqual(
    getAgentModelOptions("comfly").map((option) => option.id),
    ["gemini-3.5-flash", "gemini-3.1-pro", "gpt-5.4-mini", "gpt-5.5"],
  );
  assert.deepEqual(
    getAgentModelOptions("zhenzhen").map((option) => option.id),
    ["gemini-3.5-flash", "gemini-3.1-pro", "gpt-5.4-mini", "gpt-5.5"],
  );
  assert.deepEqual(
    getAgentModelOptions("vibe").map((option) => option.id),
    ["gpt-5.4-mini", "gpt-5.5"],
  );
  assert.deepEqual(
    getAgentModelOptions("fucheers").map((option) => option.id),
    ["gpt-5.4-mini", "gpt-5.5"],
  );
  assert.deepEqual(
    getAgentModelOptions("grsai").map((option) => option.id),
    ["gpt-5.4-mini", "gpt-5.5"],
  );
});

test("repairs an incompatible model when Provider changes", () => {
  assert.equal(isAgentModelSupportedByProvider("vibe", "gemini-3.5-flash"), false);
  assert.equal(isAgentModelSupportedByProvider("comfly", "gemini-3.5-flash"), true);
  assert.equal(resolveAgentModelForProvider("vibe", "gemini-3.5-flash"), "gpt-5.4-mini");
  assert.equal(resolveAgentModelForProvider("comfly", "gemini-3.5-flash"), "gemini-3.5-flash");
});
