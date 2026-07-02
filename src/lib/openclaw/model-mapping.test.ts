import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapAgentPanelModelToOpenClaw } from "./model-mapping.ts";

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
