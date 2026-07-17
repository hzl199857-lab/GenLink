import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PlanfEcomRulesStage = "start" | "confirm" | "workflow";

type BuildPlanfEcomRulesMessageInput = {
  stage: PlanfEcomRulesStage;
  taskMessage: string;
  preset?: string;
  imageSet?: string;
  styleMode?: string;
  rulesRoot?: string;
};

const BASE_RULE_FILES = [
  "phase-policy.md",
  "skills/ecom-image/SKILL.md",
  "skills/ecom-image/references/categories.md",
] as const;

const WORKFLOW_RULE_FILES = [
  "skills/_shared/self-check.md",
  "skills/engineer/SKILL.md",
  "skills/engineer/validation.md",
] as const;

function resolveRulesRoot(explicitRoot?: string): string {
  return explicitRoot?.trim() ||
    process.env.PLANF_RULES_ROOT?.trim() ||
    path.join(process.cwd(), "rules", "planf-canvas");
}

function isDetailRulesRequest(input: BuildPlanfEcomRulesMessageInput): boolean {
  return input.preset === "detail-page-pack" ||
    input.preset === "amazon-adapter" ||
    input.imageSet === "detail" ||
    input.imageSet === "detail-page" ||
    input.imageSet === "detail-page-pack" ||
    input.imageSet === "amazon-adapter";
}

function selectRuleFiles(input: BuildPlanfEcomRulesMessageInput): string[] {
  const selected: string[] = input.stage === "workflow"
    ? [...WORKFLOW_RULE_FILES]
    : [...BASE_RULE_FILES];

  if (input.stage !== "workflow" && (input.preset === "ugc-lifestyle" || input.styleMode === "ugc")) {
    selected.push("skills/ecom-image/references/ugc-style.md");
  }
  if (input.stage !== "workflow" && (input.preset === "editorial-stylist" || input.styleMode === "stylist")) {
    selected.push("skills/ecom-image/references/fashion-stylist.md");
  }
  if (input.stage !== "workflow" && isDetailRulesRequest(input)) {
    selected.push("skills/ecom-image/references/detail-page-sop.md");
  }
  if (input.stage === "confirm") {
    selected.push("skills/_shared/self-check.md");
  }
  return Array.from(new Set(selected));
}

export class PlanfRulesContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanfRulesContextError";
  }
}

async function loadRequiredRule(rulesRoot: string, relativePath: string) {
  const fullPath = path.join(rulesRoot, ...relativePath.split("/"));
  let content: string;

  try {
    content = await readFile(fullPath, "utf8");
  } catch {
    throw new PlanfRulesContextError(
      `Required GenLink rule file is missing: ${relativePath}`,
    );
  }

  if (!content.trim()) {
    throw new PlanfRulesContextError(
      `Required GenLink rule file is empty: ${relativePath}`,
    );
  }

  return {
    relativePath,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

export async function buildPlanfEcomRulesMessage(
  input: BuildPlanfEcomRulesMessageInput,
): Promise<string> {
  const rulesRoot = resolveRulesRoot(input.rulesRoot);
  const rules = await Promise.all(
    selectRuleFiles(input).map((relativePath) => loadRequiredRule(rulesRoot, relativePath)),
  );
  const context = [
    '<genlink_rules_context version="1">',
    "OpenClaw already loaded the workspace root context AGENTS.md, TOOLS.md, and IDENTITY.md. The staged task message provides the required protocol directly, so BOOTSTRAP.md is not repeated.",
    "GenLink loaded the following additional exact allowlisted rule files before this model call.",
    "Treat their contents as authoritative for the task below.",
    "Do not call file, shell, or tool APIs. Do not claim that any unlisted file was loaded.",
    ...rules.flatMap((rule) => [
      `<rule_file path="${rule.relativePath}" sha256="${rule.sha256}">`,
      rule.content,
      "</rule_file>",
    ]),
    "</genlink_rules_context>",
  ].join("\n");

  return `${context}\n\n${input.taskMessage}`;
}
