# 首页 Hero、Agent 入口与首次保存设计

## 背景

当前首页只展示 GenLink 品牌信息和“开始创作”按钮。用户点击后，已登录用户进入项目库，未登录用户跳转到独立登录页。画布 Agent、项目库卡片、新建项目弹窗和登录注册流程分别已有独立实现，但首页没有直接承接创作意图的入口。

本次改造把首页变成真正的创作入口：用户可直接输入任务、选择模型并上传图片；未登录时在原页面完成认证；认证完成后自动进入未落盘画布并运行 Agent；用户首次保存时再选择本地项目目录。

## 已确认需求

- 移除首页原有“开始创作”按钮，以 Agent 输入区作为主要入口。
- 首页 Agent 输入区支持文本输入、模型选择、图片上传和运行，不支持画布节点引用、语音和电商模式。
- 未登录用户点击运行时打开登录浮窗，保留文本、模型和图片。
- 登录浮窗默认展示邮箱登录，通过“注册”按钮切换到现有邮箱验证码注册流程。
- 浮窗可通过右上角关闭按钮或 `Escape` 关闭，点击遮罩不关闭；关闭后保留首页草稿。
- 登录或注册成功后自动继续先前的运行请求。
- 运行后进入一个未绑定项目目录的临时画布，并自动打开画布 Agent、提交首页任务。
- 临时画布首次保存时复用项目新建弹窗，主操作改为“保存”；确认后才创建项目目录并保存当前完整画布。
- 首页项目区仅对登录用户显示，包含一个新建项目卡片和最近编辑的三个项目卡片。
- 首页项目卡片只使用现有封面、项目名和更新时间，不新增提示词摘要等元数据。
- 点击项目卡片直接进入画布；点击“所有项目”进入现有完整项目库；点击新建项目卡片复用现有新建项目流程。
- 独立登录、注册页面入口移除。
- 移动端采用纵向布局，项目卡片使用横向滑动或紧凑网格。

## 方案选择

采用“内存临时画布，首次保存落盘”方案。

没有采用“运行前先选择项目目录”，因为它会在用户表达创作意图后立即打断流程。没有采用“浏览器长期持久化临时项目”，因为它会引入临时媒体恢复、跨会话清理和用户隔离等额外职责，且与本次需求无关。

这里的“自动创建新项目”特指初始化一个 `currentProject === null` 的未落盘画布。只有首次保存成功后，画布才绑定 `ProjectHandleRecord` 并成为项目库中的正式项目。

## 页面结构

### 首页 Hero

`src/components/hero/GenLinkHero.tsx` 继续负责首页整体背景、品牌 Logo 和文案，但不承载认证、项目加载或 Agent 执行细节。首页主体调整为：

1. 品牌区：保留现有 GenLink Logo 和介绍文案，压缩垂直留白。
2. Agent 输入区：新增聚焦的首页输入组件。
3. 最近项目区：仅登录后渲染。

桌面端使用居中定宽内容区，输入区位于项目区上方。移动端品牌区、输入区和项目区依次纵向排列，项目卡片不得因桌面尺寸硬缩放。

### 首页 Agent 输入区

新增 `src/components/hero/HeroAgentComposer.tsx`，职责如下：

- 管理文本草稿。
- 使用现有 `AGENT_MODEL_OPTIONS` 展示模型选择，避免首页维护第二套模型列表。
- 接受多张图片文件，提供缩略预览和移除操作。
- 在运行时提交结构化启动请求，不直接调用画布内部函数。
- 展示上传、认证恢复或启动失败的中文错误。

首页不使用 `PromptMentionInput` 的 `@` 引用能力。图片在未登录阶段只保留为当前页面内的 `File` 和临时预览 URL，不写入项目数据；组件移除文件或卸载时释放 object URL。

### 首页最近项目区

新增 `src/components/hero/HeroRecentProjects.tsx`，不直接复用完整 `ProjectLibrary` 页面。它复用现有 `listProjects` 数据来源和项目打开动作，并完成以下处理：

- 按 `updatedAt` 降序排列。
- 最多展示三个已有项目。
- 固定在最前方展示一个“新建项目”卡片。
- 项目卡片展示封面、项目名和格式化更新时间。
- 组件卸载或列表刷新时释放封面 object URL。
- 列表读取失败时显示紧凑错误状态，不影响 Agent 输入。

卡片视觉改为首页使用的紧凑横向比例，不修改完整项目库现有卡片尺寸。项目卡片本身仍是可点击按钮，并保留键盘焦点样式。

## 首页 Agent 启动契约

