# Agent Provider And Model Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the complete legacy GPT Provider/model experience, keep Gemini available on Comfly and Zhenzhen, and make every OpenClaw entry use the same compatibility matrix and generated runtime model catalog.

**Architecture:** `agent-model-options.ts` becomes the single Provider/model compatibility contract used by both UI surfaces, credential resolution, API validation, and OpenClaw configuration. A focused OpenClaw runtime-config helper parses the existing JSON5 config, preserves unrelated runtime settings, creates an immutable legacy backup, and writes an atomic generated config containing all supported Agent models.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node test runner, JSON5, OpenClaw CLI, Zustand-backed browser settings.

---

## File Structure

- Modify `src/lib/agent-model-options.ts`: four-model catalog, model families, Provider compatibility, defaults, and filtering.
- Modify `src/lib/agent-model-options.test.ts`: compatibility matrix and fallback tests.
- Modify `src/lib/agent-provider-options.ts`: restore all legacy GPT Providers.
- Modify `src/lib/agent-provider-options.test.ts`: restored Provider contract.
- Modify `src/app/page.tsx`: keep homepage Provider/model selection valid.
- Modify `src/components/hero/HeroAgentComposer.tsx`: display filtered models.
- Modify `src/components/canvas/CanvasAgentPanel.tsx`: display filtered models and resolve compatible credentials.
- Modify `src/lib/agent-api-key.ts`: model-aware Provider credential resolution.
- Modify `src/lib/agent-api-key.test.ts`: GPT and Gemini credential eligibility.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: model-aware first-use API Key gate.
- Modify `src/components/canvas/ApiSettingsPanel.test.ts`: model-aware gate contract.
- Create `src/lib/openclaw/runtime-config.ts`: legacy backup and generated OpenClaw config.
- Create `src/lib/openclaw/runtime-config.test.ts`: JSON5 preservation, model catalog, backup, and atomic output tests.
- Modify `src/lib/openclaw/real-runtime.ts`: use generated config and classify model/config failures.
- Modify `src/lib/openclaw/real-runtime.test.ts`: generated config and diagnostic tests.
- Modify `src/lib/openclaw/model-mapping.ts`: validate Provider/model combinations.
- Modify `src/lib/openclaw/model-mapping.test.ts`: GPT/Gemini mapping matrix.
- Create `src/lib/openclaw/route-model-compatibility.test.ts`: all four OpenClaw route contracts.
- Modify `src/lib/agent-chat-display.ts`: accurate safe runtime error display.
- Modify `src/lib/agent-chat-display.test.ts`: no misleading timeout and no raw runtime errors.
- Modify `package.json` and `package-lock.json`: direct `json5` runtime dependency.

### Task 1: Unified Provider And Model Compatibility Matrix

**Files:**
- Modify: `src/lib/agent-model-options.test.ts`
- Modify: `src/lib/agent-provider-options.test.ts`
- Modify: `src/lib/agent-model-options.ts`
- Modify: `src/lib/agent-provider-options.ts`

- [ ] **Step 1: Write failing compatibility tests**

Require these public behaviors:

```ts
assert.deepEqual(getAgentModelOptions("comfly").map(({ id }) => id), [
  "gemini-3.5-flash",
  "gemini-3.1-pro",
  "gpt-5.4-mini",
  "gpt-5.5",
]);
assert.deepEqual(getAgentModelOptions("vibe").map(({ id }) => id), [
  "gpt-5.4-mini",
  "gpt-5.5",
]);
assert.equal(isAgentModelSupportedByProvider("vibe", "gemini-3.5-flash"), false);
assert.equal(resolveAgentModelForProvider("vibe", "gemini-3.5-flash"), "gpt-5.4-mini");
assert.deepEqual(AGENT_TEXT_PROVIDER_OPTIONS.map(({ id }) => id), [
  "vibe",
  "fucheers",
  "comfly",
  "zhenzhen",
  "grsai",
]);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test src/lib/agent-model-options.test.ts src/lib/agent-provider-options.test.ts
```

Expected: FAIL because GPT models, legacy Providers, and compatibility helpers are absent.

- [ ] **Step 3: Implement the model contract**

Export:

```ts
export type AgentModelFamily = "gpt" | "gemini";
export type AgentModelOption = {
  id: AgentModelId;
  label: string;
  family: AgentModelFamily;
};

export function getAgentModelOptions(provider: AgentProvider): readonly AgentModelOption[];
export function isAgentModelSupportedByProvider(
  provider: AgentProvider,
  model: string,
): model is AgentModelId;
export function resolveAgentModelForProvider(
  provider: AgentProvider,
  model: string,
): AgentModelId;
```

