# GenLink 认证与多租户安全整改设计

日期：2026-07-12

## 1. 背景与目标

GenLink 已部署到阿里云并面向多个用户公开注册。当前已有 6 个真实用户账号和有效登录会话。项目需要在不要求现有用户重新注册、不移动用户本地项目文件的前提下，完成第一阶段安全整改。

本阶段目标：

- 使用 Better Auth 官方 Email OTP 能力，把 6 位邮箱验证码与账号验证状态真正绑定。
- 让所有敏感 API 在路由内部验证真实会话，消除仅凭 Cookie 存在即可放行的问题。
- 让服务端任务、MCP 操作和浏览器本地数据按用户隔离。
- 升级存在高危公告的 Next.js，并恢复稳定的生产构建和质量门禁。
- 使用兼容迁移、线上备份和可回滚发布，保留现有账号、密码和有效会话。

## 2. 已确认事实

- 项目使用 Next.js App Router、Better Auth、Prisma 和 SQLite。
- `RESEND_API_KEY` 与发件人配置存在，用户目前能够收到 6 位验证码。
- 当前验证码流程发生在客户端，验证成功后才调用 Better Auth 注册，Better Auth 服务端没有强制验证。
- 当前数据库中的 6 个用户全部为 `emailVerified=false`，但已有登录会话，说明验证码结果没有写入 Better Auth。
- `getSessionCookie()` 只读取 Cookie 值，不能替代 `auth.api.getSession()` 的真实会话校验。
- 当前项目库主要保存在用户选择的本地文件夹中，IndexedDB 保存目录句柄；项目文件本身不在服务端 `Project` 表中。
- IndexedDB 项目记录、localStorage API Key、Agent 历史和收藏目前没有用户命名空间。
- `/api/projects` 和 `/api/image-history` 在当前前端源码中没有调用方。
- `ImageHistoryItem` 仍会重复保存 base64 图片，已造成约 2.6 GB 的本地数据库体积；这部分清理不与首次认证发布混合执行。

## 3. 范围与非目标

### 3.1 本阶段范围

- Better Auth Email OTP 注册流程。
- 现有用户验证状态迁移。
- 敏感 API 的路由级会话校验。
- ImageJob、MCP、上传和 Media Worker 的用户归属。
- 浏览器本地项目句柄、API 设置、Agent 历史、草稿和收藏的用户隔离。
- Next.js 安全升级、构建修复、测试入口和部署门禁。
- 线上数据库与环境配置备份、候选版本启动检查和回滚流程。

### 3.2 非目标

- 不把本地项目文件迁移到云端。
- 不在本阶段删除 2.6 GB 的旧图片历史数据或执行数据库压缩。
- 不在本阶段大规模拆分 `InfiniteCanvas.tsx`、`canvas-store.ts` 或 `CanvasAgentPanel.tsx`。
- 不改变现有 API Provider、模型选择或计费方式。
- 不轮换 `BETTER_AUTH_SECRET`，不主动注销有效会话。

## 4. 用户体验约束

- 现有用户不重新注册、不重设密码。
- 迁移先把所有现有用户标记为已验证，再启用强制邮箱验证。
- 保持现有 Better Auth secret、Cookie 名称和 Session 数据，正常会话继续有效。
- 用户本地项目目录、`project.json`、输出历史和素材文件不移动、不改名。
- 新用户仍经历“填写邮箱和密码 -> 收到 6 位验证码 -> 输入验证码 -> 进入应用”。
- 只有过期、伪造或数据库中不存在的会话会被要求重新登录。
- 正式切换只允许出现 PM2 重启造成的短暂连接波动。

## 5. 认证架构

### 5.1 Better Auth 配置

服务端启用 `better-auth/plugins` 中的 `emailOTP`：

- `emailAndPassword.enabled = true`
- `emailAndPassword.requireEmailVerification = true`
- `emailAndPassword.autoSignIn = false`
- `emailOTP.sendVerificationOnSignUp = true`
- OTP 长度为 6 位，10 分钟过期。
- OTP 使用 `storeOTP: "hashed"` 保存。
- 单个 OTP 最多错误 3 次。
- OTP 发送和验证接口每 60 秒最多 3 次。
- 发信继续复用 Resend 和现有中文邮件模板。

客户端 Auth Client 注册 `emailOTPClient`。旧的自制验证码 API 在新流程完成并验证后从路由和前端调用中删除，避免两套验证码协议并存。

### 5.2 新用户注册流程

1. 用户提交邮箱、密码和显示名称。
2. Better Auth 创建未验证用户，不创建可用登录会话，并发送 Email OTP。
3. 用户提交 OTP。
4. Better Auth 校验 OTP，增加错误次数，成功后更新 `emailVerified=true` 并消费验证码。
5. 客户端使用邮箱和原密码执行正常登录。
6. 用户进入项目库。

