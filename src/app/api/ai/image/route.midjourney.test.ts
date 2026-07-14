import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("dispatches Comfly Midjourney before the generic Comfly branch", () => {
  const postDispatch = source.slice(source.indexOf("const isMidjourney"));
  const midjourneyBranch = postDispatch.indexOf('if (isMidjourney)');
  const genericBranch = postDispatch.indexOf('provider === "comfly" || provider === "zhenzhen"');

  assert.ok(midjourneyBranch >= 0, "Midjourney branch is missing");
  assert.ok(genericBranch > midjourneyBranch, "Midjourney must branch before generic Comfly");
});

test("persists and resumes the dedicated Midjourney upstream protocol", () => {
  assert.match(source, /provider:\s*"comfly-midjourney"/);
  assert.match(source, /job\.provider === "comfly-midjourney"/);
  assert.match(source, /fetchMidjourneyTask\(\{/);
  assert.match(source, /cacheRemoteBeforeComplete:\s*true/);
});

test("preserves optional Midjourney metadata in image job results", () => {
  assert.match(source, /midjourney:\s*result\.midjourney/);
});

test("preserves Midjourney metadata in image history node data", () => {
  const historyBlock = source.slice(
    source.indexOf("async function persistImageHistoryItems("),
    source.indexOf("function persistImageHistoryItemsAfterResponse("),
  );
  assert.match(historyBlock, /midjourney:\s*result\.midjourney/);
});

test("passes persisted Midjourney settings into Imagine submission", () => {
  const dispatchBlock = source.slice(
    source.indexOf("if (isMidjourney)"),
    source.indexOf("} else if (provider === \"runninghub\")"),
  );
  const submitBlock = source.slice(
    source.indexOf("async function submitMidjourneyJob("),
    source.indexOf("function buildMidjourneyGenerateResult("),
  );

  assert.match(dispatchBlock, /historyNodeData\?\.midjourneySettings/);
  assert.match(submitBlock, /settings[,:]/);
  assert.match(submitBlock, /submitMidjourneyImagine\(\{[\s\S]*settings,/);
});
