import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./InfiniteCanvas.tsx", import.meta.url), "utf8");

test("resolves remote image file sizes through a one-byte metadata request", () => {
  assert.match(source, /async function readRemoteImageSizeBytes/);
  assert.match(source, /Range:\s*['"]bytes=0-0['"]/);
  assert.match(source, /headers\.get\(['"]content-range['"]\)/);
  assert.match(source, /response\.body\?\.cancel\(\)/);

  const resolverCalls = source.match(/resolveImageInfoPopoverMetadata\(base, imageUrl\)/g) ?? [];
  assert.equal(resolverCalls.length, 3);
});

test("shows selected image metadata immediately and ignores stale metadata requests", () => {
  assert.match(source, /function toCanvasNodeInfoPopoverData/);
  assert.match(source, /setImageInfoPopover\(toCanvasNodeInfoPopoverData\(node\)\)/);
  assert.match(source, /const requestId = imageInfoRequestIdRef\.current \+ 1/);
  assert.match(source, /if \(imageInfoRequestIdRef\.current === requestId\)/);
});