重复注册一个尚未验证的邮箱时，不再次创建用户；页面进入重发验证码路径。接口对“邮箱不存在”和“邮件已发送”使用一致的外部响应，降低账号枚举风险。

### 5.3 现有用户迁移

迁移脚本在启用 `requireEmailVerification` 前执行：

```sql
UPDATE User SET emailVerified = 1 WHERE emailVerified = 0;
```

该更新只改变验证标记，不修改用户 ID、密码哈希、Session、Account 或 Cookie。

### 5.4 会话校验边界

- `middleware.ts` 只负责公开路径分流和页面跳转，不作为最终授权边界。
- 所有敏感 Route Handler 调用 `requireAuth(request)`，使用 `auth.api.getSession()` 校验数据库会话。
- 公开 API 仅保留 Better Auth、注册 OTP 必要端点、应用版本和明确允许匿名访问的静态内容。
- API 返回 401 时使用统一中文错误结构；已登录但无资源权限时返回 404，避免泄露资源是否存在。
- 日志不记录 Session token、Cookie、OTP、API Key 或完整请求体。

## 6. 多租户数据隔离

### 6.1 服务端任务

`ImageJob` 增加可空 `userId` 和索引，第一阶段保持数据库迁移向后兼容。新代码创建任务时必须写入当前用户 ID，查询、恢复和轮询使用 `{ id, userId }` 条件。旧的无归属任务不对普通用户返回，并继续由现有一小时清理逻辑过期删除。

`ImageHistoryItem` 不再写入新的 base64 历史。当前生成历史继续由项目目录中的 `output/history.json` 提供。旧 `/api/image-history` 关闭外部访问，数据删除和 `VACUUM` 放到单独的存储瘦身阶段。

当前未使用的 `/api/projects` 同样关闭外部访问。Prisma 中旧 Project、CanvasNode 和 CanvasEdge 模型暂不在首次发布中删除，避免扩大迁移风险。

### 6.2 MCP

- MCP Route 从真实 Better Auth Session 取得 `userId`。
- 不接受 `x-genlink-user-id` 作为身份来源。
- `projectId` 与 `canvasId` 仍来自结构化工具参数，但网关作用域必须同时包含真实 `userId`。
- 写入和生成操作继续要求显式确认；伪造身份头不能提升权限。

### 6.3 上传和对象存储

- 图片和媒体上传 Route 必须先执行 `requireAuth()`。
- OSS object key 由服务端加入不可逆的用户命名空间，不使用邮箱等可识别信息。
- 客户端可提供文件名建议，但不能决定用户目录前缀。
- 现有 OSS URL 和本地项目引用保持有效，不批量改写旧素材。

### 6.4 Media Worker

- `MEDIA_WORKER_TOKEN` 缺失时服务拒绝启动，而不是关闭鉴权。
- Next.js 代理校验真实用户会话后，把内部用户 ID 传给 Worker。
- Worker Job 保存 `ownerUserId`，任务状态查询必须匹配同一用户。
- 用户提供的第三方 AI Key 只在执行期间使用，不写入 Redis 或 SQLite Job payload。
- Worker 的公网入口仍可由平台访问，但业务端点必须持有共享 Bearer Token。

## 7. 浏览器本地数据隔离

### 7.1 IndexedDB 项目句柄

`genlink-project-library` 升级到新的 schema 版本，为项目记录增加 `ownerUserId` 并按用户过滤。

旧记录没有历史用户归属。升级后第一次由已登录用户访问项目库时，把当前浏览器中的无归属记录一次性认领给该用户。该策略不移动项目目录，也不修改项目文件。迁移完成后，其他账号无法列出这些句柄。

### 7.2 localStorage 数据

以下数据使用稳定用户 ID 作为命名空间：

- Provider 和模型选择。
- 用户填写的各 Provider API Key。
- Agent 会话、草稿和历史。
- 提示词收藏与偏好。
- 其他含用户内容或凭证的持久化设置。

旧的无命名空间值在第一次升级时复制到当前用户命名空间并记录迁移标记。读取逻辑只读取当前用户命名空间。

### 7.3 登录切换

登录用户变化或退出登录时：

- 清空内存中的画布节点、边、分组、当前项目句柄和 Agent 状态。
- 重新从新用户命名空间加载设置。
- 不删除磁盘项目文件，也不删除其他用户的浏览器命名空间数据。

## 8. Next.js 与构建安全

