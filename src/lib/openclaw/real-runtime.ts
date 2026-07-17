import "server-only";

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ImageApiProvider } from "@/lib/vibe";
import { prepareOpenClawRuntimeConfig } from "./runtime-config";

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

export type RealOpenClawRuntimeDiagnostic = {
  kind:
    | "missing_api_key"
    | "missing_runtime"
    | "workspace_sync_failed"
    | "process_start_failed"
    | "process_timeout"
    | "provider_timeout"
    | "provider_network"
    | "provider_http_error"
    | "provider_content_filter"
    | "provider_tool_protocol"
    | "unsupported_model"
    | "invalid_config"
    | "invalid_json"
    | "empty_output"
    | "process_failed";
  provider?: ImageApiProvider;
  model?: string;
  baseUrlHost?: string;
  elapsedMs?: number;
  timeoutMs?: number;
  exitCode?: number | null;
  stderrPreview?: string;
  stdoutPreview?: string;
};

export type PublicRealOpenClawRuntimeDiagnostic = Omit<
  RealOpenClawRuntimeDiagnostic,
  "stderrPreview" | "stdoutPreview"
>;

export class RealOpenClawRuntimeError extends Error {
  public readonly publicMessage?: string;
  public readonly diagnostic?: RealOpenClawRuntimeDiagnostic;

  constructor(
    message: string,
    options: {
      publicMessage?: string;
      diagnostic?: RealOpenClawRuntimeDiagnostic;
    } = {},
  ) {
    super(message);
    this.name = "RealOpenClawRuntimeError";
    this.publicMessage = options.publicMessage;
    this.diagnostic = options.diagnostic;
  }
}

