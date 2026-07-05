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

const { buildAgentCanvasRulePack } =
  require("./agent-canvas-rule-pack.ts") as typeof import("./agent-canvas-rule-pack");

test("loads AGENTS.md as the controller entrypoint in the Agent canvas rule pack", () => {
  const rulePack = buildAgentCanvasRulePack();

  assert.equal(rulePack.loadedFiles[0]?.relativePath, "rules/planf-canvas/AGENTS.md");
  assert.match(rulePack.prompt, /GenLink Canvas — 智能体总控/);
  assert.match(rulePack.prompt, /BOOTSTRAP\.md/);
  assert.match(rulePack.prompt, /workflow-json/);
});
