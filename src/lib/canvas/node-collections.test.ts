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

const { appendUniqueCanvasNodes, dedupeCanvasNodesById } = require("./node-collections.ts") as typeof import("./node-collections");

import type { CanvasNode } from "@/types/canvas";

function textNode(id: string, text = id): Extract<CanvasNode, { type: "text" }> {
  return {
    id,
    type: "text",
    position: { x: 0, y: 0 },
    data: { text, status: "idle" },
  };
}

describe("canvas node collections", () => {
  it("removes duplicate ids from loaded nodes while keeping the first node", () => {
    const nodes = dedupeCanvasNodesById([
      textNode("shared", "first"),
      textNode("shared", "second"),
      textNode("other"),
    ]);

    assert.deepEqual(nodes.map((node) => node.id), ["shared", "other"]);
    const firstNode = nodes[0];
    assert.ok(firstNode && firstNode.type === "text");
    assert.equal(firstNode.data.text, "first");
  });

  it("appends only ids that are absent from both existing and incoming nodes", () => {
    const existing = [textNode("existing")];
    const nodes = appendUniqueCanvasNodes(existing, [
      textNode("existing", "replacement"),
      textNode("new", "first"),
      textNode("new", "second"),
    ]);

    assert.deepEqual(nodes.map((node) => node.id), ["existing", "new"]);
    assert.equal(nodes[0], existing[0]);
    const appendedNode = nodes[1];
    assert.ok(appendedNode && appendedNode.type === "text");
    assert.equal(appendedNode.data.text, "first");
  });
});
