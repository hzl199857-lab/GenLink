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
  estimateCanvasNodeBounds,
  layoutAgentWorkflowNodes,
  rectsOverlap,
} = require("./agent-layout.ts") as typeof import("./agent-layout");

import type { CanvasEdge, CanvasNode } from "@/types/canvas";

function textNode(id: string, x = 0, y = 0): Extract<CanvasNode, { type: "text" }> {
  return {
    id,
    type: "text",
    position: { x, y },
    data: {
      text: `Prompt ${id}`,
      status: "idle",
    },
  };
}

function imageGenerationNode(
  id: string,
  x = 0,
  y = 0,
): Extract<CanvasNode, { type: "image_generation" }> {
  return {
    id,
    type: "image_generation",
    position: { x, y },
    data: {
      prompt: `Image ${id}`,
      aspectRatio: "auto",
      status: "idle",
    },
  };
}

function uploadedImageNode(
  id: string,
  x: number,
  y: number,
): Extract<CanvasNode, { type: "uploaded_image" }> {
  return {
    id,
    type: "uploaded_image",
    position: { x, y },
    data: {
      imageUrl: "/ref.png",
      width: 420,
      height: 420,
    },
  };
}

function edge(id: string, source: string, target: string): CanvasEdge {
  return { id, source, target };
}

describe("layoutAgentWorkflowNodes", () => {
  it("places the image generation node directly to the right of the reference node", () => {
    const source = uploadedImageNode("source", 100, 200);
    const incomingNodes: CanvasNode[] = [
      textNode("prompt"),
      imageGenerationNode("image"),
    ];

    const positioned = layoutAgentWorkflowNodes({
      incomingNodes,
      incomingEdges: [edge("e1", "prompt", "image")],
      existingNodes: [source],
      sourceNodes: [source],
      fallbackStartPosition: { x: 0, y: 0 },
    });

    const sourceBounds = estimateCanvasNodeBounds(source);
    const prompt = positioned.find((node) => node.id === "prompt");
    const image = positioned.find((node) => node.id === "image");

    assert.ok(image);
    assert.ok(prompt);
    assert.equal(image.position.x, sourceBounds.x + sourceBounds.width + 140);
    assert.ok(prompt.position.x > image.position.x);
  });

  it("stacks multiple image generation nodes without overlapping their final cards", () => {
    const incomingNodes: CanvasNode[] = [
      imageGenerationNode("image-1"),
      imageGenerationNode("image-2"),
      imageGenerationNode("image-3"),
    ];

    const positioned = layoutAgentWorkflowNodes({
      incomingNodes,
      incomingEdges: [],
      existingNodes: [],
      sourceNodes: [],
      fallbackStartPosition: { x: 500, y: 100 },
    });

    const imageRects = positioned.map(estimateCanvasNodeBounds);

    for (let i = 0; i < imageRects.length; i += 1) {
      for (let j = i + 1; j < imageRects.length; j += 1) {
        assert.equal(rectsOverlap(imageRects[i], imageRects[j], 0), false);
      }
    }
  });

  it("moves the workflow down when the first right-side slot overlaps existing nodes", () => {
    const source = uploadedImageNode("source", 100, 200);
    const blocker = uploadedImageNode("blocker", 660, 180);
    const incomingNodes: CanvasNode[] = [
      textNode("prompt"),
      imageGenerationNode("image"),
    ];

    const positioned = layoutAgentWorkflowNodes({
      incomingNodes,
      incomingEdges: [edge("e1", "prompt", "image")],
      existingNodes: [source, blocker],
      sourceNodes: [source],
      fallbackStartPosition: { x: 0, y: 0 },
    });

    const createdRects = positioned.map(estimateCanvasNodeBounds);
    const existingRects = [source, blocker].map(estimateCanvasNodeBounds);

    for (const createdRect of createdRects) {
      for (const existingRect of existingRects) {
        assert.equal(rectsOverlap(createdRect, existingRect, 48), false);
      }
    }
  });
});
