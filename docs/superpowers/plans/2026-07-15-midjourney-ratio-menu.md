# Midjourney Ratio Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Midjourney ratio popup with a compact adaptive-plus-seven-ratios layout and hide the `x1 / x2 / x4` control only for Midjourney.

**Architecture:** Keep the existing `aspectRatio` field and `RatioIcon`; branch only inside `ImageGenerationPromptBar` when `isComflyMidjourneyModel` is true. Extend `PromptBarRunControls` with a small `showLabel` presentation prop so Midjourney can keep the run button while hiding the parallel-count label and menu.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, ReactFlow, Node test runner.

---

## File map

- Modify `src/components/nodes/ImageGenerationPromptBar.tsx`: add the Midjourney-only ratio list and conditional ratio popup; hide its parallel-count menu.
- Modify `src/components/nodes/PromptBarRunControls.tsx`: allow callers to hide the label while retaining the run button.
- Modify `src/components/nodes/MidjourneySettingsPanel.test.ts`: add source-contract regression coverage for the requested layout and count-control behavior.

### Task 1: Lock the Midjourney ratio and count-control contract

**Files:**
- Modify: `src/components/nodes/MidjourneySettingsPanel.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Add a source read for `PromptBarRunControls.tsx` and tests equivalent to:

```ts
const runControlsSource = readFileSync(
  new URL("./PromptBarRunControls.tsx", import.meta.url),
  "utf8",
);

test("uses the compact Midjourney adaptive and ratio layout", () => {
  assert.match(
    promptBarSource,
    /MIDJOURNEY_ASPECT_RATIOS = \['1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3'\]/,
  );
  assert.match(promptBarSource, />分辨率</);
  assert.match(promptBarSource, /onAspectRatioChange\?\.\('auto'\)/);
  assert.match(promptBarSource, />自适应</);
  assert.match(promptBarSource, />比例</);
  assert.match(promptBarSource, /MIDJOURNEY_ASPECT_RATIOS\.map/);
});

test("hides parallel count only for Midjourney", () => {
  assert.match(promptBarSource, /showLabel=\{!isMidjourneyModel\}/);
  assert.match(promptBarSource, /parallelMenuOpen && !isMidjourneyModel/);
  assert.match(runControlsSource, /showLabel\?: boolean/);
  assert.match(runControlsSource, /\{showLabel \? \(/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test src/components/nodes/MidjourneySettingsPanel.test.ts
```

Expected: the new tests fail because the Midjourney ratio constant and `showLabel` behavior do not exist.

- [ ] **Step 3: Commit the failing tests with the implementation in Task 2**

Do not commit RED-only code separately; keep it staged for the next task's green commit.

### Task 2: Implement the compact ratio popup and hide Midjourney count

**Files:**
- Modify: `src/components/nodes/ImageGenerationPromptBar.tsx`
- Modify: `src/components/nodes/PromptBarRunControls.tsx`
- Test: `src/components/nodes/MidjourneySettingsPanel.test.ts`

- [ ] **Step 1: Add the exact Midjourney ratio list**

Near the existing prompt-bar constants, add:

```ts
const MIDJOURNEY_ASPECT_RATIOS = [
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
] as const;
```

- [ ] **Step 2: Render the Midjourney-only popup layout**

Inside the existing `settingsMenuOpen` popup, branch the ratio section:

```tsx
{isMidjourneyModel ? (
  <div className="flex flex-col gap-3">
    <div>
      <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
        分辨率
      </div>
      <button
        type="button"
        onClick={() => onAspectRatioChange?.('auto')}
        className={[
          'flex h-10 w-full items-center justify-center rounded-[8px] border text-[14px] font-medium transition-colors',
          modelAspectRatio === 'auto'
            ? 'border-white/70 bg-white/[0.12] text-gl-text-primary'
            : 'border-white/20 text-gl-text-secondary hover:bg-white/[0.06]',
        ].join(' ')}
      >
        自适应
      </button>
    </div>

    <div>
      <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
        比例
      </div>
      <div className="grid grid-cols-5 gap-2">
        {MIDJOURNEY_ASPECT_RATIOS.map((ratio) => {
          const selected = ratio === modelAspectRatio;
          return (
            <button
              key={ratio}
              type="button"
              onClick={() => onAspectRatioChange?.(ratio)}
              className={[
                'flex h-[62px] flex-col items-center justify-center gap-2 rounded-[8px] border text-[12px] font-medium transition-colors',
                selected
                  ? 'border-white/70 bg-white/[0.12] text-gl-text-primary'
                  : 'border-white/20 text-gl-text-muted hover:bg-white/[0.06] hover:text-gl-text-primary',
              ].join(' ')}
            >
              <RatioIcon ratio={ratio} active={selected} />
              <span>{ratio}</span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
) : (
  // Keep the current generic quality, ratio, and detail sections unchanged.
)}
```

The Midjourney branch must not render `IMAGE_SIZE_OPTIONS`, `IMAGE_DETAIL_OPTIONS`, or any generation-count section.

- [ ] **Step 3: Add an optional count-label switch to run controls**

Update the props and render guard:

```tsx
export interface PromptBarRunControlsProps {
  label: string;
  showLabel?: boolean;
  // existing props remain unchanged
}

export function PromptBarRunControls({
  label,
  showLabel = true,
  // existing props
}: PromptBarRunControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {showLabel ? (
        onLabelClick ? (
          // existing clickable label
        ) : (
          // existing read-only label
        )
      ) : null}
      {/* existing run button remains unchanged */}
    </div>
  );
}
```

- [ ] **Step 4: Hide the Midjourney count label and menu**

In `ImageGenerationPromptBar.tsx`:

```tsx
<PromptBarRunControls
  label={`x${parallelCount}`}
  showLabel={!isMidjourneyModel}
  // existing props remain unchanged
/>

{parallelMenuOpen && !isMidjourneyModel ? (
  // existing x1/x2/x4 menu
) : null}
```

Do not remove `PARALLEL_COUNT_OPTIONS` or the callback because non-Midjourney models still use them.

- [ ] **Step 5: Run GREEN and type checking**

```powershell
node --test src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
npx tsc --noEmit
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/components/nodes/ImageGenerationPromptBar.tsx src/components/nodes/PromptBarRunControls.tsx src/components/nodes/MidjourneySettingsPanel.test.ts
git commit -m "feat: simplify Midjourney ratio controls"
```

### Task 3: Final verification

**Files:**
- Verify only; no planned production changes.

- [ ] **Step 1: Run focused Midjourney regression tests**

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

Expected: TypeScript and diff checks exit 0; lint has no new errors. Existing unrelated warnings may remain.

- [ ] **Step 3: Verify the live development bundle**

```powershell
$response = Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/' -TimeoutSec 10
$response.StatusCode
```

Expected: `200`, and the Next.js development bundle contains `MIDJOURNEY_ASPECT_RATIOS` after recompilation.

---

## Self-review

- The seven requested ratios and standalone adaptive control are covered in Task 2.
- The ratio popup contains no generation-count section.
- The existing external count label/menu are hidden only for Midjourney; other models keep the current contract.
- No prompt-building, API, history, or Midjourney grid behavior is changed.
- No placeholders or undefined helper names remain.
