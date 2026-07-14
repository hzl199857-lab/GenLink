# Comfly Midjourney Basic Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Comfly Midjourney Imagine text/reference generation and let users click one quadrant of the returned grid to request the matching U1-U4 high-resolution image.

**Architecture:** Keep `provider="comfly"` in product data and dispatch `model="midjourney"` to a focused server module. Persist upstream jobs as internal provider `comfly-midjourney`, attach optional grid metadata to image results, and expose a constrained upscale route accepting only quadrant 1-4. Render the hit regions in a small node component rather than expanding `InfiniteCanvas.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, Prisma, Tailwind CSS, Node test runner.

---

## File map

- Create `src/lib/comfly-midjourney.ts` and `.test.ts`: prompt, reference conversion, HTTP requests, status/error parsing, U-button extraction.
- Modify `src/lib/vibe.ts`: export the existing reference-image reader for reuse.
- Modify `src/lib/image-generation-options.ts` and test: expose Midjourney only under Comfly.
- Modify `src/app/api/ai/image/route.ts`; create `route.midjourney.test.ts`: Imagine dispatch, polling, result metadata, resume.
- Create `src/app/api/ai/image/midjourney-upscale/route.ts` and test: server-validated U1-U4 submission.
- Create `src/lib/midjourney-image-state.ts` and test: pure canvas state transitions.
- Modify `src/types/canvas.ts` and `src/store/canvas-store.ts`: metadata and upscale action.
- Create `src/components/nodes/MidjourneyGridSelector.tsx` and test; modify `ImageGenerationNode.tsx` and the adapter in `InfiniteCanvas.tsx`.
- Modify `.env.example`: document `COMFLY_MIDJOURNEY_BASE_URL`.

---

### Task 1: Model option and pure protocol helpers

**Files:** `src/lib/image-generation-options.ts`, `src/lib/image-generation-options.test.ts`, new `src/lib/comfly-midjourney.ts`, new `src/lib/comfly-midjourney.test.ts`.

- [ ] Write failing tests for:
  - `midjourney` exists only in `IMAGE_MODEL_OPTIONS_BY_PROVIDER.comfly`.
  - `buildMidjourneyPrompt("cat", "16:9")` returns `cat --ar 16:9`.
  - existing `--ar` or `--aspect` is not duplicated; `auto` appends nothing.
  - submission codes 1 and 22 return a task ID; 23 is retryable queue-full; 24 is non-retryable sensitive prompt.
  - unordered buttons produce `{1,2,3,4}` only when U1-U4 are all present.

- [ ] Run RED:

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts
```

Expected: missing model/helper failures.

- [ ] Implement the minimal public API:

```ts
export type MidjourneyQuadrant = 1 | 2 | 3 | 4;
export type MidjourneyUpscaleActions = Record<MidjourneyQuadrant, string>;
export function buildMidjourneyPrompt(prompt: string, aspectRatio?: string): string;
export function parseMidjourneySubmission(value: unknown): { taskId: string };
export function extractMidjourneyUpscaleActions(buttons: unknown): MidjourneyUpscaleActions | undefined;
```

Add `{ id: "midjourney", label: "Midjourney" }` only to `COMFLY_IMAGE_MODELS` and export `isComflyMidjourneyModel(provider, model)`.

- [ ] Run GREEN with the same command.
- [ ] Commit: `git commit -m "feat: add Midjourney protocol helpers"`.

---

### Task 2: Reference conversion and HTTP client

**Files:** `src/lib/vibe.ts`, `src/lib/comfly-midjourney.ts`, `src/lib/comfly-midjourney.test.ts`, `.env.example`.

- [ ] Write failing injected-fetch tests asserting:
  - Imagine calls `/mj/submit/imagine` with Bearer auth.
  - text-only body contains `base64Array: []`.
  - one and multiple references are sent in original order as full Data URLs.
  - fetch calls `/mj/task/{id}/fetch`.
  - pending statuses are `NOT_START`, `SUBMITTED`, `IN_PROGRESS`.
  - success requires `imageUrl`; failure/cancel/modal return clear Chinese errors.
  - Action sends the stored `taskId` and selected stored `customId` to `/mj/submit/action`.

- [ ] Run RED: `node --test src/lib/comfly-midjourney.test.ts`.

- [ ] Export the existing reader without changing behavior:

```ts
export async function readReferenceImage(
  image: { url: string; fileName?: string },
  index: number,
): Promise<{ bytes: Buffer; mediaType: string }>;
```

- [ ] Implement:

```ts
export async function submitMidjourneyImagine(params: MidjourneyImagineParams): Promise<{ taskId: string }>;
export async function fetchMidjourneyTask(params: MidjourneyFetchParams): Promise<MidjourneyTaskState>;
export async function submitMidjourneyUpscale(params: MidjourneyUpscaleParams): Promise<{ taskId: string }>;
```

Use `COMFLY_MIDJOURNEY_BASE_URL`; otherwise remove terminal `/v1` from `COMFLY_IMAGE_BASE_URL` or `COMFLY_BASE_URL`. Do not log prompt, key, or base64.

- [ ] Add `COMFLY_MIDJOURNEY_BASE_URL=https://ai.comfly.org` to `.env.example`.
- [ ] Run GREEN.
- [ ] Commit: `git commit -m "feat: add Comfly Midjourney client"`.

---

### Task 3: Imagine task integration and recovery

**Files:** `src/app/api/ai/image/route.ts`, new `src/app/api/ai/image/route.midjourney.test.ts`, `src/types/canvas.ts`.

