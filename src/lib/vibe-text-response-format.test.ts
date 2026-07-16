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

  if (request === "@/lib/local-image-storage") {
    return {
      getLocalImageDirectory: () => "",
      getLocalImageFileNameFromUrl: () => null,
    };
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

const { generateText } = require("./vibe.ts") as typeof import("./vibe");
const { AGENT_RUNTIME_RESPONSE_FORMAT } = require("./agent-response-format.ts") as typeof import("./agent-response-format");

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("passes OpenAI response_format through text generation requests", async () => {
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [
        {
          message: {
            content: "{\"type\":\"final\",\"message\":\"ok\"}",
          },
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  await generateText({
    provider: "fucheers",
    model: "gpt-5.4-mini",
    apiKey: "test-key",
    prompt: "hello",
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "agent_step",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["final"] },
            message: { type: "string" },
          },
          required: ["type", "message"],
        },
      },
    },
  });

  assert.deepEqual(requestBody?.response_format, {
    type: "json_schema",
    json_schema: {
      name: "agent_step",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["final"] },
          message: { type: "string" },
        },
        required: ["type", "message"],
      },
    },
  });
});

test("normalizes JSON schema for Gemini structured output", async () => {
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      model: "gemini-3.5-flash",
      choices: [
        {
          message: {
            content: "{\"type\":\"chat\",\"summary\":\"ok\",\"workflow\":null}",
          },
        },
      ],
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  await generateText({
    provider: "comfly",
    model: "gemini-3.5-flash",
    apiKey: "test-key",
    prompt: "hello",
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "agent_step",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["chat"] },
            summary: { type: ["string", "null"] },
            workflow: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                  },
                  required: ["name"],
                },
                { type: "null" },
              ],
            },
          },
          required: ["type", "summary", "workflow"],
        },
      },
    },
  });

  assert.deepEqual(requestBody?.response_format, {
    type: "json_schema",
    json_schema: {
      name: "agent_step",
      strict: true,
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["chat"] },
          summary: { type: "string", nullable: true },
          workflow: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
            nullable: true,
          },
        },
        required: ["type", "summary", "workflow"],
      },
    },
  });
});

test("retries Gemini schema compatibility failures as a JSON object", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(
      JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    );

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "Invalid JSON payload received. Unknown name \"additionalProperties\" at 'generation_config.response_schema'",
        },
      }), {
        status: 400,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({
      model: "gemini-3.5-flash",
      choices: [
        {
          message: {
            content: "{\"type\":\"chat\",\"summary\":\"ok\",\"workflow\":null}",
          },
        },
      ],
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const result = await generateText({
    provider: "comfly",
    model: "gemini-3.5-flash",
    apiKey: "test-key",
    prompt: "hello",
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "agent_step",
        strict: true,
        schema: {
          type: "object",
          properties: {
            type: { type: "string" },
          },
          required: ["type"],
        },
      },
    },
  });

  assert.equal(requestBodies.length, 2);
  assert.deepEqual(requestBodies[1]?.response_format, {
    type: "json_object",
  });
  assert.equal(result.content, "{\"type\":\"chat\",\"summary\":\"ok\",\"workflow\":null}");
});

test("normalizes the complete Agent runtime schema for Gemini", async () => {
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      model: "gemini-3.1-pro",
      choices: [
        {
          message: {
            content: "{\"type\":\"chat\",\"reason\":null,\"filePath\":null,\"summary\":\"ok\",\"workflow\":null}",
          },
        },
      ],
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  await generateText({
    provider: "zhenzhen",
    model: "gemini-3.1-pro",
    apiKey: "test-key",
    prompt: "hello",
    responseFormat: AGENT_RUNTIME_RESPONSE_FORMAT,
  });

  const responseFormat = requestBody?.response_format as {
    json_schema?: {
      schema?: Record<string, unknown>;
    };
  } | undefined;
  const serializedSchema = JSON.stringify(responseFormat?.json_schema?.schema);
  const workflowSchema = (
    responseFormat?.json_schema?.schema?.properties as Record<string, Record<string, unknown>>
  )?.workflow;

  assert.doesNotMatch(serializedSchema, /additionalProperties/);
  assert.doesNotMatch(serializedSchema, /"type":\[/);
  assert.doesNotMatch(serializedSchema, /"anyOf":/);
  assert.equal(workflowSchema?.nullable, true);
});
