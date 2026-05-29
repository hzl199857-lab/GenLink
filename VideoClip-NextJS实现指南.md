# GenLink 版「裁剪视频」实现指南

> 配套规格：[VideoClip-裁剪视频-功能实现说明.md](./VideoClip-裁剪视频-功能实现说明.md)。
> 本文不是原 AI-CanvasPro 的逐行搬运版，而是针对 **GenLink 当前代码结构、项目 output 持久化方式、以及 Vercel 部署约束** 的落地方案。

## 0. 关键结论

GenLink 不能采用“Next Route Handler 里直接跑 ffmpeg + 写入 `public/output` + 内存 job 字典”的方案，原因如下：

- 目标部署到 Vercel，Route Handler 不适合执行 ffmpeg 长任务、Python 场景检测、持续轮询状态或依赖本地持久文件系统。
- GenLink 的项目文件是浏览器 File System Access 模型，当前项目的 `output` 文件夹在用户选择的本地项目目录中，不在 Vercel 服务器上。
- 现有视频节点是 `type: "video"`，字段是 `videoUrl / hostedVideoUrl / durationSeconds / outputFileName`，不是原文档里的 `source-video / localPath`。
- 视频来源需要同时支持：本地上传视频、AI 生成视频、OSS/远程 URL。

因此正确架构是：

1. 前端进入视频裁剪模式，完成时间轴交互。
2. 前端把源视频规范化为“worker 可读取的 URL”：远程 URL 可直传；`blob:` 或项目本地 output 文件需要先上传到对象存储。
3. Vercel Route Handler 只负责创建媒体处理任务、查询任务状态，不直接跑 ffmpeg。
4. 外部媒体处理 worker 执行 ffmpeg / PySceneDetect / OpenCV，并把结果写入对象存储。
5. 前端拿到结果 URL 后，下载结果 blob，通过 GenLink 的项目持久化工具写入当前项目 `output` 文件夹，再创建新的 `type: "video"` 节点。

## 1. 目标能力

本次功能范围包含三项：

- 单段裁剪：选择 `[start, end]` 后生成一个新视频节点。
- 智能剪辑：按镜头/黑场自动拆成多段，每段生成一个新视频节点。
- 提取视频帧：把当前播放帧保存为图片节点。

三项都必须最终进入当前 GenLink 项目的 `output` 文件夹，而不是只留在临时远程 URL。

## 2. GenLink 现有约定

### 2.1 技术栈

- Next.js `16.2.4`
- React `19.2.4`
- React Flow 包名为 `reactflow`，不是 `@xyflow/react`
- Zustand store：`src/store/canvas-store.ts`
- 画布入口：`src/components/canvas/InfiniteCanvas.tsx`
- 视频节点：`src/components/nodes/UploadedVideoNode.tsx`

### 2.2 视频节点类型

新增裁剪结果应创建：

```ts
type: "video"
data: {
  title?: string;
  videoUrl: string;        // 当前会话可播放 URL，通常是 blob:
  hostedVideoUrl?: string; // 当前会话可播放 URL，可与 videoUrl 相同
  fileName?: string;
  outputFileName?: string; // 当前项目 output 中的文件名
  width: number;
  height: number;
  displayWidth?: number;
  displayHeight?: number;
  sizeBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
}
```

不要使用 `sourceVideo`、`source-video`、`localPath` 作为 GenLink 的节点契约。

### 2.3 必须补齐的持久化能力

当前 `src/lib/project-storage.ts` 的输出持久化主要覆盖了 `image_generation`、`video_generation`、`image`、`uploaded_image`，但 `type: "video"` 的 `outputFileName` 恢复链路还不完整。

实现前需要先扩展：

- `PersistProjectOutputParams` 支持传入 `VideoNodeData`。
- `resolveSourceKeyFromNode()` 支持 `node.type === "video"`。
- `hydrateProjectSnapshotPreviewUrls()` 支持 `node.type === "video"`，根据 `outputFileName` 或 manifest 恢复 `blob:` 预览 URL。
- 增加 `withResolvedVideoNodePreviewUrl(previewUrl, fileName, node)`，写回 `videoUrl / hostedVideoUrl / outputFileName / fileName`。
- `persistGeneratedOutput()` 的 `nodeData` 类型从 `ImageGenerationNodeData | VideoGenerationNodeData` 扩展为包含 `VideoNodeData`，或新增专门的 `persistVideoOutput()`。

否则裁剪出来的视频节点保存项目后，重新打开项目可能无法恢复视频文件。

## 3. Vercel 可部署架构

