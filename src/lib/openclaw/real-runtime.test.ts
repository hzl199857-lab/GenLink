import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module") as typeof import("node:module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

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

const { resolveTextBaseUrl } = require("./real-runtime.ts") as typeof import("./real-runtime");

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("explicit OpenClaw base URL does not override an Agent-selected provider", () => {
  process.env.GENLINK_OPENCLAW_TEXT_BASE_URL = "https://ai.comfly.org/v1";
  delete process.env.FUCHEERS_BASE_URL;

  assert.equal(resolveTextBaseUrl("fucheers"), "https://www.fucheers.top/v1");
});

test("explicit OpenClaw base URL remains the default when no provider is selected", () => {
  process.env.GENLINK_OPENCLAW_TEXT_BASE_URL = "https://ai.comfly.org/v1";

  assert.equal(resolveTextBaseUrl(), "https://ai.comfly.org/v1");
});
