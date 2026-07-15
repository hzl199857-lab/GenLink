# VPN-safe OSS image rendering

## Problem

GenLink uploads canvas images to Aliyun OSS successfully, but the OSS default
domain currently responds with `Content-Disposition: attachment` and
`x-oss-force-download: true`. Browsers therefore refuse to render those
responses in image elements. This affects both existing generated images and
newly dragged images, while the stored OSS objects remain valid.

## Decision

Keep canonical OSS URLs in canvas data and project snapshots. At render time,
convert only Aliyun OSS default-domain image URLs to the existing authenticated
same-origin endpoint:

```text
https://<bucket>.oss-<region>.aliyuncs.com/<object>
  -> /api/image-hosting/read?url=<encoded canonical URL>
```

The existing read route fetches the object server-side and emits media headers
without forwarding `Content-Disposition`, so the browser can render the image.
Blob URLs, data URLs, relative URLs, and non-OSS remote URLs remain unchanged.

## Scope

- Add a small, pure URL conversion helper in `src/lib/`.
- Apply it to uploaded-image nodes and generated-image previews, covering the
  two broken node types shown on the production canvas.
- Preserve the original URL for persistence, downloads, generation inputs, and
  project snapshots.
- Add focused tests for URL recognition, encoding, and pass-through behavior.

## Verification

- Run the focused URL helper test.
- Run TypeScript and lint checks.
- Deploy through the existing `master` workflow.
- Verify the online app version, the same-origin image response headers, and a
  browser canvas containing existing and newly uploaded images.

