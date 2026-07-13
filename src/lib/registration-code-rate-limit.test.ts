import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { getRegistrationCodeRateLimit } = require('./registration-code-rate-limit.ts') as typeof import('./registration-code-rate-limit');

const now = new Date('2026-07-13T12:00:00.000Z');

test('allows a first registration-code request', () => {
  assert.equal(getRegistrationCodeRateLimit({ recentCount: 0, latestRequestAt: null, now }), null);
});

test('blocks a request within the one-minute cooldown', () => {
  assert.equal(
    getRegistrationCodeRateLimit({ recentCount: 1, latestRequestAt: now, now })?.reason,
    'cooldown',
  );
});

test('blocks the sixth registration-code request in an hour', () => {
  assert.equal(
    getRegistrationCodeRateLimit({ recentCount: 5, latestRequestAt: null, now })?.reason,
    'hourly-limit',
  );
});
