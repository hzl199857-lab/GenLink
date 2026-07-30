import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./CardSideHandle.tsx", import.meta.url), "utf8");
const textNodeSource = readFileSync(new URL("./TextNode.tsx", import.meta.url), "utf8");

test("keeps the ReactFlow handle at its final measured coordinates", () => {
  const handleHitboxClass = source.match(
    /const HANDLE_HITBOX_BASE =\s*\n\s*'([^']+)'/,
  )?.[1];

  assert.ok(handleHitboxClass);
  assert.doesNotMatch(handleHitboxClass, /transition-\[top,left\]/);
  assert.match(source, /const SIDE_ZONE_BASE =\s*\n\s*'[^']*transition-\[top,left,height\]/);
});

test("positions text node handles from the measured card bounds", () => {
  assert.match(source, /resolvedCardTop \+ resolvedCardHeight \/ 2/);
  assert.match(textNodeSource, /top: cardElement\.offsetTop/);
  assert.match(textNodeSource, /height: cardElement\.offsetHeight/);
  assert.match(textNodeSource, /cardTopOffset=\{cardMetrics\.top\}/);
  assert.match(textNodeSource, /cardHeight=\{cardMetrics\.height\}/);
});
