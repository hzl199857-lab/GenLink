import { isAgentModelSupportedByProvider } from "../agent-model-options";
import type { AgentProvider } from "../../types/agent";

const GENLINK_OPENCLAW_TEXT_PROVIDER = "genlink_text";

export class AgentModelCompatibilityError extends Error {
  public readonly provider: AgentProvider;
  public readonly model: string;

  constructor(provider: AgentProvider, model: string) {
    super(`Agent Provider ${provider} 不支持模型 ${model}`);
    this.name = "AgentModelCompatibilityError";
    this.provider = provider;
    this.model = model;
  }
}

function normalizeModelId(model?: string): string | undefined {
  const trimmed = model?.trim();

  if (!trimmed || trimmed === "auto") {
    return undefined;
  }

  return trimmed.toLowerCase();
}

export function mapAgentPanelModelToOpenClaw(params: {
  provider?: AgentProvider;
  model?: string;
}): string | undefined {
  const model = normalizeModelId(params.model);

  if (!model) {
    return undefined;
  }

  const unqualifiedModel = model.startsWith(`${GENLINK_OPENCLAW_TEXT_PROVIDER}/`)
    ? model.slice(GENLINK_OPENCLAW_TEXT_PROVIDER.length + 1)
    : model;

  if (
    params.provider &&
    !isAgentModelSupportedByProvider(params.provider, unqualifiedModel)
  ) {
    throw new AgentModelCompatibilityError(params.provider, unqualifiedModel);
  }

  if (model.includes("/")) {
    return model;
  }

  return `${GENLINK_OPENCLAW_TEXT_PROVIDER}/${model}`;
}
