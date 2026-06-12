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
  buildOpenClawEcomConfirmMessage,
  buildOpenClawEcomWorkflowMessage,
  parseOpenClawEcomCreativeDoc,
  parseOpenClawEcomWorkflow,
} = require("./ecom-protocol.ts") as typeof import("./ecom-protocol");

const session = {
  sessionId: "session-1",
  route: "ecomImageTrack",
  phase: "collecting",
  preset: "full-set-8",
  request: "帮我做一套电商主图，产品是便携式音响",
  referenceImageCount: 1,
  stateHeader: "state",
  protocol: { name: "form-fields", trigger: "trigger", responsePath: "path" },
  agent: { title: "电商主图设计师", subtitle: "E-Commerce Image Director" },
  message: "message",
  thinkingSteps: [],
  fields: [],
} as const;

const values = {
  productName: "便携式音响",
  category: "digital3c",
  platform: "taobao",
  sellingPointsText: "便携低音 / 防水防尘",
  imageSet: "full-set",
  styleMode: "default",
};

test("builds OpenClaw confirm message for ecom creative-doc stage", () => {
  const message = buildOpenClawEcomConfirmMessage({ session, values });

  assert.match(message, /creative-doc/);
  assert.match(message, /ecom-image-plan/);
  assert.match(message, /Step 2/);
  assert.match(message, /便携式音响/);
  assert.match(message, /full-set-8/);
});

test("parses OpenClaw creative-doc into the ecom plan shape", () => {
  const plan = {
    type: "ecom-image-plan",
    title: "便携式音响 电商主图集编排",
    domain: "ecom-image",
    phase: 1,
    totalPhases: 2,
    checkpoint: true,
    checkpointPrompt: "编排已出，下一步？",
    meta: {
      productName: "便携式音响",
      category: "数码 3C",
      platform: "淘宝/天猫",
      imageSet: "full-set",
      anchorMode: "user-upload",
      amazonMode: false,
      mainRatio: "1:1",
      totalImages: 8,
      deliveryRounds: 1,
      styleMode: "default",
      extraConstraints: "便携低音 / 防水防尘",
    },
    imageSlots: [
      {
        index: 1,
        slot: "白底图",
        round: 1,
        subType: "image-image",
        anchorSource: "上传节点",
        ratio: "1:1",
        intent: "纯白背景商品全貌",
      },
    ],
    options: [
      { id: "A", label: "确认编排，开始生成" },
      { id: "B", label: "调整某张方向" },
    ],
  };
  const parsed = parseOpenClawEcomCreativeDoc([
    "```creative-doc",
    JSON.stringify(plan),
    "```",
  ].join("\n"));

  assert.deepEqual(parsed.plan, plan);
  assert.equal(parsed.protocol.type, "ecom-image-plan");
  assert.equal(parsed.values.productName, values.productName);
});

test("normalizes ecommerce creative-doc domain aliases", () => {
  const plan = {
    type: "ecom-image-plan",
    title: "portable speaker plan",
    domain: "ecommerce",
    phase: 1,
    totalPhases: 2,
    checkpoint: true,
    checkpointPrompt: "confirm?",
    meta: {
      productName: "portable speaker",
      category: "digital3c",
      platform: "taobao",
      imageSet: "full-set",
      anchorMode: "user-upload",
      amazonMode: false,
      mainRatio: "1:1",
      totalImages: 8,
      deliveryRounds: 1,
      styleMode: "default",
      extraConstraints: "",
    },
    imageSlots: [],
    options: [],
  };
  const parsed = parseOpenClawEcomCreativeDoc(JSON.stringify(plan));

  assert.equal(parsed.plan.domain, "ecom-image");
});

