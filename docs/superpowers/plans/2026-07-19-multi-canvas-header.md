# Multi-Canvas Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent project-level multi-canvas support and replace the canvas upper-left controls with the approved project/canvas manager.

**Architecture:** Store shared project metadata and materials in `project.json`, while storing each canvas in `canvases/<canvasId>.json`. Keep ReactFlow bound to one active canvas at a time, scope async work and Agent history by `canvasId`, and coordinate multi-window editing with per-canvas locks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, ReactFlow, Tailwind CSS, Prisma/SQLite, File System Access API, Web Locks, BroadcastChannel, Node test runner.

---

## File map

- `src/types/canvas.ts`: project manifest, canvas document, viewport, metadata, and legacy snapshot types.
- `src/lib/canvas/multi-canvas.ts`: pure naming, migration, duplication, and manifest helpers.
- `src/lib/canvas/multi-canvas.test.ts`: pure helper tests.
- `src/lib/project-snapshot.ts`: build and sign the versioned project manifest and active canvas document.
- `src/lib/project-storage.ts`: read/write/migrate `project.json` and `canvases/*.json` atomically.
- `src/lib/project-storage-multi-canvas.test.ts`: storage contract and migration policy tests.
- `prisma/schema.prisma`: add `Canvas`, associate nodes and edges with `canvasId`.
- `prisma/migrations/20260719193000_add_project_canvases/migration.sql`: migrate existing rows into default canvases.
- `src/lib/project-mapper.ts`: map database projects and canvases to the new project model.
- `src/lib/project-mapper.test.ts`: mapper coverage for multiple canvases.
- `src/lib/canvas/canvas-edit-lock.ts`: Web Locks/BroadcastChannel coordination and handoff messages.
- `src/lib/canvas/canvas-edit-lock.test.ts`: deterministic lock-key, lease, and handoff tests.
- `src/store/canvas-store.ts`: active canvas state and canvas lifecycle actions.
- `src/store/canvas-store-multi-canvas.test.ts`: switch, duplicate, delete, isolation, and stale async tests.
- `src/lib/agent-history.ts`: add `canvasId` to thread and draft scope.
- `src/lib/agent-history-isolation.test.ts`: canvas-level history and draft isolation.
- `src/components/canvas/CanvasAgentPanel.tsx`: consume real active `canvasId`.
- `src/components/canvas/CanvasHeader.tsx`: compose the approved compact header.
- `src/components/canvas/ProjectMenu.tsx`: project navigation and destructive action menu.
- `src/components/canvas/EditableProjectName.tsx`: accessible project name editing.
- `src/components/canvas/CanvasSwitcher.tsx`: canvas list, creation, selection, rename, duplicate, delete, and open-in-window controls.
- `src/components/canvas/CanvasHeader.test.ts`: source-level UI contract tests used by the existing test style.
- `src/components/canvas/InfiniteCanvas.tsx`: wire store actions and current canvas state without adding rendering responsibilities.
- `src/app/page.tsx`: route/deep-link handling for `projectId` and `canvasId`.

### Task 1: Define the multi-canvas domain model

**Files:**
- Modify: `src/types/canvas.ts`
- Create: `src/lib/canvas/multi-canvas.ts`
- Create: `src/lib/canvas/multi-canvas.test.ts`

- [ ] **Step 1: Write failing tests for naming, legacy migration, and duplication**

```ts
test("wraps a legacy project in canvas 1", () => {
  const migrated = migrateLegacyProjectSnapshot(legacySnapshot);
  assert.equal(migrated.manifest.canvases[0].name, "画布 1");
  assert.deepEqual(migrated.canvases[0].nodes, legacySnapshot.nodes);
});

test("allocates the first available canvas number", () => {
  assert.equal(getNextCanvasName(["画布 1", "画布 3"]), "画布 2");
});

test("duplicates graph ids and rewrites edge endpoints", () => {
  const copy = duplicateCanvasDocument(source, "copy-id", "画布 1 副本");
  assert.notEqual(copy.nodes[0].id, source.nodes[0].id);
  assert.equal(copy.edges[0].source, copy.nodes[0].id);
});
```

- [ ] **Step 2: Run the test and verify the missing exports fail**

Run: `node --test src/lib/canvas/multi-canvas.test.ts`

Expected: FAIL because the new types and helpers do not exist.

- [ ] **Step 3: Add versioned types and minimal pure helpers**

