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
  applyImageGenerationActionOptionsToMaterializedNodes,
} = require("./agent-node-preferences.ts") as typeof import("./agent-node-preferences");

import type { CanvasNode } from "@/types/canvas";
import type { CanvasAgentAction } from "@/types/agent";

describe("applyImageGenerationActionOptionsToMaterializedNodes", () => {
  it("keeps backend materialized nodes in sync with final agent action preferences", () => {
    const nodes: CanvasNode[] = [
      {
        id: "node-real-image-1",
        type: "image_generation",
        position: { x: 100, y: 100 },
        data: {
          prompt: "backend prompt",
          provider: "vibe",
          model: "gpt-image-2",
          aspectRatio: "1:1",
          quality: "1K",
          status: "idle",
        },
      },
    ];
    const actions: CanvasAgentAction[] = [
      {
        type: "create_image_generation_node",
        clientActionId: "image-1",
        prompt: "final prompt",
        options: {
          provider: "fucheers",
          model: "gpt-image-2",
          aspectRatio: "3:4",
          quality: "2K",
        },
      },
    ];

    const synced = applyImageGenerationActionOptionsToMaterializedNodes({
      nodes,
      actions,
      nodeIdMap: {
        "image-1": "node-real-image-1",
      },
    });

    assert.ok(synced);
    const syncedNode = synced[0];

    assert.ok(syncedNode);
    assert.equal(syncedNode.type, "image_generation");
    if (syncedNode.type !== "image_generation") {
      return;
    }

    assert.equal(syncedNode.data.prompt, "final prompt");
    assert.equal(syncedNode.data.provider, "fucheers");
    assert.equal(syncedNode.data.aspectRatio, "3:4");
    assert.equal(syncedNode.data.quality, "2K");
  });
});
