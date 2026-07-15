# Home Hero Agent Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passive home hero with an Agent composer and authenticated recent-project strip, resume login-gated submissions automatically, and support first-save persistence for an unsaved Agent-created canvas.

**Architecture:** The home page owns a short-lived pending request containing `File` objects, then converts it to a prepared canvas launch request containing hosted `AgentTaskAttachment` values. The canvas consumes that request once through the existing Agent submission path. Unsaved canvases keep `currentProject === null`; their first save creates a project from the current `buildProjectSnapshot` result and binds the record without replacing canvas content.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Zustand, ReactFlow, Better Auth, File System Access API, Node test runner.

---

## File Map

**Create**

- `src/lib/home-agent-entry.ts`: pending/prepared launch request types and recent-project selection.
- `src/lib/home-agent-entry.test.ts`: pure request and recent-project behavior.
- `src/lib/agent-image-upload-client.ts`: shared browser image preparation and OSS upload wrapper.
- `src/lib/project-save-intent.ts`: pure first-save routing decision.
- `src/lib/project-save-intent.test.ts`: first-save decision tests.
- `src/components/hero/HeroAgentComposer.tsx`: home prompt, model picker, image previews, and run button.
- `src/components/hero/HeroRecentProjects.tsx`: compact create/recent/all-project UI.
- `src/components/hero/HomeAuthDialog.tsx`: modal login/register shell and dismissal behavior.

**Modify**

- `src/lib/agent-model-options.ts`: export the model ID type and validator.
- `src/lib/project-storage.ts`: create a project from an optional current snapshot.
- `src/lib/project-storage-ownership.test.ts`: cover snapshot-preserving project creation helper.
- `src/store/canvas-store.ts`: expose current snapshot creation and bind a saved draft project without clearing canvas state.
- `src/store/canvas-user-scope-async.test.ts`: verify draft-project binding remains user scoped.
- `src/components/project/CreateProjectDialog.tsx`: add `create` and `save` variants.
- `src/components/project/ProjectLibrary.tsx`: pass the create variant explicitly.
- `src/components/canvas/CanvasAgentPanel.tsx`: consume one prepared launch request through the existing submit path and use the shared upload client.
- `src/components/canvas/InfiniteCanvas.tsx`: accept the launch request and route first save to the dialog.
- `src/components/canvas/InfiniteCanvasProjectMessages.test.ts`: assert first-save and autosave guards remain in source.
- `src/components/auth/LoginForm.tsx`: support success and register callbacks without mandatory navigation.
- `src/components/auth/RegisterFlow.tsx`: support success callbacks and modal completion.
- `src/components/hero/GenLinkHero.tsx`: compose the new hero surface.
- `src/app/page.tsx`: coordinate auth, pending submissions, projects, and canvas mode.
- `src/lib/auth-entry.ts`: keep unauthenticated library requests on the hero instead of redirecting to deleted pages.
- `src/lib/auth-entry.test.ts`: update the unauthenticated app-entry expectation.
- `src/app/globals.css`: add only the responsive/scrollbar styles that cannot stay local to components.
- `src/components/project/ProjectLibrary.tsx`: return to `/` after logout.

**Delete**

- `src/app/login/page.tsx`: remove the standalone login route.
- `src/app/register/page.tsx`: remove the standalone registration route.

## Task 1: Home Entry Contracts and Pure Selection Logic

**Files:**

- Create: `src/lib/home-agent-entry.ts`
- Create: `src/lib/home-agent-entry.test.ts`
- Modify: `src/lib/agent-model-options.ts`

- [ ] **Step 1: Write failing tests for model validation, request creation, and recent projects**

```ts
test("accepts only configured Agent models", () => {
  assert.equal(isAgentModelId("gpt-5.4-mini"), true);
  assert.equal(isAgentModelId("unknown"), false);
});

test("normalizes a pending home Agent request", () => {
  const request = createHomeAgentPendingRequest({
    id: "launch-1",
    prompt: "  创建一张海报  ",
    model: "gpt-5.4-mini",
    files: [],
  });

  assert.deepEqual(request, {
    id: "launch-1",
    prompt: "创建一张海报",
    model: "gpt-5.4-mini",
    files: [],
  });
});

test("returns the three most recently updated projects", () => {
  const result = selectRecentProjects([
    { id: "a", updatedAt: "2026-07-13T00:00:00.000Z" },
    { id: "b", updatedAt: "2026-07-16T00:00:00.000Z" },
    { id: "c", updatedAt: "2026-07-15T00:00:00.000Z" },
    { id: "d", updatedAt: "2026-07-14T00:00:00.000Z" },
  ]);

  assert.deepEqual(result.map((project) => project.id), ["b", "c", "d"]);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test src/lib/home-agent-entry.test.ts`

