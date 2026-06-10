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
  confirmPlanfEcomSession,
  createPlanfEcomWorkflowFromAnchor,
  createPlanfEcomWorkflowFromPlan,
  startPlanfEcomSession,
} = require("./planf-ecom-session.ts") as typeof import("./planf-ecom-session");

test("starts an ecomImageTrack collecting session", () => {
  const session = startPlanfEcomSession({
    request: "帮我做一套电商主图（8图标准），产品是：LED 无极调节灯棒",
    preset: "full-set-8",
    referenceImageCount: 1,
  });

  assert.equal(session.route, "ecomImageTrack");
  assert.equal(session.phase, "collecting");
  assert.equal(session.agent.title, "电商主图设计师");
  assert.match(session.stateHeader, /route=ecomImageTrack/);
  assert.equal(session.fields[0].id, "productName");
  assert.equal(session.fields[0].value, "LED 无极调节灯棒");
  assert.equal(session.fields.find((field) => field.id === "platform")?.value, "taobao");
  assert.equal(session.fields.find((field) => field.id === "category")?.value, "home_living");
  assert.equal(session.fields.find((field) => field.id === "productAsset")?.type, "upload");
  assert.equal(session.fields.find((field) => field.id === "sellingPoints")?.type, "text");
  assert.ok(session.thinkingSteps.some((step) => step.detail.includes("8 个差异化图片节点")));
  assert.ok(session.thinkingSteps.some((step) => step.detail.includes("1 张参考图")));
});

test("returns preset-specific agent triage and field defaults", () => {
  const amazon = startPlanfEcomSession({
    request: "帮我做一套亚马逊主图集，产品是：旅行收纳包",
    preset: "amazon-adapter",
  });
  const ugc = startPlanfEcomSession({
    request: "帮我做一组 UGC 生活化上身图，产品是：防晒帽",
    preset: "ugc-lifestyle",
    referenceImageCount: 2,
  });
  const stylist = startPlanfEcomSession({
    request: "帮我做一组高转化模特图，产品是：丝巾",
    preset: "editorial-stylist",
  });

  assert.notEqual(amazon.agent.title, ugc.agent.title);
  assert.notEqual(ugc.message, stylist.message);
  assert.equal(amazon.fields.find((field) => field.id === "platform")?.value, "amazon");
  assert.equal(ugc.fields.find((field) => field.id === "platform")?.value, "xiaohongshu");
  assert.equal(ugc.fields.find((field) => field.id === "ugcConstructPriority")?.type, "multi-select");
  assert.equal(stylist.fields.find((field) => field.id === "styleMode")?.value, "stylist");
  assert.equal(stylist.fields.find((field) => field.id === "archetypeCount")?.type, "select");
  assert.ok(amazon.thinkingSteps.some((step) => step.detail.includes("amazonMode")));
  assert.ok(ugc.thinkingSteps.some((step) => step.detail.includes("ugc-style.md")));
  assert.ok(stylist.thinkingSteps.some((step) => step.detail.includes("fashion-stylist.md")));
  assert.ok(ugc.thinkingSteps.some((step) => step.detail.includes("2 张参考图")));
});

test("confirms an ecomImageTrack session into a full-set workflow", () => {
  const session = startPlanfEcomSession({
    request: "帮我做一套电商主图（8图标准），产品是：LED 无极调节灯棒",
    preset: "full-set-8",
    referenceImageCount: 1,
  });
  const result = confirmPlanfEcomSession({
    session,
    values: {
      productName: "LED 无极调节灯棒",
      category: "home_living",
      platform: "taobao",
      sellingPointsText: "无极调光调色 / 磁吸免安装 / 人体感应控制",
      styleMode: "default",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.protocol.name, "creative-doc");
  assert.equal(result.plan.type, "ecom-image-plan");
  assert.equal(result.plan.checkpoint, true);
  assert.equal(result.plan.meta.imageSet, "full-set");
  assert.equal(result.plan.meta.totalImages, 8);
  assert.equal(result.plan.imageSlots.length, 8);
  assert.equal(result.plan.options[0].id, "A");
  assert.equal("workflow" in result, false);
  assert.equal("actions" in result, false);
});

test("creates only a white-bg anchor workflow first when no product reference exists", () => {
  const session = startPlanfEcomSession({
    request: "帮我做一套电商主图（8图标准），产品是：SONY便携式音箱",
    preset: "full-set-8",
    referenceImageCount: 0,
  });
  const values = {
    productName: "SONY便携式音箱",
    category: "digital3c",
    platform: "taobao",
    sellingPointsText: "便携轻巧 / 防水防尘 / 长续航",
    styleMode: "default",
  };
  const plan = confirmPlanfEcomSession({ session, values });
  const workflow = createPlanfEcomWorkflowFromPlan({ session, values });

  assert.equal(plan.plan.meta.anchorMode, "white-bg-first");
  assert.equal(plan.plan.meta.deliveryRounds, 2);
  assert.equal(workflow.workflow.intent.packageMode, "single");
  assert.equal(
    workflow.actions.filter((action) => action.type === "create_image_generation_node").length,
    1,
  );
  assert.match(workflow.workflow.nodes[1].data.prompt as string, /主锚白底/);
});

test("fans out remaining full-set images from the confirmed white-bg anchor", () => {
  const session = startPlanfEcomSession({
    request: "Create a full 8-image ecommerce set, product: SONY portable speaker",
    preset: "full-set-8",
    referenceImageCount: 0,
  });
  const values = {
    productName: "SONY portable speaker",
    category: "digital3c",
    platform: "taobao",
    sellingPointsText: "portable / waterproof / long battery life",
    imageSet: "full-set",
    styleMode: "default",
  };
  const anchor = {
    nodeId: "node-anchor-white-bg",
    outputUrl: "https://assets.example.com/sony-speaker-anchor.png",
  };
  const workflow = createPlanfEcomWorkflowFromAnchor({ session, values, anchor });
  const imageActions = workflow.actions.filter((action) => action.type === "create_image_generation_node");
  const anchorConnections = workflow.actions.filter((action) => (
    action.type === "connect_nodes" &&
    action.sourceRef.kind === "existing" &&
    action.sourceRef.nodeId === anchor.nodeId
  ));

  assert.equal(workflow.workflow.intent.packageMode, "full-set-8");
  assert.equal(imageActions.length, 7);
  assert.equal(imageActions.some((action) => action.clientActionId === "image-1"), false);
  assert.equal(anchorConnections.length, 7);
  assert.ok(imageActions.every((action) => action.prompt.includes(anchor.outputUrl)));
  assert.ok(anchorConnections.every((action) => (
    action.targetRef.kind === "created" &&
    imageActions.some((imageAction) => imageAction.clientActionId === action.targetRef.clientActionId)
  )));
});
