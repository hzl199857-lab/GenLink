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

const { validateEcomWorkflowMatchesPlan } = require("./ecom-workflow-contract.ts") as typeof import("./ecom-workflow-contract");

function workflow(count: number, ratio: string) {
  return {
    version: "gl-workflow-v1" as const,
    source: "openclaw" as const,
    intent: {
      type: "ecom-image" as const,
      styleMode: "ugc" as const,
      packageMode: "ugc-lifestyle" as const,
      request: "UGC sunglasses",
    },
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `image-${index + 1}`,
      type: "image_generation" as const,
      role: "ecom_image_generation",
      title: `Image ${index + 1}`,
      data: { aspectRatio: ratio },
    })),
    edges: [],
    meta: { rulesRoot: "rules", loadedRules: [] },
  };
}

const ugcPlan = {
  meta: { anchorMode: "user-upload", mainRatio: "3:4" },
  imageSlots: Array.from({ length: 6 }, (_, index) => ({
    slot: `UGC ${index + 1}`,
    round: 1,
    ratio: "3:4",
  })),
};

describe("validateEcomWorkflowMatchesPlan", () => {
  it("rejects a generic eight-image workflow for a six-image UGC plan", () => {
    const result = validateEcomWorkflowMatchesPlan({
      workflow: workflow(8, "3:4"),
      plan: ugcPlan,
      hasConfirmedAnchor: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /count 8.*count 6/);
  });

  it("rejects square nodes for a 3:4 UGC plan", () => {
    const result = validateEcomWorkflowMatchesPlan({
      workflow: workflow(6, "1:1"),
      plan: ugcPlan,
      hasConfirmedAnchor: false,
    });

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /aspectRatio 1:1.*ratio 3:4/);
  });

  it("accepts the six-node 3:4 UGC workflow", () => {
    assert.deepEqual(validateEcomWorkflowMatchesPlan({
      workflow: workflow(6, "3:4"),
      plan: ugcPlan,
      hasConfirmedAnchor: false,
    }), { ok: true });
  });

  it("expects all detail modules after a separately confirmed white-background anchor", () => {
    const detailPlan = {
      meta: { anchorMode: "white-bg-first", mainRatio: "1:1" },
      imageSlots: ["3:4", "3:4", "3:4", "1:1", "4:5"].map((ratio, index) => ({
        slot: `Detail ${index + 1}`,
        round: 2,
        ratio,
      })),
    };
    const detailWorkflow = workflow(5, "3:4");
    detailWorkflow.nodes[3].data.aspectRatio = "1:1";
    detailWorkflow.nodes[4].data.aspectRatio = "4:5";

    assert.deepEqual(validateEcomWorkflowMatchesPlan({
      workflow: detailWorkflow,
      plan: detailPlan,
      hasConfirmedAnchor: true,
    }), { ok: true });
  });
});
