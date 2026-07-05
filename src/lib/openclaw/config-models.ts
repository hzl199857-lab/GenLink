import { AGENT_MODEL_OPTIONS } from "../agent-model-options";

const GENLINK_TEXT_PROVIDER_ID = "genlink_text";
const FALLBACK_ALIAS_ANCHOR = '        "genlink_text/gpt-4o-mini": {';
const FALLBACK_MODEL_ANCHOR = '          {\n            id: "gpt-4o-mini",';

type AgentModelOption = typeof AGENT_MODEL_OPTIONS[number];

function toModelRef(model: AgentModelOption): string {
  return `${GENLINK_TEXT_PROVIDER_ID}/${model.id}`;
}

function toAliasBlock(model: AgentModelOption): string {
  return [
    `        "${toModelRef(model)}": {`,
    `          alias: "GenLink ${model.label}"`,
    "        }",
  ].join("\n");
}

function toProviderModelBlock(model: AgentModelOption): string {
  return [
    "          {",
    `            id: "${model.id}",`,
    `            name: "GenLink ${model.label}",`,
    "            reasoning: false,",
    '            input: ["text"],',
    "            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },",
    "            contextWindow: 128000,",
    "            contextTokens: 96000,",
    "            maxTokens: 8192,",
    "            compat: {",
    "              requiresStringContent: true,",
    "              strictMessageKeys: true",
    "            }",
    "          }",
  ].join("\n");
}

function insertBeforeAnchor(configText: string, anchor: string, block: string): string {
  if (!configText.includes(anchor)) {
    throw new Error(`OpenClaw config is missing expected anchor: ${anchor.trim()}`);
  }

  return configText.replace(anchor, `${block},\n${anchor}`);
}

export function ensureOpenClawConfigHasAgentModels(configText: string): string {
  return AGENT_MODEL_OPTIONS.reduce((current, model) => {
    let next = current;

    if (!next.includes(`"${toModelRef(model)}"`)) {
      next = insertBeforeAnchor(next, FALLBACK_ALIAS_ANCHOR, toAliasBlock(model));
    }

    if (!next.includes(`id: "${model.id}"`)) {
      next = insertBeforeAnchor(next, FALLBACK_MODEL_ANCHOR, toProviderModelBlock(model));
    }

    return next;
  }, configText);
}
