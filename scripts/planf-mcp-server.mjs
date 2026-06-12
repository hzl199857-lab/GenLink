#!/usr/bin/env node

import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);

const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
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

  module._compile(output.outputText, filename);
};

const {
  buildPlanfEcomPrompt,
  buildOfflinePlanfEcomFinalPrompt,
  buildPlanfEcomWorkflow,
  glWorkflowToCanvasAgentActions,
} = require("../src/lib/planf-ecom.ts");

const GENLINK_BASE_URL = (process.env.GENLINK_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const MCP_PROTOCOL_VERSION = "2024-11-05";

let inputBuffer = Buffer.alloc(0);

function writeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

function writeResult(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function writeError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

function parseJsonSchemaProperties(schema) {
  return {
    type: "object",
    additionalProperties: false,
    ...schema,
  };
}

const tools = [
  {
    name: "planf_ecom_prompt_brief",
    description: "Read the PlanF Canvas e-commerce image rules and build the LLM brief used to synthesize a final image prompt.",
    inputSchema: parseJsonSchemaProperties({
      properties: {
        request: {
          type: "string",
          description: "User's e-commerce image request in natural language.",
        },
        styleMode: {
          type: "string",
          enum: ["default", "detail-page", "ugc", "stylist"],
          description: "Optional explicit e-commerce image route. If omitted, inferred from request.",
        },
        product: {
          type: "string",
          description: "Optional product name or product category.",
        },
        platform: {
          type: "string",
          description: "Optional platform, such as Taobao, Tmall, JD, Amazon, Xiaohongshu.",
        },
        aspectRatio: {
          type: "string",
          description: "Optional target ratio, such as 1:1, 3:4, 4:5, 16:9.",
        },
        extraConstraints: {
          type: "string",
          description: "Optional hard constraints that must stay in the final prompt.",
        },
        rulesRoot: {
          type: "string",
          description: "Optional PlanF rules directory path. Defaults to PLANF_RULES_ROOT or the local downloaded rules path.",
        },
      },
      required: ["request"],
    }),
  },
  {
    name: "planf_ecom_prompt",
    description: "Read PlanF e-commerce image rules and use GenLink text generation to synthesize a clean final image prompt.",
    inputSchema: parseJsonSchemaProperties({
      properties: {
        request: {
          type: "string",
          description: "User's e-commerce image request in natural language.",
        },
        styleMode: {
          type: "string",
          enum: ["default", "detail-page", "ugc", "stylist"],
        },
        product: { type: "string" },
        platform: { type: "string" },
        aspectRatio: { type: "string" },
        extraConstraints: { type: "string" },
        rulesRoot: { type: "string" },
        textProvider: {
          type: "string",
          enum: ["vibe", "fucheers", "comfly", "zhenzhen"],
        },
        textModel: { type: "string" },
        textApiKey: { type: "string" },
      },
      required: ["request"],
    }),
  },
  {
    name: "planf_ecom_image_generate",
    description: "Build a PlanF e-commerce image prompt, submit it to GenLink image generation, and return the job state.",
    inputSchema: parseJsonSchemaProperties({
      properties: {
        request: {
          type: "string",
          description: "User's e-commerce image request in natural language.",
        },
        styleMode: {
          type: "string",
          enum: ["default", "detail-page", "ugc", "stylist"],
        },
        product: { type: "string" },
        platform: { type: "string" },
        aspectRatio: { type: "string" },
        extraConstraints: { type: "string" },
        rulesRoot: { type: "string" },
        provider: {
          type: "string",
          enum: ["vibe", "fucheers", "comfly", "zhenzhen", "runninghub", "grsai"],
          description: "GenLink image provider.",
        },
        model: { type: "string" },
        size: { type: "string" },
        quality: { type: "string" },
        outputFormat: { type: "string" },
        runningHubChannel: {
          type: "string",
          enum: ["official", "low-cost"],
        },
        runningHubWorkflowId: { type: "string" },
        n: { type: "number" },
        apiKey: {
          type: "string",
          description: "Optional provider API key. If omitted, GenLink server env is used.",
        },
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              fileName: { type: "string" },
            },
            required: ["url"],
          },
        },
      },
      required: ["request"],
    }),
  },
  {
    name: "planf_ecom_workflow",
    description: "Build a GenLink GL workflow-json from a PlanF e-commerce image request without executing image generation.",
    inputSchema: parseJsonSchemaProperties({
      properties: {
        request: {
          type: "string",
          description: "User's e-commerce image request in natural language.",
        },
        styleMode: {
          type: "string",
          enum: ["default", "detail-page", "ugc", "stylist"],
        },
        product: { type: "string" },
        platform: { type: "string" },
        aspectRatio: { type: "string" },
        extraConstraints: { type: "string" },
        rulesRoot: { type: "string" },
      },
      required: ["request"],
    }),
  },
  {
    name: "genlink_image_job_status",
    description: "Poll a GenLink image generation job by jobId.",
    inputSchema: parseJsonSchemaProperties({
      properties: {
        jobId: { type: "string" },
        apiKey: { type: "string" },
      },
      required: ["jobId"],
    }),
  },
];

function textContent(value) {
  return [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ];
}

function assertObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function buildPromptFromArgs(args) {
  const input = assertObject(args);
  return buildPlanfEcomPrompt({
    request: String(input.request || ""),
    styleMode: typeof input.styleMode === "string" ? input.styleMode : undefined,
    product: typeof input.product === "string" ? input.product : undefined,
    platform: typeof input.platform === "string" ? input.platform : undefined,
    aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
    extraConstraints: typeof input.extraConstraints === "string" ? input.extraConstraints : undefined,
    rulesRoot: typeof input.rulesRoot === "string" ? input.rulesRoot : undefined,
  });
}

