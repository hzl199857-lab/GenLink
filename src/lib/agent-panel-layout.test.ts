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
  AGENT_PANEL_DEFAULT_WIDTH,
  AGENT_PANEL_FLOATING_INSET,
  AGENT_PANEL_MIN_WIDTH,
  clampAgentPanelWidth,
  getAgentPanelMaxWidth,
  resolveStoredAgentPanelWidth,
} = require("./agent-panel-layout.ts") as typeof import("./agent-panel-layout");

test("uses a floating inset so the agent panel does not touch viewport edges", () => {
  assert.equal(AGENT_PANEL_FLOATING_INSET, 20);
});

test("uses a safe maximum that keeps canvas visible", () => {
  assert.equal(getAgentPanelMaxWidth(1600), 920);
  assert.equal(getAgentPanelMaxWidth(900), 720);
});

test("never lets the responsive maximum fall below the minimum width", () => {
  assert.equal(getAgentPanelMaxWidth(480), AGENT_PANEL_MIN_WIDTH);
});

test("clamps saved and dragged widths into the safe panel range", () => {
  assert.equal(clampAgentPanelWidth(200, 1600), AGENT_PANEL_MIN_WIDTH);
  assert.equal(clampAgentPanelWidth(1200, 1600), 920);
  assert.equal(clampAgentPanelWidth(700, 1600), 700);
});

test("falls back to the default width for invalid stored values", () => {
  assert.equal(clampAgentPanelWidth(Number.NaN, 1600), AGENT_PANEL_DEFAULT_WIDTH);
  assert.equal(clampAgentPanelWidth(0, 1600), AGENT_PANEL_MIN_WIDTH);
});

test("uses the default width when there is no stored panel width", () => {
  assert.equal(resolveStoredAgentPanelWidth(null, 1600), AGENT_PANEL_DEFAULT_WIDTH);
  assert.equal(resolveStoredAgentPanelWidth("bad", 1600), AGENT_PANEL_DEFAULT_WIDTH);
  assert.equal(resolveStoredAgentPanelWidth("700", 1600), 700);
});
