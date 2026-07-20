const USER_STORAGE_PREFIX = "genlink.user";
const LEGACY_CLAIM_PREFIX = "genlink.legacy-claimed.v1";

function isStorageQuotaError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED"),
  );
}

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
  const claimOwner = storage.getItem(claimKey);

  if (claimOwner !== null) {
    if (claimOwner === userId && scopedValue !== null) {
      storage.removeItem(baseKey);
    }
    return scopedValue;
  }

  if (scopedValue !== null) {
    storage.setItem(claimKey, userId);
    storage.removeItem(baseKey);
    return scopedValue;
  }

  const legacyValue = storage.getItem(baseKey);

  if (legacyValue === null) {
    storage.setItem(claimKey, userId);
    return null;
  }

  let movedLegacyValue = false;
  try {
    storage.setItem(scopedKey, legacyValue);
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      throw error;
    }

    storage.removeItem(baseKey);
    movedLegacyValue = true;

    try {
      storage.setItem(scopedKey, legacyValue);
    } catch (moveError) {
      storage.setItem(baseKey, legacyValue);
      throw moveError;
    }
  }

  try {
    storage.setItem(claimKey, userId);
  } catch (error) {
    storage.removeItem(scopedKey);
    if (movedLegacyValue) {
      storage.setItem(baseKey, legacyValue);
    }
    throw error;
  }

  storage.removeItem(baseKey);

  return legacyValue;
}
