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
  resolveAgentImageGenerationPreference,
} = require("./agent-image-preference.ts") as typeof import("./agent-image-preference");

test("keeps provider model and quality selectable while aspect ratio mode is auto", () => {
  const resolved = resolveAgentImageGenerationPreference({
    autoProvider: "vibe",
    preference: {
      mode: "auto",
      provider: "zhenzhen",
      model: "gpt-image-2",
      quality: "4K",
      aspectRatio: "auto",
    },
  });

  assert.equal(resolved.mode, "auto");
  assert.equal(resolved.provider, "zhenzhen");
  assert.equal(resolved.model, "gpt-image-2");
  assert.equal(resolved.quality, "4K");
  assert.equal(resolved.aspectRatio, "auto");
});