test("fills missing creative-doc domain for ecom plan types", () => {
  const plan = {
    type: "ecom-image-plan",
    title: "portable speaker plan",
    phase: 1,
    totalPhases: 2,
    checkpoint: true,
    checkpointPrompt: "confirm?",
    meta: {
      productName: "portable speaker",
      category: "digital3c",
      platform: "taobao",
      imageSet: "full-set",
      anchorMode: "user-upload",
      amazonMode: false,
      mainRatio: "1:1",
      totalImages: 8,
      deliveryRounds: 1,
      styleMode: "default",
      extraConstraints: "",
    },
    imageSlots: [],
    options: [],
  };
  const parsed = parseOpenClawEcomCreativeDoc(JSON.stringify(plan));

  assert.equal(parsed.plan.domain, "ecom-image");
});

test("normalizes OpenClaw image slot field variants", () => {
  const plan = {
    type: "ecom-image-plan",
    title: "便携式音响电商图编排",
    domain: "ecom-image",
    phase: 1,
    totalPhases: 2,
    checkpoint: true,
    checkpointPrompt: "下一步？",
    meta: {
      productName: "便携式音响",
      category: "consumer-electronics",
      platform: "amazon",
      imageSet: "full-set",
      anchorMode: "user-upload",
      amazonMode: true,
      mainRatio: "1:1",
      totalImages: 8,
      deliveryRounds: [{ round: 1 }, { round: 2 }],
      styleMode: "default",
      extraConstraints: "",
    },
    imageSlots: [
      {
        "图位": "白底主图",
        "轮次": { round: 1 },
        "锚点": "product-reference-anchored",
        "核心意图": "展示产品全貌",
        subType: "image-image",
      },
      {
        title: "场景图",
        round: [{ round: 2 }],
        anchor: "白底主图",
        description: "桌面使用场景",
      },
    ],
    options: [{ id: "A", label: "确认生成" }],
  };
  const parsed = parseOpenClawEcomCreativeDoc(JSON.stringify(plan));

  assert.equal(parsed.plan.imageSlots[0].index, 1);
  assert.equal(parsed.plan.imageSlots[0].slot, "白底主图");
  assert.equal(parsed.plan.imageSlots[0].round, 1);
  assert.equal(parsed.plan.imageSlots[0].anchorSource, "product-reference-anchored");
  assert.equal(parsed.plan.imageSlots[1].index, 2);
  assert.equal(parsed.plan.imageSlots[1].slot, "场景图");
  assert.equal(parsed.plan.imageSlots[1].round, 2);
});

test("builds OpenClaw workflow message for ecom workflow-json stage", () => {
  const message = buildOpenClawEcomWorkflowMessage({ session, values });

  assert.match(message, /workflow-json/);
  assert.match(message, /Prompt Pack/);
  assert.match(message, /from/);
  assert.match(message, /agentNodeType/);
  assert.match(message, /Every rh-image node must include aspectRatio/);
  assert.match(message, /OpenClaw CLI runtime/);
  assert.match(message, /TOOLS\.md 的 fallback 路径/);
  assert.match(message, /skills\/_shared\/self-check\.md/);
  assert.match(message, /skills\/engineer\/validation\.md/);
  assert.match(message, /Delivery Validation/);
  assert.match(message, /只输出一个 ```workflow-json fence/);
  assert.doesNotMatch(message, /优先输出一个 <tool_call> create_workflow/);
  assert.doesNotMatch(message, /gl-workflow-v1/);
});

test("builds OpenClaw workflow repair message as RH workflow-json validation notice", () => {
  const message = buildOpenClawEcomWorkflowMessage({
    session,
    values,
    previousText: "我先按你的确认生成 workflow。",
  });

  assert.match(message, /\[SYSTEM NOTICE\]/);
  assert.match(message, /previous workflow-json failed validation/);
  assert.match(message, /OpenClaw CLI runtime has no client tool bridge/);
  assert.match(message, /exactly one ```workflow-json fence/);
  assert.doesNotMatch(message, /Output exactly one <tool_call> create_workflow block/);
  assert.match(message, /RH canonical schema/);
});

