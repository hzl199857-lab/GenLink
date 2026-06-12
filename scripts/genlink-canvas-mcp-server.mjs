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
      baseUrl: ".",
      paths: {
        "@/*": ["./src/*"],
      },
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const Module = require("node:module");
const path = require("node:path");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(process.cwd(), "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  handleGenLinkCanvasMcpRequest,
} = require("../src/lib/mcp/genlink-canvas-server.ts");

let inputBuffer = Buffer.alloc(0);

function writeContentLengthMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

function writeLineMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function authFromEnv(message) {
  const params = message?.params && typeof message.params === "object"
    ? message.params
    : {};
  const args = params?.arguments && typeof params.arguments === "object"
    ? params.arguments
    : {};

  return {
    userId: process.env.GENLINK_MCP_USER_ID || "local-dev-user",
    projectId: typeof args.projectId === "string" ? args.projectId : "local-dev-project",
    canvasId: typeof args.canvasId === "string" ? args.canvasId : "default",
    permissions: {
      read: true,
      write: process.env.GENLINK_MCP_ALLOW_WRITE !== "0",
      generate: process.env.GENLINK_MCP_ALLOW_GENERATE === "1",
    },
  };
}

async function handleMessage(message, replyMode = "content-length") {
  if (!message || typeof message !== "object") {
    return;
  }

  const response = await handleGenLinkCanvasMcpRequest(message, authFromEnv(message));

  if (response === undefined) {
    return;
  }

  if (replyMode === "line") {
    writeLineMessage(response);
    return;
  }

  writeContentLengthMessage(response);
}

function writeParseError(error, replyMode = "content-length") {
  const response = {
    jsonrpc: "2.0",
    id: undefined,
    error: {
      code: -32700,
      message: error instanceof Error ? error.message : "Parse error",
    },
  };

  if (replyMode === "line") {
    writeLineMessage(response);
    return;
  }

  writeContentLengthMessage(response);
}

function tryReadMessages() {
  while (inputBuffer.length > 0) {
    if (!inputBuffer.subarray(0, 32).toString("utf8").startsWith("Content-Length:")) {
      const lineEnd = inputBuffer.indexOf("\n");

      if (lineEnd === -1) {
        return;
      }

      const line = inputBuffer.subarray(0, lineEnd).toString("utf8").replace(/\r$/, "");
      inputBuffer = inputBuffer.subarray(lineEnd + 1);

      if (!line.trim()) {
        continue;
      }

      try {
        void handleMessage(JSON.parse(line), "line");
      } catch (error) {
        writeParseError(error, "line");
      }

      continue;
    }

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
      void handleMessage(JSON.parse(payload), "content-length");
    } catch (error) {
      writeParseError(error, "content-length");
    }
  }
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  tryReadMessages();
});

process.stdin.resume();