Expected: FAIL because `home-agent-entry.ts` and the model helpers do not exist.

- [ ] **Step 3: Implement the contracts and helpers**

```ts
export const AGENT_MODEL_OPTIONS = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.5", label: "GPT-5.5" },
] as const;

export type AgentModelId = (typeof AGENT_MODEL_OPTIONS)[number]["id"];

export function isAgentModelId(value: string): value is AgentModelId {
  return AGENT_MODEL_OPTIONS.some((option) => option.id === value);
}
```

```ts
export interface HomeAgentPendingRequest {
  id: string;
  prompt: string;
  model: AgentModelId;
  files: File[];
}

export interface CanvasAgentLaunchRequest {
  id: string;
  prompt: string;
  model: AgentModelId;
  attachments: AgentTaskAttachment[];
}

export function createHomeAgentPendingRequest(
  input: HomeAgentPendingRequest,
): HomeAgentPendingRequest {
  return { ...input, prompt: input.prompt.trim(), files: [...input.files] };
}

export function selectRecentProjects<T extends { updatedAt: string }>(
  projects: T[],
  limit = 3,
): T[] {
  return [...projects]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test src/lib/home-agent-entry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract layer**

```bash
git add src/lib/agent-model-options.ts src/lib/home-agent-entry.ts src/lib/home-agent-entry.test.ts
git commit -m "feat: add home agent launch contracts"
```

## Task 2: Shared Browser Agent Image Upload

**Files:**

- Create: `src/lib/agent-image-upload-client.ts`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/lib/agent-attachment-upload.test.ts`

- [ ] **Step 1: Extend the attachment test with a high-level dependency seam**

Add a test that calls `createBrowserAgentImageAttachment(file, deps)` with injected `readImageDataUrl`, `readImageDimensions`, `createDerivativeDataUrl`, and `uploadImageDataUrl`, then asserts the returned attachment contains hosted original, preview, and semantic URLs.

```ts
assert.equal(result.hostedImageUrl, "https://cdn.test/original.png");
assert.equal(result.previewUrl, "https://cdn.test/preview.jpg");
assert.equal(result.semanticImageUrl, "https://cdn.test/semantic.jpg");
assert.equal(result.name, "reference.png");
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test src/lib/agent-attachment-upload.test.ts`

Expected: FAIL because `createBrowserAgentImageAttachment` is not exported.

- [ ] **Step 3: Move browser-specific image work into the shared client**

Implement and export:

```ts
export async function createBrowserAgentImageAttachment(
  file: File,
  overrides: Partial<CreateHostedAgentImageAttachmentDeps> = {},
): Promise<AgentTaskAttachment> {
  return createHostedAgentImageAttachment(file, {
    createAttachmentId: () => crypto.randomUUID(),
    createPreviewUrl: (value) => URL.createObjectURL(value),
    releasePreviewUrl: (url) => URL.revokeObjectURL(url),
    readImageDataUrl: readImageFileAsDataUrl,
    readImageDimensions,
    createDerivativeDataUrl: createImageDerivativeDataUrl,
    uploadImageDataUrl: uploadAgentImageDataUrl,
    ...overrides,
  });
}
```

Move `readImageDimensions`, `readImageFileAsDataUrl`, `createImageDerivativeDataUrl`, and `uploadAgentImageDataUrl` out of `CanvasAgentPanel.tsx`. Keep `uploadImageAsset` as the single OSS upload API.

- [ ] **Step 4: Update CanvasAgentPanel to call the shared wrapper**

Replace its local `createHostedAgentImageAttachment(file, deps)` construction with:

```ts
const attachment = await createBrowserAgentImageAttachment(file);
```

- [ ] **Step 5: Run attachment and TypeScript checks**

