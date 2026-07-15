# VPN-safe OSS Image Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render existing and newly uploaded Aliyun OSS canvas images through GenLink's same-origin media reader without changing persisted image URLs.

**Architecture:** A pure display-URL helper recognizes Aliyun OSS default hostnames and returns an encoded `/api/image-hosting/read` URL. Uploaded and generated image node renderers use the transformed display URL while all stored node data remains canonical.

**Tech Stack:** TypeScript, React, Next.js App Router, Node test runner.

---

### Task 1: Display URL conversion

**Files:**
- Create: `src/lib/image-display-url.test.ts`
- Create: `src/lib/image-display-url.ts`

- [ ] **Step 1: Write the failing test**

Test that an Aliyun OSS URL is encoded into `/api/image-hosting/read`, while
blob, data, relative, malformed, and non-OSS URLs pass through unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/image-display-url.test.ts`

Expected: FAIL because `image-display-url.ts` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Export `getBrowserImageDisplayUrl(imageUrl: string): string`, parse absolute
HTTP(S) URLs with `URL`, recognize hostnames matching an OSS default endpoint,
and return `/api/image-hosting/read?url=${encodeURIComponent(url)}`.

- [ ] **Step 4: Run the focused test**

Run: `node --test src/lib/image-display-url.test.ts`

Expected: PASS.

### Task 2: Canvas image node integration

**Files:**
- Modify: `src/components/nodes/UploadedImageNode.tsx`
- Modify: `src/components/nodes/ImageGenerationNode.tsx`
- Test: `src/lib/image-display-url.test.ts`

- [ ] **Step 1: Add source integration assertions**

Assert that both node modules import and call `getBrowserImageDisplayUrl`.

- [ ] **Step 2: Run the test to verify the integration assertions fail**

Run: `node --test src/lib/image-display-url.test.ts`

Expected: FAIL because neither renderer uses the helper yet.

- [ ] **Step 3: Apply the helper only at image `src` boundaries**

Transform `displayImageUrl` in `UploadedImageNode` and `src` inside
`GeneratedPreviewImageContent`. Do not update the node data or result objects.

- [ ] **Step 4: Run focused and project checks**

Run:

```bash
node --test src/lib/image-display-url.test.ts
npx tsc --noEmit
npm run lint
```

Expected: all commands exit successfully.

### Task 3: Deployment verification

**Files:**
- No additional source files.

- [ ] **Step 1: Inspect the diff and commit the focused fix**

Run `git diff --check`, review the changed files, and commit the design, plan,
test, helper, and two renderer integrations.

- [ ] **Step 2: Push `master` through the existing deployment workflow**

Run `git push origin master`.

- [ ] **Step 3: Verify production**

Confirm `/api/app-version` matches the new commit, an authenticated same-origin
read request returns `image/*` without `Content-Disposition: attachment`, and
the production canvas renders both existing and newly dragged images.

