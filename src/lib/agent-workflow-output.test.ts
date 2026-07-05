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

const { materializeAgentWorkflowOutput } =
  require("./agent-workflow-output.ts") as typeof import("./agent-workflow-output");

test("converts a canonical workflow-json image node into executable canvas actions", () => {
  const result = materializeAgentWorkflowOutput({
    output: {
      summary: "已创建图片工作流，等待用户确认生成。",
      workflow: {
        name: "企鹅插画",
        autoRun: true,
        edges: [],
        nodes: [{
          id: "node_1",
          type: "rh-image",
          subType: "text-image",
          from: "agent",
          agentNodeType: "illustration",
          title: "企鹅插画",
          content: "一只可爱的企鹅站在南极冰川上，身穿红色围巾。",
          aspectRatio: "1:1",
          duration: null,
          sourceNodeId: null,
          editAction: null,
        }],
      },
    },
    provider: "fucheers",
    model: "gpt-5.4-mini",
    allowedExistingSourceIds: [],
  });

  assert.equal(result.summary, "已创建图片工作流，等待用户确认生成。");
  assert.deepEqual(result.actions, [{
    type: "create_image_generation_node",
    clientActionId: "node_1",
    prompt: "一只可爱的企鹅站在南极冰川上，身穿红色围巾。",
    options: {
      aspectRatio: "1:1",
      provider: "fucheers",
      model: "gpt-5.4-mini",
    },
  }]);
});

test("maps image-image workflow edges to existing source connections", () => {
  const result = materializeAgentWorkflowOutput({
    output: {
      summary: "已创建图片编辑工作流。",
      workflow: {
        name: "角色加帽子",
        autoRun: true,
        nodes: [{
          id: "edit_1",
          type: "rh-image",
          subType: "image-image",
          from: "agent",
          agentNodeType: "character",
          title: "戴帽子的角色",
          content: "基于参考图进行重绘，保留人物身份和构图，仅添加帽子。",
          aspectRatio: "1:1",
          duration: null,
          sourceNodeId: "node-source-1",
          editAction: "redraw",
        }],
        edges: [{
          id: "edge_1",
          source: "node-source-1",
          target: "edit_1",
        }],
      },
    },
    provider: "comfly",
    model: "gpt-5.4-mini",
    allowedExistingSourceIds: ["node-source-1"],
  });

  assert.deepEqual(result.actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "edit_1",
      prompt: "基于参考图进行重绘，保留人物身份和构图，仅添加帽子。",
      options: {
        aspectRatio: "1:1",
        provider: "comfly",
        model: "gpt-5.4-mini",
      },
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "node-source-1" },
      targetRef: { kind: "created", clientActionId: "edit_1" },
    },
  ]);
});

test("rejects workflow-json that violates engineer delivery validation", () => {
  assert.throws(
    () => materializeAgentWorkflowOutput({
      output: {
        summary: "bad",
        workflow: {
          name: "错误工作流",
          autoRun: true,
          edges: [],
          nodes: [{
            id: "bad_1",
            type: "rh-image",
            subType: "image-image",
            from: "agent",
            agentNodeType: "illustration",
            title: "错误节点",
            content: "缺少 editAction。",
            aspectRatio: "1:1",
            duration: null,
            sourceNodeId: null,
            editAction: null,
          }],
        },
      },
      allowedExistingSourceIds: [],
    }),
    /image-image must include editAction/,
  );
});

test("rejects summaries that claim generation has already completed", () => {
  assert.throws(
    () => materializeAgentWorkflowOutput({
      output: {
        summary: "图片已生成完成。",
        workflow: {
          name: "错误声明",
          autoRun: true,
          edges: [],
          nodes: [{
            id: "bad_claim",
            type: "rh-image",
            subType: "text-image",
            from: "agent",
            agentNodeType: "illustration",
            title: "错误声明",
            content: "一张干净的产品摄影图。",
            aspectRatio: "1:1",
            duration: null,
            sourceNodeId: null,
            editAction: null,
          }],
        },
      },
      allowedExistingSourceIds: [],
    }),
    /must not claim generation/,
  );
});

test("rejects image-image sourceNodeId that does not match an incoming edge", () => {
  assert.throws(
    () => materializeAgentWorkflowOutput({
      output: {
        summary: "已创建图片编辑工作流。",
        workflow: {
          name: "错误源节点",
          autoRun: true,
          nodes: [{
            id: "edit_bad_source",
            type: "rh-image",
            subType: "image-image",
            from: "agent",
            agentNodeType: "illustration",
            title: "错误源节点",
            content: "保留参考图主体，仅调整背景。",
            aspectRatio: "1:1",
            duration: null,
            sourceNodeId: "node-source-1",
            editAction: "redraw",
          }],
          edges: [{
            id: "edge_wrong",
            source: "node-source-2",
            target: "edit_bad_source",
          }],
        },
      },
      allowedExistingSourceIds: ["node-source-1", "node-source-2"],
    }),
    /sourceNodeId must match/,
  );
});

test("rejects character anchor nodes that are not canonical boards", () => {
  assert.throws(
    () => materializeAgentWorkflowOutput({
      output: {
        summary: "已创建角色工作流。",
        workflow: {
          name: "角色图",
          autoRun: true,
          edges: [],
          nodes: [{
            id: "character_bad",
            type: "rh-image",
            subType: "text-image",
            from: "agent",
            agentNodeType: "character",
            title: "角色图",
            content: "一个日系动漫少女半身肖像，背景是校园。",
            aspectRatio: "1:1",
            duration: null,
            sourceNodeId: null,
            editAction: null,
          }],
        },
      },
      allowedExistingSourceIds: [],
    }),
    /character anchor must include/,
  );
});