```ts
export interface CanvasViewport { x: number; y: number; zoom: number }
export interface ProjectCanvasMetadata { id: string; name: string; fileName: string; createdAt: string; updatedAt: string }
export interface CanvasDocument { version: 1; id: string; name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; groups?: NodeGroup[]; viewport: CanvasViewport; createdAt: string; updatedAt: string }
export interface ProjectSnapshot { version: 2; id: string; name: string; canvases: ProjectCanvasMetadata[]; materialFolders?: MaterialLibraryFolder[]; materials?: MaterialLibraryItem[]; thumbnailFileName?: string; createdAt: string; updatedAt: string }
```

Implement `getNextCanvasName`, `getDuplicateCanvasName`, `createEmptyCanvasDocument`, `duplicateCanvasDocument`, and `migrateLegacyProjectSnapshot`. Keep legacy parsing types internal to the migration helper.

- [ ] **Step 4: Run the helper tests**

Run: `node --test src/lib/canvas/multi-canvas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/types/canvas.ts src/lib/canvas/multi-canvas.ts src/lib/canvas/multi-canvas.test.ts
git commit -m "feat: define multi-canvas project model"
```

### Task 2: Add manifest and per-canvas file storage

**Files:**
- Modify: `src/lib/project-snapshot.ts`
- Modify: `src/lib/project-storage.ts`
- Create: `src/lib/project-storage-multi-canvas.test.ts`

- [ ] **Step 1: Write failing storage contract tests**

Test that project creation returns one empty canvas, legacy parsing produces a migration plan without mutating input, canvas filenames use sanitized stable IDs, and manifest serialization contains no canvas nodes.

```ts
assert.equal(created.snapshot.canvases.length, 1);
assert.equal("nodes" in created.snapshot, false);
assert.equal(getCanvasDocumentFileName("canvas/a"), "canvas-a.json");
```

- [ ] **Step 2: Run the storage tests and confirm failure**

Run: `node --test src/lib/project-storage-multi-canvas.test.ts`

Expected: FAIL on the legacy flat snapshot assumptions.

- [ ] **Step 3: Implement focused storage functions**

Add:

```ts
loadProjectManifest(project, userId): Promise<ProjectSnapshot>
loadCanvasDocument(project, canvasId, userId): Promise<CanvasDocument>
saveCanvasDocument(project, document, userId): Promise<CanvasDocument>
saveProjectManifest(project, manifest, userId): Promise<ProjectSnapshot>
createCanvasInProject(project, manifest, userId): Promise<{ manifest: ProjectSnapshot; canvas: CanvasDocument }>
deleteCanvasFromProject(project, manifest, canvasId, userId): Promise<ProjectSnapshot>
```

Use temporary filenames followed by verified replacement for manifest and canvas writes. Preserve current media hydration by hydrating only the active canvas nodes plus shared materials.

- [ ] **Step 4: Add legacy migration during load**

Parse unknown JSON, detect missing `version: 2`, construct a default canvas, write and re-read the canvas document, then replace the manifest. Do not overwrite the legacy file until verification succeeds.

- [ ] **Step 5: Run storage and ownership tests**

Run: `node --test src/lib/project-storage-multi-canvas.test.ts src/lib/project-storage-ownership.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit storage migration**

```bash
git add src/lib/project-snapshot.ts src/lib/project-storage.ts src/lib/project-storage-multi-canvas.test.ts
git commit -m "feat: persist canvases as project documents"
```

### Task 3: Migrate Prisma and database mapping

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260719193000_add_project_canvases/migration.sql`
- Modify: `src/lib/project-mapper.ts`
- Modify: `src/lib/project-mapper.test.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Extend mapper tests with two canvases**

Assert that nodes and edges retain their `canvasId`, each project receives an ordered canvas list, and old database rows migrate to a generated default canvas.

- [ ] **Step 2: Run mapper tests and verify failure**

Run: `node --test src/lib/project-mapper.test.ts`

Expected: FAIL because database records do not expose canvases.

- [ ] **Step 3: Add the Prisma model and migration**

```prisma
model Canvas {
  id        String       @id
  projectId String
  name      String
  position  Int          @default(0)
  viewport  String
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  project   Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  nodes     CanvasNode[]
  edges     CanvasEdge[]
  @@index([projectId, position])
}
```

Add `canvasId` relations and indexes to `CanvasNode` and `CanvasEdge`. The SQL migration creates one canvas per existing project and assigns existing nodes and edges to it.

- [ ] **Step 4: Update API validation and mapper signatures**

Routes must validate the versioned manifest and canvas arrays, reject cross-project canvas IDs, and return consistent JSON errors.

- [ ] **Step 5: Generate Prisma client and run mapper/API tests**

Run: `$env:PRISMA_ENGINES_MIRROR='https://registry.npmmirror.com/-/binary/prisma'; npx prisma generate`

Run: `node --test src/lib/project-mapper.test.ts src/app/api/projects/projects-api-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit database support**

