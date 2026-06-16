import type { AgentImageGenerationPreference, AgentProvider } from "@/types/agent";
import {
  IMAGE_MODEL_OPTIONS_BY_PROVIDER,
  type RunningHubChannel,
} from "./image-generation-options";

export const DEFAULT_AGENT_IMAGE_ASPECT_RATIO = "auto";
export const DEFAULT_AGENT_IMAGE_QUALITY = "1K";
export const DEFAULT_AGENT_RUNNING_HUB_CHANNEL: RunningHubChannel = "official";

export type ResolvedAgentImageGenerationPreference = Required<AgentImageGenerationPreference>;

export function getImageModelDefault(provider: AgentProvider): string {
  const options = IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider];

  return options.find((option) => option.id === "gpt-image-2")?.id ?? options[0]?.id ?? "gpt-image-2";
}

export function resolveAgentImageGenerationPreference(params: {
  preference: AgentImageGenerationPreference;
  autoProvider: AgentProvider;
}): ResolvedAgentImageGenerationPreference {
  const selectedProvider = params.preference.provider ?? params.autoProvider;
  const modelOptions = IMAGE_MODEL_OPTIONS_BY_PROVIDER[selectedProvider];
  const selectedModel = modelOptions.some((option) => option.id === params.preference.model)
    ? params.preference.model as string
    : getImageModelDefault(selectedProvider);

  return {
    mode: params.preference.mode,
    provider: selectedProvider,
    model: selectedModel,
    runningHubChannel: selectedProvider === "runninghub"
      ? params.preference.runningHubChannel ?? DEFAULT_AGENT_RUNNING_HUB_CHANNEL
      : DEFAULT_AGENT_RUNNING_HUB_CHANNEL,
    aspectRatio: params.preference.aspectRatio ?? DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    quality: params.preference.quality ?? DEFAULT_AGENT_IMAGE_QUALITY,
  };
}
