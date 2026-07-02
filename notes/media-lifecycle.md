# GenLink 媒体生命周期规则

本文档定义 GenLink 中图片、视频、音频和其他生成媒体的生命周期。这里吸收了 `E:\infinite-canvas` 最值得复用的一点：项目元数据应引用稳定媒体身份，临时预览 URL 只属于当前会话。

## 目标

保持画布快照小、可迁移、可长期保存，同时让浏览器能立即展示生成结果。

GenLink 已经通过 `src/lib/project-storage.ts` 持久化项目文件，并通过 `persistGeneratedOutput` 保存生成产物。本文档进一步明确 project JSON、output 文件、托管 URL 和临时 object URL 的边界。

## 媒体身份层级

同一个媒体可能同时有多个标识，这些标识不能混用。

| 层级 | 示例 | 用途 | 是否长期有效 |
| --- | --- | --- | --- |
| 项目输出文件 | `output/image-node-abc.png` | 项目本地持久文件 | 是 |
| 托管 URL | `https://.../file.png` | 可分享的远程结果 | 如果服务商保证稳定，则是 |
| Source key | 服务商 task id 或生成 key | 去重和历史查询 | 是 |
| Object URL | `blob:http://localhost...` | 当前浏览器标签页预览 | 否 |
| Data URL | `data:image/png;base64,...` | 临时 API 传输或粘贴输入 | 不应长期写入快照 |

项目快照应优先保存持久文件名、source key、尺寸、mime type、文件大小、模型和 prompt 元数据。object URL 应在打开项目时重新生成。

## 节点数据规则

画布节点数据可以为了渲染保留 preview 字段，但写入 `project.json` 前应剥离或规范化临时字段。

建议为生成类媒体节点保存如下持久字段：

```ts
type PersistedMediaRef = {
  kind: "image" | "video" | "audio";
  outputFileName?: string;
  hostedUrl?: string;
  sourceKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  model?: string;
  createdAt?: string;
};
```

`previewUrl`、`imageUrl`、`videoUrl`、`audioUrl` 或 object URL 这类运行时预览字段可以在应用打开期间存在，但快照生成应走现有清理 helper，例如 `stripEmbeddedImageDataFromNodeData`。

## 写入流程

生成或上传媒体应遵循以下顺序：

1. 接收服务商 URL、上传文件、blob 或 data URL。
2. 只有在需要时才解析成 `Blob`。
3. 推断媒体类型、扩展名、mime type、尺寸、时长和大小。
4. 使用 `sanitizeFileStem` 清理文件名主体。
5. 通过 `persistGeneratedOutput` 或对应上传 / 存储 helper 持久化文件。
6. 将持久元数据写入节点和 output history。
7. 只为当前 UI 渲染保存临时预览 URL。
8. 通过 `saveProjectSnapshot` 保存项目快照。

这样可以让生成产物、节点状态和历史记录保持一致。

## 读取流程

打开项目时：

1. 读取 `project.json`。
2. 读取 output history。
3. 从项目 output 文件重新补水预览 URL。
4. 只把 hosted URL 当作长期远程引用保留。
5. 忽略旧快照里的过期 `blob:` URL。
6. 如果存在历史遗留的内嵌 data URL，应尽量在下次保存前迁移成项目文件。

当前适合接入的 helper 包括 `hydrateProjectSnapshotPreviewUrls`、`applyPersistedAudioPreview` 和 `revokeObjectUrls`。

## 删除与清理

删除节点时，如果底层媒体仍被以下位置引用，不应立即删除文件：

- 其他节点；
- 素材库条目；
- output history 条目；
- storyboard cell；
- prompt reference；
- 项目缩略图；
- 待处理的 Agent attachment。

清理应基于引用关系：

1. 收集当前项目快照和素材库仍在使用的持久媒体引用。
2. 将引用集合与项目 output 目录和 output history 对比。
3. 立即清理的只应是无引用临时 object URL。
4. 持久 output 文件只有在明确的清理动作或清楚记录的自动清理流程中删除。

MVP 阶段优先保守：及时 revoke object URL，但除非用户删除项目或明确删除历史记录，不自动删除项目 output 文件。

## 导出与迁移

如果 GenLink 后续增加项目导出包，建议使用如下结构：

```text
genlink-project.zip
  project.json
  output/
    history.json
    image-1.png
    video-1.mp4
  manifest.json
```

`manifest.json` 应包含 app version、export time、project id。如果计算成本低，可以加入媒体文件 checksum。导入时应从文件重新创建预览 URL，不要信任序列化保存的 object URL。

## Agent 与 MCP 规则

Agent 应只接收精简媒体摘要：

```ts
{
  kind: "image",
  title: "参考图",
  width: 1024,
  height: 1024,
  outputFileName: "reference.png",
  hostedUrl: "https://...",
  promptSummary: "..."
}
```

MCP 快照不要返回 base64 媒体。如果 Agent 需要做视觉分析，应提供专门的 attachment / upload 路径，而不是把大媒体塞进通用工具结果。

## 实现优先级

1. 审计节点数据类型，区分临时 URL 字段和持久媒体字段。
2. 为快照剥离和预览补水添加测试。
3. 将生成结果元数据归一到共享 `PersistedMediaRef` helper type。
4. 在实现任何自动 output 清理前，先添加引用收集 helper。
5. 等持久媒体契约稳定后，再添加导出 / 导入打包能力。
