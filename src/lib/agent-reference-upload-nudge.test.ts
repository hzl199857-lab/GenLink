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
  getAgentPlanfPresetPanelOpenState,
  getAgentReferenceUploadNudgeRequestForPlanfPanel,
  shouldShowAgentReferenceUploadNudge,
} = require("./agent-reference-upload-nudge.ts") as typeof import("./agent-reference-upload-nudge");

test("shows the reference upload nudge after an ecommerce preset is selected without attachments", () => {
  assert.equal(
    shouldShowAgentReferenceUploadNudge({
      requested: true,
      attachmentCount: 0,
    }),
    true,
  );
});

test("hides the reference upload nudge when a reference image exists", () => {
  assert.equal(
    shouldShowAgentReferenceUploadNudge({
      requested: true,
      attachmentCount: 1,
    }),
    false,
  );
});

test("keeps the reference upload nudge hidden until a preset requests it", () => {
  assert.equal(
    shouldShowAgentReferenceUploadNudge({
      requested: false,
      attachmentCount: 0,
    }),
    false,
  );
});

test("keeps the reference upload nudge requested while the ecommerce panel is open without attachments", () => {
  assert.equal(
    getAgentReferenceUploadNudgeRequestForPlanfPanel({
      panelOpen: true,
      attachmentCount: 0,
    }),
    true,
  );
});

test("dismisses the reference upload nudge when the ecommerce panel closes", () => {
  assert.equal(
    getAgentReferenceUploadNudgeRequestForPlanfPanel({
      panelOpen: false,
      attachmentCount: 0,
    }),
    false,
  );
});

test("opening the ecommerce direction panel selects the default preset and fills its prompt", () => {
  const result = getAgentPlanfPresetPanelOpenState({
    attachmentCount: 0,
    currentSelectedPresetId: null,
    presets: [
      { id: "full-set-8", prompt: "default prompt", routeMode: "default" },
      { id: "detail-page-pack", prompt: "detail prompt", routeMode: "detail-page" },
    ],
  });

  assert.deepEqual(result, {
    selectedPresetId: "full-set-8",
    routeMode: "default",
    draft: "default prompt",
    referenceUploadNudgeRequested: true,
  });
});

test("opening the ecommerce direction panel preserves an existing preset selection", () => {
  const result = getAgentPlanfPresetPanelOpenState({
    attachmentCount: 1,
    currentSelectedPresetId: "detail-page-pack",
    presets: [
      { id: "full-set-8", prompt: "default prompt", routeMode: "default" },
      { id: "detail-page-pack", prompt: "detail prompt", routeMode: "detail-page" },
    ],
  });

  assert.deepEqual(result, {
    selectedPresetId: "detail-page-pack",
    routeMode: "detail-page",
    draft: "detail prompt",
    referenceUploadNudgeRequested: false,
  });
});
