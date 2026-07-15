# Home Hero Visual Rhythm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original GenLink title scale and spacing and remove decorative white outlines from the new home controls.

**Architecture:** Keep the existing Hero component structure and behavior. Add source-contract coverage for the approved responsive Tailwind tokens, then change only component class strings so no state, data flow, or interaction contracts move.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Node test runner.

---

## File Map

- Modify `src/components/hero/HeroSurface.test.ts`: assert the approved title scale and border-free surfaces.
- Modify `src/components/hero/GenLinkHero.tsx`: restore the original responsive Logo and supporting-copy tokens.
- Modify `src/components/hero/HeroAgentComposer.tsx`: remove decorative borders while retaining focus-visible outlines.
- Modify `src/components/hero/HeroRecentProjects.tsx`: remove card and internal separator borders while retaining hover and focus states.

### Task 1: Lock the Visual Contract

**Files:**

- Test: `src/components/hero/HeroSurface.test.ts`

- [ ] **Step 1: Add failing assertions for the approved visual tokens**

Extend the existing source-contract tests with exact assertions:

```ts
test("the hero preserves the original title scale and spacing", () => {
  assert.match(heroSource, /w-\[280px\].*sm:w-\[440px\].*lg:w-\[600px\]/);
  assert.match(heroSource, /mt-6.*text-\[1rem\].*leading-relaxed.*sm:mt-8.*sm:text-\[1\.05rem\]/);
});

test("the home surfaces do not use decorative white borders", () => {
  assert.doesNotMatch(composerSource, /border-white\//);
  assert.doesNotMatch(recentProjectsSource, /border-white\//);
  assert.match(composerSource, /focus-visible:outline/);
  assert.match(recentProjectsSource, /focus-visible:outline/);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
node --test src/components/hero/HeroSurface.test.ts
```

Expected: FAIL because the current Hero uses `250/390/470px`, compact copy tokens, and `border-white/*` classes.

- [ ] **Step 3: Commit the red test together with the implementation in Task 2 after it passes**

Do not commit a deliberately failing branch state.

### Task 2: Apply the Minimal Style Changes

**Files:**

- Modify: `src/components/hero/GenLinkHero.tsx`
- Modify: `src/components/hero/HeroAgentComposer.tsx`
- Modify: `src/components/hero/HeroRecentProjects.tsx`
- Test: `src/components/hero/HeroSurface.test.ts`

- [ ] **Step 1: Restore the original title tokens**

Use these exact class strings in `GenLinkHero.tsx`:

```tsx
className="h-auto w-[280px] select-none sm:w-[440px] lg:w-[600px]"
```

```tsx
className="mx-auto mt-6 max-w-[34rem] text-[1rem] font-light leading-relaxed text-white/55 sm:mt-8 sm:text-[1.05rem]"
```

- [ ] **Step 2: Remove decorative borders from the composer**

Remove `border border-white/14` from the outer surface, `border border-white/12` from image previews, `border-t border-white/8` from the lower control row, and `border border-white/9` plus `focus:border-white/22` from the model selector. Preserve the existing solid/dark backgrounds, shadow, hover fills, and all `focus-visible:outline` tokens.

- [ ] **Step 3: Remove decorative borders from project cards**

Remove `border border-white/12` and `hover:border-white/24` from `cardClassName`. Remove `border-b border-white/8` from both the new-project media area and regular project thumbnail area. Preserve the background contrast, shadow, hover translation, and `focus-visible:outline` tokens.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test src/components/hero/HeroSurface.test.ts
```

Expected: all Hero surface tests PASS.

- [ ] **Step 5: Run static verification**

Run:

```bash
npx tsc --noEmit --incremental false
npm run lint
```

Expected: TypeScript exits 0; lint exits 0 with no new errors.

- [ ] **Step 6: Verify desktop and mobile rendering**

Use the running local app at `http://127.0.0.1:3001` and inspect:

- `1440 x 1000`: original desktop title scale is restored; composer and project surface do not overlap.
- `390 x 844`: title and composer fit without page-width overflow; controls remain reachable.
- Decorative component boundaries come from surface contrast and shadow, not white borders.
- Keyboard focus retains a visible outline.

- [ ] **Step 7: Commit the visual adjustment**

```bash
git add src/components/hero/GenLinkHero.tsx src/components/hero/HeroAgentComposer.tsx src/components/hero/HeroRecentProjects.tsx src/components/hero/HeroSurface.test.ts
git commit -m "fix: restore home hero visual rhythm"
```

