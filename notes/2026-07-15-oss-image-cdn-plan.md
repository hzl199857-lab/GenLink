# OSS Image CDN Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver GenLink OSS images through `img.zerinnai.online` without changing persisted project URLs or routing image bytes through the GenLink server.

**Architecture:** Alibaba Cloud CDN removes the OSS forced-download behavior and supplies CORS/cache headers. A configurable display helper rewrites only the GenLink OSS origin hostname to the CDN hostname and retains the current read proxy as a configuration fallback.

**Tech Stack:** Alibaba Cloud CDN/OSS, Next.js, TypeScript, Node test runner, GitHub Actions.

---

### Task 1: Verify and prepare the CDN domain

**Files:**
- No repository files.

- [ ] Inspect DNS, HTTPS, origin, and current CDN domain configuration.
- [ ] Upload a small test image to the existing OSS bucket.
- [ ] Configure inline disposition, CORS, forced-download removal, and immutable image caching.
- [ ] Verify the test object through both the OSS origin and CDN domain.

### Task 2: Specify display URL rewriting

**Files:**
- Modify: `src/lib/image-display-url.test.ts`
- Modify: `src/lib/image-display-url.ts`

- [ ] Add a failing test for exact source-host rewriting to the CDN base URL.
- [ ] Verify path and `x-oss-process` query preservation.
- [ ] Verify other OSS buckets still use `/api/image-hosting/read`.
- [ ] Implement the minimal configurable rewrite and run the focused test.

### Task 3: Configure production builds

**Files:**
- Modify: `.env.example`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy.test.ts`

- [ ] Add a failing workflow assertion for both public CDN environment values.
- [ ] Run the workflow test and confirm the expected failure.
- [ ] Add the example variables and deployment `upsert_env_var` calls before build.
- [ ] Run workflow and helper tests.

### Task 4: Validate the application

**Files:**
- Test: `src/lib/image-display-url.test.ts`
- Test: `.github/workflows/deploy.test.ts`

- [ ] Run focused tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npx next build`.
- [ ] Review `git diff --check` and confirm no persistence/upload URL changes.

### Task 5: Deploy and verify

**Files:**
- No additional source files.

- [ ] Commit the implementation and push `master`.
- [ ] Wait for GitHub Actions and `/api/app-version` to reach the commit.
- [ ] Verify a real image URL returns renderable CDN headers in production.
- [ ] Confirm production JavaScript embeds `img.zerinnai.online`.
