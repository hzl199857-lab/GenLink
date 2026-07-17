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

test("fallback helpers do not swallow model compatibility failures", () => {
  const confirmSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const workflowSource = readFileSync(
    new URL("../../app/api/openclaw/planf/ecom/create-workflow/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    confirmSource,
    /error instanceof AgentModelCompatibilityError \|\|[\s\S]*?error instanceof RealOpenClawRuntimeError/,
  );
  assert.match(
    workflowSource,
    /error instanceof AgentModelCompatibilityError \|\|[\s\S]*?error instanceof RealOpenClawRuntimeError/,
  );
  assert.match(
    confirmSource,
    /error instanceof RealOpenClawRuntimeError \|\|[\s\S]*?error instanceof PlanfRulesContextError/,
  );
  assert.match(
    workflowSource,
    /error instanceof RealOpenClawRuntimeError \|\|[\s\S]*?error instanceof PlanfRulesContextError/,
  );
});

test("all ecommerce stages inject allowlisted rule contents before calling the model", () => {
  for (const routePath of routePaths.slice(1)) {
    const source = readFileSync(new URL(routePath, import.meta.url), "utf8");

    assert.match(source, /buildPlanfEcomRulesMessage/);
    assert.doesNotMatch(source, /Read the current OpenClaw workspace rules/);
  }
});
