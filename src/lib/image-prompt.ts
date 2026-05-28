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

export type ThreeViewAngle = {
  rotation: number;
  pitch: number;
  scale: number;
};

function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let next = value % 360;

  if (next > 180) {
    next -= 360;
  }

  if (next <= -180) {
    next += 360;
  }

  return next;
}

function findClosestLabel<T extends { label: string; value: number }>(value: number, options: T[]): T {
  return options.reduce((best, option) =>
    Math.abs(value - option.value) < Math.abs(value - best.value) ? option : best,
  options[0]);
}

export function buildThreeViewPrompt(cameraAngle: ThreeViewAngle): string {
  const azimuth = findClosestLabel(normalizeRotationDegrees(cameraAngle.rotation), [
    { label: "front view", value: 0 },
    { label: "front-right quarter view", value: -45 },
    { label: "right side view", value: -90 },
    { label: "back-right quarter view", value: -135 },
    { label: "back view", value: 180 },
    { label: "back-left quarter view", value: 135 },
    { label: "left side view", value: 90 },
    { label: "front-left quarter view", value: 45 },
  ]);

  const elevation = findClosestLabel(cameraAngle.pitch, [
    { label: "low-angle shot", value: -30 },
    { label: "eye-level shot", value: 0 },
    { label: "elevated shot", value: 30 },
    { label: "high-angle shot", value: 60 },
  ]);

  const zoom = cameraAngle.scale <= 0.85
    ? "close-up"
    : cameraAngle.scale <= 1.5
      ? "medium shot"
      : "wide shot";

  return `switch the camera perspective: ${zoom}, ${azimuth.label}, ${elevation.label}`;
}

export function buildThreeViewImagePrompt(
  userPrompt: string,
  cameraAngle: ThreeViewAngle,
): string {
  const anglePrompt = buildThreeViewPrompt(cameraAngle);
  const trimmedUserPrompt = userPrompt.trim();
  const contextPrompt = "Use the provided reference image as the subject and generate a new image from the requested camera angle.";

  return [
    contextPrompt,
    anglePrompt,
    trimmedUserPrompt,
  ].filter(Boolean).join("\n\n");
}