### 3.1 不允许放在 Vercel Route Handler 里的事情

不要在 `src/app/api/.../route.ts` 里做这些事：

- 直接 `spawn("ffmpeg")` 处理视频。
- 直接 `spawn("python")` 跑 PySceneDetect / OpenCV。
- 把任务状态存在内存 `Map` 并假设它会长期存在。
- 把处理结果写入 `public/output`。

这些做法在本机开发可能能跑，但不满足 Vercel 部署要求。

### 3.2 推荐服务拆分

新增一个“媒体处理 worker 服务”，部署在适合长任务和二进制依赖的环境，例如：

- Google Cloud Run
- Fly.io
- Railway
- Render
- Modal
- RunPod
- 自托管 VPS / Docker

worker 镜像内安装：

- ffmpeg / ffprobe
- Python
- scenedetect
- opencv-python-headless

Vercel 只保留轻量 API：

```txt
POST /api/video/clip-jobs
GET  /api/video/clip-jobs/[jobId]
```

这些 API 的职责：

- 校验请求。
- 获取用户侧可访问的源视频 URL。
- 调用 worker 创建任务。
- 查询 worker 或数据库中的任务状态。
- 把 worker 返回的结果透传给前端。

### 3.3 任务状态不要放内存

智能剪辑可能运行较久，状态必须放在持久层。GenLink 已有 Prisma / libsql，可选：

- 使用现有 Prisma 数据库建 `MediaJob` 表。
- 或 worker 自己维护 job 存储，Vercel 只代理查询。

推荐最小表结构：

```prisma
model MediaJob {
  id        String   @id
  kind      String   // cut | smart_clip
  status    String   // queued | running | done | error
  stage     String?
  progress  Float    @default(0)
  error     String?
  payload   Json?
  result    Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

如果 worker 已提供可靠 job API，也可以不在 GenLink DB 复制状态，只保存必要的映射和审计字段。

## 4. 源视频规范化

裁剪前必须把源视频变成 worker 能读取的 URL。

### 4.1 远程 URL / OSS URL

如果 `videoUrl` 或 `hostedVideoUrl` 是 `https://...`，可以直接传给 worker。

注意：

- worker 要能访问该 URL。
- 如果 URL 有鉴权或过期，需要先换成短期签名 URL。
- worker 应限制可访问协议为 `https`，避免 SSRF 风险。

### 4.2 `blob:` URL / 当前项目 output 文件

`blob:` URL 只存在于浏览器会话，Vercel 和 worker 都读不到。

处理流程：

1. 前端 `fetch(blobUrl)` 得到 Blob。
2. 调用现有 `/api/media-hosting/upload-url` 获取 OSS 预签名 PUT URL。
3. 前端 PUT 上传 Blob。
4. 使用返回的 `mediaUrl` 作为 worker 输入 URL。

这个流程也适用于当前项目 `output` 恢复出来的 `blob:` 预览视频。

### 4.3 本地上传视频

如果用户刚上传时只有本地对象 URL，也走 4.2 上传。

为了减少重复上传，建议在视频节点 data 中增加可选字段：

```ts
processingSourceUrl?: string;
processingSourceObjectKey?: string;
```

首次上传到 OSS 后缓存这个 URL。后续裁剪同一视频优先复用，避免每次裁剪都重新上传。

如果不想扩展节点字段，也可以先做无缓存版本，功能正确但大文件体验较差。

## 5. 后端 API 契约

### 5.1 创建单段裁剪任务

```http
POST /api/video/clip-jobs
Content-Type: application/json
```

```json
{
  "kind": "cut",
  "sourceUrl": "https://...",
  "start": 1.2,
  "end": 4.2,
  "fps": 24
}
```

响应：

```json
{
  "ok": true,
  "jobId": "clip_..."
}
```

### 5.2 创建智能剪辑任务

```json
{
  "kind": "smart_clip",
  "sourceUrl": "https://...",
  "options": {
    "mode": "stable",
    "maxSegments": 20,
    "fps": 24
  }
}
```

### 5.3 查询任务状态

```http
GET /api/video/clip-jobs/[jobId]
```

运行中：

```json
{
  "ok": true,
  "jobId": "clip_...",
  "status": "running",
  "stage": "cut",
  "progress": 0.42,
  "doneCount": 3,
  "total": 8
}
```

完成：

```json
{
  "ok": true,
  "jobId": "clip_...",
  "status": "done",
  "segments": [
    {
      "index": 1,
      "url": "https://oss.example.com/clip/result.mp4",
      "start": 1.2,
      "end": 4.2,
      "duration": 3.0,
      "fps": 24,
      "width": 1280,
      "height": 720,
      "sizeBytes": 1234567,
      "mimeType": "video/mp4"
    }
  ]
}
```

