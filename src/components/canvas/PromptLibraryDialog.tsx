"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Heart,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Sparkles,
  Video,
  WifiOff,
  X,
} from "lucide-react";

import bundledCommunityPrompts from "@/features/prompt-library/bundledCommunityPrompts.json";
import type {
  PromptLibraryApiResponse,
  PromptLibraryEntry,
} from "@/features/prompt-library/types";
import { OPENNANA_MODELS } from "@/features/prompt-library/types";
import { mergePromptLibraryEntries, sortPromptLibraryEntries } from "@/lib/prompt-library/parse";
import { usePromptLibraryStore } from "@/store/prompt-library-store";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const BUNDLED_COMMUNITY_PROMPTS = bundledCommunityPrompts as PromptLibraryEntry[];
const ALL_OPTION = "\u5168\u90e8";
const FAVORITES_OPTION = "\u6536\u85cf";
const EXPAND_LABEL = "\u5c55\u5f00";
const COLLAPSE_LABEL = "\u6536\u8d77";
const MODEL_LABEL = "\u6a21\u578b\uff1a";
const TAG_LABEL = "\u6807\u7b7e\uff1a";
const TAG_PREVIEW_COUNT = 48;

type RefreshNotice = {
  kind: "loading" | "success" | "warning" | "error";
  message: string;
};

export interface PromptLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onAddToCanvas: (entry: PromptLibraryEntry) => void;
}

