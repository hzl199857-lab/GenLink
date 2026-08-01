import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const middlewareSource = readFileSync(
  new URL("../../middleware.ts", import.meta.url),
  "utf8",
);

test("unauthenticated app routes open the existing home login dialog", () => {
  assert.match(middlewareSource, /new URL\("\/", request\.url\)/);
  assert.match(middlewareSource, /searchParams\.set\("auth", "login"\)/);
  assert.doesNotMatch(middlewareSource, /new URL\("\/login"/);
});
