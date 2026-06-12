import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlanfEcomWorkflow,
  createPlanfEcomWorkflowResponse,
  glWorkflowToCanvasAgentActions,
} from "./planf-ecom.ts";

test("builds a GenLink workflow-json for a PlanF e-commerce image request", () => {
  const workflow = buildPlanfEcomWorkflow({
    request: "给一款夏季女装连衣裙做淘宝主图，清爽高级，突出面料垂坠和显瘦版型",
    platform: "淘宝",
    aspectRatio: "1:1",
    extraConstraints: "不要出现夸张文字，不要廉价影楼风",
  });

  assert.equal(workflow.version, "gl-workflow-v1");
  assert.equal(workflow.source, "planf");
  assert.equal(workflow.intent.type, "ecom-image");
  assert.equal(workflow.intent.styleMode, "stylist");

  const textNode = workflow.nodes.find((node) => node.type === "text");
  const imageNode = workflow.nodes.find((node) => node.type === "image_generation");

  assert.ok(textNode);
  assert.ok(imageNode);
  assert.equal(textNode.role, "prompt_brief");
  assert.equal(imageNode.role, "ecom_image_generation");
  assert.equal(imageNode.data.aspectRatio, "1:1");
  assert.match(String(imageNode.data.prompt), /夏季女装连衣裙/);
  assert.match(String(imageNode.data.prompt), /不要廉价影楼风/);

  assert.deepEqual(workflow.edges, [
    {
      id: "edge-prompt-1-image-1",
      source: "prompt-1",
      target: "image-1",
      role: "drives_generation",
    },
  ]);
});

test("creates a deployable PlanF e-commerce workflow response payload", () => {
  const response = createPlanfEcomWorkflowResponse({
    request: "给一款护肤精华做天猫详情页卖点图，突出修护和温和",
    platform: "天猫",
    aspectRatio: "3:4",
    packageMode: "detail-page-pack",
  });

  assert.equal(response.ok, true);
  assert.equal(response.summary, "已生成 GenLink 电商图工作流");
  assert.equal(response.workflow.version, "gl-workflow-v1");
  assert.equal(response.workflow.intent.styleMode, "detail-page");
  assert.equal(response.workflow.intent.packageMode, "detail-page-pack");
  assert.equal(response.actions.filter((action) => action.type === "create_image_generation_node").length, 5);
  assert.equal(response.actions[0].type, "create_text_node");
  assert.equal(response.actions[1].type, "create_image_generation_node");
  assert.equal(response.actions.at(-1)?.type, "connect_nodes");
});

test("creates workflow nodes with canvas gateway agent metadata", () => {
  const response = createPlanfEcomWorkflowResponse({
    request: "Create a UGC lifestyle ecommerce image set for a linen dress",
    product: "linen dress",
    platform: "xiaohongshu",
    aspectRatio: "1:1",
    packageMode: "ugc-lifestyle",
    styleMode: "ugc",
  });

  for (const node of response.workflow.nodes) {
    assert.equal(node.data.from, "agent");
    assert.equal(typeof node.data.agentNodeType, "string");
    assert.notEqual(node.data.agentNodeType, "");
  }
});

test("expands the full-set preset into eight image generation nodes", () => {
  const workflow = buildPlanfEcomWorkflow({
    request: "帮我做一套电商主图（8图标准），产品是：无级调节LED灯棒",
    platform: "淘宝",
    aspectRatio: "1:1",
    packageMode: "full-set-8",
  });

  const imageNodes = workflow.nodes.filter((node) => node.type === "image_generation");

  assert.equal(imageNodes.length, 8);
  assert.equal(workflow.edges.length, 8);
  assert.match(String(imageNodes[0].data.prompt), /第1张/);
  assert.match(String(imageNodes[7].data.prompt), /第8张/);
});

test("converts a GL workflow-json into GenLink canvas agent actions", () => {
  const workflow = buildPlanfEcomWorkflow({
    request: "做一张淘宝夏季连衣裙主图",
    platform: "淘宝",
    aspectRatio: "1:1",
  });

  const actions = glWorkflowToCanvasAgentActions(workflow);

  assert.equal(actions.length, 3);
  assert.deepEqual(actions[0], {
    type: "create_text_node",
    clientActionId: "prompt-1",
    text: "做一张淘宝夏季连衣裙主图",
    title: "电商图需求",
  });
  assert.equal(actions[1].type, "create_image_generation_node");

  if (actions[1].type !== "create_image_generation_node") {
    throw new Error("expected image generation action");
  }

  assert.equal(actions[1].clientActionId, "image-1");
  assert.match(actions[1].prompt, /淘宝夏季连衣裙/);
  assert.equal(actions[1].options?.aspectRatio, "1:1");
  assert.deepEqual(actions[2], {
    type: "connect_nodes",
    sourceRef: { kind: "created", clientActionId: "prompt-1" },
    targetRef: { kind: "created", clientActionId: "image-1" },
  });
});