- Next.js 和 `eslint-config-next` 至少升级到审计建议的 `16.2.10`，最终版本以实施时 `npm audit` 的无高危结果为准。
- 移除构建时依赖在线 Google Fonts 的路径，使用可随应用部署的本地字体或稳定系统字体栈。
- 收紧 OpenClaw 规则文件的静态根目录和 Turbopack tracing 标记，避免构建追踪整个仓库。
- 锁文件通过固定 npm 版本重新生成并提交，避免部署时由 Next 自动修补 SWC 条目。

## 9. 错误处理与安全限制

- 注册、验证码、登录失败使用稳定的中文用户文案，不返回内部异常或账号存在状态。
- OTP 过期、错误次数耗尽和发送限流分别给出可操作提示。
- SSRF、远程媒体大小限制和 API Key 查询串问题属于紧随本阶段的第二个安全子项目；第一阶段的路由级真实会话校验先降低暴露面。
- 不在 URL 查询参数、日志或持久化 Worker payload 中保存第三方 API Key。
- 所有新增写接口验证 JSON 类型、字符串长度和资源归属。

## 10. 测试设计

### 10.1 认证测试

- 伪造 Session Cookie 不能访问敏感 API。
- 过期、撤销和不存在的 Session 返回 401。
- 未验证用户不能登录。
- 现有迁移用户可以继续登录。
- OTP 正常验证、过期、错误 3 次、重发和限流行为正确。
- 直接调用 Better Auth 注册不能绕过邮箱验证。

### 10.2 多租户测试

- 用户 A 不能查询、恢复或修改用户 B 的 ImageJob。
- MCP 伪造 `x-genlink-user-id` 无效。
- Worker 任务 owner 不匹配时不返回状态。
- 同一浏览器切换账号后，项目句柄、API Key、Agent 历史和收藏互不可见。
- 旧浏览器数据只迁移一次，迁移后目录句柄仍可使用。

### 10.3 回归与质量门禁

- 增加统一的全量测试脚本和可靠的 TypeScript 测试 runner。
- 修复现有 9 个失败测试，包括 8 个 ESM 解析失败和 1 个旧常量名断言。
- 部署前执行：

```bash
npx tsc --noEmit
npm run lint
npm test
npm audit --audit-level=high --registry=https://registry.npmjs.org
npm run build
```

- 两组 MCP 聚焦测试继续执行。

## 11. 发布与回滚

### 11.1 发布前备份

- 使用 SQLite 在线 Backup API 备份共享 `prisma/dev.db`，避免直接复制活跃数据库造成不一致。
- 复制共享 `.env.production`，不在日志输出内容。
- 备份使用时间戳目录，并校验文件存在、大小非零和 SQLite `PRAGMA integrity_check`。
- 任一备份或校验失败立即停止发布。

### 11.2 发布顺序

1. 安装固定锁文件依赖并完成全部质量门禁。
2. 备份数据库和环境配置。
3. 使用 Prisma mirror 配置执行 `prisma migrate deploy`。
4. 在候选端口启动新 release，检查进程启动、应用版本、公开首页、认证 API 和数据库连接。
5. 候选检查通过后切换 `CURRENT` 符号链接并重启 PM2。
6. 检查已有用户登录、新用户 OTP 注册、项目库、图片请求、上传、剪辑和 MCP。

### 11.3 回滚

- 候选检查失败时不切换线上版本。
- 正式切换后异常时立即把 `CURRENT` 指回上一 release 并重启 PM2。
- 首次迁移只增加兼容字段并更新 `emailVerified`，旧版本可继续读取数据库。
- 只有数据库本身损坏或迁移异常时才恢复 SQLite 备份。
- 旧历史表和旧浏览器存储的破坏性清理不进入本次发布，因此回滚不依赖反向数据迁移。

## 12. 验收标准

- 现有账号无需重新注册或修改密码，正常会话继续有效。
- 新账号只有完成邮箱 OTP 后才能登录。
- 任意伪造 Cookie 或身份头不能访问敏感 API。
- 两个账号之间的服务端任务和浏览器数据相互隔离。
- 新增图片生成不再扩大数据库 base64 历史。
- Worker 缺少 Token 时不能提供业务服务，任务不持久化第三方 API Key。
- TypeScript、Lint、全量测试、安全审计和生产构建全部满足门禁。
- 发布流程具备自动备份、候选启动检查和可执行回滚。

## 13. 后续子项目顺序

第一阶段稳定后依次进行：

1. SSRF、防重定向绕过、上传与下载流式大小限制、API Key 移出查询串。
2. 删除旧图片历史和无用 API，清理重复数据库并执行 SQLite `VACUUM`。
3. 提示词库按需加载、前端 selector 性能优化和大文件拆分。
4. 删除编译残留、无用依赖、旧 preview 资产和重复 helper。
