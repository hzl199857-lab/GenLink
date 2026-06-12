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
  GENLINK_CANVAS_TOOL_NAMES,
  listGenLinkCanvasTools,
} = require("./genlink-canvas-tools.ts") as typeof import("./genlink-canvas-tools");

describe("GenLink canvas MCP tools", () => {
  it("lists every genlink_canvas tool", () => {
    const tools = listGenLinkCanvasTools();
    const names = tools.map((tool) => tool.name);

    assert.deepEqual(names, GENLINK_CANVAS_TOOL_NAMES);
  });

  it("defines object input schemas for every tool", () => {
    for (const tool of listGenLinkCanvasTools()) {
      assert.equal(tool.inputSchema.type, "object", tool.name);
      assert.ok(tool.description.trim(), tool.name);
    }
  });
});
