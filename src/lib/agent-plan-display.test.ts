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
  getPlanfEcomImageSummary,
  getPlanfEcomPlanStatusLabel,
  getPlanfEcomSlotKey,
} = require("./agent-plan-display.ts") as typeof import("./agent-plan-display");

test("uses the active generation preference in the image plan summary", () => {
  const summary = getPlanfEcomImageSummary({
    preference: {
      mode: "manual",
      provider: "fucheers",
      model: "gpt-image-2",
      runningHubChannel: "official",
      aspectRatio: "3:4",
      quality: "1K",
    },
    taskCount: 5,
  });

  assert.deepEqual(summary, {
    modelLabel: "gpt-image-2",
    aspectRatio: "3:4",
    quality: "1K",
    taskLabel: "5 个任务",
  });
});

test("builds stable expansion keys per plan slot", () => {
  assert.equal(
    getPlanfEcomSlotKey({ messageId: "plan-1", slotId: 3, slotIndex: 2 }),
    "plan-1:3:2",
  );
});

test("marks finished image plans as created", () => {
  assert.equal(getPlanfEcomPlanStatusLabel("completed"), "已创建");
});
