"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PromptLibraryEntry } from "@/features/prompt-library/types";

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
      name: "prompt-library-storage",
      version: 1,
    },
  ),
);
