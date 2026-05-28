# Video Generation Node Plan

This document summarizes the decisions made for adding a Seedance 2.0 video generation node to GenLink. It is intended as the implementation guide for the `codex/video-generation-node` branch.

## Goal

Add a canvas node for video generation using Comfly as the provider and Seedance 2.0 as the model.

Primary model:

```text
doubao-seedance-2-0-260128
```

The video node should follow the interaction model of the existing image generation node: a compact result card on the canvas, with provider, model, prompt, and generation parameters in a prompt bar below the selected node.

## Source Evidence

Comfly exposes Seedance APIs through Apifox:

- API index: https://gpt-best.apifox.cn/llms.txt
- Unified text-to-video: https://gpt-best.apifox.cn/api-343444777.md
- Unified image-to-video: https://gpt-best.apifox.cn/api-343464094.md
- Unified first-last-frame image-to-video: https://gpt-best.apifox.cn/api-343464933.md
- Unified task query: https://gpt-best.apifox.cn/api-343444780.md
- Seedance official-format task creation: https://gpt-best.apifox.cn/api-343680647.md
- Seedance official-format task query: https://gpt-best.apifox.cn/api-343680865.md

The user confirmed from the Comfly model page that the intended model is:

```text
doubao-seedance-2-0-260128
```

The Comfly page showed these endpoints for the model:

```text
GET  https://ai.comfly.org/seedance/v3/contents/generations/tasks/{task_id}
GET  https://ai.comfly.org/v2/videos/generations/{task_id}
POST https://ai.comfly.org/seedance/v3/contents/generations/tasks
POST https://ai.comfly.org/v2/videos/generations
```

## Product Modes

The API capabilities can be understood as two lower-level categories:

1. All-reference generation through the Seedance official format.
2. First-last-frame generation as a special constrained workflow.

For the frontend, expose four user-facing modes because users think in workflows rather than API categories:

```text
Text to video
Image to video
All-reference
First-last-frame
```

Implementation mapping:

| UI mode | Input requirement | Recommended API |
| --- | --- | --- |
| Text to video | Prompt only | Official format, `content[]` with text |
| Image to video | Prompt plus one image | Official format, `content[]` with text and `image_url` |
| All-reference | Prompt plus multiple images and optionally video/audio references | Official format, `content[]` with text, `image_url`, `video_url`, and `audio_url` as supported |
| First-last-frame | Prompt plus exactly two images | Unified `/v2/videos/generations` or official format after exact contract is confirmed |

Do not treat "all-reference" as a separate documented Comfly API name. The evidence is that the official-format endpoint supports multi-modal reference content. The product label can be "All-reference", but the API path is the official-format task endpoint.

## API Parameters To Map

Core request parameters:

| Frontend field | API field | Type | Notes |
| --- | --- | --- | --- |
| Provider | internal `provider` | string | Fixed to `comfly` for this node initially |
| Model | `model` | string | `doubao-seedance-2-0-260128` |
| Prompt | `prompt` or text `content[]` item | string | Required |
| Mode | internal `mode` | enum | Controls request builder and required references |
| Reference images | `images` or `content[].image_url.url` | string[] | Use hosted public URLs |
| Reference videos | `content[].video_url.url` | string[] | Official format only; URL must be publicly reachable |
| Reference audio | `content[].audio_url.url` | string[] | Official format only if enabled |
| Duration | `duration` | integer/string depending endpoint | Docs list `5` and `10`; default to `5` until tested |
| Resolution | `resolution` | string | `480p`, `720p`, `1080p`; default `720p` or `480p` |
| Ratio | `ratio` | string | `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `9:21`, `keep_ratio`, `adaptive` |
| Watermark | `watermark` | boolean | Default `false` |
| Seed | `seed` | integer | Optional, `0` to `2147483647` |
| Camera fixed | `camerafixed` | boolean | Default `false` |
| Return last frame | `return_last_frame` | boolean | Store returned `last_frame_url` |
| Generate audio | `generate_audio` | boolean | Used for audio-enabled generation |

Unified query result fields:

| Frontend field | Response field |
| --- | --- |
| Task ID | `task_id` |
| Status | `status`: `NOT_START`, `IN_PROGRESS`, `SUCCESS`, `FAILURE` |
| Progress | `progress` |
| Video URL | `data.output` |
| Last frame URL | `data.last_frame_url` |
| Actual duration | `data.duration` |
| Actual ratio | `data.ratio` |
| Actual resolution | `data.resolution` |
| Actual seed | `data.seed` |
| Failure reason | `fail_reason` |
| Usage | `data.usage` |

Official-format query results may instead use:

```text
id
model
status
content.video_url
usage
created_at
updated_at
```

Normalize both response shapes in the backend before returning data to the frontend.

## Node Data Shape

Add a new canvas node type, for example:

```ts
type VideoGenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "all-reference"
  | "first-last-frame";
