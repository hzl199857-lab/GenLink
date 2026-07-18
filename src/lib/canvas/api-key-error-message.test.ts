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
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const { getMissingApiKeyErrorMessage } =
  require("./api-key-error-message.ts") as typeof import("./api-key-error-message");

test("uses Chinese text for a missing image provider API key", () => {
  assert.equal(
    getMissingApiKeyErrorMessage("image", "VibeAPI"),
    "请先在 API 设置中配置图像 VibeAPI 的 API Key。",
  );
});
