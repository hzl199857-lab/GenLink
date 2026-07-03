# GenLink 画布提示词库设计

## 目标

在 GenLink 画布右上角增加“提示词库”入口，打开一个居中的大型悬浮弹窗。用户可以浏览、搜索、筛选、收藏社区与本地精选提示词，并把提示词直接添加为画布节点。

首版复刻 open-storyboard-canvas 的数据思路，但交互和视觉必须贴合 GenLink 当前深色画布 UI：克制、紧凑、玻璃质感、圆角约 9-12px、主强调色使用现有荧光绿 `#CCFF00`。

## 范围

首版包含：

- 画布右上角独立文字按钮“提示词库”。
- 居中大弹窗，参考用户提供的素材库式浮层。
- 社区源同步、浏览器缓存、打包 JSON 兜底、本地精选兜底。
- 搜索、类型切换、分类/来源/标签筛选。
- 卡片网格、详情查看、复制 prompt、收藏。
- “添加到画布”创建节点，但不自动运行生成。

首版不包含：

- 后台定时同步 OSS/CDN 镜像。
- 用户自定义提示词上传/编辑。
- 全量 1 万+ 条社区库索引。
- 远程图片代理或图片持久化。
- 为提示词库单独配置模型或服务商。

## 数据源

社区源：

1. `YouMind-OpenLab/awesome-gpt-image-2`
   - 类型：`image`
   - 优先读取 `README_zh.md`，失败退回 `README.md`
   - 默认最多解析前 500 条

2. `YouMind-OpenLab/awesome-seedance-2-prompts`
   - 类型：`video`
   - 优先读取 `README_zh.md`，失败退回 `README.md`
   - 默认最多解析前 500 条

兜底数据：

- `src/features/prompt-library/bundledCommunityPrompts.json`
  - 打包一份社区提示词快照。
  - 用于 GitHub/服务端代理失败且浏览器无可用新缓存时。
- `src/features/prompt-library/localPrompts.ts`
  - GenLink 本地精选，覆盖图像、视频、分镜、角色、场景、商品视觉等场景。

## 数据契约

统一条目类型：

```ts
export type PromptLibraryKind = "image" | "video";
export type PromptLibraryOrigin = "community" | "local";

export interface PromptLibraryEntry {
  id: string;
  kind: PromptLibraryKind;
  origin: PromptLibraryOrigin;
  title: string;
  prompt: string;
  excerpt: string;
  category: string;
  source: string;
  tags: string[];
  coverUrl?: string;
  previewUrl?: string;
  githubUrl?: string;
  detailUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

服务端响应：

```ts
export interface PromptLibraryCommunityResponse {
  ok: true;
  entries: PromptLibraryEntry[];
  fetchedAt: string;
  errors: string[];
}
```

错误时 API 返回一致 JSON：

```json
{
  "ok": false,
  "error": "提示词库同步失败"
}
```

## 同步与缓存

前端不直接请求 GitHub raw。打开提示词库时请求：

```txt
GET /api/prompt-library/community
```

服务端 route handler 负责：

- 以短超时拉取两个 YouMind raw README。
- 中文 README 失败时退回英文 README。
- 从 Markdown 中解析 `### No...` 条目和后续块。
- 提取标题、描述、代码块 prompt、图片/视频缩略图、详情链接、分类、标签。
- 每个源最多返回 500 条。
- 任一源失败不影响另一个源返回，错误写入 `errors`。

前端策略：

- 打开弹窗时触发拉取。
- 30 分钟 `staleTime` 与 30 分钟自动刷新。
- 成功返回非空社区数据后写入 Zustand persist 缓存，存储名建议 `prompt-library-storage`。
- 展示合并顺序：实时社区数据 > 浏览器缓存 > 打包 JSON > GenLink 本地精选。
- 以 `id` 去重，排在前面的条目优先。

## Markdown 解析

解析器放在 `src/lib/prompt-library/parse.ts`，只处理数据转换，不访问网络。

通用规则：

- 只把形如 `### No. 1: 标题` 或 Seedance 源中后续 `### 标题` 的块视为条目。
- 块内 `#### 📝 提示词` 后第一个 fenced code block 是主 prompt。
- `#### 📖 描述` 到下一小标题之间作为描述，生成 `excerpt`。
- `<img src="...">` 或 Markdown image 的第一张可用图作为 `coverUrl`。
- YouMind 详情链接作为 `detailUrl`。
- GPT Image 2 源的标题中如有 `分类 - 标题`，分类取 `-` 前半段；否则使用源默认分类“图像提示词”。
- Seedance 源默认分类“视频提示词”，如标题或描述中出现明显风格词，可加入 tags。