在 `src/types/agent.ts` 增加两个聚焦的结构化类型。首页认证和附件准备前使用：

```ts
interface HomeAgentPendingRequest {
  id: string;
  prompt: string;
  model: AgentModelId;
  files: File[];
}
```

`AgentModelId` 从 `AGENT_MODEL_OPTIONS` 推导并导出，首页和画布不得分别声明字符串联合。

附件上传完成后，交给画布的请求使用：

```ts
interface CanvasAgentLaunchRequest {
  id: string;
  prompt: string;
  model: AgentModelId;
  attachments: AgentTaskAttachment[];
}
```

两个类型使用同一个 `id`，保证同一请求只消费一次。请求只在当前 React 页面会话中存在，不进入项目快照和浏览器长期存储。

启动流程如下：

1. 校验文本非空；图片不是运行必需条件。
2. 未登录时保存为待继续请求并打开认证浮窗。
3. 登录成功或用户原本已登录时，上传图片并生成现有 `AgentTaskAttachment`。
4. 调用 `canvas-store` 的 `newProject` 初始化未落盘画布。
5. 将已准备好的 prompt、model 和 attachments 作为一次性启动请求交给画布。
6. 首页切换为 `canvas` 模式。
7. `CanvasAgentDock` 自动打开，`CanvasAgentPanel` 消费请求并调用与手动提交相同的 Agent 执行路径。
8. 消费成功后清除首页待处理请求和本地图片预览。

不通过浏览器点击自动化、自由格式 JSON、全局可变回调或复制一份 Agent 请求逻辑来启动。`CanvasAgentPanel` 应增加最小的初始请求入口，并把现有 `handleSubmit` 内可复用的提交流程抽成聚焦 helper，使首页启动和画布手动提交共享同一套附件选择、消息追加和 `runAgent` 行为。

如果图片上传失败，保持首页可见并保留草稿，让用户重试。画布切换只发生在附件准备完成之后。

## 认证浮窗

新增 `src/components/hero/HomeAuthDialog.tsx`，复用当前 `LoginForm` 和 `RegisterFlow` 的认证 API 与错误映射，但把“认证成功后的跳转”改为回调。

状态包括：

- `login`：默认状态，邮箱、密码、登录按钮和注册按钮。
- `register-email`：邮箱和密码输入。
- `register-code`：邮箱验证码输入。
- `register-success`：短暂成功状态，随后调用成功回调。

认证成功后不执行 `window.location.assign`，避免丢失 `File`、输入草稿和待运行请求。首页观察到有效 session 后关闭浮窗并继续待运行请求。

关闭规则：

- 右上角关闭按钮关闭。
- `Escape` 关闭。
- 点击遮罩不关闭。
- 提交过程中关闭按钮可保留，但必须避免卸载后的异步状态写入。
- 关闭只影响浮窗可见性，不清除首页草稿和待运行请求。

移除 `src/app/login/page.tsx` 和 `src/app/register/page.tsx` 的独立页面入口，并更新项目内原有 `/login`、`/register` 跳转。退出登录后返回首页，不自动打开认证浮窗；认证浮窗由首页运行行为触发。

## 临时画布与首次保存

### 临时画布状态

首页启动 Agent 前调用现有 `newProject`，得到以下状态：

- `currentProject: null`
- `projectId: null`
- 临时项目名固定为“未命名项目”
- 空节点、连线、分组和素材，随后由 Agent 执行写入

临时画布允许使用画布和 Agent 的正常编辑能力。由首页上传的图片在进入画布前转为托管附件，画布数据不得依赖跨会话 `blob:` URL。

### 首次保存行为

当前 `saveProject` 在 `currentProject` 为空时会报错，首次保存需要在 UI 层分流：

- 如果 `currentProject` 存在，继续执行现有 `saveProject`。
- 如果 `currentProject` 不存在，打开 `CreateProjectDialog` 的保存模式。
- `Ctrl/Cmd + S` 与工具栏保存按钮使用同一分流。
- 五分钟自动保存仅在 `currentProject` 存在时执行；未落盘画布不弹窗，也不反复报错。

`CreateProjectDialog` 增加 `variant: 'create' | 'save'`。`create` 模式显示“新建项目 / 创建并进入”，`save` 模式显示“保存项目 / 保存”。目录选择、项目名称校验和其余说明保持一致，避免调用方分别拼装文案。

### 保存当前完整快照

不能先调用当前 `createProjectAtParentDirectory` 创建空白快照，再调用 `attachProject`，因为这会覆盖 Agent 已生成的画布。

