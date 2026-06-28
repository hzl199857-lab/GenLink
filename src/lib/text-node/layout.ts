import type { TextNodeData } from "@/types/canvas";

export const TEXT_NODE_DEFAULT_CARD_WIDTH = 511;
export const TEXT_NODE_DEFAULT_CARD_HEIGHT = 289;
export const TEXT_NODE_MAX_CARD_WIDTH = 1800;
export const TEXT_NODE_MAX_CARD_HEIGHT = 1000;

export interface TextNodeCardSize {
  width: number;
  height: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTextNodeCardSize(width: unknown, height: unknown): TextNodeCardSize {
  const nextWidth =
    typeof width === "number" && Number.isFinite(width)
      ? width
      : TEXT_NODE_DEFAULT_CARD_WIDTH;
  const nextHeight =
    typeof height === "number" && Number.isFinite(height)
      ? height
      : TEXT_NODE_DEFAULT_CARD_HEIGHT;

  return {
    width: Math.round(clampNumber(nextWidth, TEXT_NODE_DEFAULT_CARD_WIDTH, TEXT_NODE_MAX_CARD_WIDTH)),
    height: Math.round(clampNumber(nextHeight, TEXT_NODE_DEFAULT_CARD_HEIGHT, TEXT_NODE_MAX_CARD_HEIGHT)),
  };
}

export function getTextNodeCardSize(
  data: Pick<TextNodeData, "cardWidth" | "cardHeight">,
): TextNodeCardSize {
  return normalizeTextNodeCardSize(data.cardWidth, data.cardHeight);
}
