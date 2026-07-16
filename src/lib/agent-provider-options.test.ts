import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { readFileSync } from "node:fs";

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
  AGENT_TEXT_PROVIDER_OPTIONS,
  isAgentTextProvider,
} = require("./agent-provider-options.ts") as typeof import("./agent-provider-options");

test("Agent text providers contain only Gemini video-capable providers", () => {
  const ids = AGENT_TEXT_PROVIDER_OPTIONS.map((option) => option.id);

  assert.deepEqual(ids, ["comfly", "zhenzhen"]);
  assert.equal(isAgentTextProvider("comfly"), true);
  assert.equal(isAgentTextProvider("zhenzhen"), true);
  assert.equal(isAgentTextProvider("fucheers"), false);
  assert.equal(isAgentTextProvider("grsai"), false);
});

test("RunningHub stays image-generation only and is not used for Agent text calls", () => {
  assert.equal(isAgentTextProvider("runninghub"), false);
});

test("both Agent entry points default to Comfly", () => {
  const canvasPanel = readFileSync(new URL("../components/canvas/CanvasAgentPanel.tsx", import.meta.url), "utf8");
  const homePage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(canvasPanel, /useState<AgentProvider>\('comfly'\)/);
  assert.match(homePage, /useState<AgentProvider>\('comfly'\)/);
});