失败：

```json
{
  "ok": false,
  "status": "error",
  "error": "FFmpeg processing failed"
}
```

## 6. Worker 职责

worker 执行原规格中的核心媒体逻辑：

### 6.1 单段裁剪

```bash
ffmpeg -y -i <source> -ss <start> -t <end-start> \
  -c:v libx264 -preset fast -c:a aac [-r <fps>] <out>
```

要求：

- `-ss` 放在 `-i` 后面，保证精确裁剪。
- 使用 `-t`，不要用 `-to`。
- 重新编码，不使用 `-c copy`。
- `fps` 仅接受 16 / 24 / 30；否则由 ffprobe 探测。

### 6.2 智能剪辑

沿用原规格：

- PySceneDetect `ContentDetector`
- OpenCV 黑场检测
- `stable / balanced / sensitive` 三档
- 自动降级链
- 合并到 `maxSegments <= 25`
- 每段用 ffmpeg 重编码输出

worker 输出每段的远程可下载 URL 和元数据。

### 6.3 安全要求

worker 必须做：

- 限制输入 URL 协议为 `https`。
- 限制最大文件大小和最大时长。
- 限制 ffmpeg 执行超时。
- 对下载文件做 MIME / ffprobe 校验。
- 不允许任意本地路径输入。

## 7. 前端组件落点

### 7.1 目录建议

```txt
src/
├─ app/api/video/clip-jobs/route.ts
├─ app/api/video/clip-jobs/[jobId]/route.ts
├─ components/video-clip/
│  ├─ VideoClipOverlay.tsx
│  ├─ VideoClipBar.tsx
│  ├─ SmartClipPanel.tsx
│  ├─ useClipDrag.ts
│  ├─ useClipKeyboard.ts
│  ├─ useClipThumbnails.ts
│  ├─ usePlayheadLoop.ts
│  └─ videoClip.css
├─ lib/video/
│  ├─ clip-client.ts
│  ├─ source-upload.ts
│  └─ constants.ts
└─ store/video-clip-store.ts
```

### 7.2 React Flow 包名

GenLink 当前使用：

```ts
import { useReactFlow, useViewport } from "reactflow";
```

不要使用：

```ts
import { useReactFlow } from "@xyflow/react";
```

### 7.3 挂载方式

推荐把裁剪 UI 挂在 `InfiniteCanvas.tsx` 的 React Flow 内部，作为基于当前视频节点 bounds 的 overlay。

进入裁剪模式时：

- 设置 `videoClipStore.active = true`
- 记录 `nodeId`
- 聚焦到该节点，可复用现有 `getViewportForBounds / setViewport` 风格
- 禁用其它画布交互或对非目标节点降透明度

不要直接照搬 AI-CanvasPro 的 `appendChild` 单例控制器。

## 8. 前端交互规格

时间轴行为沿用原规格：

- 默认选区 3s。
- 最小选区 0.1s。
- 左右边缘命中范围 20px。
- 双击选区恢复 3s，距边缘 24px 内忽略。
- 键盘 / 滚轮步进按 30fps 计算。
- Space 做区间循环预览。
- Esc 退出裁剪模式。
- 缩略图离屏 `<video>` + canvas 生成 10 张，失败不影响裁剪。

注意：

- 如果视频源是跨域 URL，缩略图 canvas 可能因 CORS 被污染。失败时静默降级即可。
- `UploadedVideoNode` 当前 `<video controls>` 会吃掉部分事件，裁剪模式下应隐藏 controls 或阻止非裁剪交互。

## 9. 裁剪完成后的项目 output 写入

worker 只返回远程结果 URL。前端拿到结果后必须写回当前项目 output。

建议新增一个 store action：

```ts
createVideoNodeFromProcessedResult(params: {
  sourceNodeId: string;
  title: string;
  resultUrl: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mimeType?: string;
  position?: { x: number; y: number };
}): Promise<string>
```

内部流程：

1. 下载 `resultUrl` 为 Blob。
2. 调用扩展后的 `persistGeneratedOutput(..., { kind: "video" })` 或 `persistVideoOutput()`。
3. 得到 `{ fileName, previewUrl }`。
4. 创建 `type: "video"` 节点：

```ts
{
  id: crypto.randomUUID(),
  type: "video",
  position,
  data: {
    title,
    videoUrl: previewUrl,
    hostedVideoUrl: previewUrl,
    fileName,
    outputFileName: fileName,
    width: width ?? 1280,
    height: height ?? 720,
    durationSeconds,
    sizeBytes,
    mimeType: mimeType ?? "video/mp4",
  },
}
```

