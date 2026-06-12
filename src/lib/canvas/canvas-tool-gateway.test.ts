import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import type { CanvasNode } from "@/types/canvas";

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
  buildCanvasRuntimeSnapshot,
  materializeWorkflowForCanvas,
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

  it("materializes workflow into concrete canvas nodes and edges with real id mappings", () => {
    const workflow = validWorkflow();
    const materialized = materializeWorkflowForCanvas(workflow, {
      startPosition: { x: 100, y: 200 },
      createNodeId: (logicalId) => `real-${logicalId}`,
      createEdgeId: (logicalId) => `real-${logicalId}`,
    });

    assert.deepEqual(materialized.nodeIdMap, {
      "prompt-1": "real-prompt-1",
      "image-1": "real-image-1",
    });
    assert.deepEqual(materialized.edgeIdMap, {
      "edge-1": "real-edge-1",
    });
    assert.deepEqual(materialized.createdNodeIds, ["real-prompt-1", "real-image-1"]);
    assert.deepEqual(materialized.createdEdgeIds, ["real-edge-1"]);
    assert.equal(materialized.nodes.length, 2);
    assert.equal(materialized.edges.length, 1);
    assert.equal(materialized.nodes[0].id, "real-prompt-1");
    assert.equal(materialized.nodes[0].type, "text");
    assert.deepEqual(materialized.nodes[0].position, { x: -580, y: 200 });
    assert.equal(materialized.nodes[1].id, "real-image-1");
    assert.equal(materialized.nodes[1].type, "image_generation");
    assert.deepEqual(materialized.nodes[1].position, { x: 100, y: 200 });
    assert.equal(materialized.edges[0].id, "real-edge-1");
    assert.equal(materialized.edges[0].source, "real-prompt-1");
    assert.equal(materialized.edges[0].target, "real-image-1");
    assert.equal(materialized.nodes[1].type, "image_generation");
    assert.equal(materialized.nodes[1].data.agentLogicalId, "image-1");
    assert.equal(materialized.nodes[1].data.agentNodeType, "ecom_image_generation");
    assert.equal(materialized.nodes[1].data.generationStatus, "pending");
  });

  it("builds a runtime snapshot with finished and failed generation status", () => {
    const nodes: CanvasNode[] = [
      {
        id: "node-finished",
        type: "image_generation",
        position: { x: 0, y: 0 },
        data: {
          title: "Finished image",
          prompt: "A product image.",
          agentLogicalId: "image-finished",
          agentNodeType: "ecom_image_generation",
          status: "idle",
          generatedHostedImageUrl: "https://cdn.example/finished.png",
          generatedImageWidth: 1024,
          generatedImageHeight: 1024,
          generatedAt: "2026-06-12T10:00:00.000Z",
        },
      },
      {
        id: "node-failed",
        type: "image_generation",
        position: { x: 400, y: 0 },
        data: {
          title: "Failed image",
          prompt: "A failed product image.",
          agentLogicalId: "image-failed",
          agentNodeType: "ecom_image_generation",
          status: "error",
          errorMessage: "OpenClaw backend returned non-JSON response (502)",
          generationErrorCode: "BACKEND_NON_JSON",
          generationRetryable: true,
          generationUpdatedAt: "2026-06-12T10:05:00.000Z",
        },
      },
    ];

    const snapshot = buildCanvasRuntimeSnapshot({
      nodes,
      edges: [],
      groupCount: 0,
    });

    assert.equal(snapshot.summary.finishedCount, 1);
    assert.equal(snapshot.summary.failedCount, 1);
    assert.deepEqual(snapshot.nodes.map((node) => ({
      id: node.id,
      logicalId: node.logicalId,
      status: node.status,
      outputUrl: node.outputUrl,
      errorCode: node.errorCode,
      retryable: node.retryable,
    })), [
      {
        id: "node-finished",
        logicalId: "image-finished",
        status: "finished",
        outputUrl: "https://cdn.example/finished.png",
        errorCode: undefined,
        retryable: false,
      },
      {
        id: "node-failed",
        logicalId: "image-failed",
        status: "failed",
        outputUrl: undefined,
        errorCode: "BACKEND_NON_JSON",
        retryable: true,
      },
    ]);
  });

  it("keeps allowed existing canvas sources while mapping created targets", () => {
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
    const materialized = materializeWorkflowForCanvas(workflow, {
      allowedExistingSourceIds: [sourceNodeId],
      createNodeId: (logicalId) => `real-${logicalId}`,
      createEdgeId: (logicalId) => `real-${logicalId}`,
    });

    assert.deepEqual(materialized.nodeIdMap, {
      "edit-image-1": "real-edit-image-1",
    });
    assert.equal(materialized.edges[0].source, sourceNodeId);
    assert.equal(materialized.edges[0].target, "real-edit-image-1");
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
