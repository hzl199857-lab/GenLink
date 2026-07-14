import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
    fileName: filename,
  });
  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  applyMidjourneyGridResult,
  applyMidjourneyUpscaleResult,
  failMidjourneyUpscale,
  startMidjourneyUpscale,
} = require("./midjourney-image-state.ts") as typeof import("./midjourney-image-state");

const gridData = {
  provider: "comfly" as const,
  model: "midjourney",
  generatedImageUrl: "grid.png",
  generatedHostedImageUrl: "grid-hosted.png",
  generatedAt: "2026-07-14T00:00:00.000Z",
  generationResults: [{
    status: "completed" as const,
    imageUrl: "grid.png",
    hostedImageUrl: "grid-hosted.png",
    model: "midjourney",
    generatedAt: "2026-07-14T00:00:00.000Z",
  }],
  midjourney: {
    kind: "grid" as const,
    jobId: "grid-job",
    taskId: "grid-task",
    actions: { 1: "one", 2: "two", 3: "three", 4: "four" },
  },
};

test("applies an Imagine grid result and keeps its action metadata", () => {
  const next = applyMidjourneyGridResult({}, {
    model: "midjourney",
    images: [{ imageUrl: "grid.png", hostedImageUrl: "grid-hosted.png", model: "midjourney", width: 1024, height: 1024 }],
    midjourney: gridData.midjourney,
  }, "2026-07-14T00:00:00.000Z");

  assert.equal(next.generatedImageUrl, "grid.png");
  assert.equal(next.midjourney?.kind, "grid");
  assert.equal(next.midjourney?.actions?.[2], "two");
});

test("marks only the selected quadrant as running while keeping the grid visible", () => {
  const next = startMidjourneyUpscale(gridData, 4, "upscale-job");
  assert.equal(next.generatedImageUrl, "grid.png");
  assert.equal(next.midjourney?.pendingQuadrant, 4);
  assert.equal(next.midjourney?.pendingJobId, "upscale-job");
  assert.equal(next.status, "generating");
});

test("applies the upscale as primary while preserving the grid in history", () => {
  const running = startMidjourneyUpscale(gridData, 2, "upscale-job");
  const next = applyMidjourneyUpscaleResult(running, {
    model: "midjourney",
    images: [{ imageUrl: "upscale.png", hostedImageUrl: "upscale-hosted.png", model: "midjourney", width: 1024, height: 1024 }],
    midjourney: {
      kind: "upscale",
      jobId: "upscale-job",
      taskId: "upscale-task",
      sourceTaskId: "grid-task",
      selectedQuadrant: 2,
      gridImageUrl: "grid.png",
      gridHostedImageUrl: "grid-hosted.png",
    },
  }, "2026-07-14T00:01:00.000Z");

  assert.equal(next.generatedImageUrl, "upscale.png");
  assert.equal(next.midjourney?.kind, "upscale");
  assert.equal(next.generationResults?.[0].imageUrl, "grid.png");
  assert.equal(next.generationResults?.[1].imageUrl, "upscale.png");
});

test("restores grid selection after an upscale failure", () => {
  const running = startMidjourneyUpscale(gridData, 1, "upscale-job");
  const next = failMidjourneyUpscale(running, "failed");
  assert.equal(next.generatedImageUrl, "grid.png");
  assert.equal(next.midjourney?.pendingQuadrant, undefined);
  assert.equal(next.midjourney?.pendingJobId, undefined);
  assert.equal(next.status, "error");
  assert.equal(next.errorMessage, "failed");
});
