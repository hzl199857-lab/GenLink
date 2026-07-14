# Comfly Midjourney 基础接入设计

## 目标

在 GenLink 现有 Comfly 图片生成能力中增加 Midjourney，首版只支持：

- Imagine 文生图。
- 通过 `base64Array` 提交一张或多张参考图。
- 展示 Midjourney 返回的四宫格总图。
- 用户直接点击四宫格中的一个分区，执行对应的 U1～U4 动作并获得独立高清单图。

首版不支持 V1～V4、Reroll、Zoom、Pan、Describe、Blend、Modal、局部重绘或其他 Midjourney 按钮操作。

## 产品行为

### 模型选择

Comfly 的图片模型列表增加 `midjourney`，展示名称为 `Midjourney`。它仍使用用户已配置的 Comfly API Key，但服务端根据模型选择 Midjourney 专用 `/mj/*` 协议，而不是现有 OpenAI 兼容 `/images/*` 协议。

### 初始生成

用户可以仅输入提示词进行文生图，也可以连接或上传一张或多张参考图进行参考生图。

服务端提交：

```http
POST {COMFLY_MIDJOURNEY_BASE_URL}/mj/submit/imagine
Authorization: Bearer <COMFLY_API_KEY>
Content-Type: application/json
```

```json
{
  "prompt": "cinematic portrait --ar 16:9",
  "base64Array": ["data:image/png;base64,..."]
}
```

无参考图时 `base64Array` 为 `[]`。参考图复用现有图片读取能力，将 Data URL、本地项目图片或 HTTP 图片读取为字节，并转换为包含 MIME 类型的 Data URL。

### 比例参数

Midjourney 不接收现有的像素尺寸参数。服务端将画布节点的 `aspectRatio` 转换为 prompt 中的 `--ar <ratio>`。

- 如果 prompt 已包含 `--ar` 或 `--aspect`，不重复追加。
- `auto` 不追加比例参数。
- 画质、输出格式、内容审核等 OpenAI 图片参数不发送给 Midjourney。
- 首版不自动追加 `--v`，因为 Comfly 文档没有声明可用的 Midjourney 版本列表。

### 四宫格结果

初始 Imagine 成功时，Comfly 返回单个 `imageUrl`，该图片是一张四宫格总图。服务端同时保存：

- Midjourney 上游任务 ID。
- 任务状态和进度。
- 返回按钮中 U1、U2、U3、U4 对应的 `customId`。
- 四宫格图片的稳定项目存储地址。

图片节点用一张图片展示四宫格。当且仅当 U1～U4 四个动作均可用时，节点进入“可选择”状态。

### 方案 A：图片四分区点击

四宫格图片上覆盖四个等大的透明交互区域：

| 区域 | 动作 |
| --- | --- |
| 左上 | U1 |
| 右上 | U2 |
| 左下 | U3 |
| 右下 | U4 |

悬停时只显示轻量边框、遮罩和编号，不改变图片内容。点击后锁定重复操作并显示该分区正在生成。键盘用户可以通过四个可聚焦按钮完成相同操作，按钮需要中文可访问名称，例如“选择左上图片并生成高清图”。

### 高清单图生成

用户点击分区后，服务端提交：

```http
POST {COMFLY_MIDJOURNEY_BASE_URL}/mj/submit/action
```

```json
{
  "taskId": "原始 Imagine 任务 ID",
  "customId": "对应 U1～U4 的 customId"
}
```

Action 返回新的任务 ID。GenLink 使用相同的 `/mj/task/{id}/fetch` 接口轮询新任务，成功后把高清单图设为节点当前主结果，并将四宫格保留在生成历史中。高清单图也必须立即写入项目媒体存储。

如果 Action 返回 `code=21` 或任务状态为 `MODAL`，首版显示“该操作需要 Midjourney 高级交互，当前版本暂不支持”，不调用 Modal。

## 架构

### Midjourney 协议模块

新增聚焦的服务端模块 `src/lib/comfly-midjourney.ts`，负责：

- 组装 Imagine prompt。
- 将参考图片转换成 `base64Array`。
- 提交 Imagine。
- 提交 U1～U4 Action。
- 查询和解析任务。
- 从按钮列表中提取 U1～U4。
- 将 Comfly 错误码和任务状态转换为稳定的内部结果。

模块使用依赖注入的请求函数或可替换的 fetch，以便单元测试不访问真实 API。现有 `src/lib/vibe.ts` 继续负责其他模型，不把 Midjourney 的协议细节继续堆入该文件。

### API Route 和任务恢复

`src/app/api/ai/image/route.ts` 继续作为统一图片任务入口。请求的产品 provider 仍为 `comfly`；当模型为 `midjourney` 时，路由选择 Midjourney 提交和轮询逻辑。

ImageJob 的 `provider` 是普通字符串。Midjourney 上游任务保存为内部值 `comfly-midjourney`，使任务恢复时能够区分：

