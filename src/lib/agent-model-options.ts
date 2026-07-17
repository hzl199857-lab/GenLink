export const AGENT_MODEL_OPTIONS = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.5", label: "GPT-5.5" },
] as const;

export type AgentModelId = (typeof AGENT_MODEL_OPTIONS)[number]["id"];

export function isAgentModelId(value: string): value is AgentModelId {
  return AGENT_MODEL_OPTIONS.some((option) => option.id === value);
}
