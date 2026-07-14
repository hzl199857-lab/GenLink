# VPN-Safe OSS Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every production browser image upload through a same-origin, 100MB-bounded streaming endpoint so VPN routing never has to reach Aliyun OSS directly.

**Architecture:** Add a testable Web Streams forwarder that validates metadata, limits actual bytes, propagates cancellation, and sends the body to a signed OSS internal endpoint. A thin authenticated Next.js route exposes it. Existing browser call sites converge on `uploadImageAsset`, while Aliyun builds select the `server` policy.

**Tech Stack:** Next.js App Router, TypeScript, Web Streams, Node.js fetch, Aliyun OSS signed PUT, Node test runner.

---

## File map

- Create `src/lib/image-upload-stream.ts` and `src/lib/image-upload-stream.test.ts` for bounded streaming.
- Create `src/app/api/image-hosting/upload-stream/route.ts` and `route.test.ts` for the authenticated API.
- Modify `src/lib/browser-oss-upload.ts` and its tests to use the raw stream route.
- Modify `CanvasAgentPanel.tsx` and `canvas-store.ts` to remove private image PUT paths.
- Create `src/lib/browser-image-upload-call-sites.test.ts` to prevent duplicate paths.
- Modify deployment workflow/tests and environment examples to select server mode before build.

### Task 1: Bounded streaming forwarder

**Files:**
- Create: `src/lib/image-upload-stream.ts`
- Test: `src/lib/image-upload-stream.test.ts`

- [ ] **Step 1: Write failing tests**

Cover non-image types, missing/invalid length, declared length over 100MB, actual bytes over the configured maximum, successful byte-for-byte forwarding, upstream non-2xx, and request cancellation. The desired API is:

```ts
export const MAX_STREAM_IMAGE_UPLOAD_BYTES = 100 * 1024 * 1024;

export class ImageUploadStreamError extends Error {
  constructor(readonly status: number, message: string, options?: ErrorOptions);
}

export async function forwardImageUploadRequest(
  request: Request,
  deps: {
    createUploadTarget(input: {
      contentType: string;
      fileName?: string;
      folder?: string;
      useInternalEndpoint: true;
    }): {
      uploadUrl: string;
      imageUrl: string;
      headers: Record<string, string>;
    };
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  },
): Promise<{ imageUrl: string }>;
```

Use a test maximum of 3 bytes to prove a body with 4 actual bytes aborts even when the declared length is 3.

- [ ] **Step 2: Verify RED**

