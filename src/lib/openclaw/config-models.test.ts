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

const { ensureOpenClawConfigHasAgentModels } =
  require("./config-models.ts") as typeof import("./config-models");

test("adds every Agent panel model to the OpenClaw genlink_text provider", () => {
  const source = `{
  agents: {
    defaults: {
      models: {
        "genlink_text/gpt-5.5": {
          alias: "GenLink GPT-5.5"
        },
        "genlink_text/gpt-4o-mini": {
          alias: "GenLink GPT-4o Mini"
        }
      }
    }
  },
  models: {
    providers: {
      genlink_text: {
        models: [
          {
            id: "gpt-5.5",
            name: "GenLink GPT-5.5",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            contextTokens: 96000,
            maxTokens: 8192,
            compat: {
              requiresStringContent: true,
              strictMessageKeys: true
            }
          },
          {
            id: "gpt-4o-mini",
            name: "GenLink GPT-4o Mini",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            contextTokens: 96000,
            maxTokens: 8192,
            compat: {
              requiresStringContent: true,
              strictMessageKeys: true
            }
          }
        ]
      }
    }
  }
}`;

  const result = ensureOpenClawConfigHasAgentModels(source);

  assert.match(result, /"genlink_text\/gpt-5\.4-mini"/);
  assert.match(result, /id: "gpt-5\.4-mini"/);
  assert.equal(result.match(/"genlink_text\/gpt-5\.5"/g)?.length, 1);
  assert.equal(result.match(/id: "gpt-5\.5"/g)?.length, 1);
});
