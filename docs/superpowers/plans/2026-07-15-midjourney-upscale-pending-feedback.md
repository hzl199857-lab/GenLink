# Midjourney Upscale Pending Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected Midjourney quadrant and its upscale progress visibly marked until the task finishes or fails.

**Architecture:** Reuse `pendingQuadrant` as the single source of truth inside `MidjourneyGridSelector`. Derive a local `hasPending` flag to disable all quadrant buttons, keep the selected quadrant highlighted, dim the remaining quadrants, and render a persistent loading overlay independent of hover.

**Tech Stack:** React, TypeScript, Tailwind CSS, ReactFlow, Node test runner.

---

### Task 1: Persistent quadrant upscale feedback

**Files:**
- Modify: `src/components/nodes/MidjourneyGridSelector.tsx`
- Modify: `src/components/nodes/MidjourneyGridSelector.test.ts`

- [ ] **Step 1: Write the failing source-contract tests**

Update the disabled assertion and add:

```ts
assert.match(source, /disabled=\{disabled \|\| hasPending\}/);

test("keeps pending upscale feedback visible without hover", () => {
  assert.match(source, /const hasPending = pendingQuadrant !== undefined/);
  assert.match(source, /pending \? 'opacity-100'/);
  assert.match(source, /正在高清放大/);
  assert.match(source, /aria-busy=\{pending\}/);
  assert.match(source, /hasPending[\s\S]*?opacity-60/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test src/components/nodes/MidjourneyGridSelector.test.ts
```

Expected: failures for missing `hasPending`, persistent opacity, center status text, and pending-wide disabling.

- [ ] **Step 3: Implement the pending visual state**

Inside `MidjourneyGridSelector` add:

```ts
const hasPending = pendingQuadrant !== undefined;
```

For each button use `disabled={disabled || hasPending}` and conditional classes:

```tsx
className={[
  'group/quadrant relative border bg-transparent outline-none transition-colors disabled:cursor-wait',
  pending
    ? 'border-white/85 bg-black/25'
    : hasPending
      ? 'border-transparent bg-black/35 opacity-60'
      : 'border-transparent hover:border-white/75 hover:bg-black/20 focus-visible:border-white focus-visible:bg-black/25',
].join(' ')}
```

Make the top-left badge persistent only for the selected pending quadrant:

```tsx
className={[
  'absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded bg-black/65 px-2 text-xs font-semibold text-white shadow-sm transition-opacity',
  pending
    ? 'opacity-100'
    : 'opacity-0 group-hover/quadrant:opacity-100 group-focus-visible/quadrant:opacity-100',
].join(' ')}
```

Render a center overlay for the selected pending quadrant:

```tsx
{pending ? (
  <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/15 text-white">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
    <span className="rounded-[6px] bg-black/70 px-2.5 py-1.5 text-[12px] font-medium shadow-sm">
      正在高清放大
    </span>
  </span>
) : null}
```

- [ ] **Step 4: Run GREEN and TypeScript**

```powershell
node --test src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
npx tsc --noEmit
```

Expected: zero failures and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/nodes/MidjourneyGridSelector.tsx src/components/nodes/MidjourneyGridSelector.test.ts
git commit -m "fix: persist Midjourney upscale feedback"
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

Expected: `200`, and the development bundle contains `正在高清放大`.

---

## Self-review

- Pending feedback is tied to the existing persisted state and remains visible without hover.
- All four buttons are disabled when a pending quadrant exists.
- Non-selected quadrants dim; non-pending hover behavior remains intact.
- Completion, failure, API, polling, and persistence flows remain unchanged.
