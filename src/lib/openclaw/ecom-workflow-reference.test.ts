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

const { buildPlanfEcomWorkflow } = require("../planf-ecom.ts") as typeof import("../planf-ecom");
const { bindUploadedReferencesToEcomWorkflow } = require("./ecom-workflow-reference.ts") as typeof import("./ecom-workflow-reference");
const {
  confirmPlanfEcomSession,
  createPlanfEcomWorkflowFromPlan,
  startPlanfEcomSession,
} = require("./planf-ecom-session.ts") as typeof import("./planf-ecom-session");
const { validateEcomWorkflowMatchesPlan } = require("./ecom-workflow-contract.ts") as typeof import("./ecom-workflow-contract");

describe("bindUploadedReferencesToEcomWorkflow", () => {
  it("replaces fallback prompt nodes with real reference edges", () => {
    const workflow = buildPlanfEcomWorkflow({
      request: "Create a UGC sunglasses image set",
      styleMode: "ugc",
      packageMode: "ugc-lifestyle",
      aspectRatio: "1:1",
    });
    const sourceNodeId = "node-uploaded-sunglasses";
    const bound = bindUploadedReferencesToEcomWorkflow(workflow, [sourceNodeId]);
    const imageNodes = bound.nodes.filter((node) => node.type === "image_generation");

    assert.equal(bound.nodes.some((node) => node.type === "text"), false);
    assert.equal(imageNodes.length, 6);
    assert.equal(bound.edges.length, imageNodes.length);
    assert.deepEqual(new Set(bound.edges.map((edge) => edge.source)), new Set([sourceNodeId]));
    assert.deepEqual(
      new Set(bound.edges.map((edge) => edge.target)),
      new Set(imageNodes.map((node) => node.id)),
    );

    for (const node of imageNodes) {
      assert.equal(node.data.subType, "image-image");
      assert.equal(node.data.sourceNodeId, sourceNodeId);
      assert.equal(node.data.editAction, "redraw");
    }
  });

  it("connects every uploaded reference to every image node without duplicate ids", () => {
    const workflow = buildPlanfEcomWorkflow({
      request: "Create two product images",
      packageMode: "full-set-8",
    });
    const sourceNodeIds = ["reference-a", "reference-b", "reference-a"];
    const bound = bindUploadedReferencesToEcomWorkflow(workflow, sourceNodeIds);
    const imageNodeCount = bound.nodes.filter((node) => node.type === "image_generation").length;

    assert.equal(bound.edges.length, imageNodeCount * 2);
    assert.equal(new Set(bound.edges.map((edge) => edge.id)).size, bound.edges.length);
  });

  it("materializes the lifestyle preset as six 3:4 nodes connected to the uploaded reference", () => {
    const sourceNodeId = "node-uploaded-sunglasses";
    const session = startPlanfEcomSession({
      request: "帮我做一组 UGC 生活化上身图，产品是：机能风墨镜",
      preset: "ugc-lifestyle",
      referenceImageCount: 1,
    });
    const values = {
      productName: "机能风墨镜",
      platform: "xiaohongshu",
      imageSet: "full-set",
      styleMode: "ugc",
    };
    const plan = confirmPlanfEcomSession({ session, values }).plan;
    const localWorkflow = createPlanfEcomWorkflowFromPlan({ session, values }).workflow;
    const workflow = bindUploadedReferencesToEcomWorkflow(localWorkflow, [sourceNodeId]);
    const imageNodes = workflow.nodes.filter((node) => node.type === "image_generation");

    assert.deepEqual(validateEcomWorkflowMatchesPlan({
      workflow,
      plan,
      hasConfirmedAnchor: false,
    }), { ok: true });
    assert.equal(imageNodes.length, 6);
    assert.ok(imageNodes.every((node) => node.data.aspectRatio === "3:4"));
    assert.equal(workflow.nodes.some((node) => node.type === "text"), false);
    assert.equal(workflow.edges.length, 6);
    assert.ok(workflow.edges.every((edge) => edge.source === sourceNodeId));
  });
});