export function getPublicRealOpenClawRuntimeDiagnostic(
  diagnostic?: RealOpenClawRuntimeDiagnostic,
): PublicRealOpenClawRuntimeDiagnostic | undefined {
  if (!diagnostic) {
    return undefined;
  }

  return {
    kind: diagnostic.kind,
    provider: diagnostic.provider,
    model: diagnostic.model,
    baseUrlHost: diagnostic.baseUrlHost,
    elapsedMs: diagnostic.elapsedMs,
    timeoutMs: diagnostic.timeoutMs,
    exitCode: diagnostic.exitCode,
  };
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
const OPENCLAW_STDIN_MESSAGE_THRESHOLD = 16_000;
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

function getOpenClawStdinRunner(): string {
  return process.env.OPENCLAW_STDIN_RUNNER?.trim() ||
    path.join(process.cwd(), "scripts", "openclaw-stdin-runner.mjs");
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

export function resolveTextBaseUrl(provider?: ImageApiProvider): string {
  const explicit = process.env.GENLINK_OPENCLAW_TEXT_BASE_URL?.trim();

  if (!provider && explicit) {
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

function getBaseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid-url";
  }
}

function getProviderLabel(provider?: ImageApiProvider): string {
  switch (provider) {
    case "fucheers":
      return "Fucheers";
    case "comfly":
      return "Comfly";
    case "zhenzhen":
      return "贞贞 AI 工坊";
    case "grsai":
      return "Grsai";
    case "vibe":
      return "Vibe API";
    default:
      return "当前文本模型服务";
  }
}

function previewOpenClawOutput(text: string): string | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key["'=:\s]+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 800);
}

export function classifyOpenClawFailure(output: string): RealOpenClawRuntimeDiagnostic["kind"] {
  if (/function_response\.name:\s*Name cannot be empty|Tool [^\n]+ not found/i.test(output)) {
    return "provider_tool_protocol";
  }

  if (/finish_reason:\s*content_filter|content[_\s-]?filter(?:ed)?/i.test(output)) {
    return "provider_content_filter";
  }

  if (/unknown model|model[^\n]*(not found|not registered|unregistered)|unsupported model/i.test(output)) {
    return "unsupported_model";
  }

  if (/invalid config|configuration error|failed to (load|parse) config|models\.providers[^\n]*(invalid|malformed)/i.test(output)) {
    return "invalid_config";
  }

  if (/timed?\s*out|timeout|AbortError|LLM request timed out/i.test(output)) {
    return "provider_timeout";
  }

  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network|TLS|certificate/i.test(output)) {
    return "provider_network";
  }

  if (/\bHTTP\s*(4\d\d|5\d\d)\b|status\s*(=|:)\s*(4\d\d|5\d\d)|request failed with status/i.test(output)) {
    return "provider_http_error";
  }

  return "process_failed";
}

function buildRuntimePublicMessage(diagnostic: RealOpenClawRuntimeDiagnostic): string {
  const providerLabel = getProviderLabel(diagnostic.provider);
  const modelText = diagnostic.model ? `，模型 ${diagnostic.model}` : "";
  const hostText = diagnostic.baseUrlHost ? `，目标 ${diagnostic.baseUrlHost}` : "";

  if (diagnostic.kind === "provider_timeout" || diagnostic.kind === "process_timeout") {
    return `${providerLabel} 在服务器侧请求超时${modelText}${hostText}。如果本地可用但线上不可用，请优先检查阿里云服务器到该服务的网络连通性和反向代理超时时间。`;
  }

  if (diagnostic.kind === "provider_network") {
    return `${providerLabel} 在服务器侧网络请求失败${modelText}${hostText}。请检查阿里云服务器 DNS、TLS、防火墙或到该服务的出站连通性。`;
  }

  if (diagnostic.kind === "provider_http_error") {
    return `${providerLabel} 返回了上游 HTTP 错误${modelText}${hostText}。请检查该 provider 的 API Key、模型名和后台错误记录。`;
  }

  if (diagnostic.kind === "provider_content_filter") {
    return `${providerLabel} 拒绝了当前请求（内容安全过滤）${modelText}。这不是超时；请调整提示词或切换模型后重试。`;
  }

  if (diagnostic.kind === "provider_tool_protocol") {
    return `${providerLabel} 的 Gemini 工具协议与当前规则运行不兼容${modelText}。这不是超时；当前请求已改为禁用工具调用。`;
  }

  if (diagnostic.kind === "missing_api_key") {
    return `${providerLabel} 缺少 API Key，请先在 API 设置里保存该 provider 的文本模型 Key。`;
  }

  if (diagnostic.kind === "missing_runtime") {
    return "服务器上的 GenLink 规则运行时未安装或路径配置不正确。";
  }

  if (diagnostic.kind === "unsupported_model") {
    return `当前模型未在 GenLink 规则运行配置中注册${modelText}。请检查模型选择或重新生成 OpenClaw 配置。`;
  }

  if (diagnostic.kind === "invalid_config") {
    return "GenLink 规则运行配置无效，无法启动 Agent。请检查 OpenClaw 配置文件。";
  }

  if (diagnostic.kind === "workspace_sync_failed") {
    return "服务器同步 GenLink 规则文件失败，请检查规则目录和运行时工作目录权限。";
  }

  return `${providerLabel} 规则运行失败${modelText}${hostText}。请查看服务器日志中的 openclaw-runtime 诊断信息。`;
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
  const provider = input.provider;
  const baseUrl = resolveTextBaseUrl(provider);
  const baseUrlHost = getBaseUrlHost(baseUrl);
  const startedAt = Date.now();
  const model = input.model ?? resolveTextModel();

  if (!apiKey) {
    const diagnostic: RealOpenClawRuntimeDiagnostic = {
      kind: "missing_api_key",
      provider,
      model,
      baseUrlHost,
    };

    throw new RealOpenClawRuntimeError(
      "OPENCLAW_REAL_RUNTIME=1 requires an Agent panel API key, GENLINK_OPENCLAW_TEXT_API_KEY, or VIBE_API_KEY",
      {
        publicMessage: buildRuntimePublicMessage(diagnostic),
        diagnostic,
      },
    );
  }

  try {
    assertOpenClawRuntimeAvailable();
  } catch (error) {
    if (error instanceof RealOpenClawRuntimeError) {
      const diagnostic: RealOpenClawRuntimeDiagnostic = {
        kind: "missing_runtime",
        provider,
        model,
        baseUrlHost,
      };

      throw new RealOpenClawRuntimeError(error.message, {
        publicMessage: buildRuntimePublicMessage(diagnostic),
        diagnostic,
      });
    }

    throw error;
  }

  try {
    syncCoreRulesToOpenClawWorkspace();
  } catch (error) {
    const diagnostic: RealOpenClawRuntimeDiagnostic = {
      kind: "workspace_sync_failed",
      provider,
      model,
      baseUrlHost,
      elapsedMs: Date.now() - startedAt,
    };

    throw new RealOpenClawRuntimeError(
      `OpenClaw workspace sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
      {
        publicMessage: buildRuntimePublicMessage(diagnostic),
        diagnostic,
      },
    );
  }

  let runtimeConfigPath: string;
  try {
    runtimeConfigPath = prepareOpenClawRuntimeConfig({
      baseConfigPath: getOpenClawConfigPath(),
      stateDir: getOpenClawStateDir(),
    }).configPath;
  } catch (error) {
    const diagnostic: RealOpenClawRuntimeDiagnostic = {
      kind: "invalid_config",
      provider,
      model,
      baseUrlHost,
      elapsedMs: Date.now() - startedAt,
    };

    throw new RealOpenClawRuntimeError(
      `OpenClaw config preparation failed: ${error instanceof Error ? error.message : "unknown error"}`,
      {
        publicMessage: buildRuntimePublicMessage(diagnostic),
        diagnostic,
      },
    );
  }

  console.info("[openclaw-runtime] start", {
    provider,
    model,
    baseUrlHost,
    timeoutMs: input.timeoutMs,
    messageChars: input.message.length,
    messageTransport: input.message.length > OPENCLAW_STDIN_MESSAGE_THRESHOLD
      ? "stdin"
      : "argument",
  });

  return await new Promise((resolve, reject) => {
    const openClawArgs = [
      "agent",
      "--local",
      "--json",
      "--session-key",
      input.sessionKey,
      "--timeout",
      String(Math.max(1, Math.ceil(input.timeoutMs / 1000))),
    ];

    if (model) {
      openClawArgs.push("--model", model);
    }

    const useStdinMessage = input.message.length > OPENCLAW_STDIN_MESSAGE_THRESHOLD;
    const args = useStdinMessage
      ? [getOpenClawStdinRunner(), getOpenClawEntry(), ...openClawArgs]
      : [getOpenClawEntry(), ...openClawArgs, "--message", input.message];

    const child = spawn(process.execPath, args, {
      cwd: path.dirname(getOpenClawEntry()),
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: runtimeConfigPath,
        OPENCLAW_STATE_DIR: getOpenClawStateDir(),
        GENLINK_OPENCLAW_TEXT_BASE_URL: baseUrl,
        GENLINK_OPENCLAW_TEXT_API_KEY: apiKey,
        ...(useStdinMessage ? { NODE_DISABLE_COMPILE_CACHE: "1" } : {}),
      },
      windowsHide: true,
      stdio: [useStdinMessage ? "pipe" : "ignore", "pipe", "pipe"],
    });

    if (useStdinMessage) {
      child.stdin?.end(input.message);
    }
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      const diagnostic: RealOpenClawRuntimeDiagnostic = {
        kind: "process_timeout",
        provider,
        model,
        baseUrlHost,
        elapsedMs: Date.now() - startedAt,
        timeoutMs: input.timeoutMs,
        stderrPreview: previewOpenClawOutput(stderr),
        stdoutPreview: previewOpenClawOutput(stdout),
      };

      console.error("[openclaw-runtime] timeout", diagnostic);
      reject(new RealOpenClawRuntimeError(
        `OpenClaw timed out after ${Math.round(input.timeoutMs / 1000)}s`,
        {
          publicMessage: buildRuntimePublicMessage(diagnostic),
          diagnostic,
        },
      ));
    }, input.timeoutMs + 5_000);

    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr!.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      const diagnostic: RealOpenClawRuntimeDiagnostic = {
        kind: "process_start_failed",
        provider,
        model,
        baseUrlHost,
        elapsedMs: Date.now() - startedAt,
      };

      console.error("[openclaw-runtime] process start failed", {
        ...diagnostic,
        error: error.message,
      });
      reject(new RealOpenClawRuntimeError(
        `OpenClaw process failed to start: ${error.message}`,
        {
          publicMessage: buildRuntimePublicMessage(diagnostic),
          diagnostic,
        },
      ));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const output = stderr.trim() || stdout.trim();
        const diagnostic: RealOpenClawRuntimeDiagnostic = {
          kind: classifyOpenClawFailure(output),
          provider,
          model,
          baseUrlHost,
          elapsedMs: Date.now() - startedAt,
          timeoutMs: input.timeoutMs,
          exitCode: code,
          stderrPreview: previewOpenClawOutput(stderr),
          stdoutPreview: previewOpenClawOutput(stdout),
        };

        console.error("[openclaw-runtime] process failed", diagnostic);
        reject(new RealOpenClawRuntimeError(
          `OpenClaw exited with code ${code}: ${output || "no output"}`,
          {
            publicMessage: buildRuntimePublicMessage(diagnostic),
            diagnostic,
          },
        ));
        return;
      }

      try {
        const raw = parseCliJson(stdout);
        const text = extractText(raw);

        if (!text) {
          const diagnostic: RealOpenClawRuntimeDiagnostic = {
            kind: "empty_output",
            provider,
            model,
            baseUrlHost,
            elapsedMs: Date.now() - startedAt,
            stdoutPreview: previewOpenClawOutput(stdout),
          };

          throw new RealOpenClawRuntimeError("OpenClaw returned no visible text payload", {
            publicMessage: buildRuntimePublicMessage(diagnostic),
            diagnostic,
          });
        }

        console.info("[openclaw-runtime] success", {
          provider,
          model,
          baseUrlHost,
          elapsedMs: Date.now() - startedAt,
        });
        resolve({
          text,
          raw,
          meta: raw && typeof raw === "object" && !Array.isArray(raw)
            ? ((raw as Record<string, unknown>).meta as Record<string, unknown> | undefined)
            : undefined,
        });
      } catch (error) {
        if (error instanceof RealOpenClawRuntimeError) {
          console.error("[openclaw-runtime] output failed", error.diagnostic ?? {
            provider,
            model,
            baseUrlHost,
            elapsedMs: Date.now() - startedAt,
          });
          reject(error);
          return;
        }

        const diagnostic: RealOpenClawRuntimeDiagnostic = {
          kind: "invalid_json",
          provider,
          model,
          baseUrlHost,
          elapsedMs: Date.now() - startedAt,
          stdoutPreview: previewOpenClawOutput(stdout),
        };

        console.error("[openclaw-runtime] invalid output", diagnostic);
        reject(new RealOpenClawRuntimeError(
          error instanceof Error ? error.message : "OpenClaw returned invalid output",
          {
            publicMessage: buildRuntimePublicMessage(diagnostic),
            diagnostic,
          },
        ));
      }
    });
  });
}
