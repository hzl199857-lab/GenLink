import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  AGENT_CANVAS_GLOBAL_RULE_SOURCE_FILES,
  getAgentCanvasGlobalRulePromptLines,
} from "./agent-canvas-global-rules";

export type AgentCanvasRulePack = {
  prompt: string;
  loadedFiles: Array<{
    relativePath: string;
    length: number;
  }>;
};

const RULES_ROOT = process.cwd();
const MAX_RULE_FILE_CHARS = 80_000;

function readRuleFile(relativePath: string): string {
  const absolutePath = path.join(RULES_ROOT, relativePath);

  if (!existsSync(absolutePath)) {
    return `[missing rule file: ${relativePath}]`;
  }

  const content = readFileSync(absolutePath, "utf8");

  return content.length > MAX_RULE_FILE_CHARS
    ? `${content.slice(0, MAX_RULE_FILE_CHARS)}\n\n[truncated at ${MAX_RULE_FILE_CHARS} chars]`
    : content;
}

export function buildAgentCanvasRulePack(): AgentCanvasRulePack {
  const loadedFiles = AGENT_CANVAS_GLOBAL_RULE_SOURCE_FILES.map((relativePath) => {
    const content = readRuleFile(relativePath);

    return {
      relativePath,
      content,
      length: content.length,
    };
  });
  const prompt = [
    "# GenLink Canvas Runtime Rule Pack",
    "",
    "The following files are loaded as the runtime startup rule pack. Treat AGENTS.md as the controller entrypoint and BOOTSTRAP.md as the highest-priority runtime constraints. Do not treat client repair/compatibility behavior as the writing contract.",
    "",
    "## Non-Negotiable Runtime Summary",
    ...getAgentCanvasGlobalRulePromptLines().map((line) => `- ${line}`),
    "",
    ...loadedFiles.flatMap((file) => [
      `## ${file.relativePath}`,
      "",
      file.content,
      "",
    ]),
  ].join("\n");

  return {
    prompt,
    loadedFiles: loadedFiles.map(({ relativePath, length }) => ({
      relativePath,
      length,
    })),
  };
}