```bash
git add prisma src/lib/project-mapper.ts src/lib/project-mapper.test.ts src/app/api/projects
git commit -m "feat: add canvas persistence schema"
```

### Task 4: Add active-canvas store operations

**Files:**
- Modify: `src/store/canvas-store.ts`
- Create: `src/store/canvas-store-multi-canvas.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover loading the first canvas, saving before switch, isolated undo stacks, blank creation, deep duplication, last-canvas delete prevention, shared materials retention, and stale async completion after a canvas switch.

```ts
assert.equal(store.getState().activeCanvasId, "canvas-b");
assert.deepEqual(store.getState().nodes, canvasB.nodes);
assert.deepEqual(savedCanvasA.nodes, canvasAEditedNodes);
```

- [ ] **Step 2: Run focused store tests and verify failure**

Run: `node --test src/store/canvas-store-multi-canvas.test.ts`

Expected: FAIL because the store has no canvas lifecycle actions.

- [ ] **Step 3: Add active canvas state and actions**

Add `projectCanvases`, `activeCanvasId`, `activeCanvasViewport`, per-canvas runtime sessions, and actions `switchCanvas`, `createCanvas`, `renameCanvas`, `duplicateCanvas`, `deleteCanvas`, `saveActiveCanvas`, and `attachProjectCanvas`.

Keep `nodes`, `edges`, and `groups` as the active ReactFlow graph. Extend the current user-scope guard with a canvas token so asynchronous work can commit to its originating canvas only.

- [ ] **Step 4: Update snapshot signatures and autosave**

Project dirty state covers manifest/shared material changes; canvas dirty state covers graph and viewport changes. Autosave writes the active canvas first and the manifest only when project-level data changed.

- [ ] **Step 5: Run store tests**

Run: `node --test src/store/canvas-store-multi-canvas.test.ts src/store/canvas-user-scope-async.test.ts src/store/canvas-user-isolation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit store behavior**

```bash
git add src/store/canvas-store.ts src/store/canvas-store-multi-canvas.test.ts
git commit -m "feat: manage active project canvases"
```

### Task 5: Scope Agent history and MCP calls by canvas

**Files:**
- Modify: `src/lib/agent-history.ts`
- Modify: `src/lib/agent-history-isolation.test.ts`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`

- [ ] **Step 1: Add failing isolation tests**

Create two canvas IDs under one project and assert that drafts, thread lists, saves, and deletes do not cross canvas boundaries.

- [ ] **Step 2: Run the isolation tests and verify failure**

Run: `node --test src/lib/agent-history-isolation.test.ts`

Expected: FAIL because current keys contain only the project ID.

- [ ] **Step 3: Add `canvasId` to Agent records and helpers**

```ts
createAgentDraftScopeKey(userId, projectId, projectName, canvasId)
listAgentThreads(userId, projectId, projectName, canvasId)
deleteAgentThreadsForCanvas(userId, projectId, projectName, canvasId)
```

Migrate legacy project-scoped threads into the default canvas on first read. Pass `activeCanvasId` through `CanvasAgentPanel` and replace all hard-coded `canvasId: "default"` request values.

- [ ] **Step 4: Run Agent and MCP tests**

Run: `node --test src/lib/agent-history-isolation.test.ts src/lib/canvas/canvas-tool-gateway.test.ts src/lib/mcp/genlink-canvas-server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Agent isolation**

```bash
git add src/lib/agent-history.ts src/lib/agent-history-isolation.test.ts src/components/canvas/CanvasAgentPanel.tsx
git commit -m "feat: isolate agent sessions by canvas"
```

### Task 6: Add per-canvas edit locks and deep links

