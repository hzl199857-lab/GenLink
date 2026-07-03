# Prompt Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GenLink-native prompt library modal on the canvas that syncs YouMind community prompts, caches them locally, supports search/filter/favorites, and creates image/video generation nodes at the current viewport center.

**Architecture:** Keep prompt-library data parsing, fetching, caching, and UI in focused modules. `InfiniteCanvas.tsx` should only host the right-top entry button, modal state, and a small adapter that maps a prompt entry to an existing canvas node. The browser calls a GenLink API route instead of GitHub raw directly.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Zustand persist, existing GenLink canvas store and ReactFlow runtime.

---

## File Structure

- Create `src/features/prompt-library/types.ts`: shared prompt-library entry, source, API response, and UI filter types.
- Create `src/features/prompt-library/localPrompts.ts`: GenLink curated local fallback entries.
- Create `src/features/prompt-library/bundledCommunityPrompts.json`: small bundled community fallback snapshot.
- Create `src/lib/prompt-library/parse.ts`: pure Markdown parser for YouMind README content.
- Create `src/lib/prompt-library/parse.test.ts`: parser coverage using representative Markdown snippets.
- Create `src/lib/prompt-library/source.ts`: server-side source fetching, language fallback, and source merging helpers.
- Create `src/app/api/prompt-library/community/route.ts`: route handler returning parsed community entries with partial-source errors.
- Create `src/store/prompt-library-store.ts`: Zustand persisted favorites and community cache.
- Create `src/store/prompt-library-store.test.ts`: store behavior tests.
- Create `src/components/canvas/PromptLibraryDialog.tsx`: modal UI, filtering, detail view, refresh, copy, favorite, add-to-canvas.
- Create `src/components/canvas/PromptLibraryEntryButton.tsx`: right-top entry button.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: import the new components, add modal open state, and create image/video nodes at viewport center.
- Modify tests or add focused tests only where project patterns make it practical.

## Task 1: Prompt Library Types And Local Fallbacks

**Files:**
- Create: `src/features/prompt-library/types.ts`
- Create: `src/features/prompt-library/localPrompts.ts`
- Create: `src/features/prompt-library/bundledCommunityPrompts.json`

- [ ] **Step 1: Create shared types**

Create `src/features/prompt-library/types.ts`:

```ts
export type PromptLibraryKind = "image" | "video";
export type PromptLibraryOrigin = "community" | "local";
export type PromptLibrarySourceId = "youmind-gpt-image-2" | "youmind-seedance-2";
export type PromptLibraryViewMode = "all" | "image" | "video" | "favorites";

export interface PromptLibraryEntry {
  id: string;
  kind: PromptLibraryKind;
  origin: PromptLibraryOrigin;
  title: string;
  prompt: string;
  excerpt: string;
  category: string;
  source: string;
  tags: string[];
  coverUrl?: string;
  previewUrl?: string;
  githubUrl?: string;
  detailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptLibrarySourceConfig {
  id: PromptLibrarySourceId;
  kind: PromptLibraryKind;
  source: string;
  githubUrl: string;
  rawBaseUrl: string;
  defaultCategory: string;
  maxEntries: number;
}

export interface PromptLibraryCommunityResponse {
  ok: true;
  entries: PromptLibraryEntry[];
  fetchedAt: string;
  errors: string[];
}

export interface PromptLibraryErrorResponse {
  ok: false;
  error: string;
}

export type PromptLibraryApiResponse =
  | PromptLibraryCommunityResponse
  | PromptLibraryErrorResponse;
```

- [ ] **Step 2: Add local curated prompts**

Create `src/features/prompt-library/localPrompts.ts`:

```ts
import type { PromptLibraryEntry } from "./types";

const LOCAL_UPDATED_AT = "2026-07-04T00:00:00.000Z";

export const LOCAL_PROMPT_LIBRARY_ENTRIES: PromptLibraryEntry[] = [
  {
    id: "local-image-character-continuity",
    kind: "image",
    origin: "local",
    title: "角色连续性肖像",
    prompt:
      "为后续分镜生成一张可复用角色肖像：半身构图，五官清晰，发型、服装、配饰和体态具有高辨识度；柔和主光从左前方照射，背景简洁但保留真实摄影质感；保持角色身份特征稳定，避免夸张变形，适合作为多角度生成的角色参考。",
    excerpt: "用于固定角色外观、发型、服装和识别特征的基础肖像提示词。",
    category: "角色",
    source: "GenLink 本地精选",
    tags: ["角色", "肖像", "连续性", "参考图"],
    createdAt: LOCAL_UPDATED_AT,
    updatedAt: LOCAL_UPDATED_AT,
  },
  {
    id: "local-image-commercial-hero",
    kind: "image",
    origin: "local",
    title: "产品英雄静物",
    prompt:
      "商业广告风格产品主视觉，一件核心产品置于画面中心偏下位置，边缘高光清晰，材质细节真实；背景使用低调几何台面和柔和渐变光，主光塑造产品体积，辅光保留阴影层次；画面干净、专业、适合海报或电商主图，不添加多余文字和标志。",
    excerpt: "用于电商主图、广告海报和产品视觉的干净商业静物。",
    category: "商品视觉",
    source: "GenLink 本地精选",
    tags: ["产品", "广告", "电商", "光影"],
    createdAt: LOCAL_UPDATED_AT,
    updatedAt: LOCAL_UPDATED_AT,
  },
  {
    id: "local-video-emotional-closeup",
    kind: "video",
    origin: "local",
    title: "情绪近景短片",
    prompt:
      "近景固定镜头，角色站在昏暗室内窗边，视线先短暂下垂，呼吸变浅，手指轻轻收紧衣角；随后缓慢抬眼看向窗外，眼眶微红但不落泪，肩颈从紧绷逐渐放松。画面使用柔和侧逆光，背景保持浅景深，节奏克制、真实、电影感。",
    excerpt: "把抽象情绪转译成可观察微表情和身体动作的视频提示词。",
    category: "情绪表演",
    source: "GenLink 本地精选",
    tags: ["视频", "近景", "情绪", "电影感"],
    createdAt: LOCAL_UPDATED_AT,
    updatedAt: LOCAL_UPDATED_AT,
  },
  {
    id: "local-video-product-reveal",
    kind: "video",
    origin: "local",
    title: "产品揭示镜头",
    prompt:
      "中近景缓慢推镜，产品从柔和暗部轮廓中逐渐被边缘光勾出，镜头沿产品正面轻微下移，展现材质纹理、关键结构和品牌质感；背景中微弱反射随镜头移动产生细小高光变化，整体节奏稳重、高级、适合新品发布短片。",
    excerpt: "用于商品短视频的稳重揭示镜头，强调材质、结构和高级感。",
    category: "商品视觉",
    source: "GenLink 本地精选",
    tags: ["视频", "产品", "揭示", "运镜"],
    createdAt: LOCAL_UPDATED_AT,
    updatedAt: LOCAL_UPDATED_AT,
  },
];
```

- [ ] **Step 3: Add bundled community fallback JSON**

Create `src/features/prompt-library/bundledCommunityPrompts.json`:

```json
[
  {
    "id": "bundled-youmind-gpt-image-2-001",
    "kind": "image",
    "origin": "community",
    "title": "VR 头显爆炸视图海报",
    "prompt": "Create an exploded-view product poster for a futuristic VR headset, showing separated lenses, sensors, straps, internal chips, cooling vents, and translucent casing layers. Use a premium dark studio background, precise technical callout composition, crisp rim lighting, realistic materials, and a clean commercial layout without unreadable text.",
    "excerpt": "未来感 VR 头显产品爆炸视图海报，强调结构拆解和高级商业质感。",
    "category": "产品营销",
    "source": "youmind-gpt-image-2",
    "tags": ["GPT Image 2", "产品", "海报", "科技"],
    "githubUrl": "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    "detailUrl": "https://youmind.com/zh-CN/gpt-image-2-prompts",
    "createdAt": "2026-07-04T00:00:00.000Z",
    "updatedAt": "2026-07-04T00:00:00.000Z"
  },
  {
    "id": "bundled-youmind-seedance-2-001",
    "kind": "video",
    "origin": "community",
    "title": "15 秒电影感日式浪漫短片",
    "prompt": "A 15-second cinematic Japanese romance short film. Soft evening street light, gentle handheld camera, two characters passing under warm lanterns, a quiet pause, subtle eye contact, wind moving hair and clothing, slow push-in, delicate emotional rhythm, realistic skin tones, shallow depth of field, film grain, natural motion.",
    "excerpt": "电影感日式浪漫短片，强调柔和灯光、眼神停顿和克制运镜。",
    "category": "视频提示词",
    "source": "youmind-seedance-2",
    "tags": ["Seedance 2", "视频", "电影感", "情绪"],
    "githubUrl": "https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts",
    "detailUrl": "https://youmind.com/zh-CN/seedance-2-0-prompts",
    "createdAt": "2026-07-04T00:00:00.000Z",
    "updatedAt": "2026-07-04T00:00:00.000Z"
  }
]
```

- [ ] **Step 4: Verify type import path compiles**

Run: `npx tsc --noEmit`

Expected: it may still report unrelated existing workspace errors, but it must not report missing modules for the three new prompt-library files.

## Task 2: Markdown Parser

