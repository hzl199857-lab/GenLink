# Midjourney Slider Native Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the pointer-capture conflict that makes the three Midjourney settings sliders jitter while dragging.

**Architecture:** Keep the existing local draft state and commit-on-release data flow. Let the native range input own pointer tracking, use separate success and cancellation handlers, and restore the committed prop value when a drag is cancelled.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, ReactFlow, Node test runner.

---

### Task 1: Use native range pointer tracking

**Files:**
- Modify: `src/components/nodes/MidjourneySettingsPanel.test.ts`
- Modify: `src/components/nodes/MidjourneySettingsPanel.tsx`

- [ ] **Step 1: Write the failing regression test**

Extend the existing slider-drag test with these source-contract assertions:

```ts
assert.match(panelSource, /const handleSliderPointerCancel/);
assert.match(panelSource, /onPointerCancel=\{handleSliderPointerCancel\}/);
assert.doesNotMatch(panelSource, /setPointerCapture|releasePointerCapture|hasPointerCapture/);
assert.match(
  panelSource,
  /handleSliderPointerCancel[\s\S]*?isSliderDraggingRef\.current = false[\s\S]*?updateDraftSettings\(value\)/,
);
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
node --test src/components/nodes/MidjourneySettingsPanel.test.ts
```

Expected: the slider-drag test fails because the component still calls `setPointerCapture`, `releasePointerCapture`, and `hasPointerCapture`, and has no separate cancel handler.

- [ ] **Step 3: Implement native pointer tracking**

Change the shared handlers in `MidjourneySettingsPanel.tsx` to:

```tsx
const handleSliderPointerDown = (event: PointerEvent<HTMLInputElement>) => {
  event.stopPropagation();
  isSliderDraggingRef.current = true;
};

const handleSliderPointerUp = (event: PointerEvent<HTMLInputElement>) => {
  event.stopPropagation();
  if (!isSliderDraggingRef.current) {
    return;
  }

  isSliderDraggingRef.current = false;
  onChange(draftSettingsRef.current);
};

const handleSliderPointerCancel = (event: PointerEvent<HTMLInputElement>) => {
  event.stopPropagation();
  if (!isSliderDraggingRef.current) {
    return;
  }

  isSliderDraggingRef.current = false;
  updateDraftSettings(value);
};
```

For all three ranges, replace:

```tsx
onPointerCancel={handleSliderPointerUp}
```

with:

```tsx
onPointerCancel={handleSliderPointerCancel}
```

Do not change ranges, steps, preset buttons, quality controls, styling, parent props, persistence, API mapping, or ReactFlow canvas code.

- [ ] **Step 4: Run GREEN and static checks**

Run:

```powershell
node --test src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/nodes/MidjourneySettingsPanel.tsx src/components/nodes/MidjourneySettingsPanel.test.ts
git commit -m "fix: use native Midjourney slider dragging"
```

### Task 2: Final verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all focused Midjourney tests**

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run static and repository checks**

```powershell
npx tsc --noEmit
npm run lint
git diff --check
git status --short
```

Expected: no TypeScript or lint errors, no whitespace errors, and no uncommitted task changes. Existing unrelated lint warnings may remain.

- [ ] **Step 3: Confirm the live development page**

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/' -TimeoutSec 10).StatusCode
```

Expected: `200`, and the current development bundle contains `handleSliderPointerCancel` without manual pointer-capture calls.

---

## Self-review

- The plan covers native drag ownership, one-time pointer-up persistence, and cancellation rollback.
- The change remains limited to the Midjourney settings panel and its focused test.
- The test will fail against the current implementation for the identified root cause.
- There are no placeholders or unrelated behavior changes.