**Files:**
- Create: `src/lib/canvas/canvas-edit-lock.ts`
- Create: `src/lib/canvas/canvas-edit-lock.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write deterministic lock tests**

Test lock keys, stale heartbeat detection, handoff message validation, and project/canvas URL construction without requiring browser globals.

- [ ] **Step 2: Run lock tests and verify failure**

Run: `node --test src/lib/canvas/canvas-edit-lock.test.ts`

Expected: FAIL because the lock module does not exist.

- [ ] **Step 3: Implement the lock coordinator**

Expose `acquireCanvasEditLock`, `releaseCanvasEditLock`, `handoffCanvasEditLock`, `subscribeCanvasLockEvents`, and `buildCanvasDeepLink`. Use Web Locks when available and a heartbeat lease over BroadcastChannel/localStorage as fallback.

- [ ] **Step 4: Wire URL restoration and ownership handoff**

Read `projectId` and `canvasId` query parameters, prioritize them over the stored last canvas, and save before transferring the active canvas to a new window. Display a non-editable occupied state with retry when lock acquisition fails.

- [ ] **Step 5: Run lock and refresh restoration tests**

Run: `node --test src/lib/canvas/canvas-edit-lock.test.ts src/lib/update-refresh-restore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit window coordination**

```bash
git add src/lib/canvas/canvas-edit-lock.ts src/lib/canvas/canvas-edit-lock.test.ts src/app/page.tsx src/components/canvas/InfiniteCanvas.tsx
git commit -m "feat: coordinate canvas editing across windows"
```

### Task 7: Build the approved upper-left controls

**Files:**
- Modify: `src/components/canvas/CanvasHeader.tsx`
- Create: `src/components/canvas/ProjectMenu.tsx`
- Create: `src/components/canvas/EditableProjectName.tsx`
- Create: `src/components/canvas/CanvasSwitcher.tsx`
- Create: `src/components/canvas/CanvasHeader.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add failing source-level UI contract tests**

Assert the four Chinese project commands, canvas item commands, keyboard handlers, disabled last-canvas deletion, and absence of the Wordmark asset from `CanvasHeader`.

- [ ] **Step 2: Run the UI contract test and verify failure**

Run: `node --test src/components/canvas/CanvasHeader.test.ts`

Expected: FAIL because the canvas switcher components do not exist.

- [ ] **Step 3: Implement focused components**

Use controlled `openMenu` state in `CanvasHeader`, accessible buttons and inputs, outside-click/Escape cleanup, current-row checkmark-to-ellipsis hover behavior, Chinese tooltips, and existing confirmation dialog/message helpers.

- [ ] **Step 4: Wire actions without moving canvas runtime logic into the header**

Pass callbacks and metadata from `InfiniteCanvas`. Map homepage to `/`, all projects to `/?app=library`, and use store lifecycle actions for every canvas operation.

- [ ] **Step 5: Run UI tests and type-check the touched components**

Run: `node --test src/components/canvas/CanvasHeader.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the header UI**

```bash
git add src/components/canvas/CanvasHeader.tsx src/components/canvas/ProjectMenu.tsx src/components/canvas/EditableProjectName.tsx src/components/canvas/CanvasSwitcher.tsx src/components/canvas/CanvasHeader.test.ts src/components/canvas/InfiniteCanvas.tsx src/app/page.tsx
git commit -m "feat: add project canvas header controls"
```

### Task 8: Final integration and regression verification

**Files:**
- Modify only files required by failures found below.

- [ ] **Step 1: Run all focused tests**

```powershell
node --test src/lib/canvas/multi-canvas.test.ts src/lib/project-storage-multi-canvas.test.ts src/lib/project-storage-ownership.test.ts src/lib/project-mapper.test.ts src/store/canvas-store-multi-canvas.test.ts src/store/canvas-user-scope-async.test.ts src/store/canvas-user-isolation.test.ts src/lib/agent-history-isolation.test.ts src/lib/canvas/canvas-edit-lock.test.ts src/components/canvas/CanvasHeader.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run generated client, type checking, and lint**

```powershell
$env:PRISMA_ENGINES_MIRROR='https://registry.npmmirror.com/-/binary/prisma'
npx prisma generate
npx tsc --noEmit
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 3: Verify the working tree and migration policy**

Run: `git diff --check` and inspect `git status --short`. Confirm no unrelated files, generated media, local paths, or temporary video frames are staged.

- [ ] **Step 4: Commit final integration fixes**

```bash
git add <only final integration files>
git commit -m "fix: complete multi-canvas integration"
```
