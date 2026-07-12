"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { PromptLibraryEntry } from "@/features/prompt-library/types";
import { migrateLegacyStorageValue, userStorageKey } from "@/lib/browser-user-storage";

const PROMPT_LIBRARY_STORAGE_KEY = "prompt-library-storage";
const NOOP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
const BROWSER_STORAGE: StateStorage = {
  getItem: (name) => typeof window === "undefined" ? null : window.localStorage.getItem(name),
  setItem: (name, value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(name, value);
    }
  },
  removeItem: (name) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(name);
    }
  },
};
let promptHydrationQueue = Promise.resolve();
let promptHydrationRequestId = 0;

export interface PromptLibraryState {
  favoritePrompts: Record<string, PromptLibraryEntry>;
  communityPrompts: PromptLibraryEntry[];
  communityFetchedAt: string | null;
  addFavorite: (entry: PromptLibraryEntry) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (entry: PromptLibraryEntry) => void;
  setCommunityCache: (entries: PromptLibraryEntry[], fetchedAt: string) => void;
}

export function createPromptLibraryState(): PromptLibraryState {
  const state: PromptLibraryState = {
    favoritePrompts: {},
    communityPrompts: [],
    communityFetchedAt: null,
    addFavorite: (entry) => {
      state.favoritePrompts = {
        ...state.favoritePrompts,
        [entry.id]: entry,
      };
    },
    removeFavorite: (id) => {
      const nextFavorites = { ...state.favoritePrompts };
      delete nextFavorites[id];
      state.favoritePrompts = nextFavorites;
    },
    toggleFavorite: (entry) => {
      if (state.favoritePrompts[entry.id]) {
        state.removeFavorite(entry.id);
        return;
      }
      state.addFavorite(entry);
    },
    setCommunityCache: (entries, fetchedAt) => {
      state.communityPrompts = entries;
      state.communityFetchedAt = fetchedAt;
    },
  };

  return state;
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      favoritePrompts: {},
      communityPrompts: [],
      communityFetchedAt: null,
      addFavorite: (entry) => {
        set((state) => ({
          favoritePrompts: {
            ...state.favoritePrompts,
            [entry.id]: entry,
          },
        }));
      },
      removeFavorite: (id) => {
        set((state) => {
          const nextFavorites = { ...state.favoritePrompts };
          delete nextFavorites[id];
          return { favoritePrompts: nextFavorites };
        });
      },
      toggleFavorite: (entry) => {
        const favorites = get().favoritePrompts;
        if (favorites[entry.id]) {
          get().removeFavorite(entry.id);
          return;
        }
        get().addFavorite(entry);
      },
      setCommunityCache: (entries, fetchedAt) => {
        set((state) => {
          const currentSignature = state.communityPrompts
            .map((entry) => `${entry.id}:${entry.updatedAt}`)
            .join("|");
          const nextSignature = entries
            .map((entry) => `${entry.id}:${entry.updatedAt}`)
            .join("|");

          if (currentSignature === nextSignature && state.communityFetchedAt === fetchedAt) {
            return state;
          }

          return {
            communityPrompts: entries,
            communityFetchedAt: fetchedAt,
          };
        });
      },
    }),
    {
      name: PROMPT_LIBRARY_STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => BROWSER_STORAGE),
    },
  ),
);

function resetPromptLibraryMemory(): void {
  usePromptLibraryStore.persist.setOptions({
    name: PROMPT_LIBRARY_STORAGE_KEY,
    storage: createJSONStorage(() => NOOP_STORAGE),
  });
  usePromptLibraryStore.setState({
    favoritePrompts: {},
    communityPrompts: [],
    communityFetchedAt: null,
  });
}

export function deactivatePromptLibraryStore(): void {
  promptHydrationRequestId += 1;
  resetPromptLibraryMemory();
}

async function hydratePromptLibraryForUserNow(userId: string, requestId: number): Promise<void> {
  if (typeof window === "undefined") {
    resetPromptLibraryMemory();
    return;
  }

  migrateLegacyStorageValue(userId, PROMPT_LIBRARY_STORAGE_KEY, window.localStorage);
  const name = userStorageKey(userId, PROMPT_LIBRARY_STORAGE_KEY);

  usePromptLibraryStore.persist.setOptions({
    name,
    storage: createJSONStorage(() => NOOP_STORAGE),
  });
  usePromptLibraryStore.setState({
    favoritePrompts: {},
    communityPrompts: [],
    communityFetchedAt: null,
  });
  usePromptLibraryStore.persist.setOptions({
    name,
    storage: createJSONStorage(() => BROWSER_STORAGE),
  });
  await usePromptLibraryStore.persist.rehydrate();

  if (requestId !== promptHydrationRequestId) {
    resetPromptLibraryMemory();
  }
}

export function hydratePromptLibraryForUser(userId: string): Promise<void> {
  const requestId = ++promptHydrationRequestId;
  const hydration = promptHydrationQueue.then(async () => {
    if (requestId !== promptHydrationRequestId) {
      return;
    }

    await hydratePromptLibraryForUserNow(userId, requestId);
  });

  promptHydrationQueue = hydration.catch(() => undefined);
  return hydration;
}
