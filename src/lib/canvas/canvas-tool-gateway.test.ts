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
  mapWorkflowToCanvasMutations,
  validateCanvasNodeDraft,
  validateGLWorkflowForCanvas,
} = require("./canvas-tool-gateway.ts") as typeof import("./canvas-tool-gateway");

function validWorkflow() {
  return {
    version: "gl-workflow-v1",
    source: "openclaw",
    intent: {
      type: "ecom-image",
      styleMode: "default",
      packageMode: "single",
      request: "Create one ecommerce product image.",
    },
    nodes: [
      {
        id: "prompt-1",
        type: "text",
        role: "prompt_brief",
        title: "Brief",
        data: {
          from: "agent",
          agentNodeType: "prompt_brief",
          text: "Create one ecommerce product image.",
        },
      },
      {
        id: "image-1",
        type: "image_generation",
        role: "ecom_image_generation",
        title: "Image",
        data: {
          from: "agent",
          agentNodeType: "ecom_image_generation",
          prompt: "A clean product image.",
          provider: "vibe",
          status: "idle",
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "prompt-1",
        target: "image-1",
        role: "drives_generation",
      },
    ],
    meta: {
      rulesRoot: "rules/planf-canvas",
      loadedRules: [],
    },
  };
}

describe("canvas tool gateway validation", () => {
  it("rejects unsupported node type", () => {
    const result = validateCanvasNodeDraft({
      type: "unsupported",
      position: { x: 0, y: 0 },
      data: {},
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /unsupported node type/i);
  });

  it("rejects workflow without gl-workflow-v1", () => {
    const workflow = validWorkflow();

    const result = validateGLWorkflowForCanvas({
      ...workflow,
      version: "v0",
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /gl-workflow-v1/);
  });

  it("rejects workflow nodes missing from agent marker", () => {
    const workflow = validWorkflow();
    workflow.nodes[0].data = {
      agentNodeType: "prompt_brief",
      text: "Create one ecommerce product image.",
    };

    const result = validateGLWorkflowForCanvas(workflow);

    assert.equal(result.ok, false);
    assert.match(result.error, /from: "agent"/);
  });

  it("rejects workflow nodes missing agentNodeType", () => {
    const workflow = validWorkflow();
    workflow.nodes[0].data = {
      from: "agent",
      text: "Create one ecommerce product image.",
    };

    const result = validateGLWorkflowForCanvas(workflow);

    assert.equal(result.ok, false);
    assert.match(result.error, /agentNodeType/);
  });

  it("accepts and maps a minimal valid workflow", () => {
    const workflow = validWorkflow();
    const validation = validateGLWorkflowForCanvas(workflow);

    assert.equal(validation.ok, true);

    const mapped = mapWorkflowToCanvasMutations(workflow);

    assert.deepEqual(mapped.createdNodeIds, ["prompt-1", "image-1"]);
    assert.deepEqual(mapped.createdEdgeIds, ["edge-1"]);
    assert.equal(mapped.actions.length, 3);
    assert.equal(mapped.actions[0].type, "create_text_node");
    assert.equal(mapped.actions[1].type, "create_image_generation_node");
    assert.equal(mapped.actions[2].type, "connect_nodes");
  });

  it("accepts workflow edges from existing canvas nodes", () => {
    const workflow = validWorkflow();
    workflow.nodes = [workflow.nodes[1]];
    workflow.nodes[0].id = "edit-image-1";
    workflow.nodes[0].data.sourceNodeId = "node-source-1";
    workflow.edges = [
      {
        id: "edge-existing-edit",
        source: "node-source-1",
        target: "edit-image-1",
        role: "reference",
      },
    ];

    const validation = validateGLWorkflowForCanvas(workflow);

    assert.equal(validation.ok, true);

    const mapped = mapWorkflowToCanvasMutations(workflow);

    assert.deepEqual(mapped.createdNodeIds, ["edit-image-1"]);
    assert.deepEqual(mapped.createdEdgeIds, ["edge-existing-edit"]);
    assert.deepEqual(mapped.actions[1], {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "node-source-1" },
      targetRef: { kind: "created", clientActionId: "edit-image-1" },
    });
  });

  it("accepts explicitly allowed UUID source nodes from current attachments", () => {
    const sourceNodeId = "59df6c9c-77f6-4c1a-b55f-06dac91e4a56";
    const workflow = validWorkflow();
    workflow.nodes = [workflow.nodes[1]];
    workflow.nodes[0].id = "edit-image-1";
    workflow.nodes[0].data.sourceNodeId = sourceNodeId;
    workflow.edges = [
      {
        id: `edge-${sourceNodeId}-edit-image-1`,
        source: sourceNodeId,
        target: "edit-image-1",
        role: "reference",
      },
    ];

    const validation = validateGLWorkflowForCanvas(workflow, {
      allowedExistingSourceIds: [sourceNodeId],
    });

    assert.equal(validation.ok, true);

    const mapped = mapWorkflowToCanvasMutations(workflow, {
      allowedExistingSourceIds: [sourceNodeId],
    });

    assert.deepEqual(mapped.actions[1], {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: sourceNodeId },
      targetRef: { kind: "created", clientActionId: "edit-image-1" },
    });
  });

  it("rejects UUID source nodes that were not authorized by the current task", () => {
    const workflow = validWorkflow();
    workflow.nodes = [workflow.nodes[1]];
    workflow.nodes[0].id = "edit-image-1";
    workflow.edges = [
      {
        id: "edge-unknown-edit-image-1",
        source: "59df6c9c-77f6-4c1a-b55f-06dac91e4a56",
        target: "edit-image-1",
        role: "reference",
      },
    ];

    const validation = validateGLWorkflowForCanvas(workflow);

    assert.equal(validation.ok, false);
    assert.match(validation.error, /unknown source/);
  });
});
