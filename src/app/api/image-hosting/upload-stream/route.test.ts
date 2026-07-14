import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(currentDir, "route.ts"), "utf8");

test("streaming image upload route is authenticated and runs in Node", () => {
  assert.match(routeSource, /export const runtime = ["']nodejs["']/);
  assert.match(routeSource, /requireAuth\(request\)/);
  assert.match(routeSource, /forwardImageUploadRequest\(request/);
  assert.match(routeSource, /createAliyunOssUploadTarget/);
});

test("streaming image upload route never buffers or base64-encodes the body", () => {
  assert.doesNotMatch(routeSource, /arrayBuffer\(/);
  assert.doesNotMatch(routeSource, /Buffer\.from\(/);
  assert.doesNotMatch(routeSource, /base64/i);
  assert.doesNotMatch(routeSource, /formData\(/);
});