- [ ] Write failing tests/source contracts proving:
  - `provider=comfly, model=midjourney` branches before generic Comfly `/images/*` handling.
  - ImageJob stores provider `comfly-midjourney`.
  - successful Imagine produces one image plus `{kind:"grid", taskId, actions}` metadata.
  - resume reads `/mj/task/*` for `comfly-midjourney`.
  - ordinary Comfly models retain existing behavior.

- [ ] Run RED:

```powershell
node --test src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts
```

- [ ] Add shared optional metadata:

```ts
export interface MidjourneyImageMetadata {
  kind: "grid" | "upscale";
  taskId: string;
  sourceTaskId?: string;
  selectedQuadrant?: 1 | 2 | 3 | 4;
  actions?: MidjourneyUpscaleActions;
  gridImageUrl?: string;
  gridHostedImageUrl?: string;
  pendingQuadrant?: 1 | 2 | 3 | 4;
}
```

- [ ] Add `submitMidjourneyJob` and `pollMidjourneyImageJob`. Persist `upstreamTaskId`, call `completeImageJob(..., { cacheRemoteBeforeComplete: true })`, and preserve metadata through `buildImageJobResult` and persistence.
- [ ] Extend pending, stale, and error-resume allowlists with `comfly-midjourney`.
- [ ] Run GREEN.
- [ ] Commit: `git commit -m "feat: run Midjourney Imagine jobs"`.

---

### Task 4: Constrained U1-U4 endpoint

**Files:** new `src/app/api/ai/image/midjourney-upscale/route.ts` and `.test.ts`.

- [ ] Write failing tests for `parseMidjourneyUpscaleBody`: require `jobId`, allow only integer quadrant 1-4, reject `customId` input.
- [ ] Add a source-contract test proving the route loads the original ImageJob result, requires `provider === "comfly-midjourney"`, and selects `actions[quadrant]` server-side.
- [ ] Run RED: `node --test src/app/api/ai/image/midjourney-upscale/route.test.ts`.
- [ ] Implement POST: authenticate; validate; load completed grid job; resolve stored action; call Action; create a new `comfly-midjourney` ImageJob with upscale metadata; start polling; return the standard pending response.
- [ ] Run GREEN.
- [ ] Commit: `git commit -m "feat: add Midjourney upscale endpoint"`.

---

### Task 5: Canvas state and store action

**Files:** new `src/lib/midjourney-image-state.ts` and `.test.ts`, `src/types/canvas.ts`, `src/store/canvas-store.ts`.

- [ ] Write failing pure tests:
  - applying Imagine stores the grid URL, job ID, and actions.
  - starting quadrant 4 keeps the grid visible, sets `pendingQuadrant=4`, and disables repeat action.
  - success makes the upscale primary and retains the grid in `generationResults`.
  - failure restores the selectable grid and clears pending state.

- [ ] Run RED: `node --test src/lib/midjourney-image-state.test.ts`.

- [ ] Implement:

```ts
applyMidjourneyGridResult(data, result): ImageGenerationNodeData;
startMidjourneyUpscale(data, quadrant): ImageGenerationNodeData;
applyMidjourneyUpscaleResult(data, result): ImageGenerationNodeData;
failMidjourneyUpscale(data, message): ImageGenerationNodeData;
```

- [ ] Add store action `upscaleMidjourneyGridImage(nodeId, quadrant)`. POST only `{jobId, quadrant}`, reuse `pollImageGenerationJob`, persist the returned image, and update via the pure helpers.
- [ ] Ensure normal initial generation copies optional `result.midjourney` into node state.
- [ ] Run GREEN.
- [ ] Commit: `git commit -m "feat: manage Midjourney grid state"`.

---

### Task 6: Four-quadrant node UI

**Files:** new `src/components/nodes/MidjourneyGridSelector.tsx` and `.test.ts`, `ImageGenerationNode.tsx`, `InfiniteCanvas.tsx`.

- [ ] Write failing source-contract tests proving:
  - four real buttons appear in `[1,2,3,4]` visual order inside `grid-cols-2 grid-rows-2`.
  - labels are “选择左上/右上/左下/右下图片并生成高清图”.
  - controls use `nodrag nopan`, stop propagation, and call `onSelect(quadrant)`.
  - pending disables all buttons and marks only the selected quadrant.
  - selector markup lives outside `InfiniteCanvas.tsx`; the adapter only passes the store callback.

- [ ] Run RED: `node --test src/components/nodes/MidjourneyGridSelector.test.ts`.

- [ ] Implement `MidjourneyGridSelector` with absolute four-region overlay, hover/focus border and number, keyboard accessibility, and pending indicator.
- [ ] Add `onMidjourneyUpscale` to `ImageGenerationNodeProps`. Render only for a complete `kind="grid"` action set. Stop the underlying card/lightbox click.
- [ ] In `ImageGenerationNodeAdapter`, pass `(quadrant) => upscaleMidjourneyGridImage(id, quadrant)`.
- [ ] Run GREEN plus regression test:

```powershell
node --test src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

- [ ] Commit: `git commit -m "feat: add Midjourney grid selection UI"`.

---

### Task 7: Verification

- [ ] Run all focused tests:

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts src/app/api/ai/image/midjourney-upscale/route.test.ts src/lib/midjourney-image-state.test.ts src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `git diff --check`, `git status --short`, and inspect `git diff --stat`.
- [ ] Confirm no key, base64 payload, generated media, temporary file, or unrelated change is present.
- [ ] If verification requires fixes, add a failing regression test first, apply the minimal fix, rerun verification, and commit `fix: finalize Midjourney image integration`.
