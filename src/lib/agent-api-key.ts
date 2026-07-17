import type { StoredApiSettings } from "../store/canvas-store";
import type { AgentProvider } from "../types/agent";
import {
  AGENT_TEXT_PROVIDERS,
  isAgentTextProvider,
} from "./agent-provider-options";

export type AgentApiCredential = {
  provider: AgentProvider;
  apiKey: string;
};

export function resolveAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
): AgentApiCredential | null {
  const candidates: AgentProvider[] = [
    preferredProvider,
    settings.textProvider,
    settings.imageProvider,
    ...AGENT_TEXT_PROVIDERS,
  ].filter((provider, index, providers): provider is AgentProvider => (
    isAgentTextProvider(provider) && providers.indexOf(provider) === index
  ));

  for (const provider of candidates) {
    const apiKey =
      settings.textApiKeys[provider]?.trim() ||
      settings.imageApiKeys[provider]?.trim();

    if (apiKey) {
      return { provider, apiKey };
    }
  }

  return null;
}

export function hasAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
): boolean {
  return resolveAgentApiCredential(settings, preferredProvider) !== null;
}
