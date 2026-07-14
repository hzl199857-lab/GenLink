# Midjourney Upscale Pending Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected Midjourney quadrant and its upscale progress visibly marked until the task finishes or fails, without rendering a duplicate top-left loading spinner.

**Architecture:** Reuse `pendingQuadrant` as the single source of truth inside `MidjourneyGridSelector`. Derive a local `hasPending` flag to disable all quadrant buttons, keep the selected quadrant highlighted, dim the remaining quadrants, and render one persistent central loading overlay independent of hover. The top-left quadrant number remains an idle-only hover/focus hint and is not rendered while pending.

**Tech Stack:** React, TypeScript, Tailwind CSS, ReactFlow, Node test runner.

---

### Task 1: Remove the duplicate pending spinner

**Files:**
- Modify: `src/components/nodes/MidjourneyGridSelector.tsx`
- Modify: `src/components/nodes/MidjourneyGridSelector.test.ts`

- [ ] **Step 1: Write the failing source-contract tests**

Add assertions that the top-left quadrant badge renders only when `!pending`, contains the quadrant number, and contains no `animate-spin` class. Keep the existing assertions for the central pending status, `aria-busy`, pending-wide disabling, and dimmed non-selected quadrants.

- [ ] **Step 2: Run RED**

```powershell
node --test src/components/nodes/MidjourneyGridSelector.test.ts
```

Expected: the new regression test fails because the top-left badge still renders a pending spinner.

- [ ] **Step 3: Implement the idle-only top-left badge**

Replace the conditional contents of the current top-left badge with an idle-only wrapper:

```tsx
{!pending ? (
  <span className="absolute left-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded bg-black/65 px-2 text-xs font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover/quadrant:opacity-100 group-focus-visible/quadrant:opacity-100">
    {quadrant}
  </span>
) : null}
```

Do not change the central pending overlay, selected border, dimming, disabled behavior, API, polling, persistence, or U1-U4 mappings.

- [ ] **Step 4: Run GREEN and TypeScript**

```powershell
node --test src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
npx tsc --noEmit
```

Expected: zero failures and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/nodes/MidjourneyGridSelector.tsx src/components/nodes/MidjourneyGridSelector.test.ts
git commit -m "fix: remove duplicate Midjourney upscale spinner"
```

### Task 2: Final verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all focused Midjourney tests**

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run static checks**

```powershell
npx tsc --noEmit
npm run lint
git diff --check
git status --short
```

Expected: no TypeScript, lint errors, or whitespace errors; unrelated existing lint warnings may remain.

- [ ] **Step 3: Confirm the live development server**

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/' -TimeoutSec 10).StatusCode
```

Expected: `200`, and the development bundle contains the central `正在高清放大` status text.

---

## Self-review

- Pending feedback is tied to the existing persisted state and remains visible without hover.
- The pending quadrant renders only the central spinner and status text; the top-left badge is idle-only.
- All four buttons are disabled when a pending quadrant exists.
- Non-selected quadrants dim; non-pending hover behavior remains intact.
- Completion, failure, API, polling, and persistence flows remain unchanged.
