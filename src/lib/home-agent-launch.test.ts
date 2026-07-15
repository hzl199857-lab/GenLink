import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the canvas Agent consumes a structured initial request once", () => {
  const panel = readSource("../components/canvas/CanvasAgentPanel.tsx");
  const canvas = readSource("../components/canvas/InfiniteCanvas.tsx");

  assert.match(panel, /initialRequest\?: CanvasAgentLaunchRequest/);
  assert.match(panel, /consumedInitialRequestIdRef/);
  assert.match(panel, /submitAgentRequest/);
  assert.match(panel, /onInitialRequestConsumed\?\.\(initialRequest\.id\)/);
  assert.match(canvas, /initialAgentRequest\?: CanvasAgentLaunchRequest/);
  assert.match(canvas, /effectiveOpen = open \|\| Boolean\(initialAgentRequest\)/);
});

test("the home page preserves login-gated input and prepares the canvas request", () => {
  const page = readSource("../app/page.tsx");

  assert.match(page, /createHomeAgentPendingRequest/);
  assert.match(page, /createBrowserAgentImageAttachment/);
  assert.match(page, /newProject\('未命名项目'\)/);
  assert.match(page, /setAuthDialogOpen\(true\)/);
  assert.match(page, /readyUserId !== userId/);
  assert.match(page, /initialAgentRequest=\{preparedAgentRequest\}/);
  assert.match(page, /onInitialAgentRequestConsumed/);
});