**Files:**
- Create: `src/lib/prompt-library/parse.ts`
- Create: `src/lib/prompt-library/parse.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/lib/prompt-library/parse.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseYouMindPromptMarkdown } from "./parse";
import type { PromptLibrarySourceConfig } from "@/features/prompt-library/types";

const gptSource: PromptLibrarySourceConfig = {
  id: "youmind-gpt-image-2",
  kind: "image",
  source: "youmind-gpt-image-2",
  githubUrl: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
  rawBaseUrl: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main",
  defaultCategory: "图像提示词",
  maxEntries: 500,
};

const seedanceSource: PromptLibrarySourceConfig = {
  id: "youmind-seedance-2",
  kind: "video",
  source: "youmind-seedance-2",
  githubUrl: "https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts",
  rawBaseUrl: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-seedance-2-prompts/main",
  defaultCategory: "视频提示词",
  maxEntries: 500,
};

test("parses GPT Image 2 markdown prompt blocks", () => {
  const entries = parseYouMindPromptMarkdown(
    [
      "### No. 1: 产品营销 - VR 头显爆炸视图海报",
      "#### 📖 描述",
      "用于产品海报的结构拆解视觉。",
      "#### 📝 提示词",
      "```",
      "Create a futuristic VR headset exploded view poster.",
      "```",
      "#### 🖼️ 生成图片",
      '<img src="https://example.com/cover.jpg" width="700" alt="cover">',
      "**[👉 立即尝试 →](https://youmind.com/zh-CN/gpt-image-2-prompts?id=13460)**",
    ].join("\n"),
    gptSource,
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "youmind-gpt-image-2-001");
  assert.equal(entries[0].kind, "image");
  assert.equal(entries[0].title, "VR 头显爆炸视图海报");
  assert.equal(entries[0].category, "产品营销");
  assert.equal(entries[0].prompt, "Create a futuristic VR headset exploded view poster.");
  assert.equal(entries[0].coverUrl, "https://example.com/cover.jpg");
  assert.equal(entries[0].detailUrl, "https://youmind.com/zh-CN/gpt-image-2-prompts?id=13460");
});

test("parses Seedance markdown prompt blocks", () => {
  const entries = parseYouMindPromptMarkdown(
    [
      "### No. 1: Seedance 2.0：15 秒电影感日式浪漫短片",
      "#### 📖 描述",
      "一段电影感短片。",
      "#### 📝 提示词",
      "```",
      "A 15-second cinematic Japanese romance short film.",
      "```",
      "#### 🎬 视频",
      '<img src="https://example.com/thumb.jpg" width="700" alt="video">',
      "**[👉 立即体验 →](https://youmind.com/zh-CN/seedance-2-0-prompts?id=1402)**",
    ].join("\n"),
    seedanceSource,
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "youmind-seedance-2-001");
  assert.equal(entries[0].kind, "video");
  assert.equal(entries[0].category, "视频提示词");
  assert.equal(entries[0].prompt, "A 15-second cinematic Japanese romance short film.");
  assert.deepEqual(entries[0].tags.includes("Seedance 2"), true);
});

