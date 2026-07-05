export type PromptLibraryKind = "image" | "video";
export type PromptLibraryOrigin = "community";
export type PromptLibrarySourceId = "opennana";
export type PromptLibraryViewMode = "all" | "image" | "video" | "favorites";

export const OPENNANA_MODELS = [
  "Nano Banana Pro",
  "Nano Banana 2",
  "ChatGPT",
  "Grok",
  "Seedance 2.0",
] as const;

export interface PromptLibraryEntry {
  id: string;
  kind: PromptLibraryKind;
  origin: PromptLibraryOrigin;
  title: string;
  prompt: string;
  promptEn?: string;
  promptZh?: string;
  excerpt: string;
  category: string;
  source: string;
  sourceName?: string;
  sourceUrl?: string;
  model?: string;
  tags: string[];
  coverUrl?: string;
  videoUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  detailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptLibraryCommunityResponse {
  ok: true;
  entries: PromptLibraryEntry[];
  fetchedAt: string;
  errors: string[];
  fromCache?: boolean;
  cacheReason?: "memory" | "fallback";
}

export interface PromptLibraryErrorResponse {
  ok: false;
  error: string;
}

export type PromptLibraryApiResponse =
  | PromptLibraryCommunityResponse
  | PromptLibraryErrorResponse;
