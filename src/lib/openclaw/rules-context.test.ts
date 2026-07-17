import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const {
  PlanfRulesContextError,
  buildPlanfEcomRulesMessage,
} = require("./rules-context.ts") as typeof import("./rules-context");

const BASE_FILES = [
  "phase-policy.md",
  "skills/ecom-image/SKILL.md",
  "skills/ecom-image/references/categories.md",
] as const;

const OPENCLAW_ROOT_FILES = [
  "AGENTS.md",
  "BOOTSTRAP.md",
  "IDENTITY.md",
] as const;

const WORKFLOW_FILES = [
  "skills/_shared/self-check.md",
  "skills/engineer/SKILL.md",
  "skills/engineer/validation.md",
] as const;

function writeRule(root: string, relativePath: string, content = `content:${relativePath}`) {
  const fullPath = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createRulesRoot(extraFiles: readonly string[] = []) {
  const root = mkdtempSync(path.join(tmpdir(), "genlink-rules-context-"));

  for (const relativePath of [...BASE_FILES, ...extraFiles]) {
    writeRule(root, relativePath);
  }

  return root;
}

test("injects ecommerce rules without repeating OpenClaw root bootstrap files", async () => {
  const rulesRoot = createRulesRoot();
  const message = await buildPlanfEcomRulesMessage({
    stage: "start",
    preset: "full-set-8",
    rulesRoot,
    taskMessage: "MODEL_TASK",
  });

  for (const relativePath of BASE_FILES) {
    assert.match(message, new RegExp(`path="${relativePath.replaceAll("/", "\\/")}"`));
    assert.match(message, new RegExp(`content:${relativePath.replaceAll("/", "\\/")}`));
  }
  for (const relativePath of OPENCLAW_ROOT_FILES) {
    assert.doesNotMatch(message, new RegExp(`path="${relativePath}"`));
    assert.doesNotMatch(message, new RegExp(`content:${relativePath}`));
  }
  assert.match(message, /sha256="[a-f0-9]{64}"/);
  assert.ok(message.indexOf("content:skills/ecom-image/SKILL.md") < message.indexOf("MODEL_TASK"));
  assert.match(message, /OpenClaw already loaded the workspace root context AGENTS\.md, TOOLS\.md, and IDENTITY\.md/);
  assert.match(message, /Do not call file, shell, or tool APIs/);
});

test("loads only the ecommerce reference required by the selected preset", async () => {
  const rulesRoot = createRulesRoot([
    "skills/_shared/self-check.md",
    "skills/ecom-image/references/ugc-style.md",
    "skills/ecom-image/references/fashion-stylist.md",
    "skills/ecom-image/references/detail-page-sop.md",
  ]);
  const message = await buildPlanfEcomRulesMessage({
    stage: "confirm",
    preset: "ugc-lifestyle",
    rulesRoot,
    taskMessage: "MODEL_TASK",
  });

  assert.match(message, /path="skills\/ecom-image\/references\/ugc-style\.md"/);
  assert.doesNotMatch(message, /fashion-stylist\.md/);
  assert.doesNotMatch(message, /detail-page-sop\.md/);

  const detailMessage = await buildPlanfEcomRulesMessage({
    stage: "start",
    preset: "detail-page-pack",
    rulesRoot,
    taskMessage: "MODEL_TASK",
  });

  assert.match(detailMessage, /path="skills\/ecom-image\/references\/detail-page-sop\.md"/);
  assert.doesNotMatch(detailMessage, /ugc-style\.md/);
  assert.doesNotMatch(detailMessage, /fashion-stylist\.md/);
});

test("injects only workflow assembly rules after the creative plan is confirmed", async () => {
  const rulesRoot = createRulesRoot([
    ...WORKFLOW_FILES,
    "skills/ecom-image/references/fashion-stylist.md",
  ]);
  const message = await buildPlanfEcomRulesMessage({
    stage: "workflow",
    preset: "full-set-8",
    styleMode: "stylist",
    rulesRoot,
    taskMessage: "MODEL_TASK",
  });

  for (const relativePath of WORKFLOW_FILES) {
    assert.match(message, new RegExp(`content:${relativePath.replaceAll("/", "\\/")}`));
  }
  for (const relativePath of BASE_FILES) {
    assert.doesNotMatch(message, new RegExp(`path="${relativePath.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(message, /fashion-stylist\.md/);
  assert.doesNotMatch(message, /path="TOOLS\.md"/);
});

test("fails before the model call when an allowlisted rule is missing or empty", async () => {
  const missingRoot = createRulesRoot();
  const missingPath = path.join(
    missingRoot,
    "skills",
    "ecom-image",
    "references",
    "ugc-style.md",
  );

  await assert.rejects(
    buildPlanfEcomRulesMessage({
      stage: "start",
      preset: "ugc-lifestyle",
      rulesRoot: missingRoot,
      taskMessage: "MODEL_TASK",
    }),
    (error: unknown) => {
      assert.ok(error instanceof PlanfRulesContextError);
      assert.match(error.message, /skills\/ecom-image\/references\/ugc-style\.md/);
      assert.doesNotMatch(error.message, new RegExp(missingRoot.replaceAll("\\", "\\\\")));
      return true;
    },
  );

  writeRule(missingRoot, "skills/ecom-image/references/ugc-style.md", "   ");
  await assert.rejects(
    buildPlanfEcomRulesMessage({
      stage: "start",
      preset: "ugc-lifestyle",
      rulesRoot: missingRoot,
      taskMessage: "MODEL_TASK",
    }),
    PlanfRulesContextError,
  );

  assert.ok(missingPath.endsWith(path.join("references", "ugc-style.md")));
});
