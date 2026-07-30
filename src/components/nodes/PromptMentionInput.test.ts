import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./PromptMentionInput.tsx', import.meta.url), 'utf8');

test('agent mention menu renders through the viewport portal above the composer', () => {
  assert.match(source, /agentViewportLeft: number/);
  assert.match(source, /agentViewportBottom: number/);
  assert.match(source, /bottom: trigger\.agentViewportBottom/);
  assert.match(source, /\{mentionMenu && typeof document !== 'undefined'/);
  assert.doesNotMatch(source, /\{agentMenu && trigger \? \(/);
});

test('default mention menu anchors above the caret using its rendered height', () => {
  assert.match(source, /viewportBottom: number \| null/);
  assert.match(
    source,
    /top: trigger\.viewportBottom === null \? trigger\.viewportTop : undefined/,
  );
  assert.match(source, /bottom: trigger\.viewportBottom \?\? undefined/);
  assert.doesNotMatch(
    source,
    /caretTop - DEFAULT_MENTION_MENU_MAX_HEIGHT - 6/,
  );
});
