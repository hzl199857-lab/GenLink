const COOLDOWN_MS = 60_000;
const HOURLY_LIMIT = 5;

export function getRegistrationCodeRateLimit(input: {
  recentCount: number;
  latestRequestAt: Date | null;
  now: Date;
}): { reason: 'cooldown' | 'hourly-limit' } | null {
  if (input.latestRequestAt && input.now.getTime() - input.latestRequestAt.getTime() < COOLDOWN_MS) {
    return { reason: 'cooldown' };
  }

  return input.recentCount >= HOURLY_LIMIT ? { reason: 'hourly-limit' } : null;
}

export const REGISTRATION_CODE_RATE_LIMIT_WINDOW_MS = 60 * 60_000;
