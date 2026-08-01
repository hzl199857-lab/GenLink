import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('project records are indexed and filtered by authenticated owner', () => {
  const projectStorage = source('src/lib/project-storage.ts');
  const listStart = projectStorage.indexOf('async function readAllProjectRecords');
  const listEnd = projectStorage.indexOf('async function requireStoredProjectOwner', listStart);
  const listingImplementation = projectStorage.slice(listStart, listEnd);

  assert.match(projectStorage, /ownerUserId/);
  assert.match(projectStorage, /PROJECT_OWNER_INDEX_NAME/);
  assert.match(projectStorage, /listProjectLibrary\(userId: string\)/);
  assert.match(
    listingImplementation,
    /store\.index\(PROJECT_OWNER_INDEX_NAME\)\.getAll\(userId\)/,
  );
  assert.match(listingImplementation, /store\.getAll\(\)/);
  assert.match(
    listingImplementation,
    /filter\(\(record\) => record\.ownerUserId === userId\)/,
  );
});

test('account changes clear canvas memory and invalidate pending work', () => {
  const canvasStore = source('src/store/canvas-store.ts');

  assert.match(canvasStore, /activeUserId/);
  assert.match(canvasStore, /userScopeEpoch/);
  assert.match(canvasStore, /setActiveUserId/);
});

test('legacy projects are not automatically assigned during project listing', () => {
  const projectStorage = source('src/lib/project-storage.ts');
  const listStart = projectStorage.indexOf('async function readAllProjectRecords');
  const listEnd = projectStorage.indexOf('async function requireStoredProjectOwner', listStart);
  const listingImplementation = projectStorage.slice(listStart, listEnd);

  assert.doesNotMatch(listingImplementation, /record\.ownerUserId\s*=\s*userId/);
  assert.doesNotMatch(projectStorage, /existing\.ownerUserId\s*=\s*userId/);
  assert.doesNotMatch(projectStorage, /record\.ownerUserId\s*=\s*userId/);
});
