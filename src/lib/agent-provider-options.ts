import type { AgentProvider } from "@/types/agent";

export type AgentProviderOption = {
  id: AgentProvider;
  label: string;
};

export const AGENT_TEXT_PROVIDER_OPTIONS = [
  { id: "comfly", label: "Comfly" },
  { id: "zhenzhen", label: "Zhenzhen" },
] as const satisfies readonly AgentProviderOption[];

export const AGENT_TEXT_PROVIDERS: readonly AgentProvider[] = AGENT_TEXT_PROVIDER_OPTIONS.map(
  (option) => option.id,
);

export function isAgentTextProvider(value: unknown): value is AgentProvider {
  return typeof value === "string" && AGENT_TEXT_PROVIDERS.includes(value as AgentProvider);
}
