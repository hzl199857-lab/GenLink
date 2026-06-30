import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const transpileTypeScriptModule = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

require.extensions[".ts"] = transpileTypeScriptModule;
require.extensions[".tsx"] = transpileTypeScriptModule;

const {
  shouldNotifyAudioDuration,
} = require("./AudioWaveformPlayer.tsx") as typeof import("./AudioWaveformPlayer");

test("does not notify parent when decoded duration already matches known duration", () => {
  assert.equal(shouldNotifyAudioDuration(18.001, 18.0014), false);
});

test("notifies parent when decoded duration differs from known duration", () => {
  assert.equal(shouldNotifyAudioDuration(18, undefined), true);
  assert.equal(shouldNotifyAudioDuration(18, 17.5), true);
});