解析失败的块直接跳过，不因单条异常中断整个源。

## UI 设计

入口：

- 位置：画布右上角。
- 样式：独立文字按钮“提示词库”，可带 `BookOpen` 图标。
- 风格：深色半透明底、细边框、白色文字、hover 使用 `#CCFF00` 强调。
- 不放入左侧竖向工具栏。

弹窗：

- 居中悬浮，遮罩使用黑色半透明 + 轻微 blur。
- 宽度约 `min(1500px, calc(100vw - 120px))`，高度约 `min(920px, calc(100vh - 120px))`。
- 背景使用 `#17181B` / `#1f2023` 系列，与素材库、历史弹窗一致。
- 圆角约 12px，边框 `white/10`，阴影贴合现有弹窗。

结构：

- 顶部：标题“提示词库”、状态文案、搜索框、刷新按钮、关闭按钮。
- 类型 Tabs：全部 / 图像 / 视频 / 收藏。
- 筛选 chips：分类、来源、标签。
- 主体：卡片网格，响应式列数。
- 底部或状态区：条目数、社区源更新时间、部分离线提示。

卡片：

- 默认显示封面、类型角标、来源、标题、2-3 行摘要。
- 无封面或图片加载失败时显示 GenLink 风格占位封面。
- hover 时显示“查看”“添加到画布”。
- 收藏按钮在卡片角落，收藏状态本地保存。

详情：

- 在大弹窗内打开详情层，不跳转页面。
- 展示封面、标题、来源、分类、标签、完整 prompt。
- 操作：复制提示词、添加到画布、收藏/取消收藏。

## 添加到画布

用户点击“添加到画布”后：

- 创建节点位置：当前画布视口中心附近。
- 自动选中新节点。
- 不自动运行生成。
- 弹窗保持打开，方便继续添加其他提示词。

节点映射：

- `kind: "image"` 创建 `image_generation` 节点，只写入 `prompt`。
- `kind: "video"` 创建 `video_generation` 节点，只写入 `prompt`。
- 不写死 provider、model、aspectRatio、quality、duration。
- 节点标题可用提示词标题。

实现上尽量通过现有 canvas store 的 `addNodes` / 选中节点能力完成，不引入第二套画布运行时。

## 文件组织

建议新增：

- `src/features/prompt-library/types.ts`
- `src/features/prompt-library/localPrompts.ts`
- `src/features/prompt-library/bundledCommunityPrompts.json`
- `src/lib/prompt-library/parse.ts`
- `src/lib/prompt-library/source.ts`
- `src/store/prompt-library-store.ts`
- `src/app/api/prompt-library/community/route.ts`
- `src/components/canvas/PromptLibraryDialog.tsx`
- `src/components/canvas/PromptLibraryEntryButton.tsx` 或直接在 `InfiniteCanvas.tsx` 中小范围接入入口

尽量避免继续扩大 `src/components/canvas/InfiniteCanvas.tsx`。它只负责：

- 管理弹窗 open 状态。
- 放置右上角入口。
- 将 `PromptLibraryEntry` 映射为现有画布节点。

## 错误处理

- 服务端任一源失败时返回另一个源的数据和 `errors`。
- 两个源都失败时 API 返回 `ok: false` 或 `ok: true` 空 entries + errors；前端必须仍能展示缓存/兜底。
- 前端显示“部分社区源暂不可用”而不是阻断使用。
- 图片加载失败只切换占位封面，不影响卡片。
- 复制失败时显示简短错误提示。

## 测试与验证

聚焦测试：

- `src/lib/prompt-library/parse.test.ts`
  - 解析 GPT Image 2 条目。
  - 解析 Seedance 条目。
  - 跳过无 prompt 的块。
  - 提取 coverUrl/detailUrl/excerpt/category。
- `src/store/prompt-library-store.test.ts`
  - 收藏、取消收藏。
  - 社区缓存写入与去重。
- 如已有 React 组件测试方式可用，补充 PromptLibraryDialog 的筛选和空状态渲染测试。

项目验证：

```bash
npx tsc --noEmit
npm run lint
```

如果改动触及节点创建逻辑，优先补充或运行相关画布测试。
