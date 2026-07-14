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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  buildMidjourneyPrompt,
  extractMidjourneyUpscaleActions,
  parseMidjourneySubmission,
} = require("./comfly-midjourney.ts") as typeof import("./comfly-midjourney");

test("appends aspect ratio only when the prompt does not already specify one", () => {
  assert.equal(buildMidjourneyPrompt("cat", "16:9"), "cat --ar 16:9");
  assert.equal(buildMidjourneyPrompt("cat --ar 4:3", "16:9"), "cat --ar 4:3");
  assert.equal(buildMidjourneyPrompt("cat --aspect 3:2", "16:9"), "cat --aspect 3:2");
  assert.equal(buildMidjourneyPrompt("cat", "auto"), "cat");
});

test("accepts submitted and queued Imagine responses", () => {
  assert.deepEqual(
    parseMidjourneySubmission({ code: 1, result: "task-a", description: "ok" }),
    { taskId: "task-a" },
  );
  assert.deepEqual(
    parseMidjourneySubmission({ code: 22, result: "task-b", description: "queued" }),
    { taskId: "task-b" },
  );
});

test("maps queue full and sensitive prompt responses to stable errors", () => {
  assert.throws(
    () => parseMidjourneySubmission({ code: 23, description: "full" }),
    /队列已满/,
  );
  assert.throws(
    () => parseMidjourneySubmission({ code: 24, description: "blocked" }),
    /敏感/,
  );
});

test("extracts a complete U1-U4 action map from unordered buttons", () => {
  assert.deepEqual(
    extractMidjourneyUpscaleActions([
      { label: "U3", customId: "three" },
      { label: "V1", customId: "variation" },
      { label: "U1", customId: "one" },
      { label: "U4", customId: "four" },
      { label: "U2", customId: "two" },
    ]),
    { 1: "one", 2: "two", 3: "three", 4: "four" },
  );
});

test("does not expose quadrant selection for an incomplete action map", () => {
  assert.equal(
    extractMidjourneyUpscaleActions([{ label: "U1", customId: "one" }]),
    undefined,
  );
});
