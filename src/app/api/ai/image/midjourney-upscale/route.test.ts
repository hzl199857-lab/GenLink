import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("loads a stored Midjourney grid and resolves the action server-side", () => {
  assert.match(source, /prisma\.imageJob\.findUnique/);
  assert.match(source, /originalJob\.provider !== "comfly-midjourney"/);
  assert.match(source, /gridMetadata\.actions\?\.\[quadrant\]/);
  assert.doesNotMatch(source, /body\.customId/);
});

test("creates a resumable Midjourney upscale ImageJob", () => {
  assert.match(source, /provider:\s*"comfly-midjourney"/);
  assert.match(source, /upstreamTaskId:\s*submission\.taskId/);
  assert.match(source, /kind:\s*"upscale"/);
  assert.match(source, /selectedQuadrant:\s*quadrant/);
});