function sortLabels(labels: string[]): string[] {
  return labels.filter(Boolean).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function formatPromptTime(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatPromptDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function PromptCover({
  entry,
  className = "",
  playable = false,
  contain = false,
}: {
  entry: PromptLibraryEntry;
  className?: string;
  playable?: boolean;
  contain?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedVideoUrl, setFailedVideoUrl] = useState<string | null>(null);
  const videoUrl = entry.videoUrl?.trim();
  const showVideo = Boolean(playable && entry.kind === "video" && videoUrl && failedVideoUrl !== videoUrl);
  const showImage = Boolean(entry.coverUrl && failedUrl !== entry.coverUrl);
  const mediaClassName = contain
    ? "block max-h-[386px] w-full object-contain bg-black"
    : "block h-auto w-full";

  return (
    <div
      className={[
        "relative block overflow-hidden bg-[linear-gradient(135deg,#26272c,#17181b_48%,#222821)]",
        contain ? "flex items-center justify-center bg-black" : "",
        showImage ? "" : "min-h-[180px]",
        className,
      ].join(" ")}
    >
      {showVideo && videoUrl ? (
        <video
          src={videoUrl}
          poster={entry.coverUrl}
          controls={playable}
          muted={!playable}
          loop={!playable}
          playsInline
          preload="metadata"
          className={mediaClassName}
          onError={() => setFailedVideoUrl(videoUrl)}
        />
      ) : showImage && entry.coverUrl ? (
        <img
          src={entry.coverUrl}
          alt={entry.title}
          loading="lazy"
          className={mediaClassName}
          onError={() => setFailedUrl(entry.coverUrl ?? null)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-white/22">
          {entry.kind === "video" ? <Video size={38} /> : <ImageIcon size={38} />}
        </span>
      )}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold outline-none transition",
        active
          ? "bg-white text-[#111214]"
          : "bg-white/[0.055] text-white/58 hover:bg-white/10 hover:text-white/86",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-8 shrink-0 pt-[7px] text-[12px] font-semibold text-white/54">{label}</div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function getMasonryColumnCount(width: number): number {
  if (width >= 1536) {
    return 5;
  }
  if (width >= 1024) {
    return 4;
  }
  return 2;
}

function useMasonryColumnCount(): number {
  const [columnCount, setColumnCount] = useState(() =>
    typeof window === "undefined" ? 5 : getMasonryColumnCount(window.innerWidth),
  );

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getMasonryColumnCount(window.innerWidth));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return columnCount;
}

function distributeEntriesByColumn(
  entries: PromptLibraryEntry[],
  columnCount: number,
): PromptLibraryEntry[][] {
  const columns = Array.from({ length: columnCount }, () => [] as PromptLibraryEntry[]);

  entries.forEach((entry, index) => {
    columns[index % columnCount].push(entry);
  });

  return columns;
}

async function copyText(value: string, onCopied: () => void, onError: () => void) {
  try {
    await navigator.clipboard.writeText(value);
    onCopied();
  } catch {
    onError();
  }
}

export function PromptLibraryDialog({
  open,
  onClose,
  onAddToCanvas,
}: PromptLibraryDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const refreshNoticeTimerRef = useRef<number | null>(null);
  const communityEntriesRef = useRef<PromptLibraryEntry[]>([]);
  const favoritePrompts = usePromptLibraryStore((state) => state.favoritePrompts);
  const cachedCommunityPrompts = usePromptLibraryStore((state) => state.communityPrompts);
  const cachedCommunityFetchedAt = usePromptLibraryStore((state) => state.communityFetchedAt);
  const toggleFavorite = usePromptLibraryStore((state) => state.toggleFavorite);
  const setCommunityCache = usePromptLibraryStore((state) => state.setCommunityCache);
  const [liveEntries, setLiveEntries] = useState<PromptLibraryEntry[]>([]);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [usingRemoteCache, setUsingRemoteCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<RefreshNotice | null>(null);
  const [query, setQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState(ALL_OPTION);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PromptLibraryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const masonryColumnCount = useMasonryColumnCount();

  const showRefreshNotice = useCallback((notice: RefreshNotice) => {
    if (refreshNoticeTimerRef.current !== null) {
      window.clearTimeout(refreshNoticeTimerRef.current);
      refreshNoticeTimerRef.current = null;
    }

    setRefreshNotice(notice);

    if (notice.kind !== "loading") {
      refreshNoticeTimerRef.current = window.setTimeout(() => {
        setRefreshNotice(null);
        refreshNoticeTimerRef.current = null;
      }, 2400);
    }
  }, []);

  const communityEntries = useMemo(
    () => {
      const sourceEntries =
        liveEntries.length > 0
          ? liveEntries
          : cachedCommunityPrompts.length > 0
            ? cachedCommunityPrompts
            : BUNDLED_COMMUNITY_PROMPTS;

      return sortPromptLibraryEntries(mergePromptLibraryEntries(sourceEntries));
    },
    [cachedCommunityPrompts, liveEntries],
  );

  useEffect(() => {
    communityEntriesRef.current = communityEntries;
  }, [communityEntries]);

  const fetchCommunity = useCallback(async (options?: { manual?: boolean }) => {
    const manual = options?.manual ?? false;
    setLoading(true);

    if (manual) {
      showRefreshNotice({
        kind: "loading",
        message: "\u6b63\u5728\u5237\u65b0...",
      });
    }

    try {
      const response = await fetch(
        manual ? "/api/prompt-library/community?force=1" : "/api/prompt-library/community",
        { cache: "no-store" },
      );
      const body = (await response.json()) as PromptLibraryApiResponse;

      if (!body.ok) {
        throw new Error(body.error);
      }

      setLiveEntries(body.entries);
      setLiveFetchedAt(body.fetchedAt);
      setUsingRemoteCache(Boolean(body.fromCache));
      setErrors(body.fromCache ? body.errors : []);
      if (body.entries.length > 0) {
        setCommunityCache(body.entries, body.fetchedAt);
      }

      if (manual) {
        const currentIds = new Set(communityEntriesRef.current.map((entry) => entry.id));
        const newEntryCount = body.entries.filter((entry) => !currentIds.has(entry.id)).length;
        showRefreshNotice({
          kind: body.errors.length > 0 || body.fromCache ? "warning" : "success",
          message:
            body.fromCache
              ? "\u8fdc\u7a0b\u6682\u65f6\u4e0d\u7a33\u5b9a\uff0c\u5df2\u4fdd\u7559\u7f13\u5b58"
              : body.errors.length > 0
                ? "\u5df2\u5237\u65b0\uff0c\u90e8\u5206\u8fdc\u7a0b\u6e90\u5931\u8d25"
                : newEntryCount > 0
                  ? `\u5237\u65b0\u5b8c\u6210\uff0c\u65b0\u589e ${newEntryCount} \u6761\uff0c\u5171 ${body.entries.length} \u6761`
                  : `\u5df2\u662f\u6700\u65b0\uff0c\u5171 ${body.entries.length} \u6761`,
        });
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "\u63d0\u793a\u8bcd\u5e93\u540c\u6b65\u5931\u8d25"]);
      setUsingRemoteCache(true);
      if (manual) {
        showRefreshNotice({
          kind: "error",
          message: "\u5237\u65b0\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u5f53\u524d\u7f13\u5b58",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [setCommunityCache, showRefreshNotice]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialRefresh = window.setTimeout(() => {
      void fetchCommunity();
    }, 0);
    const timer = window.setInterval(() => {
      void fetchCommunity();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [fetchCommunity, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (selectedEntry) {
        setSelectedEntry(null);
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, selectedEntry]);

  useEffect(() => {
    return () => {
      if (refreshNoticeTimerRef.current !== null) {
        window.clearTimeout(refreshNoticeTimerRef.current);
        refreshNoticeTimerRef.current = null;
      }
    };
  }, []);

  const openEntryDetail = useCallback((entry: PromptLibraryEntry) => {
    setCopied(false);
    setCopyError(null);
    setSelectedEntry(entry);
  }, []);

  const favoriteIds = useMemo(() => new Set(Object.keys(favoritePrompts)), [favoritePrompts]);
  const baseEntries = useMemo(
    () => (favoritesOnly ? Object.values(favoritePrompts) : communityEntries),
    [communityEntries, favoritePrompts, favoritesOnly],
  );
  const modelOptions = useMemo(() => {
    const knownModels = OPENNANA_MODELS.filter((model) =>
      communityEntries.some((entry) => entry.model === model),
    );
    const extraModels = sortLabels(
      Array.from(new Set(communityEntries.map((entry) => entry.model).filter(Boolean) as string[])).filter(
        (model) => !OPENNANA_MODELS.includes(model as (typeof OPENNANA_MODELS)[number]),
      ),
    );

    return [ALL_OPTION, ...knownModels, ...extraModels];
  }, [communityEntries]);
  const tags = useMemo(() => {
    const modelSet = new Set(modelOptions);
    return sortLabels(
      Array.from(new Set(baseEntries.flatMap((entry) => entry.tags))).filter(
        (tag) => tag && tag !== entryKindLabel("image") && tag !== entryKindLabel("video") && !modelSet.has(tag),
      ),
    );
  }, [baseEntries, modelOptions]);
  const visibleTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW_COUNT);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortPromptLibraryEntries(baseEntries.filter((entry) => {
      const searchable = [
        entry.title,
        entry.prompt,
        entry.excerpt,
        entry.category,
        entry.source,
        entry.sourceName,
        entry.model,
        ...entry.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (selectedModel === ALL_OPTION || entry.model === selectedModel) &&
        selectedTags.every((tag) => entry.tags.includes(tag))
      );
    }));
  }, [baseEntries, query, selectedModel, selectedTags]);
  const masonryColumns = useMemo(
    () => distributeEntriesByColumn(filteredEntries, masonryColumnCount),
    [filteredEntries, masonryColumnCount],
  );

  if (!open) {
    return null;
  }

  const fetchedAtLabel = formatPromptTime(liveFetchedAt ?? cachedCommunityFetchedAt);
  const selectedEntryDate = formatPromptDate(selectedEntry?.updatedAt ?? selectedEntry?.createdAt);

  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-black/42 px-8 py-8 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="relative flex h-[min(920px,calc(100vh-96px))] w-[min(1500px,calc(100vw-96px))] flex-col overflow-hidden rounded-[12px] border border-white/10 bg-[#17181B] text-white shadow-[0_28px_80px_rgba(0,0,0,0.56)]"
        data-canvas-menu-ignore="true"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-[66px] items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <BookOpen size={18} className="text-white/82" />
            <div>
              <div className="text-[15px] font-semibold text-white/90">{"\u63d0\u793a\u8bcd\u5e93"}</div>
              <div className="mt-0.5 text-[11px] text-white/38">
                {fetchedAtLabel ? `${"\u66f4\u65b0\u4e8e"} ${fetchedAtLabel}` : "OpenNana \u793e\u533a\u6e90\u540c\u6b65\u4e2d"}
                {errors.length > 0 ? " · \u8fdc\u7a0b\u5931\u8d25\uff0c\u6b63\u5728\u4f7f\u7528\u7f13\u5b58" : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex h-9 w-[280px] items-center gap-2 rounded-[10px] bg-white/[0.055] px-3 text-white/58 outline-none transition focus-within:bg-white/10">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/32"
                placeholder={"\u641c\u7d22\u63d0\u793a\u8bcd"}
              />
            </label>
            <button
              type="button"
              aria-busy={loading}
              disabled={loading}
              className={[
                "flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-semibold outline-none transition",
                loading
                  ? "cursor-wait bg-white/12 text-white/88"
                  : "bg-white/[0.055] text-white/62 hover:bg-white/10 hover:text-white",
              ].join(" ")}
              onClick={() => void fetchCommunity({ manual: true })}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "\u5237\u65b0\u4e2d" : "\u5237\u65b0"}
            </button>
            {refreshNotice ? (
              <span
                className={[
                  "hidden h-9 items-center rounded-[10px] px-3 text-[12px] font-semibold sm:flex",
                  refreshNotice.kind === "success"
                    ? "bg-white/[0.07] text-white/78"
                    : refreshNotice.kind === "warning"
                      ? "bg-amber-300/10 text-amber-100/84"
                      : refreshNotice.kind === "error"
                        ? "bg-red-400/10 text-red-100/84"
                        : "bg-white/[0.055] text-white/62",
                ].join(" ")}
              >
                {refreshNotice.message}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={"\u5173\u95ed\u63d0\u793a\u8bcd\u5e93"}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white/48 outline-none transition hover:bg-white/10 hover:text-white/78"
              onClick={onClose}
            >
              <X size={19} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div
          className={[
            "generation-history-scrollable shrink-0 space-y-3 border-b border-white/10 px-5 py-3",
            showAllTags ? "max-h-[320px] overflow-y-auto" : "overflow-visible",
          ].join(" ")}
        >
          <FilterRow label={MODEL_LABEL}>
            {modelOptions.map((model) => (
              <FilterChip
                key={model}
                active={selectedModel === model && !favoritesOnly}
                onClick={() => {
                  setFavoritesOnly(false);
                  setSelectedModel(model);
                }}
              >
                {model}
              </FilterChip>
            ))}
            <FilterChip
              active={favoritesOnly}
              onClick={() => {
                setFavoritesOnly((current) => !current);
                setSelectedModel(ALL_OPTION);
              }}
            >
              {FAVORITES_OPTION} {Object.keys(favoritePrompts).length}
            </FilterChip>
            {errors.length > 0 ? (
              <span className="flex h-8 items-center gap-1.5 text-[12px] text-amber-200/80">
                <WifiOff size={14} />
                {usingRemoteCache ? "\u4f7f\u7528\u7f13\u5b58" : "\u90e8\u5206\u5931\u8d25"}
              </span>
            ) : null}
          </FilterRow>
          <FilterRow label={TAG_LABEL}>
            <FilterChip active={selectedTags.length === 0} onClick={() => setSelectedTags([])}>
              {ALL_OPTION}
            </FilterChip>
            {tags.length > TAG_PREVIEW_COUNT ? (
              <button
                type="button"
                className="h-8 shrink-0 rounded-full bg-white/[0.055] px-3 text-[12px] font-semibold text-white/62 outline-none transition hover:bg-white/10 hover:text-white"
                onClick={() => setShowAllTags((current) => !current)}
              >
                {showAllTags ? `${COLLAPSE_LABEL} ^` : `${EXPAND_LABEL} v`}
              </button>
            ) : null}
            {visibleTags.map((tag) => (
              <FilterChip
                key={tag}
                active={selectedTags.includes(tag)}
                onClick={() =>
                  setSelectedTags((current) =>
                    current.includes(tag)
                      ? current.filter((item) => item !== tag)
                      : [...current, tag],
                  )
                }
              >
                {tag}
              </FilterChip>
            ))}
          </FilterRow>
          <div className="text-right text-[12px] text-white/38">
            {"\u663e\u793a"} {filteredEntries.length} / {baseEntries.length} {"\u6761\uff0cOpenNana"} {communityEntries.length} {"\u6761"}
          </div>
        </div>

        <div className="generation-history-scrollable min-h-0 flex-1 overflow-y-auto p-5">
          {filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-white/34">
              {"\u6ca1\u6709\u5339\u914d\u7684\u63d0\u793a\u8bcd"}
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${masonryColumnCount}, minmax(0, 1fr))` }}
            >
              {masonryColumns.map((column, columnIndex) => (
                <div key={`prompt-column-${columnIndex}`} className="min-w-0 space-y-4">
                  {column.map((entry) => {
                    return (
                      <article
                        key={entry.id}
                        className="group relative overflow-hidden rounded-[10px] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5"
                      >
                        <button
                          type="button"
                          className="block h-full w-full text-left outline-none"
                          onClick={() => openEntryDetail(entry)}
                        >
                          <PromptCover entry={entry} className="rounded-t-[10px]" />
                          <div className="px-4 py-3">
                            <div className="line-clamp-1 text-[14px] font-semibold leading-5 text-[#101828]">
                              {entry.title}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label={"\u6536\u85cf\u63d0\u793a\u8bcd"}
                          className={[
                            "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/28 text-white shadow-[0_8px_20px_rgba(0,0,0,0.28)] outline-none backdrop-blur-md transition hover:bg-black/42",
                            favoriteIds.has(entry.id) ? "bg-white/88 text-[#17181B]" : "",
                          ].join(" ")}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(entry);
                          }}
                        >
                          <Heart
                            size={18}
                            strokeWidth={1.8}
                            className={favoriteIds.has(entry.id) ? "fill-current" : ""}
                          />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEntry ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/58 p-8 backdrop-blur-[2px]">
            <div className="flex h-[min(720px,calc(100vh-112px))] w-[min(1080px,calc(100vw-128px))] flex-col overflow-hidden rounded-[12px] border border-white/10 bg-[#191919] shadow-[0_24px_72px_rgba(0,0,0,0.62)]">
              <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
                <div className="truncate text-[14px] font-semibold text-white/92">
                  {selectedEntry.title}
                </div>
                <button
                  type="button"
                  aria-label={"\u5173\u95ed\u8be6\u60c5"}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.055] text-white/52 outline-none transition hover:bg-white/10 hover:text-white/82"
                  onClick={() => setSelectedEntry(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-6 overflow-hidden p-5">
                <div className="min-h-0 min-w-0 overflow-hidden pr-1">
                  <PromptCover entry={selectedEntry} className="rounded-[8px]" playable contain />
                  <div className="mt-3 space-y-2.5 text-[13px] text-[#9aa8bd]">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <span>
                        {"\u6765\u6e90\uff1a"}
                        {selectedEntry.sourceUrl ? (
                          <a
                            href={selectedEntry.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#74a5ff] hover:text-[#9bbfff]"
                          >
                            {selectedEntry.sourceName || "OpenNana"}
                          </a>
                        ) : (
                          <span className="font-semibold text-[#d5dfef]">
                            {selectedEntry.sourceName || selectedEntry.source}
                          </span>
                        )}
                      </span>
                      {selectedEntry.model ? <span>{"\u6a21\u578b\uff1a"}{selectedEntry.model}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[selectedEntry.category, ...selectedEntry.tags.slice(0, 8)].map((tag, index) => (
                        <span
                          key={`${selectedEntry.id}-detail-tag-${index}-${tag}`}
                          className="rounded-full bg-white/[0.065] px-3 py-1 text-[12px] text-[#d5dfef]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  {selectedEntryDate ? (
                    <div className="mt-3 text-[12px] text-white/38">{"\u66f4\u65b0\uff1a"}{selectedEntryDate}</div>
                  ) : null}
                  {selectedEntry.detailUrl ? (
                    <a
                      href={selectedEntry.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 block truncate text-[12px] font-medium text-[#74a5ff] hover:text-[#9bbfff]"
                    >
                      {"\u67e5\u770b OpenNana \u9875\u9762"}
                    </a>
                  ) : null}
                </div>

                <div className="flex min-h-0 min-w-0 flex-col">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-5 w-1 rounded-full bg-white/85" />
                    <div className="text-[16px] font-semibold text-white/90">{"\u63d0\u793a\u8bcd"}</div>
                  </div>

                  {selectedEntry.promptEn ? (
                    <section className="min-h-0 flex-1 overflow-hidden rounded-[10px] bg-[#f6f8fb] text-[#101828]">
                      <div className="flex h-10 items-center justify-between border-b border-[#dce4ef] px-4 text-[12px] font-semibold uppercase tracking-wide text-[#667895]">
                        <span>English</span>
                        <button
                          type="button"
                          className="text-[#2f74ff] outline-none"
                          onClick={() =>
                            void copyText(
                              selectedEntry.promptEn ?? "",
                              () => setCopied(true),
                              () => setCopyError("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u9009\u4e2d\u6587\u672c\u590d\u5236"),
                            )
                          }
                        >
                          {"\u590d\u5236"}
                        </button>
                      </div>
                      <pre className="generation-history-scrollable h-[calc(100%-40px)] overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-6">
                        {selectedEntry.promptEn}
                      </pre>
                    </section>
                  ) : null}

                  {selectedEntry.promptZh ? (
                    <section className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[10px] bg-[#f6f8fb] text-[#101828]">
                      <div className="flex h-10 items-center justify-between border-b border-[#dce4ef] px-4 text-[12px] font-semibold tracking-wide text-[#667895]">
                        <span>{"\u4e2d\u6587"}</span>
                        <button
                          type="button"
                          className="text-[#2f74ff] outline-none"
                          onClick={() =>
                            void copyText(
                              selectedEntry.promptZh ?? "",
                              () => setCopied(true),
                              () => setCopyError("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u9009\u4e2d\u6587\u672c\u590d\u5236"),
                            )
                          }
                        >
                          {"\u590d\u5236"}
                        </button>
                      </div>
                      <pre className="generation-history-scrollable h-[calc(100%-40px)] overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-6">
                        {selectedEntry.promptZh}
                      </pre>
                    </section>
                  ) : null}

                  {!selectedEntry.promptEn && !selectedEntry.promptZh ? (
                    <section className="min-h-0 flex-1 overflow-hidden rounded-[10px] bg-[#f6f8fb] text-[#101828]">
                      <pre className="generation-history-scrollable h-full overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-6">
                        {selectedEntry.prompt}
                      </pre>
                    </section>
                  ) : null}
                  {copyError ? (
                    <div className="mt-3 text-[12px] text-[#ff8b8b]">{copyError}</div>
                  ) : null}
                </div>
              </div>

              <div className="flex h-16 items-center justify-end gap-2 border-t border-white/10 px-5">
                <button
                  type="button"
                  className="h-10 rounded-[9px] bg-transparent px-4 text-[13px] font-semibold text-white/78 outline-none transition hover:bg-white/8 hover:text-white"
                  onClick={() => setSelectedEntry(null)}
                >
                  {"\u5173\u95ed"}
                </button>
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-[9px] bg-white/[0.055] px-4 text-[13px] font-semibold text-white/82 outline-none transition hover:bg-white/10"
                  onClick={() => toggleFavorite(selectedEntry)}
                >
                  <Heart
                    size={16}
                    className={favoriteIds.has(selectedEntry.id) ? "fill-current" : ""}
                  />
                  {"\u6536\u85cf"}
                </button>
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-[9px] bg-white px-4 text-[13px] font-semibold text-[#111214] outline-none transition hover:bg-white/88"
                  onClick={() => {
                    setCopyError(null);
                    void copyText(
                      selectedEntry.prompt,
                      () => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1200);
                      },
                      () => setCopyError("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u9009\u4e2d\u6587\u672c\u590d\u5236"),
                    );
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "\u5df2\u590d\u5236" : "\u590d\u5236"}
                </button>
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-[9px] bg-[#2f74ff] px-4 text-[13px] font-semibold text-white outline-none transition hover:bg-[#3d7fff]"
                  onClick={() => onAddToCanvas(selectedEntry)}
                >
                  <Sparkles size={15} />
                  {"\u5e94\u7528\u5230\u753b\u5e03"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function entryKindLabel(kind: PromptLibraryEntry["kind"]): string {
  return kind === "video" ? "\u89c6\u9891\u63d0\u793a\u8bcd" : "\u56fe\u50cf\u63d0\u793a\u8bcd";
}
