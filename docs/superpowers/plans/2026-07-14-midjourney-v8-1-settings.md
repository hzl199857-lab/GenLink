# Midjourney V8.1 Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Midjourney controls with a fixed V8.1, ratio-first, beginner-friendly settings experience that generates normalized Midjourney prompt parameters.

**Architecture:** Keep the stable internal model ID `midjourney`, store optional Midjourney settings on `ImageGenerationNodeData`, and centralize validation plus prompt parameter replacement in `src/lib/comfly-midjourney.ts`. A focused `MidjourneySettingsPanel` owns presets and sliders; the existing prompt bar only decides when to show it.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, Tailwind CSS, Node test runner.

---

## File map

- Modify `src/types/canvas.ts`: add persisted Midjourney settings.
- Modify `src/lib/image-generation-options.ts` and test: rename display label and export ranges/defaults/presets.
- Modify `src/lib/comfly-midjourney.ts` and test: normalize settings, remove managed flags, append V8.1 and UI-selected flags.
- Modify `src/app/api/ai/image/route.ts` and route contract test: pass persisted settings to Imagine.
- Create `src/components/nodes/MidjourneySettingsPanel.tsx` and source-contract test: presets, sliders, and quality control.
- Modify `src/components/nodes/ImageGenerationPromptBar.tsx`: hide generic controls and render ratio plus Midjourney settings.
- Modify `src/components/nodes/ImageGenerationNode.tsx`: persist settings through existing node updates.

---

### Task 1: Define settings and V8.1 prompt normalization

**Files:** `src/types/canvas.ts`, `src/lib/image-generation-options.ts`, `src/lib/image-generation-options.test.ts`, `src/lib/comfly-midjourney.ts`, `src/lib/comfly-midjourney.test.ts`.

- [ ] Write failing tests that require:
  - Comfly label is `Midjourney V8.1` while ID remains `midjourney`.
  - default settings are `{ stylize: 100, weird: 0, chaos: 0, quality: 1 }`.
  - numeric values clamp to stylize 0-1000, weird 0-3000, chaos 0-100, quality 1 or 2.
  - prompt always contains `--v 8.1`.
  - existing `--v/--version`, `--ar/--aspect`, `--s/--stylize`, `--weird`, `--chaos/--c`, and `--q/--quality` are removed before selected values are appended.
  - `auto` omits `--ar`.

- [ ] Run RED:

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts
```

Expected: failures for the old label, missing defaults, and old prompt output.

- [ ] Add types:

```ts
export interface MidjourneyGenerationSettings {
  stylize?: number;
  weird?: number;
  chaos?: number;
  quality?: 1 | 2;
}
```

Add `midjourneySettings?: MidjourneyGenerationSettings` to `ImageGenerationNodeData`.

- [ ] Export defaults and normalization:

```ts
export const DEFAULT_MIDJOURNEY_SETTINGS = { stylize: 100, weird: 0, chaos: 0, quality: 1 } as const;
export function normalizeMidjourneySettings(value?: MidjourneyGenerationSettings): Required<MidjourneyGenerationSettings>;
```

- [ ] Change the model option to `{ id: "midjourney", label: "Midjourney V8.1" }`.

- [ ] Change prompt builder signature:

```ts
export function buildMidjourneyPrompt(
  prompt: string,
  aspectRatio?: string,
  settings?: MidjourneyGenerationSettings,
): string;
```

Remove managed flags with a token-aware expression and append in stable order: `--v 8.1`, optional `--ar`, `--s`, `--weird`, `--chaos`, `--q`.

- [ ] Run GREEN and commit `feat: add Midjourney V8.1 prompt settings`.

---

### Task 2: Pass settings through the server Imagine flow

**Files:** `src/lib/comfly-midjourney.ts`, `src/lib/comfly-midjourney.test.ts`, `src/app/api/ai/image/route.ts`, `src/app/api/ai/image/route.midjourney.test.ts`.

- [ ] Add a failing injected-fetch test asserting an Imagine body contains:

```json
{
  "prompt": "portrait --v 8.1 --ar 16:9 --s 250 --weird 100 --chaos 15 --q 2",
  "base64Array": []
}
```

- [ ] Add a failing route source-contract test requiring `historyNodeData?.midjourneySettings` to reach `submitMidjourneyImagine`.
- [ ] Run RED with the two Midjourney test files.
- [ ] Add `settings?: MidjourneyGenerationSettings` to `submitMidjourneyImagine` and pass it to `buildMidjourneyPrompt`.
- [ ] In `submitMidjourneyJob`, pass `historyNodeData?.midjourneySettings`; update its function signature and POST call.
- [ ] Run GREEN plus `npx tsc --noEmit`.
- [ ] Commit `feat: send Midjourney V8.1 settings`.

---

### Task 3: Build the beginner-friendly settings panel

**Files:** new `src/components/nodes/MidjourneySettingsPanel.tsx`, new `src/components/nodes/MidjourneySettingsPanel.test.ts`, `src/components/nodes/ImageGenerationPromptBar.tsx`, `src/components/nodes/ImageGenerationNode.tsx`.

- [ ] Write failing source-contract tests requiring:
  - fixed model text `Midjourney V8.1`.
  - stylize presets 50/100/250/750 and slider 0-1000 step 10.
  - weird presets 0/100/500 and slider 0-3000 step 50.
  - chaos presets 0/15/35 and slider 0-100 step 1.
  - quality segmented values 1 and 2.
  - Chinese labels and accessible range labels.
  - Midjourney mode hides `IMAGE_SIZE_OPTIONS`, output format, moderation, and generic detail controls.
  - Midjourney ratio button label contains only the ratio, not `/ 1K`.

- [ ] Run RED:

```powershell
node --test src/components/nodes/MidjourneySettingsPanel.test.ts
```

- [ ] Implement component contract:

```tsx
interface MidjourneySettingsPanelProps {
  value: Required<MidjourneyGenerationSettings>;
  onChange: (next: Required<MidjourneyGenerationSettings>) => void;
}
```

Use compact preset buttons and sliders with existing dark panel tokens. Use 8px or smaller card radius where applicable, stable control heights, no nested decorative cards, and stop canvas drag propagation.

- [ ] In `ImageGenerationPromptBar`, derive `isMidjourneyModel`, set `settingsLabel` to ratio only, hide generic format/detail/quality UI, and show the dedicated panel behind the settings icon.
- [ ] Add `midjourneySettings` and `onMidjourneySettingsChange` props.
- [ ] In `ImageGenerationNode`, normalize defaults, update node data on change, and pass values to the prompt bar.
- [ ] Run GREEN plus existing hitbox/prompt-bar tests and `npx tsc --noEmit`.
- [ ] Commit `feat: add Midjourney V8.1 settings UI`.

---

### Task 4: Final verification

- [ ] Run focused tests:

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `git diff --check`, inspect `git status --short`, and verify no unrelated files, API keys, or generated media are present.
- [ ] If a defect appears, add a failing regression test before the minimal fix and rerun all verification.
