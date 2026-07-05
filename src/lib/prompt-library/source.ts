import {
  OPENNANA_MODELS,
  type PromptLibraryEntry,
} from "@/features/prompt-library/types";
import { mergePromptLibraryEntries, sortPromptLibraryEntries } from "./parse";

const OPENNANA_ORIGIN = "https://opennana.com";
const OPENNANA_API_ORIGIN = "https://api.opennana.com";
const OPENNANA_PAGE_SIZE = 100;
const OPENNANA_PER_MODEL_COUNT = 100;
const OPENNANA_DETAIL_CONCURRENCY = 10;
const SOURCE_TIMEOUT_MS = 15_000;
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;

interface OpenNanaListItem {
  id: number;
  slug?: string;
  title: string;
  media_type?: string;
  cover_image?: string;
  _is_sponsor?: boolean;
}

interface OpenNanaListResponse {
  status: number;
  msg?: string;
  data?: {
    items?: OpenNanaListItem[];
  };
}

interface OpenNanaPromptBlock {
  text?: string;
  type?: string;
  label?: string;
}

interface OpenNanaDetailData {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  model?: string | null;
  prompts?: OpenNanaPromptBlock[];
  images?: string[] | null;
  tags?: string[] | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  thumbnail?: string | null;
  media_type?: string | null;
  video_urls?: string[] | null;
}

interface OpenNanaDetailResponse {
  status: number;
  msg?: string;
  data?: OpenNanaDetailData;
}

let memoryCache:
  | {
      entries: PromptLibraryEntry[];
      errors: string[];
      fetchedAt: string;
      fetchedAtMs: number;
    }
  | null = null;

type PromptLibraryCacheReason = "memory" | "fallback";

function decodeHtml(value: string): string {
  return value
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function createExcerpt(value: string): string {
  const compact = stripTags(value);
  return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact;
}

function normalizeUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const decoded = decodeHtml(value);
  if (decoded.startsWith("https://img.opennana.com/pthumbs/https://")) {
    return decoded.replace("https://img.opennana.com/pthumbs/", "");
  }

  if (decoded.startsWith("//")) {
    return `https:${decoded}`;
  }

  if (decoded.startsWith("pthumbs/") || decoded.startsWith("prompts/")) {
    return `https://img.opennana.com/${decoded}`;
  }

  if (decoded.startsWith("/")) {
    return `${OPENNANA_ORIGIN}${decoded}`;
  }

  return decoded;
}

function withOpenNanaReferrer(value: string | null | undefined): string | undefined {
  const url = normalizeUrl(value);
  if (!url) {
    return undefined;
  }

  if (!/^https?:\/\//i.test(url) || url.includes("referrer=opennana.com")) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}referrer=opennana.com`;
}

async function fetchTextWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html",
        "user-agent": "GenLink Prompt Library",
      },
      next: {
        revalidate: 30 * 60,
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  return JSON.parse(await fetchTextWithTimeout(url)) as T;
}

function createOpenNanaListUrl(model: string, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(OPENNANA_PAGE_SIZE),
    sort: "reviewed_at",
    order: "DESC",
    model,
  });

  return `${OPENNANA_API_ORIGIN}/api/prompts?${params.toString().replace(/\+/g, "%20")}`;
}

async function fetchOpenNanaListByModel(model: string): Promise<OpenNanaListItem[]> {
  const pages = Math.ceil(OPENNANA_PER_MODEL_COUNT / OPENNANA_PAGE_SIZE);
  const items: OpenNanaListItem[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const body = await fetchJsonWithTimeout<OpenNanaListResponse>(
      createOpenNanaListUrl(model, page),
    );
    const pageItems = body.data?.items?.filter((item) => item.id && item.slug && !item._is_sponsor) ?? [];

    if (pageItems.length === 0) {
      break;
    }

    items.push(...pageItems);
  }

  return items.slice(0, OPENNANA_PER_MODEL_COUNT);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  return results;
}

function pickPrompt(prompts: OpenNanaPromptBlock[] | null | undefined, type: string): string | undefined {
  const value = prompts?.find((prompt) => prompt.type === type)?.text?.trim();
  return value || undefined;
}

