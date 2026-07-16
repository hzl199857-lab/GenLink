import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import JSON5 from "json5";

const GENERATED_CONFIG_FILE = "openclaw-agent.generated.json";
const LEGACY_BACKUP_FILE = "openclaw-genlink.legacy-gpt.json";

const OPENCLAW_AGENT_MODELS = [
  { id: "gemini-3.5-flash", name: "GenLink Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", name: "GenLink Gemini 3.1 Pro" },
  { id: "gpt-5.4-mini", name: "GenLink GPT-5.4 Mini" },
  { id: "gpt-5.5", name: "GenLink GPT-5.5" },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function createModelDefinition(model: (typeof OPENCLAW_AGENT_MODELS)[number]) {
  return {
    id: model.id,
    name: model.name,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    contextTokens: 96000,
    maxTokens: 8192,
    compat: {
      ...(model.id.startsWith("gemini-")
        ? { maxTokensField: "max_tokens" }
        : {}),
      requiresStringContent: true,
      strictMessageKeys: true,
    },
  };
}

export function buildOpenClawRuntimeConfig(
  baseConfig: Record<string, unknown>,
): Record<string, unknown> {
  const agents = asRecord(baseConfig.agents);
  const defaults = asRecord(agents.defaults);
  const models = asRecord(baseConfig.models);
  const providers = asRecord(models.providers);
  const textProvider = asRecord(providers.genlink_text);
  const agentModelAliases = Object.fromEntries(
    OPENCLAW_AGENT_MODELS.map((model) => [
      `genlink_text/${model.id}`,
      { alias: model.name },
    ]),
  );

  return {
    ...baseConfig,
    agents: {
      ...agents,
      defaults: {
        ...defaults,
        model: { primary: "genlink_text/gpt-5.5" },
        models: agentModelAliases,
      },
    },
    models: {
      ...models,
      providers: {
        ...providers,
        genlink_text: {
          ...textProvider,
          baseUrl: "${GENLINK_OPENCLAW_TEXT_BASE_URL}",
          apiKey: "${GENLINK_OPENCLAW_TEXT_API_KEY}",
          models: OPENCLAW_AGENT_MODELS.map(createModelDefinition),
        },
      },
    },
  };
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

export function prepareOpenClawRuntimeConfig(input: {
  baseConfigPath: string;
  stateDir: string;
}): {
  configPath: string;
  legacyBackupPath: string;
  legacyBackupHash: string;
} {
  const sourceBytes = readFileSync(input.baseConfigPath);
  const backupDir = path.join(path.dirname(input.baseConfigPath), "backups");
  const legacyBackupPath = path.join(backupDir, LEGACY_BACKUP_FILE);
  const legacyBackupHashPath = `${legacyBackupPath}.sha256`;

  mkdirSync(backupDir, { recursive: true });
  if (!existsSync(legacyBackupPath)) {
    writeFileSync(legacyBackupPath, sourceBytes, { flag: "wx" });
  }

  const legacyBackupHash = sha256(readFileSync(legacyBackupPath));
  if (!existsSync(legacyBackupHashPath)) {
    writeFileSync(legacyBackupHashPath, `${legacyBackupHash}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  }

  const baseConfig = JSON5.parse(sourceBytes.toString("utf8")) as Record<string, unknown>;
  const generatedConfig = buildOpenClawRuntimeConfig(baseConfig);
  const configPath = path.join(
    input.stateDir,
    "genlink-runtime",
    GENERATED_CONFIG_FILE,
  );
  writeJsonAtomically(configPath, generatedConfig);

  return {
    configPath,
    legacyBackupPath,
    legacyBackupHash,
  };
}
