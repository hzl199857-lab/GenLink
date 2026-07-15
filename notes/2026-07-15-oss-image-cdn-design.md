# OSS image CDN delivery

## Goal

Serve GenLink-hosted images through `https://img.zerinnai.online` so browsers,
Canvas, and Three.js load image bytes from Alibaba Cloud CDN instead of routing
every read through the GenLink application server.

## Current state

- Canonical project data stores URLs under
  `https://genlink-img.oss-cn-guangzhou.aliyuncs.com`.
- The OSS origin sends `Content-Disposition: attachment` and
  `x-oss-force-download: true`, so browsers cannot reliably render it directly.
- `getBrowserImageDisplayUrl` currently converts every Aliyun OSS default-domain
  image to `/api/image-hosting/read`.
- `img.zerinnai.online` already resolves to Alibaba Cloud CDN and its origin is
  the `genlink-img` OSS bucket. HTTPS is active.

## Approaches considered

### Display-only CDN rewrite (selected)

Keep canonical OSS URLs in project data. At browser display boundaries, rewrite
only the GenLink OSS hostname to `img.zerinnai.online`, preserving the object
path and query string. Configure CDN response headers so the result renders
inline and supports cross-origin Canvas/Three.js reads.

This has the smallest data and rollback surface. Removing the two public CDN
environment variables restores the existing authenticated read proxy.

### Return CDN URLs from uploads

Set `ALIYUN_OSS_PUBLIC_BASE_URL` to the CDN domain so new uploads are persisted
as CDN URLs. This is not selected because several existing code paths recognize
already-hosted objects from the `.aliyuncs.com` hostname. Changing persisted
URLs would require a broader migration and compatibility audit.

### Cache the GenLink read proxy

Keep `/api/image-hosting/read` and cache it at ESA. This reduces repeated origin
reads but still routes image bytes through the application origin and retains
the server-bandwidth bottleneck.

## Data flow

Stored project data remains:

```text
https://genlink-img.oss-cn-guangzhou.aliyuncs.com/<object>?<processing-query>
```

The browser displays:

```text
https://img.zerinnai.online/<object>?<processing-query>
```

Uploads, generation inputs, downloads, project snapshots, and backend media
normalization continue to use the stored canonical URL. Only browser image read
boundaries use the CDN URL.

## CDN contract

`img.zerinnai.online` must:

- use the `genlink-img.oss-cn-guangzhou.aliyuncs.com` OSS bucket as origin;
- serve HTTPS with a valid certificate;
- override `Content-Disposition` to `inline`;
- omit or neutralize `x-oss-force-download`;
- return `Access-Control-Allow-Origin: *` for Canvas and Three.js;
- cache successful immutable object responses while respecting object query
  strings such as `x-oss-process`;
- preserve `Content-Type` from OSS.

Objects use date folders and UUID-based names, so successful image objects are
immutable in normal GenLink operation.

## Application configuration

Production defines:

```text
NEXT_PUBLIC_IMAGE_CDN_BASE_URL=https://img.zerinnai.online
NEXT_PUBLIC_IMAGE_CDN_SOURCE_HOST=genlink-img.oss-cn-guangzhou.aliyuncs.com
```

`getBrowserImageDisplayUrl` rewrites an image only when both values are valid
and the input hostname exactly matches the configured source. Other Aliyun OSS
hosts retain the existing `/api/image-hosting/read` fallback. Blob, data,
relative, non-OSS, and already-CDN URLs pass through unchanged.

## Rollout and rollback

Configure and verify CDN headers with a real test object before deploying the
application rewrite. Then deploy the public environment variables and helper
change together.

Rollback requires removing the two public CDN variables and redeploying. The
existing read route remains in place, and no project data migration is needed.

## Verification

- A real object returns `200`, `Content-Type: image/*`, inline disposition, and
  `Access-Control-Allow-Origin: *` through `img.zerinnai.online`.
- The same object can be decoded by a browser image element and drawn to Canvas.
- The helper rewrites only the configured GenLink OSS host and preserves path
  and query strings.
- Focused tests, TypeScript, Lint, and the production Next.js build pass.
- Production app version matches the pushed commit, and production static code
  contains the CDN hostname rather than proxying the GenLink OSS image.
