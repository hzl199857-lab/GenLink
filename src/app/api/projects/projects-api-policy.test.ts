import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const projectApiRoutes = [
  'src/app/api/projects/route.ts',
  'src/app/api/projects/[id]/route.ts',
];

test('legacy database project APIs are closed and do not access Prisma', () => {
  for (const routePath of projectApiRoutes) {
    const source = readFileSync(resolve(process.cwd(), routePath), 'utf8');

    assert.match(source, /status:\s*404/);
    assert.doesNotMatch(source, /@\/lib\/prisma/);
  }
});
