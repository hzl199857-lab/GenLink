import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routePaths = [
  "../../app/api/openclaw/agent/run/route.ts",
  "../../app/api/openclaw/planf/ecom/start/route.ts",
  "../../app/api/openclaw/planf/ecom/confirm/route.ts",
  "../../app/api/openclaw/planf/ecom/create-workflow/route.ts",
] as const;

for (const routePath of routePaths) {
  test(`${routePath} validates Provider/model compatibility`, () => {
    const source = readFileSync(new URL(routePath, import.meta.url), "utf8");

    assert.match(source, /mapAgentPanelModelToOpenClaw/);
    assert.match(source, /AgentModelCompatibilityError/);
    assert.match(
      source,
      /error instanceof AgentModelCompatibilityError[\s\S]*?(?:status:\s*400|errorJson\([^\n]*400)/,
    );
    assert.match(source, /error\.publicMessage \?\? error\.message/);
  });
}

test("ecommerce routes never replace invalid Agent output with local content", () => {
  const confirmSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const workflowSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/create-workflow/route.ts", import.meta.url),
    "utf8",
  );
  const panelSource = readFileSync(
    new URL("../../components/canvas/CanvasAgentPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(confirmSource, /confirmPlanfEcomSession/);
  assert.doesNotMatch(workflowSource, /createPlanfEcomWorkflowFrom(?:Plan|Anchor)/);
  assert.doesNotMatch(confirmSource, /using local .*fallback/i);
  assert.doesNotMatch(workflowSource, /using local .*fallback/i);
  assert.match(confirmSource, /genlink-planf-confirm-repair-/);
  assert.match(workflowSource, /genlink-planf-workflow-repair-/);
  assert.match(workflowSource, /usedFallback:\s*false/);
  assert.doesNotMatch(panelSource, /reconcileOpenClawEcomPlanReferenceMode/);
});

test("all ecommerce stages inject allowlisted rule contents before calling the model", () => {
  for (const routePath of routePaths.slice(1)) {
    const source = readFileSync(new URL(routePath, import.meta.url), "utf8");

    assert.match(source, /buildPlanfEcomRulesMessage/);
    assert.doesNotMatch(source, /Read the current OpenClaw workspace rules/);
  }
});

test("confirm and workflow routes enforce session reference state over model output", () => {
  const confirmSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const workflowSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/create-workflow/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(confirmSource, /parseOpenClawEcomCreativeDoc\(real\.text, values, session\)/);
  assert.match(workflowSource, /reconcileOpenClawEcomPlanReferenceMode\(parsedPlan, session, values\)/);
  assert.match(workflowSource, /bindUploadedReferencesToEcomWorkflow/);
  assert.match(workflowSource, /references\.map\(\(reference\) => reference\.sourceNodeId\)/);
  assert.match(workflowSource, /validateEcomWorkflowMatchesPlan/);
  assert.match(workflowSource, /anchor \? \[anchor\.nodeId\] : \[\]/);
});