test("builds OpenClaw workflow repair message with GenLink validation error", () => {
  const message = buildOpenClawEcomWorkflowMessage({
    session,
    values,
    previousText: "```workflow-json\n{\"name\":\"bad\",\"nodes\":[],\"edges\":[]}\n```",
    previousValidationError: "workflow edge edge-1 has unknown source 59df6c9c",
    referenceNodeMap: [
      {
        attachmentId: "attachment-1",
        sourceNodeId: "59df6c9c-77f6-4c1a-b55f-06dac91e4a56",
      },
    ],
  });

  assert.match(message, /failed GenLink validation/);
  assert.match(message, /unknown source 59df6c9c/);
  assert.match(message, /Every edge\.source/);
  assert.match(message, /referenceNodeMap/);
});

test("parses RH create_workflow tool call into GenLink GL workflow", () => {
  const rhWorkflow = {
    name: "智能扫地机器人主图生成",
    nodes: [
      {
        id: "node_ecom_example_1",
        type: "rh-image",
        subType: "text-image",
        from: "agent",
        agentNodeType: "prop",
        title: "扫地机-白底证件照",
        content: "一台珍珠白色圆形智能扫地机器人，居中俯视视角，外壳亚光质感，顶部有拉丝金属触控面板，正面有黑色红外避障窗口。背景为极简纯白色，画面干净明亮，产品占比60%，商业摄影质感，8K分辨率",
        aspectRatio: "1:1",
      },
    ],
    edges: [],
    autoRun: true,
  };
  const parsed = parseOpenClawEcomWorkflow([
    '<tool_call>{"name":"create_workflow","arguments":{"workflow":',
    JSON.stringify(rhWorkflow),
    '}}</tool_call>',
  ].join(""));

  assert.equal(parsed.version, "gl-workflow-v1");
  assert.equal(parsed.source, "openclaw");
  assert.equal(parsed.intent.request, "智能扫地机器人主图生成");
  assert.equal(parsed.nodes.length, 1);
  assert.deepEqual(parsed.nodes[0], {
    id: "node_ecom_example_1",
    type: "image_generation",
    role: "prop",
    title: "扫地机-白底证件照",
    data: {
      from: "agent",
      agentNodeType: "prop",
      prompt: rhWorkflow.nodes[0].content,
      effectivePromptOverride: rhWorkflow.nodes[0].content,
      aspectRatio: "1:1",
      rhType: "rh-image",
      subType: "text-image",
      autoRun: true,
    },
  });
  assert.deepEqual(parsed.edges, []);
});

test("parses RH workflow-json fence into GenLink GL workflow", () => {
  const rhWorkflow = {
    name: "图片局部编辑",
    nodes: [
      {
        id: "edit_1",
        type: "rh-image",
        subType: "image-image",
        from: "agent",
        agentNodeType: "output",
        title: "去掉人物帽子",
        content: "保留人物身份、五官、发型、服装轮廓、构图、背景和画风，只去掉图中人物头上的帽子，补全自然头发与头顶光影。",
        aspectRatio: "1:1",
        editAction: "redraw",
        sourceNodeId: "node-source-1",
      },
    ],
    edges: [
      { source: "node-source-1", target: "edit_1" },
    ],
    autoRun: true,
  };
  const parsed = parseOpenClawEcomWorkflow([
    "```workflow-json",
    JSON.stringify(rhWorkflow),
    "```",
  ].join("\n"));

  assert.equal(parsed.nodes[0].type, "image_generation");
  assert.equal(parsed.nodes[0].data.subType, "image-image");
  assert.equal(parsed.nodes[0].data.editAction, "redraw");
  assert.equal(parsed.nodes[0].data.sourceNodeId, "node-source-1");
  assert.deepEqual(parsed.edges, [
    {
      id: "edge-node-source-1-edit_1",
      source: "node-source-1",
      target: "edit_1",
      role: "reference",
    },
  ]);
});

