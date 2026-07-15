import type {
  AgentImageGenerationPreference,
  AgentProvider,
  AgentTaskAttachment,
} from "@/types/agent";
import type { AgentModelId } from "@/lib/agent-model-options";

export interface HomeAgentPendingRequest {
  id: string;
  prompt: string;
  provider: AgentProvider;
  model: AgentModelId;
  imagePreference: AgentImageGenerationPreference;
  files: File[];
}

export interface CanvasAgentLaunchRequest {
  id: string;
  prompt: string;
  provider: AgentProvider;
  model: AgentModelId;
  imagePreference: AgentImageGenerationPreference;
  attachments: AgentTaskAttachment[];
}

export function createHomeAgentPendingRequest(
  input: HomeAgentPendingRequest,
): HomeAgentPendingRequest {
  return {
    ...input,
    prompt: input.prompt.trim(),
    imagePreference: { ...input.imagePreference },
    files: [...input.files],
  };
}

export function selectRecentProjects<T extends { updatedAt: string }>(
  projects: T[],
  limit = 3,
): T[] {
  return [...projects]
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, Math.max(0, limit));
}