项目存储层应提供从当前画布快照创建项目的能力。该能力必须：

1. 接收由 `buildProjectSnapshot` 生成的当前完整快照数据。
2. 使用用户填写的项目名生成最终名称和新的正式项目 ID、创建时间、更新时间。
3. 保留当前节点、连线、分组、素材文件夹、素材和缩略图字段。
4. 创建项目目录骨架并写入完整项目 JSON。
5. 保存用户作用域下的项目记录。
6. 成功后把正式项目记录绑定到当前 store，但不把画布替换为空白状态。
7. 任一步失败时清理本次新建的项目目录，并保持临时画布内容不变。

正式绑定后，后续生成输出和保存继续使用现有项目持久化链路。

## 首页项目操作

- “新建项目”卡片打开现有新建项目弹窗，成功后进入新建的正式画布。
- 已有项目卡片调用现有 `loadProject`，成功后切换到画布。
- “所有项目”切换到现有 `ProjectLibrary`。
- 项目加载期间禁用重复点击并显示紧凑加载状态。
- 项目加载失败时留在首页并显示错误。

首页项目区的读写操作继续通过 `runCanvasUserScopedOperation` 和当前登录用户作用域执行，不能接受来自客户端参数的替代用户 ID。

## 状态与错误处理

- session 加载中：首页保持现有全屏加载状态，避免错误显示未登录布局。
- 登录浮窗关闭：草稿和待运行请求保留。
- 登录失败或验证码失败：错误显示在浮窗内，不关闭浮窗。
- 登录成功但附件上传失败：关闭认证浮窗，保留首页草稿并显示上传错误。
- Agent 启动请求已消费：清除请求，防止 React 重渲染或 session 刷新重复运行。
- 项目列表失败：项目区显示错误，Agent 输入仍可使用。
- 首次保存失败：弹窗保持打开或返回可重试状态，临时画布不丢失。
- 离开未保存临时画布：沿用当前画布返回行为；本次不增加长期草稿恢复或离开确认。

## 主要改动范围

- `src/app/page.tsx`：首页认证浮窗、启动请求、Hero/项目库/画布模式协调。
- `src/components/hero/GenLinkHero.tsx`：新版首页布局。
- `src/components/hero/`：新增 Agent 输入、最近项目和认证浮窗组件。
- `src/components/auth/LoginForm.tsx`：支持认证成功回调，不强制页面跳转。
- `src/components/auth/RegisterFlow.tsx`：支持浮窗内切换与成功回调。
- `src/app/login/page.tsx`、`src/app/register/page.tsx`：移除独立入口。
- `src/components/canvas/CanvasAgentPanel.tsx`：最小化增加一次性初始请求消费能力。
- `src/components/canvas/InfiniteCanvas.tsx`：接收启动请求、首次保存分流、自动保存保护。
- `src/components/project/CreateProjectDialog.tsx`：支持新建和保存两种文案模式。
- `src/lib/project-storage.ts`：从当前完整快照创建正式项目。
- `src/store/canvas-store.ts`：保持 `buildProjectSnapshot` 为快照中心，增加 `bindDraftProject` 聚焦 action，只绑定正式项目记录和保存元数据，不清空或替换当前画布内容。

不修改完整项目库的卡片布局，不引入第二套画布运行时，不把首页职责堆入 `InfiniteCanvas.tsx`。

## 测试与验证

聚焦测试至少覆盖：

- 未登录项目区不渲染，已登录时最多显示三个最近项目。
- 登录浮窗关闭后首页草稿、模型和图片仍保留。
- 登录成功后同一个启动请求只继续一次。
- 登录表单和注册流程在回调模式下不执行整页跳转。
- 首页启动请求进入临时画布并打开 Agent。
- `currentProject === null` 时保存按钮和快捷键打开保存弹窗。
- 首次保存写入当前完整节点、连线、分组和素材，不生成空白项目。
- 首次保存失败时当前画布数据保持不变。
- 正式项目仍直接保存，不打开首次保存弹窗。
- 未落盘画布不执行周期自动保存。
- 认证和项目操作继续遵守用户隔离。

执行以下项目验证命令：

```bash
npx tsc --noEmit
npm run lint
```

同时运行相关 `*.test.ts`，并使用浏览器在桌面和移动端验证：

- 首页 Hero、输入框和项目卡片没有重叠或溢出。
- 未登录和已登录布局切换正确。
- 登录、注册、关闭和自动继续运行流程正确。
- 图片预览、删除和失败重试正确。
- 临时画布首次保存与正式项目后续保存正确。