5. `addNode` / `addNodes`，选中新节点，标记 dirty。
6. 聚焦原节点和新节点。

智能剪辑则对 `segments` 批量执行上述流程，最后批量选中所有新节点。

## 10. 提取视频帧

提取视频帧不需要 worker。

流程：

1. 读取目标视频当前帧到 canvas。
2. `canvas.toBlob("image/png")`。
3. 复用现有图片输出持久化，把 blob 写入当前项目 `output`。
4. 创建 `type: "image"` 节点，而不是 `uploaded_image`。

如果跨域视频导致 canvas 被污染：

- 对 `blob:` / 同源视频直接本地截帧。
- 对远程 OSS 视频需要确保 CORS 允许 canvas 读取。
- 如果仍失败，提示用户“该视频源不允许浏览器截帧”，不要阻塞裁剪功能。

## 11. API 与环境变量

Vercel 环境变量建议：

```txt
MEDIA_WORKER_BASE_URL=https://media-worker.example.com
MEDIA_WORKER_TOKEN=...
ALIYUN_VIDEO_OSS_BUCKET=...
ALIYUN_VIDEO_OSS_REGION=...
ALIYUN_VIDEO_OSS_ACCESS_KEY_ID=...
ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET=...
ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL=...
```

现有 `/api/media-hosting/upload-url` 可继续用于源视频上传。结果视频由 worker 写入对象存储，前端再下载写回项目 output。

## 12. 实施顺序

### 第一步：补项目 output 对 `type: "video"` 的持久化

- 扩展 `project-storage.ts`。
- 验证手动创建的 `video` 节点保存项目后，重新打开仍能播放。

### 第二步：实现源视频规范化

- 写 `ensureProcessingSourceUrl(videoNode)`。
- 支持 `https:` 直传。
- 支持 `blob:` 上传到 OSS。
- 可选缓存 `processingSourceUrl`。

### 第三步：接入 worker 的单段裁剪

- 新增 `/api/video/clip-jobs` 和 `/api/video/clip-jobs/[jobId]`。
- 先只支持 `kind: "cut"`。
- 前端确认裁剪后轮询结果。
- 结果写入当前项目 output 并创建 `type: "video"` 节点。

### 第四步：实现完整裁剪 UI

- `VideoClipBar`
- 拖动 / 键盘 / 滚轮
- 缩略图
- 播放头区间循环
- 裁剪模式视觉隔离

可以先用简化 UI 跑通链路，再补齐原规格的视觉细节。

### 第五步：智能剪辑

- worker 支持 `kind: "smart_clip"`。
- 前端 `SmartClipPanel` 创建任务并轮询。
- 多段结果批量写入项目 output。

### 第六步：提取视频帧

- 本地 canvas 截帧。
- 写入项目 output。
- 创建 `type: "image"` 节点。

## 13. 验证清单

- [ ] `video` 节点的 output 文件能保存并在重新打开项目后恢复播放。
- [ ] 本地上传视频、AI 生成视频、OSS/远程视频都能进入裁剪流程。
- [ ] `blob:` 源视频会先上传到对象存储，worker 不会收到 `blob:` URL。
- [ ] Vercel Route Handler 不直接运行 ffmpeg / Python。
- [ ] 单段裁剪结果时长约等于 `end - start`。
- [ ] 智能剪辑完成后生成多个 `video` 节点，并全部写入当前项目 output。
- [ ] 退出裁剪模式时停止轮询、清理事件监听和 RAF。
- [ ] 缩略图失败不会影响确认裁剪。
- [ ] 提取视频帧对 CORS 失败有明确提示。

## 14. 与原 AI-CanvasPro 方案的差异

| 方面 | AI-CanvasPro | GenLink / Vercel 版 |
|---|---|---|
| 后端执行 | 本地 Python server 直接跑 ffmpeg | 外部媒体 worker 跑 ffmpeg |
| 任务状态 | Python 内存字典 | worker/数据库持久状态 |
| 输出目录 | 服务端 `output/...` | 浏览器写入当前项目 `output` |
| 视频节点 | `source-video` + `localPath` | `type: "video"` + `outputFileName` |
| 前端实现 | 命令式单例 DOM 注入 | React Flow overlay + Zustand |
| 部署 | 本地服务 | Vercel + 外部 worker |

行为数学和交互细节可以沿用原规格，但文件路径、任务执行、节点类型、持久化模型必须按本文调整。
