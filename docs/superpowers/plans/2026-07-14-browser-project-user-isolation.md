# Browser Project User Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind browser project records and active canvas memory to the authenticated user without automatically assigning legacy projects to the first account that logs in.

**Architecture:** IndexedDB project records gain an `ownerUserId` index. New and explicitly imported projects receive the current session user ID; unowned legacy records stay hidden until their folder is explicitly imported. The canvas store tracks a user scope epoch, clears in-memory project state on account changes, and rejects asynchronous commits started under an older scope.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, IndexedDB, File System Access API, Node test runner.

---

### Task 1: Owner-Aware Project Records

**Files:**
- Modify: `src/lib/project-storage.ts`
- Create: `src/lib/project-storage-ownership.test.ts`

- [ ] Write failing tests proving blank users and cross-owner access are rejected, and that the IndexedDB schema includes an owner index.
- [ ] Run `npx tsx --test src/lib/project-storage-ownership.test.ts` and confirm failure.
- [ ] Add `ownerUserId`, upgrade the database version, and query project records through the owner index.
- [ ] Keep unowned legacy records hidden; only `importProjectsFromParentDirectory(parentHandle, userId)` may adopt an explicitly selected legacy project.
- [ ] Require `userId` for create, load, save, rename, duplicate, delete, output persistence, preview hydration, and history reads.
- [ ] Run the focused test and `npx tsc --noEmit`.

### Task 2: Session Scope In The Canvas Store

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/project/ProjectLibrary.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/store/canvas-store.ts`
- Create: `src/store/canvas-user-isolation.test.ts`
- Create: `src/store/canvas-user-scope-async.test.ts`

- [ ] Write failing tests proving account changes clear project memory and invalidate pending asynchronous work.
- [ ] Run both focused tests and confirm failure.
- [ ] Add `activeUserId` and `userScopeEpoch` to the store; reset project, canvas, undo/redo, materials, messages, and preview URLs when the account changes.
- [ ] Initialize the store from the validated session before rendering the project library or canvas.
- [ ] Pass the current user into every project-storage operation.
- [ ] Guard asynchronous project and generation commits with the captured user ID and epoch; revoke object URLs produced by stale work.
- [ ] Run both focused tests and `npx tsc --noEmit`.

### Task 3: Full Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-browser-project-user-isolation.md`

- [ ] Run `npx tsx --test src/lib/project-storage-ownership.test.ts src/store/canvas-user-isolation.test.ts src/store/canvas-user-scope-async.test.ts`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint` and confirm no new errors.
- [ ] Run `npm run build` and confirm the production build succeeds.
- [ ] Commit only the focused isolation files; leave unrelated image-model changes untouched.
