import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  getAgentCanvasNodeChips,
} = require("./agent-canvas-node-chips.ts") as typeof import("./agent-canvas-node-chips");

test("adds the created canvas node id to text node chips", () => {
  const chips = getAgentCanvasNodeChips({
    id: "message-1",
    role: "agent",
    type: "execution_plan",
    summary: "已创建",
    userPrompt: "一只小狗在草地玩耍",
    plan: {
      title: "OpenClaw 规则库工作流",
      brief: [],
      steps: [],
    },
    actions: [
      {
        type: "create_text_node",
        clientActionId: "text-action-1",
        title: "OpenClaw 规则库工作流",
        text: "扩写后的提示词",
      },
    ],
    nodeIdMap: {
      "text-action-1": "canvas-node-1",
    },
    attachments: [],
    status: "executed",
    createdAt: "2026-07-02T00:00:00.000Z",
  });

  assert.deepEqual(chips, [
    {
      id: "message-1-text-action-1-0",
      nodeId: "canvas-node-1",
      title: "一只小狗在草地玩耍",
      typeLabel: "文本节点",
    },
  ]);
});

test("falls back to image generation node ids for old image chips", () => {
  const chips = getAgentCanvasNodeChips({
    id: "message-1",
    role: "agent",
    type: "execution_plan",
    summary: "已创建",
    userPrompt: "一只小狗在草地玩耍",
    plan: {
      title: "OpenClaw 规则库工作流",
      brief: [],
      steps: [],
    },
    actions: [
      {
        type: "create_image_generation_node",
        clientActionId: "image-action-1",
        prompt: "小狗在草地玩耍",
      },
    ],
    imageGenerationNodeIds: ["image-node-1"],
    attachments: [],
    status: "executed",
    createdAt: "2026-07-02T00:00:00.000Z",
  });

  assert.equal(chips[0]?.nodeId, "image-node-1");
});
