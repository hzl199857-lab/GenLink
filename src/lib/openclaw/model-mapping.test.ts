import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

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

const {
  AgentModelCompatibilityError,
  mapAgentPanelModelToOpenClaw,
} = require("./model-mapping.ts") as typeof import("./model-mapping");

describe("mapAgentPanelModelToOpenClaw", () => {
  it("maps Vibe panel models to the GenLink OpenClaw text provider", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "vibe", model: "gpt-5.5" }),
      "genlink_text/gpt-5.5",
    );
  });

  it("maps panel providers to the configured GenLink OpenClaw text provider", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "comfly", model: "gpt-5.5" }),
      "genlink_text/gpt-5.5",
    );
  });

  it("maps GPT 5.4 mini to the configured GenLink OpenClaw text provider", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "comfly", model: "gpt-5.4-mini" }),
      "genlink_text/gpt-5.4-mini",
    );
  });

  it("maps Gemini models for a compatible panel provider", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "comfly", model: "gemini-3.5-flash" }),
      "genlink_text/gemini-3.5-flash",
    );
  });

  it("rejects Gemini models on GPT-only panel providers", () => {
    assert.throws(
      () => mapAgentPanelModelToOpenClaw({ provider: "vibe", model: "gemini-3.5-flash" }),
      AgentModelCompatibilityError,
    );
  });

  it("falls back to the configured GenLink OpenClaw text provider when provider is omitted", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ model: "GPT-5.5" }),
      "genlink_text/gpt-5.5",
    );
  });

  it("lets OpenClaw config choose the model for auto", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "vibe", model: "auto" }),
      undefined,
    );
  });

  it("does not prefix already-qualified OpenClaw model refs", () => {
    assert.equal(
      mapAgentPanelModelToOpenClaw({ provider: "vibe", model: "genlink_text/gpt-5.5" }),
      "genlink_text/gpt-5.5",
    );
  });
});