Run `node --test src/lib/image-upload-stream.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the forwarder**

Implementation requirements:

- Strictly parse a positive decimal `Content-Length`.
- Require `image/*` and a non-null request body.
- Read `fileName` and `folder` from URL query parameters.
- Wrap the source in a `ReadableStream<Uint8Array>` and count bytes before enqueueing.
- Abort and throw status 413 when actual bytes exceed `maxBytes`.
- Link `request.signal` to the OSS fetch abort controller.
- Send `PUT` with target headers, `Content-Length`, the limited stream, and `duplex: "half"`.
- Map OSS/network failures to sanitized status 502 errors.
- Return only the public `imageUrl`.

- [ ] **Step 4: Verify GREEN**

Run `node --test src/lib/image-upload-stream.test.ts`.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-upload-stream.ts src/lib/image-upload-stream.test.ts
git commit -m "feat: add bounded OSS image streaming"
```

### Task 2: Authenticated upload route

**Files:**
- Create: `src/app/api/image-hosting/upload-stream/route.ts`
- Test: `src/app/api/image-hosting/upload-stream/route.test.ts`

- [ ] **Step 1: Write a failing route contract test**

Read `route.ts` and require these boundaries:

```ts
assert.match(source, /runtime = ["']nodejs["']/);
assert.match(source, /requireAuth\(request\)/);
assert.match(source, /forwardImageUploadRequest\(request/);
assert.match(source, /createAliyunOssUploadTarget/);
assert.doesNotMatch(source, /arrayBuffer\(|Buffer\.from\(|base64/i);
```

- [ ] **Step 2: Verify RED**

Run `node --test src/app/api/image-hosting/upload-stream/route.test.ts`.

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Set `runtime = "nodejs"`, require authentication, call `forwardImageUploadRequest` with `createAliyunOssUploadTarget`, and return `{ ok: true, result: { imageUrl } }`. Map `ImageUploadStreamError` to 400/413/502, `VibeApiError` to its status, and unexpected errors to a sanitized 500 response.

- [ ] **Step 4: Verify GREEN and commit**

Run the route test, then commit:

```bash
git add src/app/api/image-hosting/upload-stream
git commit -m "feat: expose authenticated image upload stream"
```

### Task 3: Browser helper uses raw same-origin uploads

**Files:**
- Modify: `src/lib/browser-oss-upload.ts`
- Modify: `src/lib/browser-oss-upload.test.ts`

- [ ] **Step 1: Update tests first**

Expect server mode and direct-upload fallback to call an encoded URL beginning with `/api/image-hosting/upload-stream?`, with `method: "POST"`, `Content-Type` equal to the Blob MIME type, and the original Blob as the body. Preserve assertions for `{ hostedUrl, mode: "server" }`.

- [ ] **Step 2: Verify RED**

Run `node --test src/lib/browser-oss-upload.test.ts`.

Expected: FAIL because the implementation still posts multipart data to the legacy route.

- [ ] **Step 3: Implement raw upload**

```ts
const query = new URLSearchParams();
if (input.fileName) query.set("fileName", input.fileName);
if (input.folder) query.set("folder", input.folder);

const response = await fetchImpl(`/api/image-hosting/upload-stream?${query}`, {
  method: "POST",
  headers: { "Content-Type": input.contentType },
  body: input.data,
});
```

Keep `direct-with-fallback` semantics unchanged.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused test, then commit:

```bash
git add src/lib/browser-oss-upload.ts src/lib/browser-oss-upload.test.ts
git commit -m "fix: stream browser image uploads through GenLink"
```

### Task 4: Consolidate all browser image call sites

**Files:**
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`
- Modify: `src/store/canvas-store.ts`
- Create: `src/lib/browser-image-upload-call-sites.test.ts`

- [ ] **Step 1: Write a failing source-policy test**

Require `CanvasAgentPanel` to call `uploadImageAsset` and contain no `/api/image-hosting/upload-url`. Slice `canvas-store.ts` between `uploadImageBlobToOss` and `uploadVideoBlobToOss`; require `uploadImageAsset` and forbid `method: "PUT"` in that slice.

- [ ] **Step 2: Verify RED**

Run `node --test src/lib/browser-image-upload-call-sites.test.ts`.

Expected: FAIL for both legacy image upload paths.

- [ ] **Step 3: Replace both private implementations**

Both functions should convert/read the Blob as they do today, then call:

```ts
const result = await uploadImageAsset({
  data: blob,
  contentType: blob.type || "image/png",
  fileName,
  folder,
});
return result.hostedUrl;
```

Preserve canvas logging and do not change video upload behavior.

- [ ] **Step 4: Verify GREEN and commit**

Run the call-site and browser-helper tests, then commit the three files.

### Task 5: Production build policy

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy.test.ts`
- Modify: `.env.example`
- Modify: `deploy/.env.production.example`

- [ ] **Step 1: Write a failing deployment test**

```ts
const setting = 'upsert_env_var "NEXT_PUBLIC_IMAGE_UPLOAD_MODE" "server"';
assert.ok(source.indexOf(setting) >= 0);
assert.ok(source.indexOf("npm run build") > source.indexOf(setting));
```

- [ ] **Step 2: Verify RED**

Run `node --test .github/workflows/deploy.test.ts`.

Expected: FAIL because the variable is not set.

- [ ] **Step 3: Add build-time configuration**

Add `upsert_env_var "NEXT_PUBLIC_IMAGE_UPLOAD_MODE" "server"` before the remote build. Document the variable in both example env files, noting that `server` avoids browser-to-OSS uploads under VPN/proxy routing.

- [ ] **Step 4: Verify GREEN and commit**

Run the deployment test and commit the four files.

### Task 6: Full verification

- [ ] **Step 1: Run focused tests**

```bash
node --test src/lib/image-upload-stream.test.ts
node --test src/app/api/image-hosting/upload-stream/route.test.ts
node --test src/lib/browser-oss-upload.test.ts
node --test src/lib/browser-image-upload-call-sites.test.ts
node --test .github/workflows/deploy.test.ts
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit code 0.

- [ ] **Step 3: Run `npm run lint`**

Expected: exit code 0 with no new warnings or errors.

- [ ] **Step 4: Inspect repository state**

```bash
git status --short
git diff --check
git log --oneline -10
```

Expected: no uncommitted implementation files and only planned commits.

- [ ] **Step 5: Runtime smoke test**

Run with `NEXT_PUBLIC_IMAGE_UPLOAD_MODE=server`, sign in, and upload an image. The browser must call `/api/image-hosting/upload-stream`, receive a stable OSS public URL, and make no upload PUT to `*.aliyuncs.com`. If production credentials are unavailable locally, report that manual deployment verification remains instead of claiming it ran.
