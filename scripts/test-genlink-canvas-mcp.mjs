#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const child = spawn(process.execPath, ["scripts/genlink-canvas-mcp-server.mjs"], {
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
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }
    }, 15_000);

    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
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
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "genlink-canvas-smoke",
      version: "0.1.0",
    },
  });
  const toolList = await send("tools/list", {});
  const toolNames = toolList.tools.map((tool) => tool.name);
  const expectedTools = [
    "genlink_canvas_get_snapshot",
    "genlink_canvas_get_node",
    "genlink_canvas_create_workflow",
    "genlink_canvas_create_node",
    "genlink_canvas_connect_nodes",
    "genlink_canvas_update_node_params",
    "genlink_canvas_run_node",
    "genlink_canvas_get_job_status",
  ];

  for (const expected of expectedTools) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing MCP tool: ${expected}`);
    }
  }

  console.log(JSON.stringify({
    server: init.serverInfo,
    toolCount: toolNames.length,
    tools: toolNames,
  }, null, 2));
} finally {
  child.kill();
}
