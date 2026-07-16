import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

const { buildOpenClawRuntimeConfig, prepareOpenClawRuntimeConfig } =
  require("./runtime-config.ts") as typeof import("./runtime-config");

const baseConfig = {
  agents: {
    defaults: {
      workspace: "E:/runtime/workspace",
      model: { primary: "genlink_text/gpt-4o-mini" },
      models: {
        "genlink_text/gpt-4o-mini": { alias: "Legacy" },
      },
      sandbox: { mode: "off" },
    },
  },
  models: {
    mode: "merge",
    providers: {
      genlink_text: {
        baseUrl: "${GENLINK_OPENCLAW_TEXT_BASE_URL}",
        apiKey: "${GENLINK_OPENCLAW_TEXT_API_KEY}",
        api: "openai-completions",
        models: [{ id: "gpt-4o-mini", name: "Legacy" }],
      },
    },
  },
  tools: { profile: "minimal", deny: ["group:fs"] },
  mcp: { servers: { genlink_canvas: { command: "node" } } },
};

test("builds the four-model OpenClaw catalog without changing unrelated settings", () => {
  const built = buildOpenClawRuntimeConfig(baseConfig);
  const agents = built.agents as typeof baseConfig.agents;
  const models = built.models as {
    providers: {
      genlink_text: {
        apiKey: string;
        models: Array<{
          id: string;
          maxTokens: number;
          compat: { maxTokensField: string };
        }>;
      };
    };
  };

  assert.equal(agents.defaults.model.primary, "genlink_text/gpt-5.5");
  assert.deepEqual(
    Object.keys(agents.defaults.models),
    [
      "genlink_text/gemini-3.5-flash",
      "genlink_text/gemini-3.1-pro",
      "genlink_text/gpt-5.4-mini",
      "genlink_text/gpt-5.5",
    ],
  );
  assert.deepEqual(
    models.providers.genlink_text.models.map((model) => model.id),
    ["gemini-3.5-flash", "gemini-3.1-pro", "gpt-5.4-mini", "gpt-5.5"],
  );
  for (const model of models.providers.genlink_text.models.slice(0, 2)) {
    assert.equal(model.maxTokens, 8192);
    assert.equal(model.compat.maxTokensField, "max_tokens");
  }
  for (const model of models.providers.genlink_text.models.slice(2)) {
    assert.equal(model.maxTokens, 8192);
    assert.equal(model.compat.maxTokensField, undefined);
  }
  assert.deepEqual(built.mcp, baseConfig.mcp);
  assert.deepEqual(built.tools, baseConfig.tools);
  assert.deepEqual(agents.defaults.sandbox, baseConfig.agents.defaults.sandbox);
  assert.equal(models.providers.genlink_text.apiKey, "${GENLINK_OPENCLAW_TEXT_API_KEY}");
  assert.deepEqual(baseConfig.agents.defaults.models, {
    "genlink_text/gpt-4o-mini": { alias: "Legacy" },
  });
});

test("preserves one immutable legacy backup and atomically writes valid JSON", () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-openclaw-"));
  const baseConfigPath = path.join(runtimeRoot, "openclaw-genlink.json");
  const stateDir = path.join(runtimeRoot, "state");
  const source = Buffer.from(`{
    // Existing OpenClaw config intentionally uses JSON5.
    agents: { defaults: { workspace: "workspace", model: { primary: "genlink_text/gpt-5.5" } } },
    models: { providers: { genlink_text: { api: "openai-completions", models: [] } } },
    tools: { profile: "minimal" },
    mcp: { servers: {} },
  }\n`, "utf8");
  writeFileSync(baseConfigPath, source);

  const first = prepareOpenClawRuntimeConfig({ baseConfigPath, stateDir });
  const expectedHash = createHash("sha256").update(source).digest("hex");

  assert.deepEqual(readFileSync(first.legacyBackupPath), source);
  assert.equal(first.legacyBackupHash, expectedHash);
  assert.equal(
    readFileSync(`${first.legacyBackupPath}.sha256`, "utf8").trim(),
    expectedHash,
  );
  assert.doesNotThrow(() => JSON.parse(readFileSync(first.configPath, "utf8")));

  writeFileSync(
    baseConfigPath,
    source.toString("utf8").replace('"workspace"', '"changed-workspace"'),
  );
  const second = prepareOpenClawRuntimeConfig({ baseConfigPath, stateDir });

  assert.equal(second.legacyBackupPath, first.legacyBackupPath);
  assert.equal(second.legacyBackupHash, expectedHash);
  assert.deepEqual(readFileSync(second.legacyBackupPath), source);
  assert.equal(
    readFileSync(`${second.legacyBackupPath}.sha256`, "utf8").trim(),
    expectedHash,
  );
});
