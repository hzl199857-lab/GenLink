export const AGENT_MODEL_OPTIONS = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
] as const;

export type AgentModelId = (typeof AGENT_MODEL_OPTIONS)[number]["id"];

export function isAgentModelId(value: string): value is AgentModelId {
  return AGENT_MODEL_OPTIONS.some((option) => option.id === value);
}
