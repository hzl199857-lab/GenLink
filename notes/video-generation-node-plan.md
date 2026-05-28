# 视频生成节点实现方案

这份文档整理了本次关于“在 GenLink 画布中新增视频生成节点”的全部讨论结论。当前分支是：

```text
codex/video-generation-node
```

目标是在这个分支里实现视频生成节点，和 `master` 隔离，避免影响主分支。

## 目标

新增一个画布节点，用于调用 Comfly 的 Seedance 2.0 视频模型生成视频。

当前确认的模型 ID 是：

```text
doubao-seedance-2-0-260128
```

视频节点的交互应该参考现有图像生成节点：画布上显示一个紧凑的结果卡片，节点被选中后，下方出现 prompt bar，在里面选择 provider、model、生成模式和各项参数。

## 文档和证据

本次查阅的 Comfly / Apifox 文档入口：

- API 索引：https://gpt-best.apifox.cn/llms.txt
- Seedance 文生视频：https://gpt-best.apifox.cn/api-343444777.md
- Seedance 图生视频：https://gpt-best.apifox.cn/api-343464094.md
- Seedance 首尾帧图生视频：https://gpt-best.apifox.cn/api-343464933.md
- Seedance 查询任务：https://gpt-best.apifox.cn/api-343444780.md
- Seedance 官方格式创建任务：https://gpt-best.apifox.cn/api-343680647.md
- Seedance 官方格式查询任务：https://gpt-best.apifox.cn/api-343680865.md

用户从 Comfly 模型页确认，Seedance 2.0 的模型 ID 是：

```text
doubao-seedance-2-0-260128
```

Comfly 模型页展示的相关接口包括：

```text
GET  https://ai.comfly.org/seedance/v3/contents/generations/tasks/{task_id}
GET  https://ai.comfly.org/v2/videos/generations/{task_id}
POST https://ai.comfly.org/seedance/v3/contents/generations/tasks
POST https://ai.comfly.org/v2/videos/generations
```

重要结论：

- “全能参考”不是 Apifox 文档里的独立接口名。
- 但 Seedance 官方格式接口支持 `content[]`，可以放文本、图片 URL、视频 URL、音频 URL。
- 所以“全能参考”可以作为前端产品模式，底层走官方格式接口。

## 前端模式设计

底层能力可以理解成两类：

1. 全能参考：通过 Seedance 官方格式接口，支持文本、图片、视频、音频等参考内容。
2. 首尾帧：明确用第一帧和最后一帧约束视频过程，是一个特殊工作流。

但前端建议不要只露出两个模式。用户在画布上关心的是“我要做什么”，不是 API 分类，所以建议提供 4 个入口：

```text
文生视频
图生视频
全能参考
首尾帧
```

对应关系：

| 前端模式 | 输入要求 | 推荐接口 |
| --- | --- | --- |
| 文生视频 | 只需要提示词 | 官方格式接口，`content[]` 里只放文本 |
| 图生视频 | 提示词 + 1 张图片 | 官方格式接口，`content[]` 里放文本和 `image_url` |
| 全能参考 | 提示词 + 多张图 / 视频 / 音频参考 | 官方格式接口，`content[]` 里放文本、图片、视频、音频 |
| 首尾帧 | 提示词 + 严格 2 张图片 | 可先走 `/v2/videos/generations`，或等官方格式契约确认后走官方格式 |

设计原则：

- “全能参考”是产品侧名字，不要假设 Comfly 有一个同名 API。
- 前三种模式都可以走同一套官方格式 builder，只是输入数量和 UI 限制不同。
- “首尾帧”单独保留，因为它的语义比普通参考更强，用户需要明确知道两张图分别是首帧和尾帧。

## 需要映射的 API 参数

核心请求参数：

| 前端字段 | API 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| 服务商 | 内部 `provider` | string | 初期固定为 `comfly` |
| 模型 | `model` | string | `doubao-seedance-2-0-260128` |
| 提示词 | `prompt` 或 `content[]` 的文本项 | string | 必填 |
| 模式 | 内部 `mode` | enum | 决定请求 builder 和输入校验 |
| 参考图 | `images` 或 `content[].image_url.url` | string[] | 必须是公网可访问 URL |
| 参考视频 | `content[].video_url.url` | string[] | 官方格式支持，必须是公网可访问 URL |
| 参考音频 | `content[].audio_url.url` | string[] | 官方格式支持时使用 |
| 时长 | `duration` | integer/string | 文档里有 `5`、`10`，默认先用 `5` |
| 分辨率 | `resolution` | string | `480p`、`720p`、`1080p` |
| 比例 | `ratio` | string | `21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`9:21`、`keep_ratio`、`adaptive` |
| 水印 | `watermark` | boolean | 默认 `false` |
| 随机种子 | `seed` | integer | 可选，范围 `0` 到 `2147483647` |
| 固定镜头 | `camerafixed` | boolean | 默认 `false` |
| 返回尾帧 | `return_last_frame` | boolean | 查询结果中读取 `last_frame_url` |
| 生成音频 | `generate_audio` | boolean | 用于带音效的视频生成 |

统一格式查询结果需要映射：

| 前端字段 | 返回字段 |
| --- | --- |
| 任务 ID | `task_id` |
| 状态 | `status`: `NOT_START`、`IN_PROGRESS`、`SUCCESS`、`FAILURE` |
| 进度 | `progress` |
| 视频 URL | `data.output` |
| 尾帧 URL | `data.last_frame_url` |
| 实际时长 | `data.duration` |
| 实际比例 | `data.ratio` |
| 实际分辨率 | `data.resolution` |
| 实际 seed | `data.seed` |
| 失败原因 | `fail_reason` |
| 用量 | `data.usage` |

官方格式查询结果可能是：

```text
id
model
status
content.video_url
usage
created_at
updated_at
```

后端需要把统一格式和官方格式的查询结果都归一化成同一套前端结果。

## 节点数据结构建议

新增一个视频生成节点类型，例如：

```ts
type VideoGenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "all-reference"
  | "first-last-frame";
