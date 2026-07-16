import type { AgentProvider } from "@/types/agent";

export const AGENT_MODEL_OPTIONS = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", family: "gemini" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", family: "gemini" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", family: "gpt" },
  { id: "gpt-5.5", label: "GPT-5.5", family: "gpt" },
] as const;

export type AgentModelId = (typeof AGENT_MODEL_OPTIONS)[number]["id"];
export type AgentModelFamily = (typeof AGENT_MODEL_OPTIONS)[number]["family"];
export type AgentModelOption = (typeof AGENT_MODEL_OPTIONS)[number];

const GEMINI_AGENT_PROVIDERS: readonly AgentProvider[] = ["comfly", "zhenzhen"];
const DEFAULT_GEMINI_MODEL: AgentModelId = "gemini-3.5-flash";
const DEFAULT_GPT_MODEL: AgentModelId = "gpt-5.4-mini";

export function isAgentModelId(value: string): value is AgentModelId {
  return AGENT_MODEL_OPTIONS.some((option) => option.id === value);
}

export function getAgentModelOptions(
  provider: AgentProvider,
): readonly AgentModelOption[] {
  return AGENT_MODEL_OPTIONS.filter((option) => (
    option.family === "gpt" || GEMINI_AGENT_PROVIDERS.includes(provider)
  ));
}

export function isAgentModelSupportedByProvider(
  provider: AgentProvider,
  model: string,
): model is AgentModelId {
  return getAgentModelOptions(provider).some((option) => option.id === model);
}

export function resolveAgentModelForProvider(
  provider: AgentProvider,
  model: string,
): AgentModelId {
  if (isAgentModelSupportedByProvider(provider, model)) {
    return model;
  }

  return GEMINI_AGENT_PROVIDERS.includes(provider)
    ? DEFAULT_GEMINI_MODEL
    : DEFAULT_GPT_MODEL;
}
