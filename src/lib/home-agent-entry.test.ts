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

const { isAgentModelId } =
  require("./agent-model-options.ts") as typeof import("./agent-model-options");
const { createHomeAgentPendingRequest, selectRecentProjects } =
  require("./home-agent-entry.ts") as typeof import("./home-agent-entry");

test("accepts only configured Agent models", () => {
  assert.equal(isAgentModelId("gemini-3.5-flash"), true);
  assert.equal(isAgentModelId("gemini-3.1-pro"), true);
  assert.equal(isAgentModelId("gpt-5.5"), false);
  assert.equal(isAgentModelId("unknown"), false);
});

test("normalizes a pending home Agent request", () => {
  const request = createHomeAgentPendingRequest({
    id: "launch-1",
    prompt: "  创建一张海报  ",
    provider: "comfly",
    model: "gemini-3.5-flash",
    imagePreference: {
      mode: "manual",
      provider: "comfly",
      model: "midjourney",
      aspectRatio: "4:3",
      quality: "2K",
    },
    files: [],
  });

  assert.deepEqual(request, {
    id: "launch-1",
    prompt: "创建一张海报",
    provider: "comfly",
    model: "gemini-3.5-flash",
    imagePreference: {
      mode: "manual",
      provider: "comfly",
      model: "midjourney",
      aspectRatio: "4:3",
      quality: "2K",
    },
    files: [],
  });
});

test("returns the three most recently updated projects", () => {
  const result = selectRecentProjects([
    { id: "a", updatedAt: "2026-07-13T00:00:00.000Z" },
    { id: "b", updatedAt: "2026-07-16T00:00:00.000Z" },
    { id: "c", updatedAt: "2026-07-15T00:00:00.000Z" },
    { id: "d", updatedAt: "2026-07-14T00:00:00.000Z" },
  ]);

  assert.deepEqual(result.map((project) => project.id), ["b", "c", "d"]);
});