- `comfly`：查询 `/images/tasks/{id}`。
- `comfly-midjourney`：查询 `/mj/task/{id}/fetch`。

不需要 Prisma schema 迁移。上游任务 ID 继续使用现有 `upstreamTaskId` 字段。

统一图片任务结果增加可选的 Midjourney 元数据，包含 Imagine 任务 ID、四宫格状态和 U1～U4 动作。普通图片模型不产生这些字段。

为 U1～U4 增加聚焦的写接口。接口校验当前任务属于 Midjourney、动作只允许 U1～U4，并从服务端已保存的数据中取得 `customId`，不信任客户端自由提交任意 Midjourney `customId`。

### 节点数据和 UI

`ImageGenerationNodeData` 增加可选的 Midjourney 选择元数据，至少包含：

- 原始 Imagine 任务 ID。
- 当前四宫格图片地址。
- 可用的 U1～U4 动作。
- 当前正在执行的分区。
- 已选分区。

透明四分区 UI 放在 `src/components/nodes/` 的聚焦组件中，由 `ImageGenerationNode` 组合使用。它不进入 `InfiniteCanvas.tsx`。

四分区只在以下条件同时满足时出现：

- provider 为 `comfly`。
- model 为 `midjourney`。
- 当前展示的是初始四宫格。
- U1～U4 动作完整可用。
- 节点没有正在执行高清任务。

## 数据流

```text
图片节点运行
  -> POST /api/ai/image
  -> Midjourney Imagine
  -> 保存 ImageJob(comfly-midjourney + upstreamTaskId)
  -> 轮询 /mj/task/{id}/fetch
  -> 缓存四宫格图片并保存 U1～U4
  -> 节点展示四分区
  -> 用户点击一个分区
  -> 服务端校验并提交 Action
  -> 保存新的高清任务
  -> 轮询任务
  -> 缓存高清单图
  -> 更新节点主结果并保留四宫格历史
```

## 错误处理

提交返回码：

- `1`：提交成功。
- `22`：进入队列，作为成功提交处理。
- `23`：队列已满，显示可重试错误。
- `24`：提示词包含敏感内容，显示不可重试错误。
- 其他返回码：使用 Comfly 的 `description` 作为安全的中文错误详情。

任务状态：

- `NOT_START`、`SUBMITTED`、`IN_PROGRESS`：继续轮询。
- `SUCCESS`：必须存在 `imageUrl`，否则视为上游无结果错误。
- `FAILURE`、`CANCEL`：终止任务并返回 `failReason`。
- `MODAL`：基础版终止并提示暂不支持高级交互。

轮询继续使用现有超时和任务恢复机制。任何远程结果图片在任务完成前缓存到项目媒体存储，避免长期依赖 Discord 或临时代理 URL。

## 安全与约束

- API Key 只在服务端请求头中使用，不写入日志、节点数据或任务结果。
- 客户端只能提交分区编号 1～4，不能提交自由格式 `customId`。
- 服务端校验任务归属和模型类型，读接口不修改任务。
- 日志只记录 provider、模型、任务 ID、状态和耗时，不记录 base64 图片或完整 prompt。
- Midjourney Base URL 独立配置为 `COMFLY_MIDJOURNEY_BASE_URL`，默认从 Comfly 图片 Base URL 去掉末尾 `/v1` 后得到；部署环境可以显式覆盖。

## 测试与验收

### 单元测试

- prompt 在没有比例参数时追加 `--ar`。
- prompt 已有 `--ar` 或 `--aspect` 时不重复追加。
- 一张和多张参考图正确转换为 Data URL 数组。
- Imagine 的 `code=1`、`22`、`23`、`24` 正确映射。
- 查询状态正确区分 pending、success、failure、cancel 和 modal。
- U1～U4 从乱序 buttons 中正确提取。
- 缺少某个 U 按钮时不启用四分区。
- 分区 1～4 映射到 U1～U4；其他值被拒绝。
- 普通 Comfly 图片模型继续走 `/images/*`。
- Midjourney 恢复任务继续走 `/mj/task/*`。

### 组件测试

- 四个透明按钮位于正确象限。
- 悬停和键盘聚焦可见。
- 点击时只提交对应分区。
- 生成中禁用重复点击。
- 高清结果完成后隐藏四分区并展示独立图片。

### 项目验证

- 运行相关 `*.test.ts`。
- 运行 `npx tsc --noEmit`。
- 运行 `npm run lint`。
- 手动验证文生图、单参考图、多参考图、点击四个象限中的至少两个，以及刷新后任务恢复。

## 完成标准

- 用户能在 Comfly 下选择 Midjourney。
- 文生图和参考生图均能得到可持久化的四宫格结果。
- 用户可直接点击四宫格任一分区并得到对应高清单图。
- 刷新页面后仍可恢复等待中的 Imagine 或高清任务。
- 其他图片 provider 和 Comfly 现有模型行为不发生回归。
