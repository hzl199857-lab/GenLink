# Home Agent API Key Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve and automatically submit homepage Agent tasks while requiring a usable Comfly or Zhenzhen API Key before the first execution.

**Architecture:** Extract credential selection into a pure helper shared by the canvas gate and Agent runtime. Keep the initial request owned by `page.tsx`; `InfiniteCanvas` only blocks execution and opens the existing API settings panel, while `CanvasAgentPanel` consumes the request only after `submitAgentRequest` accepts it.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand browser settings, Node test runner.

---

## File Structure

- Create `src/lib/agent-api-key.ts`: pure credential resolution from `StoredApiSettings`.
- Create `src/lib/agent-api-key.test.ts`: provider preference and fallback coverage.
- Modify `src/components/canvas/CanvasAgentPanel.tsx`: share credential resolution and make initial submission consumption atomic.
- Modify `src/lib/home-agent-launch.test.ts`: regression contract for blocked and accepted initial requests.
- Modify `src/components/canvas/ApiSettingsPanel.tsx`: optional first-use notice.
- Create `src/components/canvas/ApiSettingsPanel.test.ts`: prompt and canvas wiring assertions.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: compute the gate, open settings, and resume after valid save.

### Task 1: Shared Agent Credential Resolution

**Files:**
- Create: `src/lib/agent-api-key.ts`
- Create: `src/lib/agent-api-key.test.ts`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`

- [ ] **Step 1: Write the failing credential tests**

Test this public contract:

```ts
resolveAgentApiCredential(settings, "comfly")
// => { provider: "comfly", apiKey: "comfly-key" }

resolveAgentApiCredential(settingsWithoutComfly, "comfly")
// => { provider: "zhenzhen", apiKey: "zhenzhen-key" }

hasAgentApiCredential(emptySettings, "comfly")
// => false
```

Cover text keys, legacy image-only keys, preferred Provider priority, supported fallback, and the no-key case.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/agent-api-key.test.ts`

Expected: FAIL because `src/lib/agent-api-key.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Export:

```ts
export type AgentApiCredential = {
  provider: AgentProvider;
  apiKey: string;
};

export function resolveAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
): AgentApiCredential | null;

export function hasAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
): boolean;
```

Build the candidate list in this order: preferred Provider, stored text Provider, stored image Provider, then `AGENT_TEXT_PROVIDERS`. Filter with `isAgentTextProvider`, dedupe, and check each candidate's text key before its image key.

- [ ] **Step 4: Reuse the helper in the Agent runtime**

Replace the private candidate loop in `resolveAgentTextRunConfig` with:

```ts
const credential = resolveAgentApiCredential(
  readStoredApiSettings(),
  preferredProvider,
);

return credential ?? {
  provider: isAgentTextProvider(preferredProvider) ? preferredProvider : "comfly",
  apiKey: "",
};
```

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `node --test src/lib/agent-api-key.test.ts src/lib/agent-provider-options.test.ts`

Run: `npx tsc --noEmit`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-api-key.ts src/lib/agent-api-key.test.ts src/components/canvas/CanvasAgentPanel.tsx
git commit -m "fix: share agent api key resolution"
```

### Task 2: Atomic Initial Request Consumption

**Files:**
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/lib/home-agent-launch.test.ts`

- [ ] **Step 1: Write the failing launch regression assertions**

Require the panel source to include:

```ts
initialRequestBlocked?: boolean;
const accepted = submitAgentRequest({ ... });
if (!accepted) return;
consumedInitialRequestIdRef.current = initialRequest.id;
onInitialRequestConsumed?.(initialRequest.id);
```

Also assert the initial-request effect body does not contain `setTimeout` and guards on `initialRequestBlocked`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/home-agent-launch.test.ts`

Expected: FAIL because the current effect marks the request consumed before a cancellable timer fires.

- [ ] **Step 3: Make submission report acceptance**

Change `submitAgentRequest` to return `boolean`:

- return `false` for blank prompt, busy state, or an existing blocking decision;
- return `true` when the ecommerce validation message or multi-attachment selection is created;
- return `true` after `runAgent` is started.

