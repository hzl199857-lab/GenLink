import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const publicRoutes = new Set([
  'src/app/api/app-version/route.ts',
  'src/app/api/auth/[...all]/route.ts',
  'src/app/api/auth/send-register-code/route.ts',
  'src/app/api/auth/verify-register-code/route.ts',
  'src/app/api/prompt-library/community/route.ts',
]);

const closedRoutes = new Set([
  'src/app/api/projects/route.ts',
  'src/app/api/projects/[id]/route.ts',
  'src/app/api/image-history/route.ts',
]);

test('all sensitive API routes require a validated server session', () => {
  const routePaths = execFileSync('git', ['ls-files', 'src/app/api/**/route.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);

  for (const routePath of routePaths) {
    const source = readFileSync(resolve(process.cwd(), routePath), 'utf8');

    if (closedRoutes.has(routePath)) {
      assert.match(source, /status:\s*404/);
      assert.doesNotMatch(source, /@\/lib\/prisma/);
      continue;
    }

    if (!publicRoutes.has(routePath)) {
      assert.match(source, /requireAuth\(/, routePath);
    }
  }
});

test('MCP derives the user identity from the validated session only', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/api/mcp/route.ts'), 'utf8');

  assert.match(source, /access\.session\.user\.id/);
  assert.doesNotMatch(source, /x-genlink-user-id/);
});