Run: `node --test src/lib/agent-attachment-upload.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the shared upload client**

```bash
git add src/lib/agent-image-upload-client.ts src/lib/agent-attachment-upload.test.ts src/components/canvas/CanvasAgentPanel.tsx
git commit -m "refactor: share agent image upload client"
```

## Task 3: Preserve the Current Canvas During First Project Creation

**Files:**

- Modify: `src/lib/project-storage.ts`
- Modify: `src/lib/project-storage-ownership.test.ts`
- Modify: `src/store/canvas-store.ts`
- Modify: `src/store/canvas-user-scope-async.test.ts`

- [ ] **Step 1: Add a failing snapshot-preservation test**

Export a pure `buildCreatedProjectSnapshot` helper and test it with a source snapshot containing nodes, edges, groups, materials, and a thumbnail.

```ts
const result = buildCreatedProjectSnapshot({
  projectName: "正式项目",
  sourceSnapshot,
  id: "project-new",
  timestamp: "2026-07-16T10:00:00.000Z",
});

assert.equal(result.id, "project-new");
assert.equal(result.name, "正式项目");
assert.deepEqual(result.nodes, sourceSnapshot.nodes);
assert.deepEqual(result.edges, sourceSnapshot.edges);
assert.deepEqual(result.groups, sourceSnapshot.groups);
assert.deepEqual(result.materials, sourceSnapshot.materials);
assert.equal(result.thumbnailFileName, sourceSnapshot.thumbnailFileName);
```

- [ ] **Step 2: Run the storage test and confirm it fails**

Run: `node --test src/lib/project-storage-ownership.test.ts`

Expected: FAIL because `buildCreatedProjectSnapshot` is missing.

- [ ] **Step 3: Implement snapshot-aware project creation**

Extend `createProjectAtParentDirectory`:

```ts
export async function createProjectAtParentDirectory(params: {
  parentHandle: FileSystemDirectoryHandle;
  projectName: string;
  userId: string;
  sourceSnapshot?: ProjectSnapshot;
}): Promise<CreateProjectResult>
```

Build the new snapshot with fresh project identity and timestamps while preserving source content:

```ts
export function buildCreatedProjectSnapshot(params: {
  projectName: string;
  sourceSnapshot?: ProjectSnapshot;
  id?: string;
  timestamp?: string;
}): ProjectSnapshot {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const source = params.sourceSnapshot;

  return buildProjectSnapshot({
    id: params.id ?? crypto.randomUUID(),
    name: params.projectName,
    nodes: source?.nodes ?? [],
    edges: source?.edges ?? [],
    groups: source?.groups,
    materialFolders: source?.materialFolders,
    materials: source?.materials,
    thumbnailFileName: source?.thumbnailFileName,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
```

- [ ] **Step 4: Add store actions for snapshot export and draft binding**

Add these state methods:

```ts
createProjectSnapshot: () => ProjectSnapshot;
bindDraftProject: (
  project: ProjectHandleRecord,
  snapshot: ProjectSnapshot,
) => void;
```

`createProjectSnapshot` returns the existing sanitized `createSnapshot(get())`. `bindDraftProject` updates project identity, timestamps, `currentProject`, thumbnail metadata, dirty state, and save signature, but leaves `nodes`, `edges`, `groups`, `materialFolders`, `materials`, and undo/redo stacks unchanged.

- [ ] **Step 5: Add a user-scope source assertion**

Extend `canvas-user-scope-async.test.ts` to assert project creation still calls `runCanvasUserScopedOperation` and does not trust a component-supplied owner ID.

- [ ] **Step 6: Run storage and scope tests**

Run: `node --test src/lib/project-storage-ownership.test.ts src/store/canvas-user-scope-async.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit first-save storage foundations**

```bash
git add src/lib/project-storage.ts src/lib/project-storage-ownership.test.ts src/store/canvas-store.ts src/store/canvas-user-scope-async.test.ts
git commit -m "feat: create projects from canvas drafts"
```

## Task 4: Route First Save Through the Existing Project Dialog

**Files:**

- Create: `src/lib/project-save-intent.ts`
- Create: `src/lib/project-save-intent.test.ts`
- Modify: `src/components/project/CreateProjectDialog.tsx`
- Modify: `src/components/project/ProjectLibrary.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/components/canvas/InfiniteCanvasProjectMessages.test.ts`

- [ ] **Step 1: Write a failing save-routing test**

```ts
test("opens the save dialog for an unsaved canvas", () => {
  assert.equal(getProjectSaveIntent(null), "open-save-dialog");
});

test("saves an attached project directly", () => {
  assert.equal(getProjectSaveIntent({ id: "project-1" }), "save-project");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test src/lib/project-save-intent.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement the save intent and dialog variant**

```ts
export function getProjectSaveIntent(
  currentProject: { id: string } | null,
): "open-save-dialog" | "save-project" {
  return currentProject ? "save-project" : "open-save-dialog";
}
```

Add `variant?: "create" | "save"` to `CreateProjectDialog`, default it to `create`, and derive exact labels:

```ts
const title = variant === "save" ? "保存项目" : "新建项目";
const confirmLabel = variant === "save" ? "保存" : "创建并进入";
```

- [ ] **Step 4: Implement first-save behavior in InfiniteCanvas**

In `handleSaveProject`, call `getProjectSaveIntent(currentProject)`. For an unsaved canvas, prefill the dialog with the current non-placeholder project name and open it. For a saved project, run `saveProject` unchanged.

When the save-mode dialog confirms:

```ts
const sourceSnapshot = useCanvasStore.getState().createProjectSnapshot();
const created = await runCanvasUserScopedOperation({
  getState: useCanvasStore.getState,
  run: (activeUserId) => createProjectAtParentDirectory({
    parentHandle: createDraft.parentHandle!,
    projectName: createDraft.projectName.trim(),
    userId: activeUserId,
    sourceSnapshot,
  }),
  commit: (result) => bindDraftProject(result.project, result.snapshot),
});
```

Guard the five-minute autosave with `currentProject !== null`. Make the keyboard shortcut call the same `handleSaveProject` function.

- [ ] **Step 5: Add source-level regression assertions**

Assert `InfiniteCanvas.tsx` contains the save intent branch, passes `sourceSnapshot`, calls `bindDraftProject`, and guards autosave with `currentProject`.

- [ ] **Step 6: Run first-save tests and TypeScript**

Run: `node --test src/lib/project-save-intent.test.ts src/components/canvas/InfiniteCanvasProjectMessages.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit first-save UI**

```bash
git add src/lib/project-save-intent.ts src/lib/project-save-intent.test.ts src/components/project/CreateProjectDialog.tsx src/components/project/ProjectLibrary.tsx src/components/canvas/InfiniteCanvas.tsx src/components/canvas/InfiniteCanvasProjectMessages.test.ts
git commit -m "feat: save temporary canvases as projects"
```

## Task 5: Callback-Based Authentication Modal

**Files:**

- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/RegisterFlow.tsx`
- Create: `src/components/hero/HomeAuthDialog.tsx`
- Create: `src/components/hero/HomeAuthDialog.test.ts`

- [ ] **Step 1: Write source-contract tests for modal authentication**

The test must assert:

```ts
assert.match(loginSource, /onSuccess\?\.\(\)/);
assert.match(loginSource, /onRegister/);
assert.doesNotMatch(loginSource, /window\.location\.assign/);
assert.match(registerSource, /onSuccess\?\.\(\)/);
assert.match(dialogSource, /event\.key === ['"]Escape['"]/);
assert.match(dialogSource, /aria-label=['"]关闭登录窗口['"]/);
```

- [ ] **Step 2: Run the auth modal test and confirm it fails**

Run: `node --test src/components/hero/HomeAuthDialog.test.ts`

Expected: FAIL because the dialog and callback props are missing.

- [ ] **Step 3: Refactor LoginForm and RegisterFlow to callbacks**

Use explicit props:

```ts
interface LoginFormProps {
  onSuccess?: () => void;
  onRegister?: () => void;
}

interface RegisterFlowProps {
  onSuccess?: () => void;
}
```

After successful sign-in or registration, call `onSuccess?.()`. `LoginForm` calls `onRegister` instead of routing when provided. Remove full-page navigation from these reusable form components.

- [ ] **Step 4: Implement HomeAuthDialog**

The dialog owns `mode: "login" | "register"`, defaults to login, does not close on backdrop click, installs an `Escape` listener only while open, and renders a top-right `X` icon button. It calls the parent `onAuthenticated` callback after either flow succeeds.

- [ ] **Step 5: Run auth modal tests and TypeScript**

Run: `node --test src/components/hero/HomeAuthDialog.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit modal authentication**

```bash
git add src/components/auth/LoginForm.tsx src/components/auth/RegisterFlow.tsx src/components/hero/HomeAuthDialog.tsx src/components/hero/HomeAuthDialog.test.ts
git commit -m "feat: add home authentication dialog"
```

## Task 6: Build the Hero Composer and Recent Project Strip

**Files:**

- Create: `src/components/hero/HeroAgentComposer.tsx`
- Create: `src/components/hero/HeroRecentProjects.tsx`
- Create: `src/components/hero/HeroSurface.test.ts`
- Modify: `src/components/hero/GenLinkHero.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write source-contract tests for the hero surface**

Assert the composer imports `AGENT_MODEL_OPTIONS`, uses an `input type="file" accept="image/*" multiple`, provides image removal controls, and disables run for an empty trimmed prompt. Assert the recent-project component calls `selectRecentProjects`, renders “新建项目” and “所有项目”, and does not contain prompt-summary metadata.

- [ ] **Step 2: Run the hero test and confirm it fails**

Run: `node --test src/components/hero/HeroSurface.test.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement HeroAgentComposer**

Use controlled props so `page.tsx` retains drafts across modal open/close:

```ts
interface HeroAgentComposerProps {
  prompt: string;
  model: AgentModelId;
  files: File[];
  busy: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onModelChange: (value: AgentModelId) => void;
  onFilesChange: (files: File[]) => void;
  onRun: () => void;
}
```

Render a stable-height composer with textarea, image preview row, model menu, image button, and circular send button. Revoke preview URLs when files are removed or replaced.

- [ ] **Step 4: Implement HeroRecentProjects**

Use props for `projects`, loading/error state, and callbacks. Render one create card plus up to three project cards. Keep `Image` at `object-cover`; use project name and `updatedAt` only. Use horizontal overflow on narrow screens and four stable desktop columns.

- [ ] **Step 5: Recompose GenLinkHero**

Replace `onEnter` with explicit composer/project props. Preserve the particle background and logo asset, reduce top spacing, and keep all foreground controls above the background. Do not add marketing cards or descriptive feature copy.

- [ ] **Step 6: Run hero tests and TypeScript**

Run: `node --test src/components/hero/HeroSurface.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit the new hero surface**

```bash
git add src/components/hero/HeroAgentComposer.tsx src/components/hero/HeroRecentProjects.tsx src/components/hero/HeroSurface.test.ts src/components/hero/GenLinkHero.tsx src/app/globals.css
git commit -m "feat: build home agent hero"
```

## Task 7: Connect Home Submission to the Existing Canvas Agent

**Files:**

- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/auth-entry.ts`
- Modify: `src/lib/auth-entry.test.ts`
- Modify: `src/components/project/ProjectLibrary.tsx`
- Delete: `src/app/login/page.tsx`
- Delete: `src/app/register/page.tsx`
- Create: `src/lib/home-agent-launch.test.ts`

- [ ] **Step 1: Write failing launch-consumption and auth-entry tests**

Update the unauthenticated library entry expectation:

```ts
assert.deepEqual(
  getHomeEntryDecision({ appParam: "library", isAuthenticated: false }),
  { action: "show-hero" },
);
```

Add source assertions that `CanvasAgentPanel` accepts `initialRequest`, compares `initialRequest.id` against a consumed ref, sets the selected model, and invokes the shared submission path once. Assert `page.tsx` creates a pending request, opens auth if no user exists, prepares attachments after authentication, calls `newProject("未命名项目")`, and passes the prepared request into `InfiniteCanvas`.

- [ ] **Step 2: Run launch tests and confirm they fail**

Run: `node --test src/lib/auth-entry.test.ts src/lib/home-agent-launch.test.ts`

Expected: FAIL because the old redirect and launch props remain.

- [ ] **Step 3: Extract a shared CanvasAgentPanel submission callback**

Change the internal submit function to accept explicit values:

```ts
const submitAgentRequest = useCallback((params: {
  prompt: string;
  model: AgentModelId;
  attachments: AgentTaskAttachment[];
}) => {
  // Existing message creation, source-node creation, selection, and runAgent flow.
}, [/* existing dependencies */]);
```

The manual button calls it with local draft/model/attachments. An effect consumes `initialRequest` once, sets the panel open through `CanvasAgentDock`, and calls the same function. Do not duplicate `runAgent` or message construction.

- [ ] **Step 4: Pass the launch request through InfiniteCanvas and CanvasAgentDock**

Add optional props:

```ts
interface InfiniteCanvasProps {
  userId: string;
  initialAgentRequest?: CanvasAgentLaunchRequest | null;
  onInitialAgentRequestConsumed?: (id: string) => void;
  // existing props
}
```

`CanvasAgentDock` opens when it receives an unconsumed request and passes the request to `CanvasAgentPanel`.

- [ ] **Step 5: Coordinate the home flow in page.tsx**

Add controlled hero state: prompt, model, files, pending request, prepared request, auth dialog visibility, run busy/error, recent projects, and project dialog state. Required behavior:

1. Run creates `HomeAgentPendingRequest`.
2. No user: open `HomeAuthDialog` and stop.
3. Authenticated: upload files with `createBrowserAgentImageAttachment`.
4. Call `newProject("未命名项目")` only after uploads succeed.
5. Store `CanvasAgentLaunchRequest` and switch to canvas mode.
6. Clear pending/prepared state only after the canvas reports consumption.
7. Preserve prompt/model/files if auth is dismissed or upload fails.

Use the existing list/load/create operations for `HeroRecentProjects`. The project section is passed to `GenLinkHero` only when `userId` exists.
When a refreshed project list replaces the previous list, revoke thumbnail object URLs owned by the previous result; also revoke the final list on home-page unmount or user change.

- [ ] **Step 6: Remove standalone auth routes and stale redirects**

Delete the two route files. Change unauthenticated `/?app=library` handling to show the hero. Change project-library logout to `router.push("/")`. Search the repository and remove remaining product navigation to `/login` or `/register`.

- [ ] **Step 7: Run launch, auth-entry, and TypeScript tests**

Run: `node --test src/lib/auth-entry.test.ts src/lib/home-agent-launch.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit integrated home-to-canvas flow**

```bash
git add src/components/canvas/CanvasAgentPanel.tsx src/components/canvas/InfiniteCanvas.tsx src/app/page.tsx src/lib/auth-entry.ts src/lib/auth-entry.test.ts src/components/project/ProjectLibrary.tsx src/lib/home-agent-launch.test.ts
git rm src/app/login/page.tsx src/app/register/page.tsx
git commit -m "feat: launch canvas agent from home"
```

## Task 8: Full Verification and Visual QA

**Files:**

- Modify only files needed to fix verification findings.

- [ ] **Step 1: Run all focused tests**

Run:

```bash
node --test src/lib/home-agent-entry.test.ts src/lib/agent-attachment-upload.test.ts src/lib/project-storage-ownership.test.ts src/store/canvas-user-scope-async.test.ts src/lib/project-save-intent.test.ts src/components/canvas/InfiniteCanvasProjectMessages.test.ts src/components/hero/HomeAuthDialog.test.ts src/components/hero/HeroSurface.test.ts src/lib/auth-entry.test.ts src/lib/home-agent-launch.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run project-wide static verification**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run lint`

Expected: exit code 0 with no new errors.

- [ ] **Step 3: Start the development server**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3000`

Expected: Next.js reports `http://127.0.0.1:3000` ready. If port 3000 is occupied, use the next available port.

- [ ] **Step 4: Verify desktop and mobile screenshots with Playwright**

Check at minimum:

- 1440 x 1000, logged out: logo, copy, composer visible; no project strip.
- 1440 x 1000, authenticated: create card plus at most three recent cards and “所有项目”.
- 390 x 844, logged out: no overlap, horizontal clipping, or inaccessible run controls.
- Auth dialog: centered, close button visible, background darkened, login default, register switch works.
- Uploaded image names/previews do not resize the composer controls.
- First-save dialog uses “保存项目 / 保存”; project-library create dialog remains “新建项目 / 创建并进入”.

- [ ] **Step 5: Exercise behavioral flows**

Verify manually:

1. Enter text and attach an image while logged out.
2. Run, close auth with `Escape`, and confirm the draft remains.
3. Run again, authenticate, and confirm the canvas opens and Agent runs once.
4. Save the temporary canvas, select a directory, and confirm current nodes remain.
5. Save again and confirm no creation dialog appears.
6. Return home, open a recent project, and open the full project library.

- [ ] **Step 6: Commit verification fixes**

```bash
git add -u
git commit -m "fix: polish home agent entry flow"
```

Skip this commit only when verification required no code changes.
