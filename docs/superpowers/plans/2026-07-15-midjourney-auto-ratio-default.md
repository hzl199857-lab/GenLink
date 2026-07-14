# Midjourney Auto Ratio Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select `auto` as the aspect-ratio default whenever a user switches an image node to Comfly Midjourney.

**Architecture:** Reuse the existing `resolveModelAspectRatio` function in `ImageGenerationNode.tsx`, adding an early Midjourney branch before the Nano Banana rules. The function is only called during model-selection handlers, so persisted ratios on already-loaded Midjourney nodes remain untouched.

**Tech Stack:** React, TypeScript, ReactFlow, Node test runner.

---

### Task 1: Default Midjourney model switches to auto

**Files:**
- Modify: `src/components/nodes/ImageGenerationNode.tsx`
- Modify: `src/components/nodes/ImageGenerationNode.hitbox.test.ts`

- [ ] **Step 1: Write the failing source-contract test**

Add:

```ts
test("defaults Comfly Midjourney model switches to auto ratio", () => {
  const resolverBlock = source.slice(
    source.indexOf("function resolveModelAspectRatio("),
    source.indexOf("function resolveCardDimensions("),
  );

  assert.match(
    resolverBlock,
    /provider === 'comfly'[\s\S]*?model\.trim\(\)\.toLowerCase\(\) === 'midjourney'[\s\S]*?return 'auto'/,
  );
  assert.match(source, /aspectRatio: resolveModelAspectRatio\(next\.provider, next\.model, data\.aspectRatio\)/);
  assert.match(source, /aspectRatio: next/);
});
```

- [ ] **Step 2: Run RED**

```powershell
node --test src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

Expected: the new test fails because the resolver currently returns the previous ratio for Midjourney.

- [ ] **Step 3: Add the minimal resolver branch**

At the start of `resolveModelAspectRatio`, add:

```ts
if (
  provider === 'comfly' &&
  model.trim().toLowerCase() === 'midjourney'
) {
  return 'auto';
}
```

Do not alter `handleAspectRatioChange`; it must continue storing explicit user selections.

- [ ] **Step 4: Run GREEN and static checks**

```powershell
node --test src/components/nodes/ImageGenerationNode.hitbox.test.ts src/components/nodes/MidjourneySettingsPanel.test.ts
npx tsc --noEmit
```

Expected: zero test failures and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/nodes/ImageGenerationNode.tsx src/components/nodes/ImageGenerationNode.hitbox.test.ts
git commit -m "fix: default Midjourney ratio to auto"
```

### Task 2: Final verification

**Files:**
- Verify only.

- [ ] **Step 1: Run the full Midjourney regression command**

```powershell
node --test src/lib/image-generation-options.test.ts src/lib/comfly-midjourney.test.ts src/app/api/ai/image/route.midjourney.test.ts src/components/nodes/MidjourneySettingsPanel.test.ts src/components/nodes/MidjourneyGridSelector.test.ts src/components/nodes/ImageGenerationNode.hitbox.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run repository checks**

```powershell
npx tsc --noEmit
npm run lint
git diff --check
git status --short
```

Expected: no TypeScript or diff errors and no new lint errors.

- [ ] **Step 3: Confirm the development server remains healthy**

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/' -TimeoutSec 10).StatusCode
```

Expected: `200`.

---

## Self-review

- Switching to Midjourney is covered by the resolver and both model-selection handlers already use it.
- Existing nodes are not migrated because rendering does not call the resolver to write data.
- Explicit user ratio changes remain handled by `handleAspectRatioChange`.
- No prompt, API, persistence schema, or unrelated model behavior changes.
