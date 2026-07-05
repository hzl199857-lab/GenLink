import "server-only";

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ImageApiProvider } from "@/lib/vibe";

export type RealOpenClawRunInput = {
  message: string;
  sessionKey: string;
  timeoutMs: number;
  model?: string;
  provider?: ImageApiProvider;
  apiKey?: string;
};

export type RealOpenClawRunResult = {
  text: string;
  raw: unknown;
  meta?: Record<string, unknown>;
};

export class RealOpenClawRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealOpenClawRuntimeError";
  }
}

const DEFAULT_OPENCLAW_ENTRY = path.join(
  "E:",
  "GenLink-runtime",
  "openclaw",
  "openclaw.mjs",
);
const DEFAULT_OPENCLAW_CONFIG = path.join("E:", "GenLink-runtime", "openclaw-genlink.json");
const DEFAULT_OPENCLAW_STATE = path.join("E:", "GenLink-runtime", "state");
const DEFAULT_OPENCLAW_WORKSPACE = path.join("E:", "GenLink-runtime", "workspaces", "genlink-planf");
const CORE_RULE_FILES = [
  "AGENTS.md",
  "BOOTSTRAP.md",
  "IDENTITY.md",
  "phase-policy.md",
  "TOOLS.md",
  "canvas-capabilities.yaml",
  "skill-registry.yaml",
  "IMAGE_PIPELINE.md",
  "VIDEO_PIPELINE.md",
];

export function isRealOpenClawRuntimeEnabled(): boolean {
  return process.env.OPENCLAW_REAL_RUNTIME === "1";
}

function getOpenClawEntry(): string {
  return process.env.OPENCLAW_CLI_ENTRY?.trim() || DEFAULT_OPENCLAW_ENTRY;
}

function getOpenClawConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH?.trim() || DEFAULT_OPENCLAW_CONFIG;
}

function getOpenClawStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR?.trim() || DEFAULT_OPENCLAW_STATE;
}

function getOpenClawWorkspaceDir(): string {
  return process.env.OPENCLAW_WORKSPACE_DIR?.trim() || DEFAULT_OPENCLAW_WORKSPACE;
}

function getSourceRulesRoot(): string {
  return process.env.PLANF_RULES_ROOT?.trim() ||
    path.join(process.cwd(), "rules", "planf-canvas");
}

function syncCoreRulesToOpenClawWorkspace(): void {
  const sourceRoot = getSourceRulesRoot();
  const workspaceRoot = getOpenClawWorkspaceDir();

  for (const relativePath of CORE_RULE_FILES) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(workspaceRoot, relativePath);

    if (!existsSync(sourcePath) || statSync(sourcePath).size === 0) {
      continue;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function assertOpenClawRuntimeAvailable(): void {
  const entry = getOpenClawEntry();
  const entryDir = path.dirname(entry);

  if (!existsSync(entry)) {
    throw new RealOpenClawRuntimeError(
      `OpenClaw runtime entry does not exist: ${entry}`,
    );
  }

  if (!existsSync(entryDir)) {
    throw new RealOpenClawRuntimeError(
      `OpenClaw runtime directory does not exist: ${entryDir}`,
    );
  }
}

function resolveTextModel(): string | undefined {
  return process.env.OPENCLAW_AGENT_MODEL?.trim() || undefined;
}

function resolveTextBaseUrl(provider?: ImageApiProvider): string {
  const explicit = process.env.GENLINK_OPENCLAW_TEXT_BASE_URL?.trim();

  if (explicit) {
    return explicit;
  }

  switch (provider) {
    case "fucheers":
      return process.env.FUCHEERS_BASE_URL?.trim() || "https://www.fucheers.top/v1";
    case "comfly":
      return process.env.COMFLY_TEXT_BASE_URL?.trim() ||
        process.env.COMFLY_BASE_URL?.trim() ||
        "https://ai.comfly.org/v1";
    case "zhenzhen":
      return process.env.ZHENZHEN_TEXT_BASE_URL?.trim() ||
        process.env.ZHENZHEN_BASE_URL?.trim() ||
        "https://ai.t8star.cn/v1";
    case "grsai":
      return process.env.GRSAI_BASE_URL?.trim() || "https://grsai.dakka.com.cn";
    default:
      return process.env.VIBE_BASE_URL?.trim() || "https://www.vibeapi.cn/v1";
  }
}

function resolveTextApiKey(input: RealOpenClawRunInput): string {
  const requestKey = input.apiKey?.trim();

  if (requestKey) {
    return requestKey;
  }

  return process.env.GENLINK_OPENCLAW_TEXT_API_KEY?.trim() ||
    process.env.VIBE_API_KEY?.trim() ||
    "";
}

function parseCliJson(stdout: string): unknown {
  const trimmed = stdout.trim();

  if (!trimmed) {
    throw new RealOpenClawRuntimeError("OpenClaw returned empty stdout");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new RealOpenClawRuntimeError(
      `OpenClaw returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }
}

function extractText(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }

  const record = raw as Record<string, unknown>;
  const payloads = Array.isArray(record.payloads) ? record.payloads : [];

  return payloads.flatMap((payload) => {
    if (!payload || typeof payload !== "object") {
      return [];
    }

    const text = (payload as Record<string, unknown>).text;

    return typeof text === "string" ? [text] : [];
  }).join("\n\n").trim();
}

export async function runRealOpenClaw(input: RealOpenClawRunInput): Promise<RealOpenClawRunResult> {
  const apiKey = resolveTextApiKey(input);

  if (!apiKey) {
    throw new RealOpenClawRuntimeError(
      "OPENCLAW_REAL_RUNTIME=1 requires an Agent panel API key, GENLINK_OPENCLAW_TEXT_API_KEY, or VIBE_API_KEY",
    );
  }

  assertOpenClawRuntimeAvailable();

  try {
    syncCoreRulesToOpenClawWorkspace();
  } catch (error) {
    throw new RealOpenClawRuntimeError(
      `OpenClaw workspace sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return await new Promise((resolve, reject) => {
    const args = [
      getOpenClawEntry(),
      "agent",
      "--local",
      "--json",
      "--session-key",
      input.sessionKey,
      "--timeout",
      String(Math.max(1, Math.ceil(input.timeoutMs / 1000))),
      "--message",
      input.message,
    ];
    const model = input.model ?? resolveTextModel();

    if (model) {
      args.push("--model", model);
    }

    const child = spawn(process.execPath, args, {
      cwd: path.dirname(getOpenClawEntry()),
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: getOpenClawConfigPath(),
        OPENCLAW_STATE_DIR: getOpenClawStateDir(),
        GENLINK_OPENCLAW_TEXT_BASE_URL: resolveTextBaseUrl(input.provider),
        GENLINK_OPENCLAW_TEXT_API_KEY: apiKey,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new RealOpenClawRuntimeError(`OpenClaw timed out after ${Math.round(input.timeoutMs / 1000)}s`));
    }, input.timeoutMs + 5_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new RealOpenClawRuntimeError(`OpenClaw process failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new RealOpenClawRuntimeError(
          `OpenClaw exited with code ${code}: ${stderr.trim() || stdout.trim() || "no output"}`,
        ));
        return;
      }

      try {
        const raw = parseCliJson(stdout);
        const text = extractText(raw);

        if (!text) {
          throw new RealOpenClawRuntimeError("OpenClaw returned no visible text payload");
        }

        resolve({
          text,
          raw,
          meta: raw && typeof raw === "object" && !Array.isArray(raw)
            ? ((raw as Record<string, unknown>).meta as Record<string, unknown> | undefined)
            : undefined,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
