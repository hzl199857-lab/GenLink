# GenLink Agent 协作规则

本文档用于约束 GenLink 项目中的 AI / 自动化开发行为。修改代码前优先遵循本文件，再结合用户当前请求。

## 基本原则

- 先读现有代码，再动手修改，优先沿用项目已有结构和写法。
- 变更范围要贴合用户请求，不顺手改无关模块。
- 不要回滚用户已有改动，也不要覆盖无关的未提交文件。
- 优先使用短小明确的 helper，避免为了抽象引入复杂层级。
- 解析、存储、日期、媒体处理、协议等通用能力优先使用现有库和框架 API。
- 除非用户明确要求，不为未上线或已废弃行为添加兼容层。
- 面向用户的产品文案默认使用中文，除非上下文已有英文风格。

## 验证命令

- 类型检查：`npx tsc --noEmit`
- Lint：`npm run lint`
- 聚焦测试：优先运行与改动相关的 `*.test.ts`，或使用项目现有 TypeScript 检查。
- 国内环境执行 Prisma 命令时使用镜像：

```bash
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma npx prisma generate
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma npx prisma migrate dev --name <name>
```

## 前端规则

- GenLink 使用 Next.js App Router、React、TypeScript、Tailwind、Zustand、ReactFlow、Three.js 和 Prisma 相关 API。
- 画布 UI 主要位于 `src/components/canvas/`、`src/components/nodes/`、`src/store/canvas-store.ts`、`src/types/canvas.ts`、`src/lib/canvas/`。
- 节点私有 UI 放在 `src/components/nodes/`。
- 画布外壳、工具栏、上下文菜单、项目控制和视口行为放在 `src/components/canvas/`。
- 纯数据转换、校验、布局计算和协议 helper 放在 `src/lib/`。
- 避免继续把无关职责堆进 `src/components/canvas/InfiniteCanvas.tsx`；如果必须修改它，优先只为当前需求抽出聚焦 helper。
- 不要引入第二套画布渲染器。除非用户明确要求大迁移，否则 ReactFlow 仍是主要画布运行时。

## 画布数据

- 将节点、连线、分组、素材和项目快照视为产品数据，而不是临时 UI 状态。
- 长期项目数据不能依赖临时 `blob:` URL 或 object URL。
- 生成媒体应有稳定的项目输出文件标识或托管层标识，同时只在当前浏览器会话中保留临时预览 URL。
- 除非功能明确要求自由变形，否则要保留原始媒体尺寸和比例。
- 删除节点或素材时，先考虑该媒体是否仍被其他位置引用，再删除底层文件。
- 项目快照生成应集中走 `buildProjectSnapshot`，项目持久化应集中走 `project-storage` 相关 helper。

## Agent 与 MCP

- MCP 工具契约放在 `src/lib/mcp/`。
- 工具 schema 要明确、最小、稳定。优先在小型操作集之上增加高级便捷工具，不要不断扩大临时 patch 结构。
- 读工具绝不能修改项目状态。
- 写入和生成工具要显式保留确认与权限行为。
- 当 Agent 需要操作当前打开的画布时，优先使用结构化 live operation 协议，不要使用浏览器点击自动化或自由格式 JSON 指令。
- 工具结果应摘要化大媒体和长文本。除非某个工具契约明确要求，否则不要通过 MCP 结果返回完整 base64 图片、视频或大 blob。
- Agent 面板中的方案、创意回复和工作流内容必须来自用户所选 Agent。允许程序执行规则校验并要求同一 Agent 修复重试；最终仍不合格时应明确报错，不得用本地模板生成内容并冒充 Agent 回复。系统进度、校验错误和执行状态文案不受此限制。

## API 与存储

- 服务端 route handler 应校验输入，并返回一致的 JSON 响应。
- 不要在客户端可见日志中暴露私有 API Key、token、文件句柄或本地绝对路径。
- 浏览器存储适合保存句柄、偏好和轻量元数据。大型业务数据和生成结果应使用项目目录、托管层或明确的媒体存储 helper。
- 写入项目文件夹的文件名必须使用现有 helper 清理，例如 `sanitizeFileStem` 和媒体扩展名推断逻辑。

## 文档规则

- 会影响后续实现的设计说明应写入 `notes/` 或已跟踪的文档目录。
- 文档要具体：写清相关文件、契约、数据字段和验证命令。
- 从其他项目学习时，记录可复用模式，不要盲目复制对方架构。
- 如果某条规则在开发中反复被提醒，应把它用明确可执行的语言补充到本文档。
