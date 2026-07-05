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

const { AGENT_STEP_RESPONSE_FORMAT, AGENT_RUNTIME_RESPONSE_FORMAT } =
  require("./agent-response-format.ts") as typeof import("./agent-response-format");

test("defines a strict JSON schema response format for Agent workflow output", () => {
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.type, "json_schema");
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.json_schema?.strict, true);
  assert.equal(AGENT_STEP_RESPONSE_FORMAT.json_schema?.name, "genlink_agent_workflow");

  const schema = AGENT_STEP_RESPONSE_FORMAT.json_schema?.schema as unknown as {
    required?: readonly string[];
    properties?: {
      workflow?: {
        properties?: {
          nodes?: {
            items?: {
              additionalProperties?: boolean;
              properties?: {
                subType?: {
                  enum?: readonly string[];
                };
              };
            };
          };
        };
      };
    };
  };

  assert.deepEqual(schema.required, ["summary", "workflow"]);
  assert.equal(schema.properties?.workflow?.properties?.nodes?.items?.additionalProperties, false);
  assert.ok(schema.properties?.workflow?.properties?.nodes?.items?.properties?.subType?.enum?.includes("image-image"));
});

test("defines a strict JSON schema response format for Agent runtime steps", () => {
  assert.equal(AGENT_RUNTIME_RESPONSE_FORMAT.type, "json_schema");
  assert.equal(AGENT_RUNTIME_RESPONSE_FORMAT.json_schema?.strict, true);
  assert.equal(AGENT_RUNTIME_RESPONSE_FORMAT.json_schema?.name, "genlink_agent_runtime_step");

  const schema = AGENT_RUNTIME_RESPONSE_FORMAT.json_schema?.schema as unknown as {
    required?: readonly string[];
    properties?: {
      type?: {
        enum?: readonly string[];
      };
      workflow?: {
        anyOf?: Array<{
          type?: string;
          properties?: {
            nodes?: {
              items?: {
                additionalProperties?: boolean;
              };
            };
          };
        }>;
      };
    };
  };
  const workflowSchema = schema.properties?.workflow?.anyOf?.find((item) => item.type === "object");

  assert.deepEqual(schema.required, ["type", "reason", "filePath", "summary", "workflow"]);
  assert.ok(schema.properties?.type?.enum?.includes("read_rule_file"));
  assert.ok(schema.properties?.type?.enum?.includes("workflow"));
  assert.equal(workflowSchema?.properties?.nodes?.items?.additionalProperties, false);
});