Use Gemini 3.5 Flash as the initial Comfly/Zhenzhen default and GPT-5.4 Mini as the fallback for GPT-only Providers. Restore Vibe, Fucheers, Comfly, Zhenzhen, and GRS AI in `AGENT_TEXT_PROVIDER_OPTIONS`.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```bash
node --test src/lib/agent-model-options.test.ts src/lib/agent-provider-options.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-model-options.ts src/lib/agent-model-options.test.ts src/lib/agent-provider-options.ts src/lib/agent-provider-options.test.ts
git commit -m "feat: restore agent provider model matrix"
```

### Task 2: Keep Homepage And Canvas Selections Compatible

**Files:**
- Modify: `src/components/hero/HeroSurface.test.ts`
- Modify: `src/lib/agent-provider-options.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/hero/HeroAgentComposer.tsx`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`

- [ ] **Step 1: Write failing UI wiring tests**

Assert that both UI surfaces call `getAgentModelOptions(provider)` and that Provider change handlers call `resolveAgentModelForProvider(nextProvider, currentModel)`. Also require both surfaces to keep Comfly as the initial Provider.

```ts
assert.match(homePage, /getAgentModelOptions\(heroProvider\)/);
assert.match(homePage, /resolveAgentModelForProvider\(nextProvider, current\)/);
assert.match(canvasPanel, /getAgentModelOptions\(provider\)/);
assert.match(canvasPanel, /resolveAgentModelForProvider\(nextProvider, current\)/);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test src/components/hero/HeroSurface.test.ts src/lib/agent-provider-options.test.ts
```

Expected: FAIL because both model dropdowns still render all `AGENT_MODEL_OPTIONS` and Provider changes do not repair an invalid model.

- [ ] **Step 3: Implement filtered dropdowns and atomic Provider changes**

In the homepage parent and canvas panel, use handlers shaped as:

```ts
const handleProviderChange = (nextProvider: AgentProvider) => {
  setProvider(nextProvider);
  setModel((current) => resolveAgentModelForProvider(nextProvider, current));
};
```

Render model options from `getAgentModelOptions(provider)`. Preserve the existing Provider/model controls and do not introduce a profile switch.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```bash
node --test src/components/hero/HeroSurface.test.ts src/lib/agent-provider-options.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/hero/HeroAgentComposer.tsx src/components/hero/HeroSurface.test.ts src/components/canvas/CanvasAgentPanel.tsx src/lib/agent-provider-options.test.ts
git commit -m "feat: filter agent models by provider"
```

### Task 3: Model-Aware Credential Resolution And First-Use Gate

**Files:**
- Modify: `src/lib/agent-api-key.test.ts`
- Modify: `src/components/canvas/ApiSettingsPanel.test.ts`
- Modify: `src/lib/agent-api-key.ts`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write failing credential tests**

Cover these contracts:

```ts
resolveAgentApiCredential(settingsWithVibeAndComfly, "vibe", "gpt-5.5")
// => { provider: "vibe", apiKey: "vibe-key" }

resolveAgentApiCredential(settingsWithVibeAndComfly, "vibe", "gemini-3.5-flash")
// => { provider: "comfly", apiKey: "comfly-key" }

hasAgentApiCredential(settingsWithOnlyVibe, "comfly", "gemini-3.5-flash")
// => false
```

Update the API settings source contract so the homepage gate checks `initialAgentRequest.model` as well as the Provider.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test src/lib/agent-api-key.test.ts src/components/canvas/ApiSettingsPanel.test.ts
```

Expected: FAIL because credential resolution is not model-aware.

- [ ] **Step 3: Implement compatible Provider fallback**

Change signatures to:

```ts
export function resolveAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
  model: AgentModelId,
): AgentApiCredential | null;

export function hasAgentApiCredential(
  settings: StoredApiSettings,
  preferredProvider: AgentProvider,
  model: AgentModelId,
): boolean;
```

Filter candidate Providers with `isAgentModelSupportedByProvider(provider, model)` before checking keys. Pass the current model from `CanvasAgentPanel` and `initialAgentRequest.model` from `InfiniteCanvas`. Replace the Gemini-specific first-use notice with a Provider-neutral Chinese notice.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```bash
node --test src/lib/agent-api-key.test.ts src/components/canvas/ApiSettingsPanel.test.ts src/lib/home-agent-launch.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-api-key.ts src/lib/agent-api-key.test.ts src/components/canvas/ApiSettingsPanel.test.ts src/components/canvas/CanvasAgentPanel.tsx src/components/canvas/InfiniteCanvas.tsx
git commit -m "fix: resolve agent keys by model compatibility"
```

