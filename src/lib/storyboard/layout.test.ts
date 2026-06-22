import {
  STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
  STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
  STORYBOARD_NODE_MAX_CARD_HEIGHT,
  STORYBOARD_NODE_MAX_CARD_WIDTH,
  STORYBOARD_NODE_MIN_CARD_HEIGHT,
  STORYBOARD_NODE_MIN_CARD_WIDTH,
  getStoryboardCardSize,
  normalizeStoryboardCardSize,
} from './layout';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function runStoryboardLayoutTests(): void {
  const defaults = getStoryboardCardSize({});

  assertEqual(defaults.width, STORYBOARD_NODE_DEFAULT_CARD_WIDTH, 'default width');
  assertEqual(defaults.height, STORYBOARD_NODE_DEFAULT_CARD_HEIGHT, 'default height');

  const minimum = normalizeStoryboardCardSize(100, 100);

  assertEqual(minimum.width, STORYBOARD_NODE_MIN_CARD_WIDTH, 'minimum width');
  assertEqual(minimum.height, STORYBOARD_NODE_MIN_CARD_HEIGHT, 'minimum height');

  const maximum = normalizeStoryboardCardSize(4000, 4000);

  assertEqual(maximum.width, STORYBOARD_NODE_MAX_CARD_WIDTH, 'maximum width');
  assertEqual(maximum.height, STORYBOARD_NODE_MAX_CARD_HEIGHT, 'maximum height');

  const rounded = normalizeStoryboardCardSize(1000.4, 620.6);

  assertEqual(rounded.width, 1000, 'rounded width');
  assertEqual(rounded.height, 621, 'rounded height');
}
