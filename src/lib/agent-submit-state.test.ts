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
  hasBlockingAgentDecision,
} = require("./agent-submit-state.ts") as typeof import("./agent-submit-state");

test("does not block follow-up prompts while generation is awaiting confirmation", () => {
  assert.equal(
    hasBlockingAgentDecision([
      {
        type: "execution_plan",
        status: "waiting_generation_confirmation",
      },
    ]),
    false,
  );
});

test("blocks follow-up prompts while an execution plan is waiting to be created", () => {
  assert.equal(
    hasBlockingAgentDecision([
      {
        type: "execution_plan",
        status: "waiting_confirmation",
      },
    ]),
    true,
  );
});

test("blocks follow-up prompts while attachment selection is required", () => {
  assert.equal(
    hasBlockingAgentDecision([
      {
        type: "attachment_selection",
        status: "waiting",
      },
    ]),
    true,
  );
});
