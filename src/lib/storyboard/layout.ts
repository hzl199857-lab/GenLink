import type { StoryboardScriptNodeData } from '@/types/canvas';

export const STORYBOARD_NODE_DEFAULT_CARD_WIDTH = 980;
export const STORYBOARD_NODE_DEFAULT_CARD_HEIGHT = 520;
export const STORYBOARD_NODE_MIN_CARD_WIDTH = 640;
export const STORYBOARD_NODE_MIN_CARD_HEIGHT = 360;
export const STORYBOARD_NODE_MAX_CARD_WIDTH = 2600;
export const STORYBOARD_NODE_MAX_CARD_HEIGHT = 1100;

export interface StoryboardCardSize {
  width: number;
  height: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeStoryboardCardSize(width: unknown, height: unknown): StoryboardCardSize {
  const nextWidth =
    typeof width === 'number' && Number.isFinite(width)
      ? width
      : STORYBOARD_NODE_DEFAULT_CARD_WIDTH;
  const nextHeight =
    typeof height === 'number' && Number.isFinite(height)
      ? height
      : STORYBOARD_NODE_DEFAULT_CARD_HEIGHT;

  return {
    width: Math.round(clampNumber(nextWidth, STORYBOARD_NODE_MIN_CARD_WIDTH, STORYBOARD_NODE_MAX_CARD_WIDTH)),
    height: Math.round(clampNumber(nextHeight, STORYBOARD_NODE_MIN_CARD_HEIGHT, STORYBOARD_NODE_MAX_CARD_HEIGHT)),
  };
}

export function getStoryboardCardSize(data: Pick<StoryboardScriptNodeData, 'cardWidth' | 'cardHeight'>): StoryboardCardSize {
  return normalizeStoryboardCardSize(data.cardWidth, data.cardHeight);
}