function normalizeTags(values: string[] | null | undefined, category: string, model: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of [category, model, ...(values ?? [])]) {
    const tag = value.trim();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

function normalizeModelName(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  const canonical = OPENNANA_MODELS.find((model) => model.toLowerCase() === normalized);
  return canonical ?? value?.trim() ?? "\u672a\u77e5\u6a21\u578b";
}

function pickCoverUrl(detail: OpenNanaDetailData, listItem: OpenNanaListItem): string | undefined {
  return (
    normalizeUrl(detail.images?.[0]) ||
    normalizeUrl(detail.thumbnail) ||
    normalizeUrl(listItem.cover_image) ||
    normalizeUrl(detail.video_urls?.[0])
  );
}

function pickVideoUrl(detail: OpenNanaDetailData): string | undefined {
  return normalizeUrl(detail.video_urls?.[0]);
}

async function fetchOpenNanaEntry(listItem: OpenNanaListItem): Promise<PromptLibraryEntry> {
  if (!listItem.slug) {
    throw new Error(`OpenNana item ${listItem.id} has no slug`);
  }

  const detailUrl = `${OPENNANA_ORIGIN}/awesome-prompt-gallery/${listItem.slug}`;
  const body = await fetchJsonWithTimeout<OpenNanaDetailResponse>(
    `${OPENNANA_API_ORIGIN}/api/prompts/${listItem.slug}`,
  );
  const detail = body.data;

  if (!detail) {
    throw new Error(`OpenNana detail ${listItem.slug} is empty`);
  }

  const model = normalizeModelName(detail.model);
  const kind = detail.media_type === "video" || listItem.media_type === "video" ? "video" : "image";
  const category = kind === "video" ? "\u89c6\u9891\u63d0\u793a\u8bcd" : "\u56fe\u50cf\u63d0\u793a\u8bcd";
  const promptEn = pickPrompt(detail.prompts, "en");
  const promptZh = pickPrompt(detail.prompts, "zh");
  const prompt = [promptEn, promptZh].filter(Boolean).join("\n\n") || detail.title || listItem.title;
  const updatedAt = detail.reviewed_at || detail.updated_at || detail.created_at || new Date().toISOString();

  return {
    id: `opennana-${detail.id}`,
    kind,
    origin: "community",
    title: detail.title || listItem.title,
    prompt,
    promptEn,
    promptZh,
    excerpt: createExcerpt(promptZh || promptEn || detail.description || detail.title || listItem.title),
    category,
    source: "OpenNana",
    sourceName: detail.source_name || undefined,
    sourceUrl: withOpenNanaReferrer(detail.source_url),
    model,
    tags: normalizeTags(detail.tags, category, model),
    coverUrl: pickCoverUrl(detail, listItem),
    videoUrl: kind === "video" ? pickVideoUrl(detail) : undefined,
    detailUrl,
    createdAt: detail.created_at || updatedAt,
    updatedAt,
  };
}

async function fetchOpenNanaEntriesByModel(model: string): Promise<PromptLibraryEntry[]> {
  const listItems = await fetchOpenNanaListByModel(model);
  const settled = await mapWithConcurrency(
    listItems,
    OPENNANA_DETAIL_CONCURRENCY,
    async (item): Promise<PromiseSettledResult<PromptLibraryEntry>> => {
      try {
        return {
          status: "fulfilled",
          value: await fetchOpenNanaEntry(item),
        };
      } catch (reason) {
        return {
          status: "rejected",
          reason,
        };
      }
    },
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function fetchOpenNanaPromptEntries(): Promise<{
  entries: PromptLibraryEntry[];
  errors: string[];
  failedModels: string[];
}> {
  const settled = await Promise.allSettled(
    OPENNANA_MODELS.map(async (model) => ({
      model,
      entries: await fetchOpenNanaEntriesByModel(model),
    })),
  );
  const entries: PromptLibraryEntry[] = [];
  const errors: string[] = [];
  const failedModels: string[] = [];

  settled.forEach((result, index) => {
    const model = OPENNANA_MODELS[index];
    if (result.status === "fulfilled") {
      entries.push(...result.value.entries);
      return;
    }

    failedModels.push(model);
    errors.push(`OpenNana ${model}: ${formatSourceError(result.reason)}`);
  });

  return {
    entries: sortPromptLibraryEntries(mergePromptLibraryEntries(entries)),
    errors,
    failedModels,
  };
}

function formatSourceError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause instanceof Error) {
    const code = "code" in cause ? ` ${(cause as { code?: string }).code}` : "";
    return `${error.message}: ${cause.message}${code}`;
  }

  return error.message;
}

export async function fetchPromptLibraryCommunityEntries(options?: {
  forceRefresh?: boolean;
}): Promise<{
  entries: PromptLibraryEntry[];
  errors: string[];
  fetchedAt: string;
  fromCache: boolean;
  cacheReason?: PromptLibraryCacheReason;
}> {
  if (
    !options?.forceRefresh &&
    memoryCache &&
    Date.now() - memoryCache.fetchedAtMs < MEMORY_CACHE_TTL_MS
  ) {
    return {
      entries: memoryCache.entries,
      errors: [],
      fetchedAt: memoryCache.fetchedAt,
      fromCache: false,
      cacheReason: "memory",
    };
  }

  try {
    const result = await fetchOpenNanaPromptEntries();
    const cachedFailedModelEntries =
      memoryCache && result.failedModels.length > 0
        ? memoryCache.entries.filter((entry) =>
            result.failedModels.includes(entry.model ?? ""),
          )
        : [];
    const entries = sortPromptLibraryEntries(
      mergePromptLibraryEntries([...result.entries, ...cachedFailedModelEntries]),
    );
    if (entries.length === 0) {
      throw new Error("OpenNana returned no prompt entries");
    }
    const fetchedAt = new Date().toISOString();
    memoryCache = {
      entries,
      errors: result.errors,
      fetchedAt,
      fetchedAtMs: Date.now(),
    };
    return {
      entries,
      errors: result.errors,
      fetchedAt,
      fromCache: false,
    };
  } catch (error) {
    const errors = [`OpenNana: ${formatSourceError(error)}`];
    if (memoryCache) {
      return {
        entries: memoryCache.entries,
        errors,
        fetchedAt: memoryCache.fetchedAt,
        fromCache: true,
        cacheReason: "fallback",
      };
    }

    return {
      entries: [],
      errors,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  }
}
