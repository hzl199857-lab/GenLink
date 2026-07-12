const USER_STORAGE_PREFIX = "genlink.user";
const LEGACY_CLAIM_PREFIX = "genlink.legacy-claimed.v1";

export function userStorageKey(userId: string, baseKey: string): string {
  if (!userId.trim()) {
    throw new Error("userId must not be blank");
  }

  return `${USER_STORAGE_PREFIX}.${encodeURIComponent(userId)}.${baseKey}`;
}

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function migrateLegacyStorageValue(
  userId: string,
  baseKey: string,
  storage: Storage | null = getBrowserLocalStorage(),
): string | null {
  if (!storage) {
    return null;
  }

  const scopedKey = userStorageKey(userId, baseKey);
  const scopedValue = storage.getItem(scopedKey);
  const claimKey = `${LEGACY_CLAIM_PREFIX}.${baseKey}`;

  if (storage.getItem(claimKey) !== null) {
    return scopedValue;
  }

  if (scopedValue !== null) {
    storage.setItem(claimKey, userId);
    return scopedValue;
  }

  const legacyValue = storage.getItem(baseKey);

  if (legacyValue === null) {
    storage.setItem(claimKey, userId);
    return null;
  }

  storage.setItem(scopedKey, legacyValue);

  try {
    storage.setItem(claimKey, userId);
  } catch (error) {
    storage.removeItem(scopedKey);
    throw error;
  }

  return legacyValue;
}
