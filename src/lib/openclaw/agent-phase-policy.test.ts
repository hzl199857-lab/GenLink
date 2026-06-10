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
  decideAgentPhaseRoute,
} = require("./agent-phase-policy.ts") as typeof import("./agent-phase-policy");

const presetPrompts = [
  {
    id: "full-set-8" as const,
    prompt: "\u5e2e\u6211\u505a\u4e00\u5957\u7535\u5546\u4e3b\u56fe\uff088\u56fe\u6807\u51c6\uff09\uff0c\u4ea7\u54c1\u662f\uff1a",
    routeMode: "default" as const,
  },
  {
    id: "ugc-lifestyle" as const,
    prompt: "\u5e2e\u6211\u505a\u4e00\u7ec4 UGC \u751f\u6d3b\u5316\u4e0a\u8eab\u56fe\uff0c\u4ea7\u54c1\u662f\uff1a",
    routeMode: "ugc" as const,
  },
];

test("routes ordinary attached image edits to the fast generic OpenClaw path", () => {
  const decision = decideAgentPhaseRoute({
    message: "\u628a\u56fe\u4e2d\u4eba\u7269\u5e3d\u5b50\u53bb\u6389",
    attachmentCount: 1,
    routeMode: "auto",
    presetPrompts,
  });

  assert.equal(decision.phase, "FAST");
  assert.equal(decision.route, "generic-openclaw");
  assert.equal(decision.nextAction, "create-workflow");
  assert.equal(decision.preset, undefined);
});

test("routes explicit ecommerce preset submissions to ECOM_IMAGE form collection", () => {
  const decision = decideAgentPhaseRoute({
    message: `${presetPrompts[0].prompt}\u4fdd\u6e29\u676f`,
    attachmentCount: 0,
    routeMode: "default",
    selectedPresetId: "full-set-8",
    presetPrompts,
  });

  assert.equal(decision.phase, "ECOM_IMAGE");
  assert.equal(decision.route, "ecom-start");
  assert.equal(decision.nextAction, "await-form-submit");
  assert.equal(decision.preset, "full-set-8");
});

test("routes typed ecommerce requests without pressing the preset button to ECOM_IMAGE", () => {
  const decision = decideAgentPhaseRoute({
    message: "\u5e2e\u6211\u505a\u4e00\u5957\u6dd8\u5b9d\u5546\u54c1\u4e3b\u56fe\uff0c\u4ea7\u54c1\u662f\u8033\u673a",
    attachmentCount: 0,
    routeMode: "auto",
    presetPrompts,
  });

  assert.equal(decision.phase, "ECOM_IMAGE");
  assert.equal(decision.route, "ecom-start");
  assert.equal(decision.preset, "full-set-8");
});

test("infers UGC ecommerce mode from typed request keywords", () => {
  const decision = decideAgentPhaseRoute({
    message: "\u7ed9\u8fd9\u4e2a\u5305\u505a\u5c0f\u7ea2\u4e66 UGC \u751f\u6d3b\u5316\u4e0a\u8eab\u56fe",
    attachmentCount: 1,
    routeMode: "auto",
    presetPrompts,
  });

  assert.equal(decision.phase, "ECOM_IMAGE");
  assert.equal(decision.routeMode, "ugc");
  assert.equal(decision.preset, "ugc-lifestyle");
});

test("routes greetings to a non-execution reply", () => {
  const decision = decideAgentPhaseRoute({
    message: "\u4f60\u597d",
    routeMode: "auto",
  });

  assert.equal(decision.phase, "GREET");
  assert.equal(decision.route, "greet");
  assert.equal(decision.nextAction, "reply");
});
