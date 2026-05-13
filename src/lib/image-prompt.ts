import type { ImageGenerationNodeData } from "@/types/canvas";

const IMAGE_PROMPT_SECTION_LABELS = [
  "Additional image instructions:",
  "Upstream text node content:",
];

function stripImagePromptSectionLabel(section: string): string {
  const trimmedSection = section.trim();
  const label = IMAGE_PROMPT_SECTION_LABELS.find((item) =>
    trimmedSection.toLowerCase().startsWith(item.toLowerCase()),
  );

  if (!label) {
    return trimmedSection;
  }

  return trimmedSection.slice(label.length).trim();
}

export function stripImagePromptSectionLabels(prompt: string | undefined): string {
  if (!prompt?.trim()) {
    return "";
  }

  const cleanedPrompt = prompt
    .split(/\n{2,}/)
    .map(stripImagePromptSectionLabel)
    .filter(Boolean)
    .join("\n\n");

  return cleanedPrompt || prompt.trim();
}

export function getImageHistoryDisplayPrompt(
  nodeData: Pick<ImageGenerationNodeData, "prompt" | "effectivePromptOverride">,
): string {
  return (
    stripImagePromptSectionLabels(nodeData.prompt) ||
    stripImagePromptSectionLabels(nodeData.effectivePromptOverride)
  );
}