### Task 4: Generated OpenClaw Runtime Configuration And Legacy Backup

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/openclaw/runtime-config.ts`
- Create: `src/lib/openclaw/runtime-config.test.ts`

- [ ] **Step 1: Add JSON5 as a direct runtime dependency**

Run:

```bash
npm install json5@2.2.3 --save
```

Expected: `package.json` and `package-lock.json` list `json5` as a direct dependency.

- [ ] **Step 2: Write failing runtime-config tests**

Use temporary directories and a JSON5 fixture with comments/unquoted keys. Require:

```ts
const built = buildOpenClawRuntimeConfig(baseConfig);
assert.equal(built.agents.defaults.model.primary, "genlink_text/gpt-5.5");
assert.deepEqual(
  built.models.providers.genlink_text.models.map((model) => model.id),
  ["gemini-3.5-flash", "gemini-3.1-pro", "gpt-5.4-mini", "gpt-5.5"],
);
assert.deepEqual(built.mcp, baseConfig.mcp);
assert.deepEqual(built.tools, baseConfig.tools);
```

For `prepareOpenClawRuntimeConfig`, assert that the backup bytes equal the source bytes, the SHA-256 companion matches, a second call does not overwrite the backup, and the generated config is valid JSON.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test src/lib/openclaw/runtime-config.test.ts
```

Expected: FAIL because `runtime-config.ts` does not exist.

- [ ] **Step 4: Implement the pure builder and filesystem preparation**

Export:

```ts
export function buildOpenClawRuntimeConfig(
  baseConfig: Record<string, unknown>,
): Record<string, unknown>;

export function prepareOpenClawRuntimeConfig(input: {
  baseConfigPath: string;
  stateDir: string;
}): {
  configPath: string;
  legacyBackupPath: string;
  legacyBackupHash: string;
};
```

Parse the base file with JSON5. Preserve unrelated settings, replace only the `genlink_text` Agent model catalog and `agents.defaults.models`, keep the legacy primary `genlink_text/gpt-5.5`, and write the generated JSON through a sibling temporary file followed by atomic rename. Create the legacy backup and `.sha256` file only when absent. Never write API Key values into either file.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```bash
node --test src/lib/openclaw/runtime-config.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/openclaw/runtime-config.ts src/lib/openclaw/runtime-config.test.ts
git commit -m "feat: generate openclaw agent model config"
```

### Task 5: OpenClaw Model Validation And Runtime Integration

**Files:**
- Modify: `src/lib/openclaw/model-mapping.test.ts`
- Modify: `src/lib/openclaw/real-runtime.test.ts`
- Modify: `src/lib/openclaw/model-mapping.ts`
- Modify: `src/lib/openclaw/real-runtime.ts`

- [ ] **Step 1: Write failing model and runtime tests**

Require:

```ts
assert.equal(
  mapAgentPanelModelToOpenClaw({ provider: "comfly", model: "gemini-3.5-flash" }),
  "genlink_text/gemini-3.5-flash",
);
assert.throws(
  () => mapAgentPanelModelToOpenClaw({ provider: "vibe", model: "gemini-3.5-flash" }),
  AgentModelCompatibilityError,
);
```

Add a runtime test proving the child environment uses the generated config path rather than the legacy base file. Add classification expectations for unknown/unregistered model output and invalid config errors.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test src/lib/openclaw/model-mapping.test.ts src/lib/openclaw/real-runtime.test.ts
```

Expected: FAIL because mapping accepts every model and the runtime still uses the legacy config directly.

- [ ] **Step 3: Implement validation and generated config use**

Export `AgentModelCompatibilityError` from `model-mapping.ts`. Reject a Provider/model pair that fails `isAgentModelSupportedByProvider` before building the qualified `genlink_text/<model>` reference.

In `runRealOpenClaw`, call:

```ts
const runtimeConfig = prepareOpenClawRuntimeConfig({
  baseConfigPath: getOpenClawConfigPath(),
  stateDir: getOpenClawStateDir(),
});
```

Pass `runtimeConfig.configPath` as `OPENCLAW_CONFIG_PATH`. Extend diagnostics with `unsupported_model` and `invalid_config`, and map each to an accurate Chinese public message.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```bash
node --test src/lib/openclaw/model-mapping.test.ts src/lib/openclaw/real-runtime.test.ts src/lib/openclaw/runtime-config.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openclaw/model-mapping.ts src/lib/openclaw/model-mapping.test.ts src/lib/openclaw/real-runtime.ts src/lib/openclaw/real-runtime.test.ts
git commit -m "fix: synchronize openclaw agent models"
```

### Task 6: Route Coverage And Accurate User-Facing Errors

**Files:**
- Create: `src/lib/openclaw/route-model-compatibility.test.ts`
- Modify: `src/lib/agent-chat-display.test.ts`
- Modify: `src/lib/agent-chat-display.ts`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/app/api/openclaw/agent/run/route.ts`
- Modify: `src/app/api/openclaw/planf/ecom/start/route.ts`
- Modify: `src/app/api/openclaw/planf/ecom/confirm/route.ts`
- Modify: `src/app/api/openclaw/planf/ecom/create-workflow/route.ts`