```

Suggested data fields:

```ts
interface VideoGenerationNodeData {
  title?: string;
  provider?: "comfly";
  model?: string;
  mode?: VideoGenerationMode;
  prompt?: string;
  ratio?: string;
  resolution?: "480p" | "720p" | "1080p";
  duration?: 5 | 10;
  seed?: number;
  camerafixed?: boolean;
  watermark?: boolean;
  returnLastFrame?: boolean;
  generateAudio?: boolean;
  referenceImages?: MediaReference[];
  referenceVideos?: MediaReference[];
  referenceAudio?: MediaReference[];
  taskId?: string;
  videoUrl?: string;
  hostedVideoUrl?: string;
  lastFrameUrl?: string;
  status?: "idle" | "generating" | "error";
  progress?: string;
  generatedModel?: string;
  generatedAt?: string;
  errorMessage?: string;
}

interface MediaReference {
  id: string;
  url: string;
  hostedUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}
```

## Canvas Placement And UI

Follow the existing image generation node layout.

Canvas node structure:

1. Top title: video icon plus editable title. Default title can be `Video` or `Seedance Video`.
2. Main card: video preview area. Default aspect ratio should be `16:9`.
3. Empty state: show a video icon and no large form.
4. Generating state: use the same animated border pattern as the image generation node.
5. Completed state: render a video element with controls inside the card.
6. Left target handle: accepts connected image, video, audio, or text references depending mode.
7. Right source handle: outputs generated video.
8. Top floating toolbar: upload references before generation; download, copy URL, add to library, and expand after generation.
9. Bottom prompt bar: visible when the node is selected, like the image generation node.

Prompt bar layout:

```text
[Reference thumbnails] [Prompt input] [Comfly / Model] [Mode] [Params] [Advanced] [Run]
```

Parameter menu:

```text
Ratio: 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 / 9:21 / keep_ratio / adaptive
Resolution: 480p / 720p / 1080p
Duration: 5s / 10s
```

Advanced menu:

```text
Seed
Camera fixed
Watermark
Return last frame
Generate audio
```

Mode-specific validation:

| Mode | Validation |
| --- | --- |
| Text to video | Prompt required |
| Image to video | Prompt plus at least one image |
| All-reference | Prompt plus zero or more image/video/audio references; allow pure prompt as well |
| First-last-frame | Prompt plus exactly two images, clearly labeled start frame and end frame |

## OSS Setup

The user chose to create a separate Aliyun OSS bucket for video media:

```text
Bucket: genlink-video
Region: oss-cn-guangzhou
Public base URL: https://genlink-video.oss-cn-guangzhou.aliyuncs.com
```

The bucket was configured for public read. A manual validation uploaded an MP4 and checked it with:

```powershell
Invoke-WebRequest -Uri "https://genlink-video.oss-cn-guangzhou.aliyuncs.com/<file>.mp4" -Method Head -UseBasicParsing
```

The response returned:

```text
StatusCode: 200
StatusDescription: OK
```

This confirms the URL is publicly reachable, which is required for Comfly to fetch reference videos.

OSS CORS should include these origins:

```text
http://localhost:3000
http://127.0.0.1:3000
https://zerinnai.online
https://www.zerinnai.online
https://zerinn-workflow-studio.vercel.app
https://zerinn-workflow-studio-lgwki8dmj-zerinns-projects.vercel.app
```

Allowed methods:

```text
GET
POST
PUT
HEAD
```

Allowed headers:

```text
*
```

Exposed headers:

```text
ETag
x-oss-request-id
```

Max age:

```text
600
```

`Vary: Origin` should be enabled.

## Environment Variables

Keep the existing image OSS configuration intact. Add video-specific variables so the new bucket does not affect existing image generation.

```env
ALIYUN_VIDEO_OSS_BUCKET=genlink-video
ALIYUN_VIDEO_OSS_REGION=oss-cn-guangzhou
ALIYUN_VIDEO_OSS_ACCESS_KEY_ID=<same key as image OSS or a dedicated key>
ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET=<same secret as image OSS or a dedicated secret>
ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL=https://genlink-video.oss-cn-guangzhou.aliyuncs.com
```

Add these both locally and in Vercel.

## Media Hosting Implementation

The existing image hosting path is image-only:

- `src/app/api/image-hosting/upload-url/route.ts` rejects non-image MIME types.
- `src/lib/image-host.ts` has image-oriented names, a 20 MB server-side limit, and image MIME extension handling.

Do not break the image APIs. Add a separate media hosting path instead.

Suggested endpoints:

```text
POST /api/media-hosting/upload-url
POST /api/media-hosting/upload
```

For the first implementation, prioritize direct browser upload:

```text
Frontend selects video
Frontend asks /api/media-hosting/upload-url for signed PUT URL
Frontend PUTs file directly to OSS with Content-Type
API returns public media URL
Video generation request uses that public URL
```

Allowed MIME types:

```text
image/*
video/*
audio/*
```

Recommended folders:

```text
references/images
references/videos
references/audio
generated/videos
generated/frames
```

For video upload, set the content type explicitly, for example:

```text
Content-Type: video/mp4
```

## Backend Video API

Add a video generation route separate from image generation, for example:

```text
POST /api/ai/video
GET  /api/ai/video?jobId=...
```

or mirror the image job pattern if the current image route already supports async jobs and history.

Responsibilities:

1. Validate provider is `comfly`.
2. Validate model defaults to `doubao-seedance-2-0-260128`.
3. Validate mode-specific media inputs.
4. Build either official-format or unified-format request.
5. Submit task to Comfly.
6. Poll task status or expose polling endpoint to the frontend.
7. Normalize result.
8. Optionally copy the returned video URL into the video OSS bucket under `generated/videos`.

Official-format request shape should be based on `content[]`, for example:

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "A cinematic detective enters a dimly lit room."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://..."
      }
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://..."
      }
    }
  ]
}
```

Unified-format request shape for simple modes:

```json
{
  "model": "doubao-seedance-2-0-260128",
  "prompt": "A cinematic detective enters a dimly lit room.",
  "images": ["https://..."],
  "duration": 5,
  "resolution": "720p",
  "ratio": "16:9",
  "watermark": false,
  "seed": 12345,
  "camerafixed": false,
  "return_last_frame": false,
  "generate_audio": false
}
```

## Implementation Order

1. Add types for video generation nodes and media references.
2. Add video OSS environment variables to `.env.example`.
3. Add media hosting helpers using the video OSS bucket.
4. Add `/api/media-hosting/upload-url` with `image/*`, `video/*`, and `audio/*` support.
5. Add Comfly Seedance video API helper functions.
6. Add `/api/ai/video` route for submit and poll.
7. Add `VideoGenerationNode` and `VideoGenerationPromptBar`.
8. Register the new node type in the canvas store and React Flow node renderer.
9. Add an entry in the add-node menu.
10. Add project serialization/deserialization support.
11. Test upload, submit, poll, preview, and project reload.

## Verification Checklist

- A local MP4 can be uploaded to `genlink-video` through signed PUT.
- The resulting URL returns HTTP 200 in an unauthenticated request.
- The video node can be added to the canvas.
- The prompt bar opens only when the video node is selected.
- Provider/model controls show Comfly and `doubao-seedance-2-0-260128`.
- Text-to-video validates prompt only.
- Image-to-video validates prompt plus image.
- First-last-frame validates exactly two images.
- All-reference accepts image and video references.
- Submit returns a task ID.
- Polling shows progress and final status.
- Completed video renders inside the node card.
- Download/copy URL work.
- Project save and reload preserve the video node state.

## Notes And Risks

- The term "all-reference" is a product/UI label. The documented evidence is the official-format endpoint accepting multi-modal `content[]`.
- If Comfly changes the Seedance 2.0 model ID, keep the model list configurable rather than hardcoding only one model forever.
- If generated video URLs are temporary, copy them into the video OSS bucket before storing final project state.
- Keep image hosting routes stable. Video/media upload should not alter current image generation behavior.
- Public-read OSS is the simplest first implementation. A private bucket with signed temporary URLs is more secure but may fail if Comfly pulls after the signature expires.
