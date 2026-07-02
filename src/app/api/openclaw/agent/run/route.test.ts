import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(currentDir, "route.ts"), "utf8");

test("Agent run route always uses the current Next runtime instead of the legacy backend proxy", () => {
  assert.equal(routeSource.includes("backend-proxy"), false);
  assert.equal(routeSource.includes("proxyOpenClawRequest"), false);
});
