'use client';

const LOCK_PREFIX = 'genlink:canvas-edit';
const LOCK_CHANNEL_NAME = 'genlink:canvas-edit-locks';
const OWNER_SESSION_KEY = 'genlink.canvasEditOwnerId';
const DEFAULT_LEASE_TIMEOUT_MS = 15_000;
const DEFAULT_HEARTBEAT_MS = 5_000;

export type CanvasLockLease = {
  projectId: string;
  canvasId: string;
  ownerId: string;
  heartbeatAt: number;
};

export type CanvasLockMessage = {
  type: 'acquired' | 'released' | 'handoff';
  projectId: string;
  canvasId: string;
  ownerId: string;
};

export type CanvasEditLockResult =
  | { acquired: false; ownerId?: string }
  | {
      acquired: true;
      ownerId: string;
      release: () => void;
      handoff: () => void;
    };

export function clearCanvasEditOwnerForWindow(
  target: Pick<Window, 'sessionStorage'>,
): void {
  target.sessionStorage.removeItem(OWNER_SESSION_KEY);
}

export function buildCanvasEditLockKey(projectId: string, canvasId: string): string {
  return `${LOCK_PREFIX}:${encodeURIComponent(projectId.trim())}:${encodeURIComponent(canvasId.trim())}`;
}

export function buildCanvasDeepLink(
  projectId: string,
  canvasId: string,
  baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  const url = new URL('/', baseUrl);
  url.searchParams.set('app', 'canvas');
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('canvasId', canvasId);
  return url.toString();
}

export function isCanvasEditLeaseStale(
  lease: Pick<CanvasLockLease, 'heartbeatAt'>,
  now = Date.now(),
  timeoutMs = DEFAULT_LEASE_TIMEOUT_MS,
): boolean {
  return now - lease.heartbeatAt > timeoutMs;
}

export function parseCanvasLockMessage(value: unknown): CanvasLockMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<CanvasLockMessage>;
  if (
    (candidate.type !== 'acquired' && candidate.type !== 'released' && candidate.type !== 'handoff') ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.canvasId !== 'string' ||
    typeof candidate.ownerId !== 'string'
  ) {
    return null;
  }

  return {
    type: candidate.type,
    projectId: candidate.projectId,
    canvasId: candidate.canvasId,
    ownerId: candidate.ownerId,
  };
}

function getWindowOwnerId(): string {
  const existing = window.sessionStorage.getItem(OWNER_SESSION_KEY);
  if (existing) {
    return existing;
  }

  const ownerId = crypto.randomUUID();
  window.sessionStorage.setItem(OWNER_SESSION_KEY, ownerId);
  return ownerId;
}

function readLease(key: string): CanvasLockLease | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<CanvasLockLease>;
    if (
      typeof value.projectId !== 'string' ||
      typeof value.canvasId !== 'string' ||
      typeof value.ownerId !== 'string' ||
      typeof value.heartbeatAt !== 'number'
    ) {
      return null;
    }
    return value as CanvasLockLease;
  } catch {
    return null;
  }
}

function postMessage(message: CanvasLockMessage): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(LOCK_CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

type WebLockAttempt =
  | { supported: false }
  | { supported: true; release: null | (() => void) };

async function acquireWebLock(key: string): Promise<WebLockAttempt> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return { supported: false };
  }

  let releaseLock: (() => void) | null = null;
  const acquired = await new Promise<boolean>((resolve) => {
    void navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }

      resolve(true);
      await new Promise<void>((release) => {
        releaseLock = release;
      });
    });
  });

  return {
    supported: true,
    release: acquired ? () => releaseLock?.() : null,
  };
}

export async function acquireCanvasEditLock(
  projectId: string,
  canvasId: string,
  options: { heartbeatMs?: number; leaseTimeoutMs?: number } = {},
): Promise<CanvasEditLockResult> {
  if (typeof window === 'undefined') {
    return { acquired: true, ownerId: 'server', release: () => {}, handoff: () => {} };
  }

  const key = buildCanvasEditLockKey(projectId, canvasId);
  const ownerId = getWindowOwnerId();
  const now = Date.now();
  const existing = readLease(key);

  const webLockAttempt = await acquireWebLock(key);
  if (webLockAttempt.supported && !webLockAttempt.release) {
    return { acquired: false, ownerId: existing?.ownerId };
  }

  if (!webLockAttempt.supported && existing && existing.ownerId !== ownerId && !isCanvasEditLeaseStale(
    existing,
    now,
    options.leaseTimeoutMs ?? DEFAULT_LEASE_TIMEOUT_MS,
  )) {
    return { acquired: false, ownerId: existing.ownerId };
  }

  const releaseWebLock = webLockAttempt.supported
    ? webLockAttempt.release!
    : () => {};

  const writeHeartbeat = () => {
    const lease: CanvasLockLease = { projectId, canvasId, ownerId, heartbeatAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(lease));
  };
  writeHeartbeat();

  if (readLease(key)?.ownerId !== ownerId) {
    releaseWebLock();
    return { acquired: false, ownerId: readLease(key)?.ownerId };
  }

  const timer = window.setInterval(writeHeartbeat, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  let released = false;
  const finishRelease = (notify: boolean) => {
    if (released) {
      return;
    }
    released = true;
    window.clearInterval(timer);
    if (readLease(key)?.ownerId === ownerId) {
      window.localStorage.removeItem(key);
    }
    releaseWebLock();
    if (notify) {
      postMessage({ type: 'released', projectId, canvasId, ownerId });
    }
  };
  const release = () => finishRelease(true);
  const handoff = () => {
    finishRelease(false);
    postMessage({ type: 'handoff', projectId, canvasId, ownerId });
  };

  postMessage({ type: 'acquired', projectId, canvasId, ownerId });
  return { acquired: true, ownerId, release, handoff };
}

export function subscribeCanvasLockEvents(
  listener: (message: CanvasLockMessage) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  const channel = new BroadcastChannel(LOCK_CHANNEL_NAME);
  channel.addEventListener('message', (event) => {
    const message = parseCanvasLockMessage(event.data);
    if (message) {
      listener(message);
    }
  });
  return () => channel.close();
}