- [ ] **Step 4: Remove the cancellable initial-request timer**

Add `initialRequestBlocked` to the panel props and effect guard. In the same effect call `submitAgentRequest` synchronously, then write `consumedInitialRequestIdRef` and notify the parent only when the return value is `true`.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `node --test src/lib/home-agent-launch.test.ts src/lib/agent-submit-state.test.ts`

Run: `npx tsc --noEmit`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/CanvasAgentPanel.tsx src/lib/home-agent-launch.test.ts
git commit -m "fix: consume homepage agent requests after submit"
```

### Task 3: First-Use API Settings Gate And Automatic Resume

**Files:**
- Modify: `src/components/canvas/ApiSettingsPanel.tsx`
- Create: `src/components/canvas/ApiSettingsPanel.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/lib/home-agent-launch.test.ts`

- [ ] **Step 1: Write failing settings and canvas wiring tests**

Assert `ApiSettingsPanelProps` contains `notice?: string | null` and the component renders `{notice}`. Assert `InfiniteCanvas.tsx`:

```ts
const initialAgentRequestBlocked = Boolean(
  initialAgentRequest &&
  !hasAgentApiCredential(apiSettings, initialAgentRequest.provider),
);
```

Also require `initialRequestBlocked={initialAgentRequestBlocked}`, the Chinese first-use notice, automatic `setApiSettingsOpen(true)`, and save-time validation through `hasAgentApiCredential(values, initialAgentRequest.provider)`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/components/canvas/ApiSettingsPanel.test.ts src/lib/home-agent-launch.test.ts`

Expected: FAIL because the settings panel has no notice and the canvas does not gate initial execution.

- [ ] **Step 3: Add the optional settings notice**

Add `notice?: string | null` and render it above the existing explanatory copy with a restrained warning treatment. When `notice` is absent, retain the existing manual settings UI unchanged.

- [ ] **Step 4: Compute and propagate the gate**

In `InnerCanvas`, derive `initialAgentRequestBlocked` from current `apiSettings` and pass it through `CanvasAgentDock` to `CanvasAgentPanel`. Keep `effectiveOpen = open || Boolean(initialAgentRequest)` so the Agent panel remains visible while blocked.

- [ ] **Step 5: Open settings for a blocked initial request**

Track the last prompted initial request ID in a ref. Use a zero-delay effect only for opening the modal and setting the notice; do not mutate or consume the request in that effect. Manual toolbar opening clears the first-use notice.

- [ ] **Step 6: Validate save and resume**

Persist settings first. If the current initial request still has no usable credential, keep the panel open with the notice. Otherwise clear the notice and close settings. The updated `apiSettings` state makes `initialAgentRequestBlocked` false, allowing the retained initial request to submit automatically.

- [ ] **Step 7: Run focused tests and repository validation**

Run:

```bash
node --test src/lib/agent-api-key.test.ts src/lib/home-agent-launch.test.ts src/components/canvas/ApiSettingsPanel.test.ts src/lib/agent-provider-options.test.ts src/components/hero/HeroSurface.test.ts
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: tests and TypeScript exit 0; Lint has 0 errors and only the 10 existing Director-module warnings; diff check is clean.

- [ ] **Step 8: Browser verification**

At `http://localhost:3000` in a signed-in session:

1. Clear Comfly and Zhenzhen keys, submit a homepage Agent task, and verify canvas plus Agent panel open before settings.
2. Verify the API settings notice is visible and the task is not yet in message history.
3. Save an empty form and verify settings remains open.
4. Enter one supported Key, save, and verify the exact homepage task submits once.
5. Submit a second homepage task with the saved Key and verify it submits directly without opening settings.

- [ ] **Step 9: Commit**

```bash
git add src/components/canvas/ApiSettingsPanel.tsx src/components/canvas/ApiSettingsPanel.test.ts src/components/canvas/InfiniteCanvas.tsx src/lib/home-agent-launch.test.ts
git commit -m "feat: gate homepage agent tasks on api key"
```
