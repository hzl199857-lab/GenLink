#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

function readDotenvValue(name) {
  try {
    const envText = readFileSync(".env", "utf8");
    const line = envText
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));

    if (!line) {
      return undefined;
    }

    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
  } catch {
    return undefined;
  }
}

const child = spawn(process.execPath, ["scripts/planf-mcp-server.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "inherit"],
});

let nextId = 1;
let outputBuffer = Buffer.alloc(0);
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  const payload = Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
    "utf8",
  );

  child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
  child.stdin.write(payload);

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }
    }, 15_000);
  });
}

function readMessages() {
  while (outputBuffer.length > 0) {
    const headerEnd = outputBuffer.indexOf("\r\n\r\n");

    if (headerEnd === -1) {
      return;
    }

    const header = outputBuffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);

    if (!match) {
      outputBuffer = outputBuffer.subarray(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;

    if (outputBuffer.length < end) {
      return;
    }

    const message = JSON.parse(outputBuffer.subarray(start, end).toString("utf8"));
    outputBuffer = outputBuffer.subarray(end);

    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        waiter.reject(new Error(message.error.message));
      } else {
        waiter.resolve(message.result);
      }
    }
  }
}

child.stdout.on("data", (chunk) => {
  outputBuffer = Buffer.concat([outputBuffer, chunk]);
  readMessages();
});

try {
  const localVibeApiKey = process.env.VIBE_API_KEY || readDotenvValue("VIBE_API_KEY");
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "genlink-planf-smoke",
      version: "0.1.0",
    },
  });
  const toolList = await send("tools/list", {});
  const brief = await send("tools/call", {
    name: "planf_ecom_prompt_brief",
    arguments: {
      request: "给一款夏季女装连衣裙做淘宝主图，清爽高级，突出面料垂坠和显瘦版型",
      platform: "淘宝",
      aspectRatio: "1:1",
      extraConstraints: "不要出现夸张文字，不要廉价影楼风",
    },
  });
  const livePrompt = process.env.PLANF_MCP_LIVE === "1"
    ? await send("tools/call", {
        name: "planf_ecom_prompt",
        arguments: {
          request: "给一款夏季女装连衣裙做淘宝主图，清爽高级，突出面料垂坠和显瘦版型",
          platform: "淘宝",
          aspectRatio: "1:1",
          extraConstraints: "不要出现夸张文字，不要廉价影楼风",
          textApiKey: localVibeApiKey,
        },
      })
    : undefined;
  const workflow = await send("tools/call", {
    name: "planf_ecom_workflow",
    arguments: {
      request: "给一款夏季女装连衣裙做淘宝主图，清爽高级，突出面料垂坠和显瘦版型",
      platform: "淘宝",
      aspectRatio: "1:1",
      extraConstraints: "不要出现夸张文字，不要廉价影楼风",
    },
  });

  console.log(JSON.stringify({
    server: init.serverInfo,
    tools: toolList.tools.map((tool) => tool.name),
    liveKeyAvailable: Boolean(localVibeApiKey),
    liveKeyLength: localVibeApiKey?.length || 0,
    briefPreview: brief.content[0].text.slice(0, 1200),
    livePromptPreview: livePrompt?.content?.[0]?.text?.slice(0, 1200),
    workflowPreview: workflow.content[0].text.slice(0, 1800),
  }, null, 2));
} finally {
  child.kill();
}