async function synthesizeFinalPrompt(args) {
  const input = assertObject(args);
  const promptBrief = buildPromptFromArgs(input);

  if (typeof input.textApiKey !== "string" || !input.textApiKey.trim()) {
    const offline = buildOfflinePlanfEcomFinalPrompt(input);

    return {
      promptBrief,
      finalPrompt: offline.prompt,
      text: {
        model: "offline-template",
      },
    };
  }

  const textResult = await postJson(`${GENLINK_BASE_URL}/api/ai/text`, {
    prompt: promptBrief.prompt,
    provider: typeof input.textProvider === "string" ? input.textProvider : undefined,
    model: typeof input.textModel === "string" ? input.textModel : undefined,
    apiKey: typeof input.textApiKey === "string" ? input.textApiKey : undefined,
    temperature: 0.35,
    maxTokens: 1200,
  });
  const finalPrompt = String(textResult?.result?.content || "").trim();

  if (!finalPrompt) {
    throw new Error("GenLink text generation returned an empty prompt");
  }

  return {
    promptBrief,
    finalPrompt,
    text: textResult.result,
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

async function callTool(name, args) {
  if (name === "planf_ecom_prompt_brief") {
    const promptResult = buildPromptFromArgs(args);
    return {
      content: textContent(promptResult),
    };
  }

  if (name === "planf_ecom_prompt") {
    const synthesized = await synthesizeFinalPrompt(args);
    return {
      content: textContent({
        prompt: synthesized.finalPrompt,
        styleMode: synthesized.promptBrief.styleMode,
        loadedRules: synthesized.promptBrief.loadedRules,
        textModel: synthesized.text.model,
        usage: {
          promptTokens: synthesized.text.promptTokens,
          completionTokens: synthesized.text.completionTokens,
          totalTokens: synthesized.text.totalTokens,
        },
      }),
    };
  }

  if (name === "planf_ecom_image_generate") {
    const input = assertObject(args);
    const synthesized = await synthesizeFinalPrompt(input);
    const result = await postJson(`${GENLINK_BASE_URL}/api/ai/image`, {
      prompt: synthesized.finalPrompt,
      provider: typeof input.provider === "string" ? input.provider : undefined,
      model: typeof input.model === "string" ? input.model : undefined,
      size: typeof input.size === "string" ? input.size : undefined,
      quality: typeof input.quality === "string" ? input.quality : undefined,
      outputFormat: typeof input.outputFormat === "string" ? input.outputFormat : undefined,
      runningHubChannel: typeof input.runningHubChannel === "string" ? input.runningHubChannel : undefined,
      runningHubWorkflowId: typeof input.runningHubWorkflowId === "string" ? input.runningHubWorkflowId : undefined,
      n: typeof input.n === "number" ? input.n : undefined,
      apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
      images: Array.isArray(input.images) ? input.images : undefined,
      historyNodeData: {
        title: "PlanF 电商图",
        prompt: synthesized.finalPrompt,
        provider: typeof input.provider === "string" ? input.provider : undefined,
        model: typeof input.model === "string" ? input.model : undefined,
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
        quality: typeof input.quality === "string" ? input.quality : undefined,
        outputFormat: typeof input.outputFormat === "string" ? input.outputFormat : undefined,
      },
    });

    return {
      content: textContent({
        prompt: synthesized.finalPrompt,
        styleMode: synthesized.promptBrief.styleMode,
        loadedRules: synthesized.promptBrief.loadedRules,
        textModel: synthesized.text.model,
        genlink: result,
      }),
    };
  }

  if (name === "planf_ecom_workflow") {
    const workflow = buildPlanfEcomWorkflow(assertObject(args));

    return {
      content: textContent({
        workflow,
        actions: glWorkflowToCanvasAgentActions(workflow),
      }),
    };
  }

  if (name === "genlink_image_job_status") {
    const input = assertObject(args);
    const jobId = String(input.jobId || "").trim();

    if (!jobId) {
      throw new Error("jobId is required");
    }

    const url = new URL(`${GENLINK_BASE_URL}/api/ai/image`);
    url.searchParams.set("jobId", jobId);

    if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      url.searchParams.set("apiKey", input.apiKey.trim());
    }

    return {
      content: textContent(await getJson(url)),
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  const { id, method, params } = message;

  try {
    if (method === "initialize") {
      writeResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "genlink-planf",
          version: "0.1.0",
        },
      });
      return;
    }

    if (method === "tools/list") {
      writeResult(id, { tools });
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;

      if (typeof toolName !== "string") {
        throw new Error("tool name is required");
      }

      writeResult(id, await callTool(toolName, params?.arguments || {}));
      return;
    }

    if (id !== undefined) {
      writeError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    writeError(
      id,
      -32000,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

function tryReadMessages() {
  while (inputBuffer.length > 0) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");

    if (headerEnd === -1) {
      return;
    }

    const header = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);

    if (!match) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = Number(match[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;

    if (inputBuffer.length < messageEnd) {
      return;
    }

    const payload = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);

    try {
      void handleMessage(JSON.parse(payload));
    } catch (error) {
      writeError(
        undefined,
        -32700,
        error instanceof Error ? error.message : "Parse error",
      );
    }
  }
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  tryReadMessages();
});

process.stdin.resume();