test("defaults missing RH image workflow aspectRatio to the rules-library image default", () => {
  const rhWorkflow = {
    name: "普通商品主图",
    nodes: [
      {
        id: "image_1",
        type: "rh-image",
        subType: "text-image",
        from: "agent",
        agentNodeType: "prop",
        title: "商品主图",
        content: "一张干净的商品主图，白色背景，主体居中，商业摄影质感",
      },
    ],
    edges: [],
    autoRun: true,
  };
  const parsed = parseOpenClawEcomWorkflow([
    "```workflow-json",
    JSON.stringify(rhWorkflow),
    "```",
  ].join("\n"));

  assert.equal(parsed.nodes[0].data.aspectRatio, "1:1");
});

test("synthesizes missing RH workflow edges from image sourceNodeId", () => {
  const rhWorkflow = {
    name: "portable speaker ecommerce set",
    nodes: [
      {
        id: "ecom_1",
        type: "rh-image",
        subType: "image-image",
        from: "agent",
        agentNodeType: "product",
        title: "white background",
        content: "white background product image prompt",
        sourceNodeId: "node-source-1",
        editAction: "redraw",
      },
      {
        id: "ecom_2",
        type: "rh-image",
        subType: "image-image",
        from: "agent",
        agentNodeType: "scene",
        title: "lifestyle scene",
        content: "lifestyle product scene prompt",
        sourceNodeId: "node-source-1",
        editAction: "redraw",
      },
    ],
    edges: [],
    autoRun: true,
  };
  const parsed = parseOpenClawEcomWorkflow([
    "```workflow-json",
    JSON.stringify(rhWorkflow),
    "```",
  ].join("\n"));

  assert.deepEqual(parsed.edges, [
    {
      id: "edge-node-source-1-ecom_1",
      source: "node-source-1",
      target: "ecom_1",
      role: "reference",
    },
    {
      id: "edge-node-source-1-ecom_2",
      source: "node-source-1",
      target: "ecom_2",
      role: "reference",
    },
  ]);
});

test("builds workflow prompt with rules-library handoff and user-upload fanout rules", () => {
  const message = buildOpenClawEcomWorkflowMessage({
    session,
    values,
    referenceNodeMap: [
      {
        attachmentId: "attachment-1",
        name: "product.png",
        sourceNodeId: "node-real-product",
      },
    ],
    plan: {
      type: "ecom-image-plan",
      title: "portable speaker ecommerce set",
      domain: "ecom-image",
      phase: 1,
      totalPhases: 2,
      checkpoint: true,
      checkpointPrompt: "confirm",
      meta: {
        productName: "portable speaker",
        category: "digital3c",
        platform: "taobao",
        imageSet: "full-set",
        anchorMode: "user-upload",
        amazonMode: false,
        mainRatio: "1:1",
        totalImages: 8,
        deliveryRounds: 1,
        styleMode: "default",
      },
      imageSlots: [],
      options: [],
    },
  });

  assert.match(message, /Prompt Pack/);
  assert.doesNotMatch(message, /每个节点 content 只能写该节点对应图位的完整 Prompt Pack/);
  assert.doesNotMatch(message, /不要压缩/);
  assert.match(message, /user-upload/);
  assert.match(message, /referenceNodeMap/);
  assert.match(message, /node-real-product/);
  assert.match(message, /不得虚构 sourceNodeId/);
  assert.match(message, /每个图片节点都必须写 sourceNodeId/);
  assert.match(message, /edges 必须从该上传源图分别连接到每个图片节点/);
});

test("rejects RH workflow nodes missing agentNodeType", () => {
  const rhWorkflow = {
    name: "错误工作流",
    nodes: [
      {
        id: "node_1",
        type: "rh-image",
        subType: "text-image",
        from: "agent",
        title: "示例图",
        content: "一张图",
      },
    ],
    edges: [],
    autoRun: true,
  };

  assert.throws(
    () => parseOpenClawEcomWorkflow(JSON.stringify(rhWorkflow)),
    /must include agentNodeType/,
  );
});
