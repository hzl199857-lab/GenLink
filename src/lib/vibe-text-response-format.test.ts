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
