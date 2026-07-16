import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the canvas Agent consumes a structured initial request once", () => {
  const panel = readSource("../components/canvas/CanvasAgentPanel.tsx");
  const canvas = readSource("../components/canvas/InfiniteCanvas.tsx");
  const initialRequestEffect = panel.match(
    /useEffect\(\(\) => \{\s*if \(\s*!open \|\|\s*!initialRequest[\s\S]*?\n  \}, \[[^\]]*submitAgentRequest[^\]]*\]\);/,
  )?.[0] ?? "";

  assert.match(panel, /initialRequest\?: CanvasAgentLaunchRequest/);
  assert.match(panel, /initialRequestBlocked\?: boolean/);
  assert.match(panel, /consumedInitialRequestIdRef/);
  assert.match(panel, /submitAgentRequest/);
  assert.match(panel, /provider: initialRequest\.provider/);
  assert.match(panel, /preference: initialRequest\.imagePreference/);
  assert.match(panel, /imagePreference: initialImagePreference/);
  assert.match(initialRequestEffect, /initialRequestBlocked/);
  assert.match(initialRequestEffect, /const accepted = submitAgentRequest\(/);
  assert.match(initialRequestEffect, /if \(!accepted\) \{\s*return;\s*\}/);
  assert.doesNotMatch(initialRequestEffect, /setTimeout/);
  assert.ok(
    initialRequestEffect.indexOf("const accepted = submitAgentRequest(") <
      initialRequestEffect.indexOf("consumedInitialRequestIdRef.current = initialRequest.id"),
  );
  assert.match(panel, /onInitialRequestConsumed\?\.\(initialRequest\.id\)/);
  assert.match(canvas, /initialAgentRequest\?: CanvasAgentLaunchRequest/);
  assert.match(canvas, /effectiveOpen = open \|\| Boolean\(initialAgentRequest\)/);
  assert.match(canvas, /initialRequestBlocked: boolean/);
  assert.match(canvas, /initialRequestBlocked=\{initialRequestBlocked\}/);
});

test("the home page preserves login-gated input and prepares the canvas request", () => {
  const page = readSource("../app/page.tsx");

  assert.match(page, /createHomeAgentPendingRequest/);
  assert.match(page, /createBrowserAgentImageAttachment/);
  assert.match(page, /provider: request\.provider/);
  assert.match(page, /imagePreference: request\.imagePreference/);
  assert.match(page, /newProject\('未命名项目'\)/);
  assert.match(page, /setAuthDialogOpen\(true\)/);
  assert.match(page, /readyUserId !== userId/);
  assert.match(page, /initialAgentRequest=\{preparedAgentRequest\}/);
  assert.match(page, /onInitialAgentRequestConsumed/);
});
