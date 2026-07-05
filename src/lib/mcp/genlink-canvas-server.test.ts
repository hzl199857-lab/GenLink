import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

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

  module._compile(output.outputText, filename);
};

const {
  handleGenLinkCanvasMcpRequest,
} = require("./genlink-canvas-server.ts") as typeof import("./genlink-canvas-server");

const auth = {
  userId: "user-1",
  projectId: "project-1",
  canvasId: "default",
  permissions: {
    read: true,
    write: true,
    generate: false,
  },
};

type JsonObject = Record<string, unknown>;

describe("GenLink canvas MCP server", () => {
  it("initializes with MCP tool capability", async () => {
    const response = await handleGenLinkCanvasMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    }, auth);

    assert.ok(response);
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.ok("result" in response);

    if ("result" in response) {
      const result = response.result as JsonObject;
      const serverInfo = result.serverInfo as JsonObject;

      assert.equal(result.protocolVersion, "2024-11-05");
      assert.deepEqual(result.capabilities, { tools: {} });
      assert.equal(serverInfo.name, "genlink-canvas");
    }
  });

  it("lists canvas tools", async () => {
    const response = await handleGenLinkCanvasMcpRequest({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    }, auth);

    assert.ok(response);
    assert.ok("result" in response);

    if ("result" in response) {
      const result = response.result as { tools: Array<{ name: string }> };

      assert.ok(result.tools.length >= 8);
      assert.equal(result.tools[0].name, "genlink_canvas_get_snapshot");
    }
  });

  it("returns protocol error for unknown method", async () => {
    const response = await handleGenLinkCanvasMcpRequest({
      jsonrpc: "2.0",
      id: "bad-method",
      method: "bad/method",
    }, auth);

    assert.ok(response);
    assert.ok("error" in response);

    if ("error" in response) {
      assert.equal(response.error.code, -32601);
    }
  });

  it("returns protocol error for unknown tool", async () => {
    const response = await handleGenLinkCanvasMcpRequest({
      jsonrpc: "2.0",
      id: "bad-tool",
      method: "tools/call",
      params: {
        name: "bad_tool",
        arguments: {},
      },
    }, auth);

    assert.ok(response);
    assert.ok("error" in response);

    if ("error" in response) {
      assert.equal(response.error.code, -32602);
      assert.match(response.error.message, /unknown tool/i);
    }
  });

  it("returns protocol error for invalid tool params", async () => {
    const response = await handleGenLinkCanvasMcpRequest({
      jsonrpc: "2.0",
      id: "bad-params",
      method: "tools/call",
      params: {
        name: "genlink_canvas_get_snapshot",
        arguments: null,
      },
    }, auth);

    assert.ok(response);
    assert.ok("error" in response);

    if ("error" in response) {
      assert.equal(response.error.code, -32602);
      assert.match(response.error.message, /arguments/i);
    }
  });
});
