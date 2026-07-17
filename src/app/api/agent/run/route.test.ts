import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
type ModuleWithLoad = typeof import("node:module") & {
  _load(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ): unknown;
};
const Module = require("node:module") as ModuleWithLoad;
const originalLoad = Module._load;

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

function createWorkflow(summary: string, nodeId: string) {
  return {
    type: "workflow",
    reason: null,
    filePath: null,
    summary,
    workflow: {
      name: "图片工作流",
      autoRun: true,
      nodes: [{
        id: nodeId,
        type: "rh-image",
        subType: "text-image",
        from: "agent",
        agentNodeType: "illustration",
        title: "图片节点",
        content: "一张干净的产品摄影图，主体清晰，光线自然，背景简洁，细节丰富。",
        aspectRatio: "1:1",
        duration: null,
        sourceNodeId: null,
        editAction: null,
      }],
      edges: [],
    },
  };
}

function installRouteMocks(generateText: (params: { prompt: string; responseFormat?: unknown }) => Promise<unknown>) {
  Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === "next/server") {
      return {
        NextResponse: {
          json: (body: unknown, init?: ResponseInit) =>
            new Response(JSON.stringify(body), {
              status: init?.status ?? 200,
              headers: { "content-type": "application/json" },
            }),
        },
      };
    }

    if (request === "@/lib/vibe") {
      return {
        VibeApiError: class VibeApiError extends Error {
          status: number;

          constructor(status: number, message: string) {
            super(message);
            this.status = status;
          }
        },
        generateText,
      };
    }

    if (request === "@/lib/auth-guard") {
      return {
        requireAuth: async () => ({
          ok: true,
          session: { user: { id: "test-user" } },
        }),
      };
    }

    if (request.startsWith("@/")) {
      return originalLoad.call(
        this,
        join(process.cwd(), "src", `${request.slice(2)}.ts`),
        parent,
        isMain,
      );
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

test("Agent run route asks the model to fully rewrite once after engineer validation fails", async () => {
  const calls: Array<{ prompt: string; responseFormat?: unknown }> = [];

  installRouteMocks(async (params) => {
    calls.push(params);

    return {
      content: JSON.stringify(calls.length === 1
        ? createWorkflow("图片已经生成完成。", "bad_1")
        : createWorkflow("已创建图片工作流，等待用户确认生成。", "good_1")),
      model: "gpt-5.4-mini",
    };
  });

  try {
    const { POST } = require("./route.ts") as typeof import("./route");
    const response = await POST(new Request("http://localhost/api/agent/run", {
      method: "POST",
      body: JSON.stringify({
        message: "生成一张产品图",
        provider: "fucheers",
        model: "gpt-5.4-mini",
        context: {
          input: {
            message: "生成一张产品图",
            attachments: [],
            referencedAttachmentIds: [],
          },
        },
      }),
    }));
    const json = await response.json() as { ok: boolean; result?: { actions: unknown[] } };
    const secondPrompt = JSON.parse(calls[1]?.prompt ?? "{}") as {
      selfRepair?: { diagnostic?: string; mode?: string };
    };

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(secondPrompt.selfRepair?.mode, "full_rewrite_only");
    assert.match(secondPrompt.selfRepair?.diagnostic ?? "", /must not claim generation/);
    assert.equal(json.result?.actions.length, 1);
  } finally {
    Module._load = originalLoad;
  }
});

test("Agent run route lets the model read a planf canvas rule file before final workflow", async () => {
  const calls: Array<{ prompt: string; responseFormat?: { json_schema?: { name?: string } } }> = [];

  installRouteMocks(async (params) => {
    calls.push(params as { prompt: string; responseFormat?: { json_schema?: { name?: string } } });

    return {
      content: JSON.stringify(calls.length === 1
        ? {
            type: "read_rule_file",
            reason: "Need e-commerce image skill details.",
            filePath: "skills/ecom-image/SKILL.md",
            summary: null,
            workflow: null,
          }
        : createWorkflow("已创建电商图片工作流，等待用户确认生成。", "ecom_1")),
      model: "gpt-5.4-mini",
    };
  });

  try {
    delete require.cache[require.resolve("./route.ts")];
    const { POST } = require("./route.ts") as typeof import("./route");
    const response = await POST(new Request("http://localhost/api/agent/run", {
      method: "POST",
      body: JSON.stringify({
        message: "生成一张电商产品图",
        provider: "comfly",
        model: "gpt-5.4-mini",
        context: {
          input: {
            message: "生成一张电商产品图",
            attachments: [],
            referencedAttachmentIds: [],
          },
        },
      }),
    }));
    const json = await response.json() as {
      ok: boolean;
      result?: {
        trace: Array<{
          type: string;
          result?: { toolName?: string; ok?: boolean; data?: { relativePath?: string; content?: string } };
        }>;
      };
    };
    const secondPrompt = JSON.parse(calls[1]?.prompt ?? "{}") as {
      toolTranscript?: Array<{
        type: string;
        name?: string;
        ok?: boolean;
        data?: { relativePath?: string; content?: string };
      }>;
    };
    const readResult = secondPrompt.toolTranscript?.find((item) => (
      item.type === "tool_result" && item.name === "read_rule_file"
    ));

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.responseFormat?.json_schema?.name, "genlink_agent_runtime_step");
    assert.equal(readResult?.ok, true);
    assert.equal(readResult?.data?.relativePath, "rules/planf-canvas/skills/ecom-image/SKILL.md");
    assert.ok((readResult?.data?.content?.length ?? 0) > 0);
    assert.ok(json.result?.trace.some((item) => item.type === "tool_result" && item.result?.toolName === "read_rule_file"));
  } finally {
    Module._load = originalLoad;
  }
});

test("Agent run route returns chat replies without creating canvas actions", async () => {
  const calls: Array<{ prompt: string; responseFormat?: { json_schema?: { name?: string } } }> = [];

  installRouteMocks(async (params) => {
    calls.push(params as { prompt: string; responseFormat?: { json_schema?: { name?: string } } });

    return {
      content: JSON.stringify({
        type: "chat",
        reason: "User only greeted the agent.",
        filePath: null,
        summary: "你好，我在。你可以告诉我想在画布上创建或修改什么内容。",
        workflow: null,
      }),
      model: "gpt-5.4-mini",
    };
  });

  try {
    delete require.cache[require.resolve("./route.ts")];
    const { POST } = require("./route.ts") as typeof import("./route");
    const response = await POST(new Request("http://localhost/api/agent/run", {
      method: "POST",
      body: JSON.stringify({
        message: "你好",
        provider: "comfly",
        model: "gpt-5.4-mini",
        context: {
          input: {
            message: "你好",
            attachments: [],
            referencedAttachmentIds: [],
          },
        },
      }),
    }));
    const json = await response.json() as {
      ok: boolean;
      result?: {
        summary: string;
        actions: unknown[];
        trace: Array<{ type: string; content?: string }>;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.responseFormat?.json_schema?.name, "genlink_agent_runtime_step");
    assert.equal(json.result?.actions.length, 0);
    assert.match(json.result?.summary ?? "", /你好/);
    assert.ok(json.result?.trace.some((item) => item.type === "final" && /你好/.test(item.content ?? "")));
  } finally {
    Module._load = originalLoad;
  }
});
