import type { PromptLibraryEntry } from "@/features/prompt-library/types";

export function mergePromptLibraryEntries(entries: PromptLibraryEntry[]): PromptLibraryEntry[] {
  const seen = new Set<string>();
  const merged: PromptLibraryEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    merged.push(entry);
  }

  return merged;
}

function getEntryTime(entry: PromptLibraryEntry): number {
  const updatedAt = new Date(entry.updatedAt).getTime();
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const createdAt = new Date(entry.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function getEntryNumericId(entry: PromptLibraryEntry): number {
  const value = Number(entry.id.match(/\d+$/)?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function sortPromptLibraryEntries(entries: PromptLibraryEntry[]): PromptLibraryEntry[] {
  return [...entries].sort((left, right) => {
    const timeDelta = getEntryTime(right) - getEntryTime(left);
    if (timeDelta !== 0) {
      return timeDelta;
    }

    const idDelta = getEntryNumericId(right) - getEntryNumericId(left);
    if (idDelta !== 0) {
      return idDelta;
    }

    return left.id.localeCompare(right.id);
  });
}
