import { migrateLegacyStorageValue, userStorageKey } from '@/lib/browser-user-storage';

export type UpdateRefreshAppMode = 'hero' | 'library' | 'canvas';

export type UpdateRefreshViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type UpdateRefreshRestoreState = {
  createdAt: number;
  mode: Exclude<UpdateRefreshAppMode, 'hero'>;
  projectId?: string;
  viewport?: UpdateRefreshViewport;
};

const ACTIVE_MODE_KEY = 'genlink:update-refresh-active-mode:v1';
const RESTORE_KEY = 'genlink:update-refresh-restore:v1';
const RESTORE_MAX_AGE_MS = 10 * 60 * 1000;

export const UPDATE_REFRESH_VIEWPORT_REQUEST_EVENT =
  'genlink:update-refresh-request-viewport';

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function isAppMode(value: unknown): value is UpdateRefreshAppMode {
  return value === 'hero' || value === 'library' || value === 'canvas';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewport(value: unknown): value is UpdateRefreshViewport {
  if (!value || typeof value !== 'object') return false;

  const viewport = value as Partial<UpdateRefreshViewport>;
  return (
    isFiniteNumber(viewport.x) &&
    isFiniteNumber(viewport.y) &&
    isFiniteNumber(viewport.zoom)
  );
}

function normalizeRestoreState(value: unknown): UpdateRefreshRestoreState | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<UpdateRefreshRestoreState>;
  if (candidate.mode !== 'library' && candidate.mode !== 'canvas') return null;
  if (!isFiniteNumber(candidate.createdAt)) return null;

  const age = Date.now() - candidate.createdAt;
  if (age < 0 || age > RESTORE_MAX_AGE_MS) return null;

  const projectId =
    typeof candidate.projectId === 'string' && candidate.projectId.length > 0
      ? candidate.projectId
      : undefined;

  return {
    createdAt: candidate.createdAt,
    mode: candidate.mode,
    projectId,
    viewport: isViewport(candidate.viewport) ? candidate.viewport : undefined,
  };
}

export function writeUpdateRefreshAppMode(userId: string, mode: UpdateRefreshAppMode) {
  if (!canUseSessionStorage()) return;
  migrateLegacyStorageValue(userId, ACTIVE_MODE_KEY, window.sessionStorage);
  window.sessionStorage.setItem(userStorageKey(userId, ACTIVE_MODE_KEY), mode);
}

export function readUpdateRefreshAppMode(userId: string): UpdateRefreshAppMode | null {
  if (!canUseSessionStorage()) return null;

  migrateLegacyStorageValue(userId, ACTIVE_MODE_KEY, window.sessionStorage);
  const value = window.sessionStorage.getItem(userStorageKey(userId, ACTIVE_MODE_KEY));
  return isAppMode(value) ? value : null;
}

export function writeUpdateRefreshRestoreState(
  userId: string,
  state: Omit<UpdateRefreshRestoreState, 'createdAt'>,
) {
  if (!canUseSessionStorage()) return;

  migrateLegacyStorageValue(userId, RESTORE_KEY, window.sessionStorage);
  window.sessionStorage.setItem(
    userStorageKey(userId, RESTORE_KEY),
    JSON.stringify({
      ...state,
      createdAt: Date.now(),
    }),
  );
}

export function readUpdateRefreshRestoreState(userId: string): UpdateRefreshRestoreState | null {
  if (!canUseSessionStorage()) return null;

  try {
    migrateLegacyStorageValue(userId, RESTORE_KEY, window.sessionStorage);
    const raw = window.sessionStorage.getItem(userStorageKey(userId, RESTORE_KEY));
    if (!raw) return null;

    const state = normalizeRestoreState(JSON.parse(raw));
    if (!state) {
      clearUpdateRefreshRestoreState(userId);
      return null;
    }

    return state;
  } catch {
    clearUpdateRefreshRestoreState(userId);
    return null;
  }
}

export function mergeUpdateRefreshRestoreViewport(
  userId: string,
  projectId: string,
  viewport: UpdateRefreshViewport,
) {
  const state = readUpdateRefreshRestoreState(userId);
  if (!state || state.mode !== 'canvas' || state.projectId !== projectId) return;

  writeUpdateRefreshRestoreState(userId, {
    ...state,
    viewport,
  });
}

export function clearUpdateRefreshRestoreState(userId: string) {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.removeItem(userStorageKey(userId, RESTORE_KEY));
}
