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

  module._compile(output.outputText, filename);
};

const {
  buildOpenClawAgentMessage,
  createAgentResultFromOpenClawText,
} = require("./agent-workflow.ts") as typeof import("./agent-workflow");

test("builds a generic OpenClaw message for non-ecommerce image edits", () => {
  const message = buildOpenClawAgentMessage({
    request: "把图中人物帽子去掉",
    referenceImageCount: 1,
    canvasSummary: { nodeCount: 3, edgeCount: 1, groupCount: 0 },
    attachments: [{
      id: "att-1",
      name: "人物图",
      sourceNodeId: "node-upload-1",
      imageUrl: "data:image/jpeg;base64,THIS_SHOULD_NOT_BE_SENT",
    }],
  });

  assert.match(message, /\.\/AGENTS\.md/);
  assert.match(message, /BOOTSTRAP\.md/);
  assert.match(message, /普通图片编辑/);
  assert.match(message, /image-image/);
  assert.match(message, /editAction:redraw/);
  assert.match(message, /不要进入 ecom-image/);
  assert.match(message, /workflow-json/);
  assert.match(message, /Every rh-image node must include aspectRatio/);
  assert.match(message, /phasePolicyDecision/);
  assert.match(message, /referenceNodeMap/);
  assert.match(message, /attachmentId/);
  assert.match(message, /never invent node ids/);
  assert.match(message, /OpenClaw CLI runtime/);
  assert.match(message, /TOOLS\.md 的 fallback 路径/);
  assert.match(message, /skills\/_shared\/self-check\.md/);
  assert.match(message, /skills\/engineer\/validation\.md/);
  assert.match(message, /Delivery Validation/);
  assert.match(message, /只输出一个 ```workflow-json fence/);
  assert.doesNotMatch(message, /优先输出一个 <tool_call> create_workflow/);
  assert.match(message, /node-upload-1/);
  assert.match(message, /把图中人物帽子去掉/);
  assert.doesNotMatch(message, /THIS_SHOULD_NOT_BE_SENT/);
  assert.doesNotMatch(message, /data:image/);
});

test("converts OpenClaw tool_call workflow into image edit actions", () => {
  const text = [
    "```thinking",
    "【State】phase=fast-track | nextAction=create-workflow",
    "```",
    '<tool_call>{"name":"create_workflow","arguments":{"workflow":{"nodes":[',
    '{"id":"edit-prompt","type":"text","role":"prompt","title":"编辑提示","data":{"content":"移除人物帽子，保持人物身份、发型轮廓、背景、光线和构图自然一致。","from":"agent","agentNodeType":"prompt"}},',
    '{"id":"edit-image","type":"image_generation","role":"image-edit","title":"去掉帽子","data":{"prompt":"移除人物帽子，保持人物身份、发型轮廓、背景、光线和构图自然一致。","subType":"image-image","editAction":"redraw","from":"agent","agentNodeType":"image-edit"}}',
    '],"edges":[{"id":"edge-source-edit","source":"node-upload-1","target":"edit-image","role":"reference"}]}}}</tool_call>',
  ].join("");

  const result = createAgentResultFromOpenClawText({
    request: "把图中人物帽子去掉",
    text,
    model: "genlink_text/gpt-5.5",
  });

  assert.equal(result.meta.model, "openclaw");
  assert.equal(result.meta.usedModel, true);
  assert.equal(result.actions.length, 2);
  assert.deepEqual(result.actions[0], {
    type: "create_image_generation_node",
    clientActionId: "edit-image",
    prompt: "移除人物帽子，保持人物身份、发型轮廓、背景、光线和构图自然一致。",
    options: {
      aspectRatio: "1:1",
    },
  });
  assert.deepEqual(result.actions[1], {
    type: "connect_nodes",
    sourceRef: { kind: "existing", nodeId: "node-upload-1" },
    targetRef: { kind: "created", clientActionId: "edit-image" },
  });
  assert.match(result.plan.title, /OpenClaw/);
  assert.match(result.plan.steps.join("\n"), /创建 1 个图片生成节点/);
});

test("converts RH create_workflow nodes into generic image edit actions", () => {
  const text = [
    '<tool_call>{"name":"create_workflow","arguments":{"name":"去掉汽车","nodes":[',
    '{"id":"edit-image","type":"rh-image","subType":"image-image","from":"agent","agentNodeType":"output","title":"去掉图中的汽车","content":"保留沙漠场景、光影、构图和画面风格，只去掉图中的汽车，并自然补全被遮挡的沙地纹理。","editAction":"redraw","sourceNodeId":"node-upload-1"}',
    '],"edges":[{"source":"node-upload-1","target":"edit-image"}],"autoRun":true}}</tool_call>',
  ].join("");

  const result = createAgentResultFromOpenClawText({
    request: "去掉图中的汽车",
    text,
    model: "genlink_text/gpt-5.5",
  });

  assert.deepEqual(result.actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "edit-image",
      prompt: "保留沙漠场景、光影、构图和画面风格，只去掉图中的汽车，并自然补全被遮挡的沙地纹理。",
      options: {
        aspectRatio: "1:1",
      },
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "node-upload-1" },
      targetRef: { kind: "created", clientActionId: "edit-image" },
    },
  ]);
});

test("converts workflow-json fallback into text-to-image actions", () => {
  const text = [
    "```workflow-json",
    JSON.stringify({
      nodes: [
        {
          id: "prompt-1",
          type: "text",
          role: "prompt",
          title: "Prompt",
          data: {
            content: "一张雨夜霓虹街道的电影感摄影，湿润路面反射灯光，主体清晰。",
          },
        },
        {
          id: "image-1",
          type: "image_generation",
          role: "text-image",
          title: "雨夜街道",
          data: {
            prompt: "一张雨夜霓虹街道的电影感摄影，湿润路面反射灯光，主体清晰。",
          },
        },
      ],
      edges: [
        { id: "edge-1", source: "prompt-1", target: "image-1", role: "prompt" },
      ],
    }),
    "```",
  ].join("\n");

  const result = createAgentResultFromOpenClawText({
    request: "生成雨夜街道",
    text,
    model: "genlink_text/gpt-5.5",
  });

  assert.deepEqual(result.actions, [
    {
      type: "create_text_node",
      clientActionId: "prompt-1",
      title: "Prompt",
      text: "一张雨夜霓虹街道的电影感摄影，湿润路面反射灯光，主体清晰。",
    },
    {
      type: "create_image_generation_node",
      clientActionId: "image-1",
      prompt: "一张雨夜霓虹街道的电影感摄影，湿润路面反射灯光，主体清晰。",
      options: {
        aspectRatio: "1:1",
      },
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "created", clientActionId: "prompt-1" },
      targetRef: { kind: "created", clientActionId: "image-1" },
    },
  ]);
});

test("defaults missing image workflow aspectRatio to the rules-library image default", () => {
  const text = [
    "```workflow-json",
    JSON.stringify({
      nodes: [
        {
          id: "image-1",
          type: "image_generation",
          role: "text-image",
          title: "商品主图",
          data: {
            prompt: "一张干净的商品主图，白色背景，主体居中，商业摄影质感",
          },
        },
      ],
      edges: [],
    }),
    "```",
  ].join("\n");

  const result = createAgentResultFromOpenClawText({
    request: "生成商品主图",
    text,
    model: "genlink_text/gpt-5.5",
  });

  assert.deepEqual(result.actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "image-1",
      prompt: "一张干净的商品主图，白色背景，主体居中，商业摄影质感",
      options: {
        aspectRatio: "1:1",
      },
    },
  ]);
});