```

建议的节点数据：

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

## 画布上的摆放方式

视频节点应参考现有图像生成节点，不要做成一个大表单。

推荐结构：

1. 顶部标题：视频图标 + 可编辑标题，默认 `Video` 或 `Seedance Video`。
2. 中间卡片：视频预览区域，默认 `16:9`。
3. 空状态：显示视频图标，不显示大段说明。
4. 生成中：使用和图像生成节点类似的 running border。
5. 生成完成：卡片内直接渲染 `<video controls>`。
6. 左侧连接点：接收图片、视频、音频、文本等参考输入。
7. 右侧连接点：输出生成的视频结果。
8. 上方浮动工具栏：未生成时支持上传参考素材；生成后支持下载、复制链接、加入素材库、放大查看。
9. 下方 prompt bar：节点被选中时显示，和图像生成节点一致。

Prompt bar 从左到右建议是：

```text
[参考素材缩略图] [Prompt 输入区] [Comfly / Model] [模式] [参数] [高级] [运行]
```

## 视觉和菜单样式要求

视频节点的整体视觉样式以当前图像生成节点为准，而不是重新做一套新的视觉语言。包括：

- 节点标题、圆角、边框、阴影、选中态、生成中状态，都沿用图像生成节点的设计。
- 下方 prompt bar 的高度、暗色半透明背景、按钮圆角、hover 状态、浮层阴影，都参考图像生成节点。
- 参数浮层的大概布局参考用户给的截图：集中式暗色面板，分组标题较弱，选项用 segmented control / pill button 表示。
- 具体参数不照抄截图，只参考它的布局方式；参数内容以本项目和 Comfly Seedance 2.0 实际需要为准。

模型选择菜单必须和图像生成节点保持一致：

```text
一级菜单：Provider
二级菜单：Model
```

也就是说，用户点击模型区域后，左侧先选择 provider，例如：

```text
Comfly
```

右侧再选择该 provider 下的视频模型，例如：

```text
doubao-seedance-2-0-260128
```

即使第一版只有 Comfly 一个 provider，也要保留这个两级菜单结构，方便后续增加其他视频 provider。

参数菜单放高频选项：

```text
比例: 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 / 9:21 / keep_ratio / adaptive
分辨率: 480p / 720p / 1080p
时长: 5s / 10s
```

高级菜单放低频选项：

```text
Seed
固定镜头
水印
返回尾帧
生成音频
```

模式校验规则：

| 模式 | 校验 |
| --- | --- |
| 文生视频 | 必须有提示词 |
| 图生视频 | 必须有提示词和至少 1 张图 |
| 全能参考 | 可以只有提示词，也可以附加图、视频、音频 |
| 首尾帧 | 必须有提示词和严格 2 张图，并区分首帧、尾帧 |

## OSS 设置

用户选择新建独立的视频 OSS bucket，而不是复用图片 bucket。

已创建：

```text
Bucket: genlink-video
Region: oss-cn-guangzhou
公网地址: https://genlink-video.oss-cn-guangzhou.aliyuncs.com
```

bucket 设置为公共读。已经手动上传 MP4，并在无痕浏览器里能触发下载，说明公网可访问。

随后用 PowerShell 验证：

```powershell
Invoke-WebRequest -Uri "https://genlink-video.oss-cn-guangzhou.aliyuncs.com/<file>.mp4" -Method Head -UseBasicParsing
```

返回：

```text
StatusCode: 200
StatusDescription: OK
```

这说明 Comfly 拉取参考视频所需的公网访问条件已经满足。

OSS CORS 已按以下来源配置：

```text
http://localhost:3000
http://127.0.0.1:3000
https://zerinnai.online
https://www.zerinnai.online
https://zerinn-workflow-studio.vercel.app
https://zerinn-workflow-studio-lgwki8dmj-zerinns-projects.vercel.app
```

允许方法：

```text
GET
POST
PUT
HEAD
```

允许 Headers：

```text
*
```

暴露 Headers：

```text
ETag
x-oss-request-id
```

缓存时间：

```text
600
```

`Vary: Origin` 建议开启。

## 环境变量

保留现有图片 OSS 配置不动，新增视频 OSS 配置，避免影响已有图片生成链路。

本地 `.env` 和 Vercel 环境变量都需要增加：

```env
ALIYUN_VIDEO_OSS_BUCKET=genlink-video
ALIYUN_VIDEO_OSS_REGION=oss-cn-guangzhou
ALIYUN_VIDEO_OSS_ACCESS_KEY_ID=<可以复用现有图片 OSS 的 AccessKey>
ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET=<可以复用现有图片 OSS 的 Secret>
ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL=https://genlink-video.oss-cn-guangzhou.aliyuncs.com
```

## 媒体托管实现方案

现有图片托管链路是图片专用：

- `src/app/api/image-hosting/upload-url/route.ts` 只允许 `image/*`。
- `src/lib/image-host.ts` 命名和逻辑都是 image-oriented。
- 服务端转存有 `20MB` 限制，不适合视频。

不要直接改坏图片 API。建议新增媒体托管接口。

建议新增：

```text
POST /api/media-hosting/upload-url
POST /api/media-hosting/upload
```

第一版优先做浏览器直传 OSS：

```text
用户选择视频
前端请求 /api/media-hosting/upload-url 获取 OSS signed PUT URL
前端用 PUT 把文件直接上传到 OSS
接口返回公网媒体 URL
视频生成请求把这个 URL 传给 Comfly
```

允许 MIME 类型：

```text
image/*
video/*
audio/*
```

推荐 OSS 目录前缀：

```text
references/images
references/videos
references/audio
generated/videos
generated/frames
```

视频上传时要显式带：

```text
Content-Type: video/mp4
```

这样浏览器和 Comfly 都更容易识别。

## 后端视频 API

新增视频生成 API，不要混进图片生成 API。

建议：

```text
POST /api/ai/video
GET  /api/ai/video?jobId=...
```

或者参考现有图片生成 job 的模式来设计。

后端职责：

1. 校验 provider 必须是 `comfly`。
2. 默认模型为 `doubao-seedance-2-0-260128`。
3. 根据模式校验输入素材。
4. 构造官方格式或统一格式请求。
5. 提交任务到 Comfly。
6. 轮询任务状态，或提供轮询接口给前端。
7. 归一化返回结果。
8. 如果 Comfly 返回的视频 URL 是临时 URL，转存到 `genlink-video` 的 `generated/videos`。

官方格式请求示例：

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

统一格式请求示例：

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

## 实现顺序

建议按这个顺序做：

1. 新增视频生成节点类型和媒体引用类型。
2. 在 `.env.example` 增加视频 OSS 环境变量。
3. 新增媒体托管 helper，支持视频 OSS bucket。
4. 新增 `/api/media-hosting/upload-url`，允许 `image/*`、`video/*`、`audio/*`。
5. 新增 Comfly Seedance 视频 API helper。
6. 新增 `/api/ai/video`，支持提交和查询。
7. 新增 `VideoGenerationNode`。
8. 新增 `VideoGenerationPromptBar`。
9. 在 React Flow node renderer 里注册视频节点。
10. 在添加节点菜单里加入视频生成节点。
11. 增加项目保存和加载时的视频节点序列化/反序列化。
12. 测试上传、提交任务、轮询、预览、保存、重载。

## 验证清单

实现完成后需要确认：

- 本地 MP4 可以通过 signed PUT 上传到 `genlink-video`。
- 上传后的 URL 未登录访问返回 HTTP 200。
- 画布可以新增视频生成节点。
- 选中视频节点后才显示下方 prompt bar。
- provider/model 控件显示 Comfly 和 `doubao-seedance-2-0-260128`。
- 文生视频只校验提示词。
- 图生视频校验提示词和至少一张图片。
- 首尾帧校验严格两张图片。
- 全能参考支持图片和视频参考。
- 提交后能拿到 task ID。
- 轮询能显示进度和最终状态。
- 生成完成后视频能在节点卡片内播放。
- 下载和复制 URL 可用。
- 项目保存并重新打开后，视频节点状态不丢失。

## 风险和注意事项

- “全能参考”是产品侧命名，不是文档里的接口名。实现依据是官方格式接口支持多模态 `content[]`。
- 如果 Comfly 后续修改 Seedance 2.0 模型 ID，模型列表最好做成可配置，不要永久硬编码单个模型。
- 如果 Comfly 返回的视频 URL 有过期时间，必须转存到自己的视频 OSS bucket。
- 不要破坏现有图片上传和图片生成链路。
- 公共读 bucket 是第一版最稳的实现方式。私有 bucket + 临时签名 URL 更安全，但 Comfly 拉取时可能因为签名过期失败。