test("skips blocks without a fenced prompt", () => {
  const entries = parseYouMindPromptMarkdown(
    [
      "### No. 1: 无提示词条目",
      "#### 📖 描述",
      "只有描述。",
    ].join("\n"),
    gptSource,
  );

  assert.equal(entries.length, 0);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --import tsx --test src/lib/prompt-library/parse.test.ts`

Expected: FAIL because `tsx` or `parse.ts` may not exist yet. If `tsx` is not available in the project, use the existing TypeScript test command pattern from nearby tests or run `npx tsc --noEmit` after implementation.

- [ ] **Step 3: Implement parser**

Create `src/lib/prompt-library/parse.ts`:

```ts
import type {
  PromptLibraryEntry,
  PromptLibrarySourceConfig,
} from "@/features/prompt-library/types";

const FALLBACK_UPDATED_AT = "2026-07-04T00:00:00.000Z";

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function createExcerpt(value: string): string {
  const compact = stripMarkdown(value);
  return compact.length > 150 ? `${compact.slice(0, 150)}...` : compact;
}

function splitEntryBlocks(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^###\s+/.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks.filter((block) => /^###\s+/.test(block.trimStart()));
}

function parseHeading(block: string): string {
  const raw = /^###\s+(.+)$/m.exec(block)?.[1]?.trim() ?? "";
  return raw.replace(/^No\.\s*\d+\s*:\s*/i, "").trim();
}

function splitCategoryAndTitle(title: string, defaultCategory: string): {
  category: string;
  title: string;
} {
  const parts = title.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return {
      category: parts[0].trim() || defaultCategory,
      title: parts.slice(1).join(" - ").trim() || title,
    };
  }

  return {
    category: defaultCategory,
    title,
  };
}

function extractSection(block: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(block);
  if (!match || match.index < 0) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = block.slice(start);
  const nextHeading = rest.search(/\n####\s+/);
  return (nextHeading >= 0 ? rest.slice(0, nextHeading) : rest).trim();
}

function extractPrompt(block: string): string {
  const promptSection = extractSection(block, /####[^\n]*提示词[^\n]*\n/);
  const code = /```[\w-]*\s*([\s\S]*?)```/.exec(promptSection)?.[1]?.trim();
  return code ?? "";
}

function extractCoverUrl(block: string, rawBaseUrl: string): string | undefined {
  const htmlImage = /<img[^>]+src=["']([^"']+)["']/i.exec(block)?.[1]?.trim();
  const markdownImage = /!\[[^\]]*]\(([^)]+)\)/.exec(block)?.[1]?.trim();
  const value = htmlImage || markdownImage;

  if (!value) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${rawBaseUrl}/${value.replace(/^\.?\//, "")}`;
}

function extractDetailUrl(block: string): string | undefined {
  const links = Array.from(block.matchAll(/\((https:\/\/youmind\.com\/[^)]+)\)/g));
  return links[links.length - 1]?.[1];
}

function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = stripMarkdown(value);
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

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

export function parseYouMindPromptMarkdown(
  markdown: string,
  source: PromptLibrarySourceConfig,
): PromptLibraryEntry[] {
  const blocks = splitEntryBlocks(markdown);
  const entries: PromptLibraryEntry[] = [];

  for (const block of blocks) {
    if (entries.length >= source.maxEntries) {
      break;
    }

    const rawTitle = parseHeading(block);
    const prompt = extractPrompt(block);

    if (!rawTitle || !prompt) {
      continue;
    }

    const { category, title } = source.kind === "image"
      ? splitCategoryAndTitle(rawTitle, source.defaultCategory)
      : { category: source.defaultCategory, title: rawTitle };
    const description = extractSection(block, /####[^\n]*描述[^\n]*\n/);
    const sourceLabel = source.kind === "video" ? "Seedance 2" : "GPT Image 2";
    const index = entries.length + 1;

    entries.push({
      id: `${source.id}-${String(index).padStart(3, "0")}`,
      kind: source.kind,
      origin: "community",
      title,
      prompt,
      excerpt: createExcerpt(description || prompt),
      category,
      source: source.source,
      tags: normalizeTags([sourceLabel, category, source.source]),
      coverUrl: extractCoverUrl(block, source.rawBaseUrl),
      githubUrl: source.githubUrl,
      detailUrl: extractDetailUrl(block),
      createdAt: FALLBACK_UPDATED_AT,
      updatedAt: FALLBACK_UPDATED_AT,
    });
  }

  return entries;
}
```

- [ ] **Step 4: Run parser tests**

Run: `node --import tsx --test src/lib/prompt-library/parse.test.ts`

Expected: PASS. If `tsx` is not installed, run `npx tsc --noEmit` and note that runtime parser tests need the repo's existing TS test harness.

## Task 3: Server Source Fetching And API Route

**Files:**
- Create: `src/lib/prompt-library/source.ts`
- Create: `src/app/api/prompt-library/community/route.ts`

- [ ] **Step 1: Implement source configs and fetching**

Create `src/lib/prompt-library/source.ts`:

```ts
import type {
  PromptLibraryEntry,
  PromptLibrarySourceConfig,
} from "@/features/prompt-library/types";
import {
  mergePromptLibraryEntries,
  parseYouMindPromptMarkdown,
} from "./parse";

const SOURCE_TIMEOUT_MS = 12_000;

export const PROMPT_LIBRARY_SOURCES: PromptLibrarySourceConfig[] = [
  {
    id: "youmind-gpt-image-2",
    kind: "image",
    source: "youmind-gpt-image-2",
    githubUrl: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    rawBaseUrl: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main",
    defaultCategory: "图像提示词",
    maxEntries: 500,
  },
  {
    id: "youmind-seedance-2",
    kind: "video",
    source: "youmind-seedance-2",
    githubUrl: "https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts",
    rawBaseUrl: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-seedance-2-prompts/main",
    defaultCategory: "视频提示词",
    maxEntries: 500,
  },
];

async function fetchTextWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
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

async function fetchSourceMarkdown(source: PromptLibrarySourceConfig): Promise<string> {
  try {
    return await fetchTextWithTimeout(`${source.rawBaseUrl}/README_zh.md`);
  } catch (zhError) {
    try {
      return await fetchTextWithTimeout(`${source.rawBaseUrl}/README.md`);
    } catch (enError) {
      const message = zhError instanceof Error ? zhError.message : String(zhError);
      const fallbackMessage = enError instanceof Error ? enError.message : String(enError);
      throw new Error(`${source.source}: zh=${message}; en=${fallbackMessage}`);
    }
  }
}

export async function fetchPromptLibraryCommunityEntries(): Promise<{
  entries: PromptLibraryEntry[];
  errors: string[];
}> {
  const results = await Promise.allSettled(
    PROMPT_LIBRARY_SOURCES.map(async (source) => {
      const markdown = await fetchSourceMarkdown(source);
      return parseYouMindPromptMarkdown(markdown, source);
    }),
  );

  const entries: PromptLibraryEntry[] = [];
  const errors: string[] = [];

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      entries.push(...result.value);
      return;
    }

    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  });

  return {
    entries: mergePromptLibraryEntries(entries),
    errors,
  };
}
```

- [ ] **Step 2: Implement API route**

Create `src/app/api/prompt-library/community/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchPromptLibraryCommunityEntries } from "@/lib/prompt-library/source";
import type {
  PromptLibraryApiResponse,
  PromptLibraryCommunityResponse,
} from "@/features/prompt-library/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<PromptLibraryApiResponse>> {
  try {
    const { entries, errors } = await fetchPromptLibraryCommunityEntries();
    const body: PromptLibraryCommunityResponse = {
      ok: true,
      entries,
      errors,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "提示词库同步失败",
      },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Verify API compiles**

Run: `npx tsc --noEmit`

Expected: no errors from `src/lib/prompt-library/source.ts` or `src/app/api/prompt-library/community/route.ts`.

## Task 4: Prompt Library Store

**Files:**
- Create: `src/store/prompt-library-store.ts`
- Create: `src/store/prompt-library-store.test.ts`

- [ ] **Step 1: Write store tests**

Create `src/store/prompt-library-store.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { PromptLibraryEntry } from "@/features/prompt-library/types";
import { createPromptLibraryState } from "./prompt-library-store";

const entry: PromptLibraryEntry = {
  id: "entry-1",
  kind: "image",
  origin: "community",
  title: "测试提示词",
  prompt: "Prompt body",
  excerpt: "Prompt body",
  category: "测试",
  source: "youmind-gpt-image-2",
  tags: ["测试"],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

test("toggles favorite prompts", () => {
  const state = createPromptLibraryState();

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), true);

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), false);
});

test("updates community cache", () => {
  const state = createPromptLibraryState();
  state.setCommunityCache([entry], "2026-07-04T01:00:00.000Z");

  assert.equal(state.communityPrompts.length, 1);
  assert.equal(state.communityPrompts[0].id, "entry-1");
  assert.equal(state.communityFetchedAt, "2026-07-04T01:00:00.000Z");
});
```

- [ ] **Step 2: Implement store**

Create `src/store/prompt-library-store.ts`:

```ts
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
      const next = { ...state.favoritePrompts };
      delete next[id];
      state.favoritePrompts = next;
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
            .map((cacheEntry) => `${cacheEntry.id}:${cacheEntry.updatedAt}`)
            .join("|");
          const nextSignature = entries
            .map((cacheEntry) => `${cacheEntry.id}:${cacheEntry.updatedAt}`)
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
```

- [ ] **Step 3: Run store tests**

Run: `node --import tsx --test src/store/prompt-library-store.test.ts`

Expected: PASS if the repo test runtime supports `tsx`. Otherwise verify with `npx tsc --noEmit`.

## Task 5: Prompt Library Dialog UI

**Files:**
- Create: `src/components/canvas/PromptLibraryDialog.tsx`
- Create: `src/components/canvas/PromptLibraryEntryButton.tsx`

- [ ] **Step 1: Implement entry button**

Create `src/components/canvas/PromptLibraryEntryButton.tsx`:

```tsx
"use client";

import { BookOpen } from "lucide-react";

export interface PromptLibraryEntryButtonProps {
  onClick: () => void;
  open?: boolean;
}

export function PromptLibraryEntryButton({
  onClick,
  open = false,
}: PromptLibraryEntryButtonProps) {
  return (
    <button
      type="button"
      data-canvas-menu-ignore="true"
      aria-pressed={open}
      className={[
        "fixed right-5 top-5 z-50 flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-md transition",
        open
          ? "border-[#CCFF00]/42 bg-[#CCFF00] text-[#141510]"
          : "border-white/10 bg-[#17181B]/92 text-white/78 hover:border-[#CCFF00]/36 hover:bg-[#202124] hover:text-white",
      ].join(" ")}
      onClick={onClick}
    >
      <BookOpen size={15} strokeWidth={1.9} />
      提示词库
    </button>
  );
}
```

- [ ] **Step 2: Implement modal shell, fetching, and filtering**

Create `src/components/canvas/PromptLibraryDialog.tsx` with these exports and core behavior:

```tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import {
  BookOpen,
  Check,
  Copy,
  Heart,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import bundledCommunityPrompts from "@/features/prompt-library/bundledCommunityPrompts.json";
import { LOCAL_PROMPT_LIBRARY_ENTRIES } from "@/features/prompt-library/localPrompts";
import type {
  PromptLibraryApiResponse,
  PromptLibraryEntry,
  PromptLibraryViewMode,
} from "@/features/prompt-library/types";
import { mergePromptLibraryEntries } from "@/lib/prompt-library/parse";
import { usePromptLibraryStore } from "@/store/prompt-library-store";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const BUNDLED_COMMUNITY_PROMPTS = bundledCommunityPrompts as PromptLibraryEntry[];

export interface PromptLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onAddToCanvas: (entry: PromptLibraryEntry) => void;
}

function sortLabels(labels: string[]): string[] {
  return labels.filter(Boolean).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function formatTime(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function PromptCover({ entry }: { entry: PromptLibraryEntry }) {
  const [failed, setFailed] = useState(false);
  const showImage = entry.coverUrl && !failed;

  return (
    <span className="relative block h-[210px] overflow-hidden rounded-[10px] bg-[linear-gradient(135deg,#24262b,#151719_44%,#17302d)] ring-1 ring-white/8">
      {showImage ? (
        <NextImage
          src={entry.coverUrl}
          alt={entry.title}
          fill
          unoptimized
          sizes="260px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-white/18">
          {entry.kind === "video" ? <Video size={38} /> : <ImageIcon size={38} />}
        </span>
      )}
      <span className="absolute left-2 top-2 rounded-md bg-black/68 px-2 py-1 text-[11px] font-semibold text-white/82">
        {entry.kind === "video" ? "视频" : "图像"}
      </span>
    </span>
  );
}

export function PromptLibraryDialog({ open, onClose, onAddToCanvas }: PromptLibraryDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const favoritePrompts = usePromptLibraryStore((state) => state.favoritePrompts);
  const cachedCommunityPrompts = usePromptLibraryStore((state) => state.communityPrompts);
  const cachedCommunityFetchedAt = usePromptLibraryStore((state) => state.communityFetchedAt);
  const toggleFavorite = usePromptLibraryStore((state) => state.toggleFavorite);
  const setCommunityCache = usePromptLibraryStore((state) => state.setCommunityCache);
  const [liveEntries, setLiveEntries] = useState<PromptLibraryEntry[]>([]);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<PromptLibraryViewMode>("all");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedSource, setSelectedSource] = useState("全部");
  const [selectedEntry, setSelectedEntry] = useState<PromptLibraryEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCommunity = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/prompt-library/community", { cache: "no-store" });
      const body = (await response.json()) as PromptLibraryApiResponse;
      if (!body.ok) {
        throw new Error(body.error);
      }
      setLiveEntries(body.entries);
      setLiveFetchedAt(body.fetchedAt);
      setErrors(body.errors);
      if (body.entries.length > 0) {
        setCommunityCache(body.entries, body.fetchedAt);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "提示词库同步失败"]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    void fetchCommunity();
    const timer = window.setInterval(() => {
      void fetchCommunity();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedEntry) {
          setSelectedEntry(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, selectedEntry]);

  const communityEntries = useMemo(
    () => mergePromptLibraryEntries([
      ...liveEntries,
      ...cachedCommunityPrompts,
      ...BUNDLED_COMMUNITY_PROMPTS,
    ]),
    [cachedCommunityPrompts, liveEntries],
  );
  const allEntries = useMemo(
    () => mergePromptLibraryEntries([...communityEntries, ...LOCAL_PROMPT_LIBRARY_ENTRIES]),
    [communityEntries],
  );
  const favoriteIds = useMemo(() => new Set(Object.keys(favoritePrompts)), [favoritePrompts]);
  const baseEntries = useMemo(() => {
    if (viewMode === "favorites") {
      return Object.values(favoritePrompts);
    }
    if (viewMode === "image") {
      return allEntries.filter((entry) => entry.kind === "image");
    }
    if (viewMode === "video") {
      return allEntries.filter((entry) => entry.kind === "video");
    }
    return allEntries;
  }, [allEntries, favoritePrompts, viewMode]);
  const categories = useMemo(
    () => ["全部", ...sortLabels(Array.from(new Set(baseEntries.map((entry) => entry.category))))],
    [baseEntries],
  );
  const sources = useMemo(
    () => ["全部", ...sortLabels(Array.from(new Set(baseEntries.map((entry) => entry.source))))],
    [baseEntries],
  );
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return baseEntries.filter((entry) => {
      const searchable = [
        entry.title,
        entry.prompt,
        entry.excerpt,
        entry.category,
        entry.source,
        ...entry.tags,
      ].join(" ").toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (selectedCategory === "全部" || entry.category === selectedCategory) &&
        (selectedSource === "全部" || entry.source === selectedSource)
      );
    });
  }, [baseEntries, query, selectedCategory, selectedSource]);

  if (!open) {
    return null;
  }

  const fetchedAtLabel = formatTime(liveFetchedAt ?? cachedCommunityFetchedAt);

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
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-[66px] items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <BookOpen size={18} className="text-[#CCFF00]" />
            <div>
              <div className="text-[15px] font-semibold text-white/90">提示词库</div>
              <div className="mt-0.5 text-[11px] text-white/38">
                {fetchedAtLabel ? `更新于 ${fetchedAtLabel}` : "社区源同步中"}
                {errors.length > 0 ? " · 部分社区源暂不可用" : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-9 w-[280px] items-center gap-2 rounded-[10px] border border-white/12 bg-black/18 px-3 text-white/58">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/32"
                placeholder="搜索提示词"
              />
            </label>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-[10px] border border-white/10 px-3 text-[12px] font-semibold text-white/62 transition hover:bg-white/8 hover:text-white"
              onClick={() => void fetchCommunity()}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              刷新
            </button>
            <button
              type="button"
              aria-label="关闭提示词库"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white/48 transition hover:bg-white/8 hover:text-white/78"
              onClick={onClose}
            >
              <X size={19} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="flex h-12 items-center gap-2 border-b border-white/10 px-5">
          {([
            ["all", "全部"],
            ["image", "图像"],
            ["video", "视频"],
            ["favorites", `收藏 ${Object.keys(favoritePrompts).length}`],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={[
                "h-8 rounded-[9px] px-3 text-[13px] font-semibold transition",
                viewMode === mode
                  ? "bg-[#CCFF00] text-[#141510]"
                  : "border border-white/10 text-white/52 hover:bg-white/8 hover:text-white/76",
              ].join(" ")}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
          {errors.length > 0 ? (
            <span className="ml-auto flex items-center gap-1.5 text-[12px] text-amber-200/80">
              <WifiOff size={14} />
              部分离线
            </span>
          ) : null}
        </div>

        <div className="flex h-12 items-center gap-3 border-b border-white/10 px-5">
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="h-8 rounded-[9px] border border-white/10 bg-[#202124] px-2 text-[12px] text-white/70 outline-none"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={selectedSource}
            onChange={(event) => setSelectedSource(event.target.value)}
            className="h-8 rounded-[9px] border border-white/10 bg-[#202124] px-2 text-[12px] text-white/70 outline-none"
          >
            {sources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
          <div className="ml-auto text-[12px] text-white/38">
            显示 {filteredEntries.length} / {baseEntries.length} 条，社区 {communityEntries.length} 条
          </div>
        </div>

        <div className="generation-history-scrollable min-h-0 flex-1 overflow-y-auto p-5">
          {filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-white/34">
              没有匹配的提示词
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
              {filteredEntries.map((entry) => (
                <article key={entry.id} className="group overflow-hidden rounded-[11px] bg-[#202124] ring-1 ring-white/8">
                  <div className="relative">
                    <PromptCover entry={entry} />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/42 opacity-0 transition group-hover:opacity-100">
                      <button className="h-8 rounded-full bg-white px-3 text-[12px] font-semibold text-[#111214]" onClick={() => setSelectedEntry(entry)}>查看</button>
                      <button className="h-8 rounded-full bg-[#CCFF00] px-3 text-[12px] font-semibold text-[#141510]" onClick={() => onAddToCanvas(entry)}>添加到画布</button>
                    </div>
                    <button
                      type="button"
                      aria-label="收藏提示词"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/62 text-white/72 transition hover:bg-[#CCFF00] hover:text-[#141510]"
                      onClick={() => toggleFavorite(entry)}
                    >
                      <Heart size={14} className={favoriteIds.has(entry.id) ? "fill-current" : ""} />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[13px] font-semibold text-white/84">{entry.title}</div>
                    <p className="mt-1 line-clamp-3 text-[12px] leading-5 text-white/44">{entry.excerpt}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-white/32">
                      <span className="truncate">{entry.category}</span>
                      <span>{entry.source}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {selectedEntry ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/48 p-8 backdrop-blur-[2px]">
            <div className="flex max-h-full w-[820px] flex-col overflow-hidden rounded-[12px] border border-white/12 bg-[#1f2023] shadow-[0_24px_64px_rgba(0,0,0,0.52)]">
              <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
                <div className="truncate text-[14px] font-semibold text-white/86">{selectedEntry.title}</div>
                <button className="flex h-8 w-8 items-center justify-center rounded-md text-white/48 hover:bg-white/8" onClick={() => setSelectedEntry(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-white/48">
                  <span>{selectedEntry.kind === "video" ? "视频" : "图像"}</span>
                  <span>{selectedEntry.category}</span>
                  <span>{selectedEntry.source}</span>
                </div>
                <pre className="max-h-[420px] whitespace-pre-wrap rounded-[10px] border border-white/10 bg-black/24 p-4 text-[13px] leading-6 text-white/78">{selectedEntry.prompt}</pre>
              </div>
              <div className="flex h-14 items-center justify-end gap-2 border-t border-white/10 px-4">
                <button
                  className="flex h-9 items-center gap-2 rounded-[9px] px-3 text-[12px] font-semibold text-white/62 hover:bg-white/8"
                  onClick={() => {
                    void navigator.clipboard.writeText(selectedEntry.prompt).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1200);
                    });
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "已复制" : "复制提示词"}
                </button>
                <button
                  className="h-9 rounded-[9px] bg-[#CCFF00] px-4 text-[12px] font-semibold text-[#141510]"
                  onClick={() => onAddToCanvas(selectedEntry)}
                >
                  添加到画布
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check UI**

Run: `npx tsc --noEmit`

Expected: no errors for `PromptLibraryDialog.tsx` or `PromptLibraryEntryButton.tsx`. If Tailwind `line-clamp-3` is not configured, replace it with `overflow-hidden` and a fixed max height.

## Task 6: Canvas Integration

**Files:**
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add imports**

Near existing canvas component imports in `src/components/canvas/InfiniteCanvas.tsx`, add:

```ts
import { PromptLibraryDialog } from './PromptLibraryDialog';
import { PromptLibraryEntryButton } from './PromptLibraryEntryButton';
import type { PromptLibraryEntry } from '@/features/prompt-library/types';
```

- [ ] **Step 2: Add modal state inside `InfiniteCanvas` component**

Near other `useState` calls in the main `InfiniteCanvas` component, add:

```ts
const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
```

- [ ] **Step 3: Add a helper to create prompt-library nodes**

Inside the main `InfiniteCanvas` component, near other node creation helpers where `addNodes`, `getViewport`, and selection helpers are available, add:

```ts
const addPromptLibraryEntryToCanvas = useCallback((entry: PromptLibraryEntry) => {
  const viewport = getViewport();
  const center = {
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom,
  };
  const nodeId = `prompt-library-${entry.kind}-${Date.now()}`;
  const node = {
    id: nodeId,
    type: entry.kind === 'video' ? 'video_generation' : 'image_generation',
    position: {
      x: center.x - 180,
      y: center.y - 160,
    },
    data: {
      title: entry.title,
      prompt: entry.prompt,
    },
  } as CanvasNode;

  addNodes([node]);
  selectSingleNode(nodeId);
  showProjectMessage(`已添加“${entry.title}”到画布`);
}, [addNodes, getViewport, selectSingleNode, showProjectMessage]);
```

If `selectSingleNode` is not in scope where this helper is added, use the existing node selection store action already used by nearby handlers. Do not introduce a second selection system.

- [ ] **Step 4: Render the right-top entry and dialog**

In the main JSX return, near `CanvasHeader` / toolbar overlays, render:

```tsx
<PromptLibraryEntryButton
  open={promptLibraryOpen}
  onClick={() => setPromptLibraryOpen((current) => !current)}
/>

<PromptLibraryDialog
  open={promptLibraryOpen}
  onClose={() => setPromptLibraryOpen(false)}
  onAddToCanvas={addPromptLibraryEntryToCanvas}
/>
```

Ensure the right-top button does not overlap the agent panel header. If it overlaps existing UI, move it to `right-6 top-[72px]` but keep it visually in the right-top canvas area.

- [ ] **Step 5: Type-check integration**

Run: `npx tsc --noEmit`

Expected: no TypeScript errors in `InfiniteCanvas.tsx` related to `PromptLibraryEntry`, `CanvasNode`, `addNodes`, `getViewport`, or selection.

## Task 7: Verification And Polish

**Files:**
- Modify only files touched in prior tasks if verification finds issues.

- [ ] **Step 1: Run focused parser tests**

Run: `node --import tsx --test src/lib/prompt-library/parse.test.ts`

Expected: PASS or document that the repo lacks `tsx` test runtime and use TypeScript check instead.

- [ ] **Step 2: Run focused store tests**

Run: `node --import tsx --test src/store/prompt-library-store.test.ts`

Expected: PASS or document that the repo lacks `tsx` test runtime and use TypeScript check instead.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: PASS, or only pre-existing unrelated failures. New prompt-library files must not introduce errors.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: PASS, or only pre-existing unrelated lint issues. New prompt-library files must not introduce errors.

- [ ] **Step 5: Manual browser verification**

Start dev server if one is not already running:

```bash
npm run dev
```

Open the canvas and verify:

- “提示词库” button appears in the right-top canvas area.
- Clicking opens a centered large modal.
- Search filters cards by title/prompt/category/source/tags.
- 图像 tab only shows image entries.
- 视频 tab only shows video entries.
- 收藏 toggles persist after closing and reopening the modal.
- 查看 opens detail layer.
- 复制提示词 copies full prompt.
- 添加图像条目 creates an `image_generation` node at viewport center and does not auto-run.
- 添加视频条目 creates a `video_generation` node at viewport center and does not auto-run.
- If API fails, bundled/local fallback entries still render.

- [ ] **Step 6: Final git status check**

Run: `git status --short`

Expected: only prompt-library implementation files plus the approved design/plan docs are new/modified, and existing unrelated user changes remain untouched.