- [ ] **Step 1: Write failing route and display tests**

Read the four route sources and require each to call `mapAgentPanelModelToOpenClaw` before `runRealOpenClaw`. Require `AgentModelCompatibilityError` to become a 400 response with a Chinese message. Require the ecom-start catch fallback to be generic rather than claiming every failure is a timeout.

```ts
assert.doesNotMatch(canvasPanel, /GenLink 规则运行超时，请稍后重试，或切换文本模型后再试。/);
assert.equal(
  formatAgentChatErrorText("Agent Provider 与模型不兼容", "fallback"),
  "Agent Provider 与模型不兼容",
);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test src/lib/openclaw/route-model-compatibility.test.ts src/lib/agent-chat-display.test.ts
```

Expected: FAIL because route compatibility errors are not classified consistently and the UI still uses the misleading timeout fallback.

- [ ] **Step 3: Implement consistent route responses and UI text**

Catch `AgentModelCompatibilityError` explicitly in all four routes and return status 400. Preserve `RealOpenClawRuntimeError.publicMessage` and public diagnostics for runtime failures. Change the UI fallback to `GenLink 规则运行失败，请稍后重试。`; continue suppressing raw protocol/process payloads and handled `console.error` calls.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```bash
node --test src/lib/openclaw/route-model-compatibility.test.ts src/lib/agent-chat-display.test.ts src/app/api/agent/run/route.test.ts
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openclaw/route-model-compatibility.test.ts src/lib/agent-chat-display.ts src/lib/agent-chat-display.test.ts src/components/canvas/CanvasAgentPanel.tsx src/app/api/openclaw/agent/run/route.ts src/app/api/openclaw/planf/ecom/start/route.ts src/app/api/openclaw/planf/ecom/confirm/route.ts src/app/api/openclaw/planf/ecom/create-workflow/route.ts
git commit -m "fix: report openclaw model errors accurately"
```

### Task 7: Preserve The Real Legacy Config And Verify Both Paths

**Files:**
- External backup: `E:/GenLink-runtime/backups/openclaw-genlink.legacy-gpt.json`
- External checksum: `E:/GenLink-runtime/backups/openclaw-genlink.legacy-gpt.json.sha256`
- Generated runtime config: `E:/GenLink-runtime/state/genlink-runtime/openclaw-agent.generated.json`

- [ ] **Step 1: Create the byte-for-byte legacy backup without overwriting an existing backup**

Use `prepareOpenClawRuntimeConfig` against the real runtime paths. Verify the backup SHA-256 equals the recorded baseline when the source is still unchanged. If the backup already exists, compare it and do not replace it.

- [ ] **Step 2: Verify the generated OpenClaw model catalog locally**

Run the OpenClaw CLI model-list command with the generated config, a dummy API Key, and no model request. Verify the catalog contains:

```text
genlink_text/gemini-3.5-flash
genlink_text/gemini-3.1-pro
genlink_text/gpt-5.4-mini
genlink_text/gpt-5.5
```

- [ ] **Step 3: Run the complete relevant regression suite**

Run:

```bash
node --test src/lib/agent-model-options.test.ts src/lib/agent-provider-options.test.ts src/lib/agent-api-key.test.ts src/components/canvas/ApiSettingsPanel.test.ts src/components/hero/HeroSurface.test.ts src/lib/vibe-text-response-format.test.ts src/lib/agent-chat-display.test.ts src/lib/openclaw/model-mapping.test.ts src/lib/openclaw/runtime-config.test.ts src/lib/openclaw/real-runtime.test.ts src/lib/openclaw/route-model-compatibility.test.ts src/app/api/agent/run/route.test.ts src/lib/home-agent-launch.test.ts
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: tests and TypeScript exit 0; Lint has 0 errors and only the existing Director warnings; diff check is clean.

- [ ] **Step 4: Live verification**

In a signed-in browser session:

1. Select Vibe and verify only GPT-5.4 Mini / GPT-5.5 are shown.
2. Select Comfly and verify all four models are shown.
3. Submit one GPT request from the homepage and one GPT ecommerce preset from the canvas.
4. Submit one Gemini request from the homepage and one Gemini ecommerce preset from the canvas.
5. Verify no request reports a false timeout and both OpenClaw paths use the selected model.

If a signed-in browser or real Provider keys are unavailable, report the missing verification explicitly and do not claim live Provider success.
