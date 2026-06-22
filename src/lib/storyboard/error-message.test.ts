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

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const {
  getStoryboardGenerationErrorMessage,
  getStoryboardGenerationTimeoutMs,
} = require("./error-message.ts") as typeof import("./error-message");

test("maps provider timeout errors to a Chinese actionable storyboard message", () => {
  const message = getStoryboardGenerationErrorMessage({
    message: "Comfly request timed out",
    status: 504,
    provider: "comfly",
    model: "gpt-5.5",
  });

  assert.match(message, /Comfly \/ gpt-5\.5 响应超时/);
  assert.match(message, /换用 gemini-3-flash、gemini-3\.1-pro 或 gpt-5\.4/);
  assert.match(message, /减少分镜数量或参考图/);
  assert.doesNotMatch(message, /request timed out/);
});

test("keeps non-timeout storyboard errors readable with provider context", () => {
  assert.equal(
    getStoryboardGenerationErrorMessage({
      message: "invalid api key",
      status: 401,
      provider: "zhenzhen",
      model: "gpt-5.4",
    }),
    "分镜生成失败：invalid api key（贞贞的AI工坊 / gpt-5.4）",
  );
});

test("uses a longer storyboard timeout for slower relay providers", () => {
  assert.equal(getStoryboardGenerationTimeoutMs("comfly"), 300_000);
  assert.equal(getStoryboardGenerationTimeoutMs("zhenzhen"), 300_000);
  assert.equal(getStoryboardGenerationTimeoutMs("vibe"), 180_000);
});
