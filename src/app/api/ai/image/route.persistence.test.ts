import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("all providers finalize inline image data before persistence", () => {
  assert.doesNotMatch(source, /finalizeDataUrlImages/);
  assert.match(source, /if \(needsHostedImageUrl\)/);
});

test("stable hosted URLs replace the original image URL", () => {
  const attachBlock = source.slice(
    source.indexOf("async function attachHostedImageUrlsToJob("),
    source.indexOf("function hasUnhostedDataUrlImages("),
  );
  const cacheBlock = source.slice(
    source.indexOf("async function cacheRemoteImages("),
    source.indexOf("async function readPersistedImageJobResult("),
  );

  assert.match(attachBlock, /withStableHostedImage\(image, hostedImageUrl\)/);
  assert.match(cacheBlock, /withStableHostedImage\(image, hostedImageUrl\)/);
  assert.equal(
    source.match(/forceOss:\s*process\.env\.NODE_ENV === "production"/g)?.length,
    2,
    "generated images must use OSS in production",
  );
});

test("database writes reject transient image references", () => {
  const completedJobBlock = source.slice(
    source.indexOf("async function persistCompletedImageJob("),
    source.indexOf("async function persistImageHistoryItems("),
  );
  const historyBlock = source.slice(
    source.indexOf("async function persistImageHistoryItems("),
    source.indexOf("function persistImageHistoryItemsAfterResponse("),
  );

  assert.match(completedJobBlock, /serializeImageJobResult\(result\)/);
  assert.match(historyBlock, /assertPersistableImageReferences\(result\.images\)/);
  assert.equal(
    source.match(/result:\s*serializeImageJobResult\(/g)?.length,
    2,
    "all ImageJob result writes must use guarded serialization",
  );
});
