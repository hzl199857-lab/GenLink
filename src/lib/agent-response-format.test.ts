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

const { AGENT_STEP_RESPONSE_FORMAT } =
  require("./agent-response-format.ts") as typeof import("./agent-response-format");

test("defines a strict JSON schema response format for Agent tool steps", () => {
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.type, "json_schema");
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.json_schema?.strict, true);
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.json_schema?.name, "genlink_agent_step");

  const schema = AGENT_STEP_RESPONSE_FORMAT.json_schema?.schema as {
    required?: string[];
    properties?: {
      tool?: {
        anyOf?: Array<{
          properties?: {
            name?: {
              enum?: string[];
            };
          };
        }>;
      };
    };
  };

  assert.deepEqual(schema.required, ["type", "thinking", "tool", "message"]);
  assert.ok(schema.properties?.tool?.anyOf?.some((entry) =>
    entry.properties?.name?.enum?.includes("create_image_generation_node"),
  ));
});
