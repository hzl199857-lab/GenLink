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

const { formatAgentFetchFailure } = require("./agent-api-fetch.ts") as typeof import("./agent-api-fetch");

test("explains browser fetch failures as cloud request failures", () => {
  assert.equal(
    formatAgentFetchFailure(
      new TypeError("Failed to fetch"),
      "套图企划生成失败",
      "/api/openclaw/planf/ecom/planner",
    ),
    "套图企划生成失败：请求没有收到服务端响应（/api/openclaw/planf/ecom/planner）。云端常见原因是 Vercel 函数超时、部署未生效，或网络连接被中断。",
  );
});

test("keeps non-network errors visible", () => {
  assert.equal(
    formatAgentFetchFailure(
      new Error("API key is required"),
      "套图企划生成失败",
      "/api/openclaw/planf/ecom/planner",
    ),
    "套图企划生成失败：API key is required",
  );
});
