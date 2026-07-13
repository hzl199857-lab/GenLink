# GenLink 认证与多租户安全整改实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不要求现有用户重新注册、不改变现有密码和有效会话、不移动本地项目文件的前提下，为 GenLink 建立真实会话校验、邮箱 OTP 强制验证、服务端与浏览器端用户隔离，以及可备份、可候选启动、可回滚的生产发布流程。

**Architecture:** Better Auth 继续作为唯一账号和会话来源，并启用官方 Email OTP 插件；所有敏感 Route Handler 在业务逻辑前调用 `requireAuth()`，用户 ID 只取自已验证 Session。服务端任务、MCP、OSS 和 Media Worker 使用同一用户归属，浏览器 IndexedDB 与 localStorage 使用稳定用户 ID 命名空间；数据库迁移保持向后兼容，部署先备份、再迁移、再候选启动，最后才切换生产软链接。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Better Auth 1.6、Prisma 6、SQLite、Zustand、IndexedDB、FastAPI、阿里云 OSS、PM2、GitHub Actions。

---

## 实施边界与停止条件

- 本计划不删除现有 `ImageHistoryItem` 大数据、不执行 `VACUUM`、不删除 `prisma/prisma/dev.db`，这些属于后续存储瘦身项目。
- 本计划不处理 SSRF 和远程媒体流式大小限制，但所有相关接口先纳入真实会话校验。
- 本计划不拆分 `InfiniteCanvas.tsx`、`canvas-store.ts` 或 `CanvasAgentPanel.tsx`，只增加当前隔离需求所需的聚焦 helper。
- 不修改 `BETTER_AUTH_SECRET`、Better Auth Cookie 名称、现有用户 ID、密码哈希、Session 或 Account 记录。
- 任一任务的聚焦测试、`npx tsc --noEmit` 或 `npm run lint` 未通过时，停止进入下一任务。
- 正式发布前必须取得线上 SQLite 备份、环境文件备份、`PRAGMA integrity_check = ok` 和候选端口健康检查；任一项失败立即停止切换。

## 文件结构

**新增文件**

- `scripts/run-tests.mjs`：跨 Windows/Linux 收集并运行全部 `*.test.ts`。
- `src/lib/auth-config.test.ts`：锁定 Better Auth OTP 和邮箱验证配置。
- `src/lib/auth-guard.test.ts`：验证伪造、过期和缺失 Session 均返回 401。
- `src/lib/api-auth-policy.test.ts`：扫描 Route Handler，防止新增敏感接口遗漏 `requireAuth()`。
- `src/lib/image-job-owner.ts`、`src/lib/image-job-owner.test.ts`：集中生成 ImageJob 用户归属查询条件。
- `src/lib/user-storage-scope.ts`、`src/lib/user-storage-scope.test.ts`：生成 OSS 与浏览器用户命名空间。
- `src/lib/browser-user-storage.ts`、`src/lib/browser-user-storage.test.ts`：localStorage 作用域和一次性旧数据迁移。
- `src/lib/mcp/auth-context.ts`、`src/lib/mcp/auth-context.test.ts`：由真实 Session 构造 MCP 权限上下文。
- `prisma/migrations/20260712090000_auth_multitenancy_hardening/migration.sql`：兼容迁移现有用户验证状态和 ImageJob 归属字段。
- `scripts/auth-migration.test.py`：在一次性临时数据库中验证旧用户、Session 和 Account 的兼容迁移。
- `media-worker/tests/test_auth_ownership.py`：Worker Token、Owner 和凭证不落盘测试。
- `media-worker/requirements-dev.txt`：仅测试使用的 Python 依赖。
- `scripts/backup-production-sqlite.py`、`scripts/backup-production-sqlite.test.py`：SQLite 在线备份和完整性检查。

**主要修改文件**

- `package.json`、`package-lock.json`：全量测试入口、Next.js 安全版本和锁文件。
- `next.config.ts`、`src/app/layout.tsx`、`src/app/globals.css`：固定 tracing 根目录并移除构建期在线字体依赖。
- `src/lib/auth.ts`、`src/lib/auth-client.ts`、`src/components/auth/RegisterFlow.tsx`：官方 Email OTP 注册流程。
- `src/lib/auth-error-message.ts`：稳定的中文 OTP 错误文案。
- `middleware.ts`、`src/lib/auth-guard.ts`、敏感 `src/app/api/**/route.ts`：真实 Session 授权边界。
- `prisma/schema.prisma`、`src/app/api/ai/image/route.ts`、`src/app/api/ai/storyboard/route.ts`：ImageJob 用户归属并停止写入 base64 历史表。
- `src/app/api/mcp/route.ts`、`src/lib/image-host.ts`、`src/lib/media-host.ts`、四个上传 Route：MCP 身份和 OSS 用户命名空间。
- `src/lib/project-storage.ts`、`src/lib/agent-history.ts`、`src/store/canvas-store.ts`、`src/store/prompt-library-store.ts`、`src/app/page.tsx`、`src/components/project/ProjectLibrary.tsx`、`src/components/canvas/InfiniteCanvas.tsx`：浏览器数据隔离与账号切换清理。
- `src/app/api/video/clip-jobs/route.ts`、`src/app/api/video/clip-jobs/[jobId]/route.ts`、`src/lib/video/clip-types.ts`、`media-worker/app/main.py`：Worker 归属和 API Key 非持久化。
- `.github/workflows/deploy.yml`、`.github/workflows/deploy.test.ts`：备份、迁移、候选启动和回滚门禁。

### Task 1: 建立可靠的全量测试入口

**Files:**
- Create: `scripts/run-tests.mjs`
- Modify: `package.json`
- Test: `scripts/run-tests.mjs`（自验证）

- [ ] **Step 1: 记录当前失败基线**

Run: `$files = git ls-files '*.test.ts'; node --test $files`

Expected: `tests 305`、`pass 296`、`fail 9`；8 个 `ERR_MODULE_NOT_FOUND` 和 1 个 `ImageGenerationHitbox` 旧常量断言失败。

- [ ] **Step 2: 新增跨平台测试收集脚本**

```js
// scripts/run-tests.mjs
import { execFileSync, spawnSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "*.test.ts"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.error("No TypeScript tests found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
```

- [ ] **Step 3: 注册统一 npm 命令**

```json
{
  "scripts": {
    "test": "node scripts/run-tests.mjs"
  }
}
```

- [ ] **Step 4: 验证新入口准确复现基线**

Run: `npm test`

Expected: 仍为 305 个测试、296 通过、9 失败，证明 runner 没有漏测。

- [ ] **Step 5: 提交测试入口**

```bash
git add package.json scripts/run-tests.mjs
git commit -m "test: add cross-platform test runner"
```

### Task 2: 清零现有 9 个测试失败

**Files:**
- Modify: `src/lib/agent-prompt-variants.test.ts`
- Modify: `src/lib/openclaw/backend-proxy.test.ts`
- Modify: `src/lib/openclaw/model-mapping.test.ts`
- Modify: `src/lib/openclaw/start-policy.test.ts`
- Modify: `src/lib/planf-ecom.test.ts`
- Modify: `src/lib/storyboard/layout.test.ts`
- Modify: `src/lib/storyboard/normalize.test.ts`
- Modify: `src/lib/storyboard/prompt.test.ts`
- Modify: `src/components/canvas/ImageGenerationHitbox.test.ts`

- [ ] **Step 1: 修复 Node ESM 的显式扩展名**

将八个测试中的相对源码导入改为以下精确形式：

```ts
import { createBatchPromptVariants } from "./agent-prompt-variants.ts";
import {
  BackendProxyError,
  getAgentBackendBaseUrl,
  proxyOpenClawRequest,
} from "./backend-proxy.ts";
import { mapAgentPanelModelToOpenClaw } from "./model-mapping.ts";
import {
  assertRealOpenClawRuntimeEnabled,
  shouldUseRealOpenClawRuntime,
} from "./start-policy.ts";
import {
  buildPlanfEcomWorkflow,
  createPlanfEcomWorkflowResponse,
  glWorkflowToCanvasAgentActions,
} from "./planf-ecom.ts";
import {
  STORYBOARD_NODE_DEFAULT_CARD_HEIGHT,
  STORYBOARD_NODE_DEFAULT_CARD_WIDTH,
  STORYBOARD_NODE_MAX_CARD_HEIGHT,
  STORYBOARD_NODE_MAX_CARD_WIDTH,
  STORYBOARD_NODE_MIN_CARD_HEIGHT,
  STORYBOARD_NODE_MIN_CARD_WIDTH,
  getStoryboardCardSize,
  normalizeStoryboardCardSize,
} from "./layout.ts";
import {
  STORYBOARD_ROW_FIELDS,
  normalizeStoryboardResponse,
} from "./normalize.ts";
import {
  STORYBOARD_BUILT_IN_PROMPTS,
  buildStoryboardGenerationPrompt,
  getStoryboardPromptMode,
} from "./prompt.ts";
```

只改变模块字符串，不改变导入名称和测试行为。

- [ ] **Step 2: 更新过期的画布常量断言**

当前实现已经把图片、视频和音频生成节点统一为 `GENERATION_NODE_GROUP_TOP_RESERVE`。将测试中的旧名称精确替换为：

```ts
assert.match(canvasSource, /const GENERATION_NODE_GROUP_TOP_RESERVE = 56;/);
assert.match(canvasSource, /y: bounds\.y - GENERATION_NODE_GROUP_TOP_RESERVE,/);
assert.match(canvasSource, /height: bounds\.height \+ GENERATION_NODE_GROUP_TOP_RESERVE,/);
```

不得为了迎合测试把产品常量改回旧值。

- [ ] **Step 3: 运行全部测试**

Run: `npm test`

Expected: `fail 0`，全部 305 个测试通过。

- [ ] **Step 4: 运行静态检查**

Run: `npx tsc --noEmit`

Expected: exit 0。

Run: `npm run lint`

Expected: exit 0。

- [ ] **Step 5: 提交基线修复**

```bash
git add src/lib/agent-prompt-variants.test.ts src/lib/openclaw/backend-proxy.test.ts src/lib/openclaw/model-mapping.test.ts src/lib/openclaw/start-policy.test.ts src/lib/planf-ecom.test.ts src/lib/storyboard/layout.test.ts src/lib/storyboard/normalize.test.ts src/lib/storyboard/prompt.test.ts src/components/canvas/ImageGenerationHitbox.test.ts
git commit -m "test: restore clean baseline"
```

### Task 3: 升级 Next.js 并稳定离线生产构建

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/lib/build-config.test.ts`

- [ ] **Step 1: 写构建配置失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

test("production build does not download Google fonts", () => {
  assert.doesNotMatch(layout, /next\/font\/google/);
});

test("Turbopack and output tracing stay inside the repository", () => {
  assert.match(config, /outputFileTracingRoot:\s*process\.cwd\(\)/);
  assert.match(config, /turbopack:\s*\{\s*root:\s*process\.cwd\(\)/s);
});
```

- [ ] **Step 2: 确认测试先失败**

Run: `node --test src/lib/build-config.test.ts`

Expected: 两个断言至少一个失败。

- [ ] **Step 3: 固定安全版本并刷新锁文件**

Run: `npm install --save-exact next@16.2.10 eslint-config-next@16.2.10`

Expected: `package.json` 和 `package-lock.json` 都固定为 `16.2.10`，无 `^` 或 `~`。

- [ ] **Step 4: 固定构建根目录**

```ts
const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    cpus: 1,
  },
  // 保留现有 outputFileTracingIncludes 和 env。
};
```

- [ ] **Step 5: 移除在线字体下载**

删除 `src/app/layout.tsx` 中 `next/font/google`、`Geist` 和 `Geist_Mono`，将 `<html>` 类名改为：

```tsx
<html lang="zh-CN" translate="no" className="dark h-full antialiased">
```

将 `src/app/globals.css` 的字体改为可随系统部署的字体栈：

```css
font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
```

- [ ] **Step 6: 验证安全与构建**

Run: `node --test src/lib/build-config.test.ts`

Expected: PASS。

Run: `npm audit --audit-level=high --registry=https://registry.npmjs.org`

Expected: 无 high/critical 漏洞。

Run: `npm run build`

Expected: exit 0，日志不再出现 Google Fonts 下载失败或 tracing 到仓库外目录。

- [ ] **Step 7: 提交依赖与构建修复**

```bash
git add package.json package-lock.json next.config.ts src/app/layout.tsx src/app/globals.css src/lib/build-config.test.ts
git commit -m "fix: secure and stabilize production build"
```

### Task 4: 配置 Better Auth 官方 Email OTP

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth-client.ts`
- Create: `src/lib/auth-config.test.ts`
- Keep: `src/lib/register-verification-email.ts`

- [ ] **Step 1: 写认证配置失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const server = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("./auth-client.ts", import.meta.url), "utf8");

test("Better Auth requires verified email and hashed six-digit OTP", () => {
  assert.match(server, /requireEmailVerification:\s*true/);
  assert.match(server, /autoSignIn:\s*false/);
  assert.match(server, /otpLength:\s*6/);
  assert.match(server, /expiresIn:\s*10 \* 60/);
  assert.match(server, /allowedAttempts:\s*3/);
  assert.match(server, /storeOTP:\s*"hashed"/);
  assert.match(server, /sendVerificationOnSignUp:\s*true/);
});

test("auth client installs email OTP plugin", () => {
  assert.match(client, /emailOTPClient\(\)/);
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test src/lib/auth-config.test.ts`

Expected: FAIL，当前配置没有 OTP 插件。

- [ ] **Step 3: 配置服务端 OTP 和 Resend**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

import { prisma } from "@/lib/prisma";
import { createRegisterVerificationEmail } from "@/lib/register-verification-email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      rateLimit: { window: 60, max: 3 },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "email-verification") return;
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
        const content = createRegisterVerificationEmail(otp);
        await new Resend(apiKey).emails.send({
          from: process.env.RESEND_FROM_EMAIL || "GenLink <onboarding@resend.dev>",
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
      },
    }),
  ],
  secret: process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "genlink-local-development-secret-change-me"),
});
```

不得在生产环境把 OTP 写入日志或响应。

- [ ] **Step 4: 配置客户端插件**

```ts
"use client";

import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
```

- [ ] **Step 5: 运行聚焦测试**

Run: `node --test src/lib/auth-config.test.ts src/lib/register-verification-email.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交 OTP 配置**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts src/lib/auth-config.test.ts
git commit -m "feat: enforce Better Auth email OTP"
```

### Task 5: 把注册页面切换到不可绕过的 OTP 流程

**Files:**
- Modify: `src/components/auth/RegisterFlow.tsx`
- Modify: `src/lib/auth-error-message.ts`
- Delete: `src/app/api/auth/send-register-code/route.ts`
- Delete: `src/app/api/auth/verify-register-code/route.ts`
- Delete: `src/lib/email-verification.ts`
- Delete: `src/lib/email-verification.test.ts`
- Delete: `src/lib/register-code.ts`
- Delete: `src/lib/register-code.test.ts`
- Create: `src/components/auth/RegisterFlow.test.ts`

- [ ] **Step 1: 写注册协议失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./RegisterFlow.tsx", import.meta.url), "utf8");

test("registration uses Better Auth signup then email OTP verification", () => {
  assert.doesNotMatch(source, /send-register-code|verify-register-code/);
  assert.match(source, /authClient\.signUp\.email/);
  assert.match(source, /authClient\.emailOtp\.verifyEmail/);
  assert.match(source, /authClient\.signIn\.email/);
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test src/components/auth/RegisterFlow.test.ts`

Expected: FAIL，仍引用旧自制接口。

- [ ] **Step 3: 把第一步改为创建未验证账号**

`handleEmailSubmit` 保留现有邮箱/密码校验和 UI 状态，核心请求替换为：

```ts
const result = await authClient.signUp.email({
  email: email.trim().toLowerCase(),
  password,
  name: email.split("@")[0] || email,
});

if (result.error) {
  setError(getRegisterAccountErrorMessage(result.error.message));
  return;
}

setStep("code");
```

Better Auth 在 `requireEmailVerification: true` 时对重复邮箱返回合成成功响应；Email OTP 插件的 sign-up after hook 同样为该响应发送验证 OTP。因此首次注册和已存在但未完成验证的邮箱都只走 `sendVerificationOnSignUp`，页面不显示账号是否存在的内部状态，也不会额外发送第二封会使第一枚 OTP 失效的邮件。

- [ ] **Step 4: 把验证码提交改为 Better Auth 验证后登录**

```ts
const verification = await authClient.emailOtp.verifyEmail({
  email: email.trim().toLowerCase(),
  otp: codeValue,
});

if (verification.error) {
  setError(getRegisterFlowErrorMessage(verification.error.message));
  return;
}

const signInResult = await authClient.signIn.email({ email, password });
if (signInResult.error) {
  setError(getLoginErrorMessage());
  return;
}

setStep("success");
```

“重新发送验证码”按钮调用 `authClient.emailOtp.sendVerificationOtp`，发送期间禁用按钮，成功后清空旧输入。

- [ ] **Step 5: 补齐稳定中文错误映射**

```ts
if (normalized.includes("too_many_attempts")) return "验证码错误次数过多，请重新发送";
if (normalized.includes("otp_expired") || normalized.includes("expired")) return "验证码已过期，请重新发送";
if (normalized.includes("invalid_otp") || normalized.includes("invalid")) return "验证码不正确，请重新输入";
if (normalized.includes("rate limit")) return "发送过于频繁，请稍后再试";
```

- [ ] **Step 6: 删除旧协议及其 helper**

删除两个旧 Route 和四个只服务旧协议的 helper/test；保留 `register-verification-email.ts`，因为官方插件继续复用邮件模板。

- [ ] **Step 7: 验证注册代码**

Run: `node --test src/components/auth/RegisterFlow.test.ts src/lib/auth-error-message.test.ts src/lib/register-verification-email.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit`

Expected: exit 0，确认 `emailOtp` 客户端方法名称和参数与 Better Auth 1.6.19 类型一致。

- [ ] **Step 8: 提交注册迁移**

```bash
git add -A src/components/auth/RegisterFlow.tsx src/components/auth/RegisterFlow.test.ts src/lib/auth-error-message.ts src/app/api/auth src/lib/email-verification.ts src/lib/email-verification.test.ts src/lib/register-code.ts src/lib/register-code.test.ts
git commit -m "feat: move registration to verified email OTP"
```

### Task 6: 添加兼容数据库迁移并保护现有账号

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712090000_auth_multitenancy_hardening/migration.sql`
- Create: `scripts/auth-migration.test.py`

- [ ] **Step 1: 在 Prisma schema 增加可空归属字段**

```prisma
model ImageJob {
  id              String   @id
  userId          String?
  status          String
  provider        String?
  upstreamTaskId  String?
  historyNodeData String?
  result          String?
  error           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([userId])
  @@index([userId, createdAt])
  @@index([createdAt])
  @@index([upstreamTaskId])
}
```

- [ ] **Step 2: 编写只增加字段的向后兼容迁移**

```sql
UPDATE "User"
SET "emailVerified" = 1
WHERE "emailVerified" = 0;

ALTER TABLE "ImageJob" ADD COLUMN "userId" TEXT;

CREATE INDEX "ImageJob_userId_idx" ON "ImageJob"("userId");
CREATE INDEX "ImageJob_userId_createdAt_idx" ON "ImageJob"("userId", "createdAt");
```

迁移不修改 User ID、Account、Session、密码哈希和 Cookie，也不删除旧无归属 ImageJob。

- [ ] **Step 3: 编写完全隔离的 migration 集成测试**

`scripts/auth-migration.test.py` 使用 `tempfile.TemporaryDirectory()`：复制 schema 和除本次 migration 外的旧 migrations，执行一次 `prisma migrate deploy`；用 Python `sqlite3` 插入一个 `emailVerified=0` 用户及其 Account、Session；再复制本次 migration 并第二次 deploy。核心断言为：

```py
with sqlite3.connect(database_path) as db:
    verified = db.execute(
        'SELECT emailVerified FROM User WHERE id = ?', ("legacy-user",)
    ).fetchone()
    session_count = db.execute(
        'SELECT COUNT(*) FROM Session WHERE userId = ?', ("legacy-user",)
    ).fetchone()[0]
    account_count = db.execute(
        'SELECT COUNT(*) FROM Account WHERE userId = ?', ("legacy-user",)
    ).fetchone()[0]
    image_job_columns = {
        row[1]: row for row in db.execute('PRAGMA table_info("ImageJob")')
    }

self.assertEqual(verified, (1,))
self.assertEqual(session_count, 1)
self.assertEqual(account_count, 1)
self.assertIn("userId", image_job_columns)
self.assertEqual(image_job_columns["userId"][3], 0)
```

子进程环境固定 `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma`；测试只读仓库 migration 文件，数据库始终位于系统临时目录。

- [ ] **Step 4: 运行 migration 集成测试**

Run: `python -m unittest scripts/auth-migration.test.py`

Expected: PASS，且仓库 `prisma/dev.db` 的大小和修改时间均不变化。

Run: `npx prisma validate`

Expected: schema valid。

Run: `npx prisma generate`

Expected: Prisma Client generated successfully。

Run: `npx prisma validate`

Expected: schema valid。

Run: `npx prisma generate`

Expected: Prisma Client generated successfully。

- [ ] **Step 5: 提交迁移**

```bash
git add prisma/schema.prisma prisma/migrations/20260712090000_auth_multitenancy_hardening/migration.sql scripts/auth-migration.test.py
git commit -m "feat: add compatible ImageJob ownership migration"
```

### Task 7: 让所有敏感 API 在路由内部验证真实 Session

**Files:**
- Modify: `src/lib/auth-guard.ts`
- Create: `src/lib/auth-guard.test.ts`
- Create: `src/lib/api-auth-policy.test.ts`
- Modify: `middleware.ts`
- Modify: all sensitive `src/app/api/**/route.ts` listed below
- Replace with 404: `src/app/api/projects/route.ts`
- Replace with 404: `src/app/api/projects/[id]/route.ts`
- Replace with 404: `src/app/api/image-history/route.ts`

- [ ] **Step 1: 让 guard 可注入 Session 读取器并写失败测试**

```ts
type SessionReader = typeof auth.api.getSession;

export async function requireAuth(
  request: Request,
  getSession: SessionReader = auth.api.getSession,
) {
  const session = await getSession({ headers: request.headers });
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "请先登录后再继续" },
        { status: 401 },
      ),
    };
  }
  return { ok: true as const, session };
}
```

`auth-guard.test.ts` 分别注入返回 `null`、过期会话结果和有效会话的 reader；请求可带任意伪造 Cookie，前两者必须 401，有效会话必须返回真实 `session.user.id`。

- [ ] **Step 2: 写 API 覆盖策略测试**

`api-auth-policy.test.ts` 用 `git ls-files src/app/api/**/route.ts` 收集路由。只允许以下公开路由不含 `requireAuth(`：

```ts
const publicRoutes = new Set([
  "src/app/api/app-version/route.ts",
  "src/app/api/auth/[...all]/route.ts",
  "src/app/api/prompt-library/community/route.ts",
]);

const closedRoutes = new Set([
  "src/app/api/projects/route.ts",
  "src/app/api/projects/[id]/route.ts",
  "src/app/api/image-history/route.ts",
]);
```

其余 Route 源码必须包含 `requireAuth(`；closed route 必须只返回 404，不读取 Prisma。

- [ ] **Step 3: 确认覆盖测试失败**

Run: `node --test src/lib/auth-guard.test.ts src/lib/api-auth-policy.test.ts`

Expected: FAIL，当前敏感 routes 尚未调用 guard。

- [ ] **Step 4: 在每个敏感 handler 第一段加入 guard**

```ts
const access = await requireAuth(request);
if (!access.ok) return access.response;
const userId = access.session.user.id;
```

必须覆盖：`agent/run`、全部 `ai/*`、全部 image/media hosting、`mcp`、全部 OpenClaw、`planf/ecom-workflow`、两个 video clip-jobs route 和本地 image file/read route。OPTIONS 可在 guard 前直接返回 CORS 预检响应。

- [x] **Step 5: 关闭未使用的数据库 API**

三个 closed route 的所有方法统一返回：

```ts
return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
```

删除这些 route 对 Prisma 和大型历史类型的导入，但不删除数据库模型或旧数据。

- [ ] **Step 6: 降低 middleware 的权限角色**

`middleware.ts` 保留页面导航优化，但 API 分支不再把 Cookie 存在视为最终授权。可以继续快速拒绝完全无 Cookie 的请求；所有放行请求仍必须经过 Route Handler 的 `requireAuth()`。

- [ ] **Step 7: 验证认证边界**

Run: `node --test src/lib/auth-guard.test.ts src/lib/api-auth-policy.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit && npm run lint`

Expected: exit 0。

- [ ] **Step 8: 提交路由认证**

```bash
git add middleware.ts src/lib/auth-guard.ts src/lib/auth-guard.test.ts src/lib/api-auth-policy.test.ts src/app/api
git commit -m "fix: enforce validated sessions in API routes"
```

### Task 8: 隔离 ImageJob 并停止新增数据库 base64 历史

**Files:**
- Create: `src/lib/image-job-owner.ts`
- Create: `src/lib/image-job-owner.test.ts`
- Modify: `src/app/api/ai/image/route.ts`
- Modify: `src/app/api/ai/storyboard/route.ts`
- Create: `src/app/api/ai/image/route.test.ts`
- Create: `src/app/api/ai/storyboard/route.test.ts`

- [ ] **Step 1: 写归属 helper 失败测试**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ownedImageJobWhere } from "./image-job-owner.ts";

test("ImageJob lookup always includes authenticated owner", () => {
  assert.deepEqual(ownedImageJobWhere("job-1", "user-a"), {
    id: "job-1",
    userId: "user-a",
  });
});
```

- [ ] **Step 2: 实现最小 helper**

```ts
export function ownedImageJobWhere(jobId: string, userId: string) {
  return { id: jobId, userId } as const;
}
```

- [ ] **Step 3: 创建任务时写入真实用户 ID**

两个 route 的 POST 都从 Task 7 的 Session 取得 `userId`，创建任务使用：

```ts
await prisma.imageJob.create({
  data: {
    id: jobId,
    userId,
    status: "pending",
    // 保留现有 provider、historyNodeData 等字段。
  },
});
```

- [ ] **Step 4: 给后台链路显式传递 owner**

`runImageJob`、三个 provider 的 submit/poll、`completeImageJob`、`readPersistedImageJobResult`、`persistCompletedImageJob` 和 storyboard 对应 helper 的签名增加 `userId: string`。所有读取、认领和状态更新都使用：

```ts
where: ownedImageJobWhere(jobId, userId)
```

允许全局一小时过期清理继续按 `createdAt` 删除旧任务；普通 GET 不得返回 `userId = null` 的旧任务，也不得用只含 `id` 的查询回退。

- [ ] **Step 5: 删除新增 ImageHistoryItem 写入链路**

从 image route 删除 `persistImageHistoryItems`、`persistImageHistoryItemsAfterResponse`、`persistImageHistoryItemsForCompletion` 及所有调用。生成历史继续由项目目录 `output/history.json` 提供；不删除数据库旧行。

- [ ] **Step 6: 增加双用户路由回归测试**

测试数据包含同一个 `jobId` 请求分别以 user A、user B Session 调用：A 可读取自己的任务；B 得到 404；伪造 query/header 中的 user A 不改变结果。断言新完成任务不会调用 `prisma.imageHistoryItem.create`。

- [ ] **Step 7: 运行聚焦验证**

Run: `node --test src/lib/image-job-owner.test.ts src/app/api/ai/image/route.test.ts src/app/api/ai/storyboard/route.test.ts`

Expected: 三个测试文件全部 PASS。

Run: `npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 8: 提交任务隔离**

```bash
git add src/lib/image-job-owner.ts src/lib/image-job-owner.test.ts src/app/api/ai/image src/app/api/ai/storyboard
git commit -m "fix: isolate generated jobs by user"
```

### Task 9: 修复 MCP 身份来源并隔离 OSS 对象目录

**Files:**
- Create: `src/lib/mcp/auth-context.ts`
- Create: `src/lib/mcp/auth-context.test.ts`
- Modify: `src/app/api/mcp/route.ts`
- Create: `src/lib/user-storage-scope.ts`
- Create: `src/lib/user-storage-scope.test.ts`
- Modify: `src/lib/image-host.ts`
- Modify: `src/lib/media-host.ts`
- Modify: `src/app/api/image-hosting/upload/route.ts`
- Modify: `src/app/api/image-hosting/upload-url/route.ts`
- Modify: `src/app/api/media-hosting/upload/route.ts`
- Modify: `src/app/api/media-hosting/upload-url/route.ts`

- [ ] **Step 1: 写 MCP 伪造身份失败测试**

测试用 Session 用户 `user-a` 和请求头 `x-genlink-user-id: user-b` 调用 `buildCanvasToolAuthContext`，断言结果 `userId === "user-a"`；`projectId`、`canvasId` 仍从结构化参数读取，generate 权限仍要求确认头。

- [ ] **Step 2: 实现 Session 驱动的 MCP context**

```ts
export function buildCanvasToolAuthContext(params: {
  userId: string;
  request: Request;
  body: unknown;
}): CanvasToolAuthContext {
  return {
    userId: params.userId,
    projectId: readScopedValue(params.body, "projectId"),
    canvasId: readScopedValue(params.body, "canvasId") || "default",
    permissions: {
      read: true,
      write: true,
      generate: params.request.headers.get("x-genlink-confirm-generate") === "1",
    },
  };
}
```

`src/app/api/mcp/route.ts` 先 `requireAuth()`，再传 `access.session.user.id`；彻底删除 `x-genlink-user-id` 和 `dev-user` 身份回退。

- [ ] **Step 3: 写 OSS 命名空间失败测试**

```ts
test("storage namespace is stable and does not expose user id", () => {
  const value = createUserStorageNamespace("user-a", "test-secret");
  assert.match(value, /^[a-f0-9]{24}$/);
  assert.doesNotMatch(value, /user-a/);
  assert.equal(value, createUserStorageNamespace("user-a", "test-secret"));
  assert.notEqual(value, createUserStorageNamespace("user-b", "test-secret"));
});
```

- [ ] **Step 4: 实现服务端不可识别命名空间**

```ts
import "server-only";
import { createHmac } from "node:crypto";

export function createUserStorageNamespace(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 24);
}

export function getUserStorageFolder(userId: string, leaf: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");
  const safeLeaf = leaf.replace(/[^A-Za-z0-9/_-]+/g, "-").replace(/^\/+|\/+$/g, "");
  return `users/${createUserStorageNamespace(userId, secret)}/${safeLeaf || "uploads"}`;
}
```

- [ ] **Step 5: 服务端强制前缀**

四个上传 route 忽略客户端目录前缀，只把清理后的用途名称作为 leaf，并将 `getUserStorageFolder(userId, leaf)` 传给 `createAliyunOssUploadTarget`、`saveImageDataUrl`、`saveRemoteImageUrl`、`createAliyunMediaUploadTarget` 或 `uploadAliyunMediaObject`。现有 OSS URL 不改写、不移动。

- [ ] **Step 6: 验证 MCP 和 OSS**

Run: `node --test src/lib/mcp/auth-context.test.ts src/lib/user-storage-scope.test.ts src/lib/mcp/genlink-canvas-server.test.ts src/lib/mcp/genlink-canvas-tools.test.ts`

Expected: PASS。

Run: `npm run test:mcp:planf && npm run test:mcp:genlink-canvas`

Expected: 两组 MCP 聚焦测试 PASS。

- [ ] **Step 7: 提交 MCP 与上传隔离**

```bash
git add src/lib/mcp/auth-context.ts src/lib/mcp/auth-context.test.ts src/app/api/mcp/route.ts src/lib/user-storage-scope.ts src/lib/user-storage-scope.test.ts src/lib/image-host.ts src/lib/media-host.ts src/app/api/image-hosting src/app/api/media-hosting
git commit -m "fix: bind MCP and uploads to session owner"
```

### Task 10: 隔离 IndexedDB、API Key、Agent 历史和提示词收藏

**Files:**
- Create: `src/lib/browser-user-storage.ts`
- Create: `src/lib/browser-user-storage.test.ts`
- Modify: `src/lib/project-storage.ts`
- Modify: `src/lib/project-storage-audio.test.ts`
- Modify: `src/lib/agent-history.ts`
- Create: `src/lib/agent-history.test.ts`
- Modify: `src/lib/update-refresh-restore.ts`
- Modify: `src/lib/project-open-transition.test.ts`
- Modify: `src/store/canvas-store.ts`
- Modify: `src/store/prompt-library-store.ts`
- Modify: `src/store/prompt-library-store.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/project/ProjectLibrary.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: 写命名空间和一次性迁移测试**

```ts
export function userStorageKey(userId: string, baseKey: string): string {
  if (!userId.trim()) throw new Error("Authenticated user id is required");
  return `genlink.user.${encodeURIComponent(userId)}.${baseKey}`;
}
```

测试 user A/B 对同一 base key 得到不同 key；旧 key 只复制到第一个执行迁移的当前用户一次，作用域 key 已存在时不得覆盖，迁移后只读取作用域 key。

- [ ] **Step 2: 实现 localStorage helper**

```ts
export function migrateLegacyStorageValue(userId: string, baseKey: string): void {
  const scopedKey = userStorageKey(userId, baseKey);
  const marker = `genlink.legacy-claimed.v1.${baseKey}`;
  if (localStorage.getItem(marker) !== null) return;
  if (localStorage.getItem(scopedKey) === null) {
    const legacy = localStorage.getItem(baseKey);
    if (legacy !== null) localStorage.setItem(scopedKey, legacy);
  }
  localStorage.setItem(marker, userId);
}
```

迁移标记是每个旧 base key 的全局认领标记，而不是每用户标记；因此第一个升级后的已登录用户认领旧值，后续账号不会再次复制同一份旧数据。

- [ ] **Step 3: 升级项目句柄 IndexedDB 到 v2**

`PROJECT_DB_VERSION` 改为 `2`，`PersistedProjectRecord` 增加 `ownerUserId?: string`。upgrade 时为 `projects` store 创建 `ownerUserId` 非唯一索引；不要移动目录或修改 `project.json`。

增加 `claimLegacyProjectRecords(userId)`：在 readwrite cursor 中只给 `ownerUserId` 为空的记录写入当前用户 ID。`listProjectLibrary(userId)` 第一次先执行 claim，再只返回 `record.ownerUserId === userId`；create/import/duplicate 写入 owner；rename/delete/save 必须同时检查 record owner。

- [ ] **Step 4: 显式传递当前用户 ID**

`ProjectLibrary` 和 `InfiniteCanvas` 增加必填 `userId: string` prop。`src/app/page.tsx` 维护 `readyUserId`：Session 用户变化时先调用 `setActiveUserId(userId)`、`hydratePromptLibraryForUser(userId)` 和作用域恢复状态读取；全部完成后才设置 `readyUserId=userId` 并渲染应用区。在此之前继续显示现有进入加载层，禁止旧 store 内容闪现。应用区使用：

```tsx
<div key={session.data.user.id}>
  <ProjectLibrary userId={session.data.user.id} {...props} />
</div>
```

画布模式同样以 user ID 作为 remount key。项目库、canvas store 调用所有项目句柄 API 时传入该 user ID。

- [ ] **Step 5: 隔离 API 设置**

`readStoredApiSettings(userId)`、provider/model/API Key 的读写 helper 都通过 `userStorageKey`。`CanvasState` 增加 `activeUserId` 与 `setActiveUserId(userId)`；用户变化时清空 `nodes`、`edges`、`groups`、当前项目、选择、历史和 Agent 内存状态，再加载新用户设置。不得删除另一用户的 localStorage。

- [ ] **Step 6: 隔离 Agent 历史和草稿**

`listAgentThreads`、`deleteAgentThread`、`loadAgentDraft`、`saveAgentDraft` 和 `saveAgentThread` 的第一个参数统一为 `userId: string`，内部使用：

```ts
const historyKey = userStorageKey(userId, AGENT_HISTORY_STORAGE_KEY);
const draftKey = userStorageKey(userId, AGENT_DRAFT_STORAGE_KEY);
```

首次读取前调用一次旧值迁移；所有调用点传当前 `activeUserId`。

`src/lib/update-refresh-restore.ts` 的 `ACTIVE_MODE_KEY` 和 `RESTORE_KEY` 同样增加 `userId` 参数并通过 `userStorageKey` 作用域化；退出登录不删除另一用户的 sessionStorage。页面只读取当前 Session 用户的恢复状态，B 登录后不得恢复 A 的 projectId、viewport 或 canvas mode。

- [ ] **Step 7: 隔离提示词收藏**

将 Zustand persist 设置为 `skipHydration: true`。增加 `hydratePromptLibraryForUser(userId)`：先迁移旧 `prompt-library-storage`，再精确执行以下切换，账号切换时完成 rehydrate 后才显示 Prompt Library。

```ts
export async function hydratePromptLibraryForUser(userId: string): Promise<void> {
  migrateLegacyStorageValue(userId, "prompt-library-storage");
  usePromptLibraryStore.setState({
    favoritePrompts: {},
    communityPrompts: [],
    communityFetchedAt: null,
  });
  usePromptLibraryStore.persist.setOptions({
    name: userStorageKey(userId, "prompt-library-storage"),
  });
  await usePromptLibraryStore.persist.rehydrate();
}
```

- [ ] **Step 8: 写双用户回归测试**

覆盖：A 的项目句柄不出现在 B 列表；A/B 同名 API Key 互不可见；Agent history/draft 互不可见；收藏互不可见；刷新恢复状态互不可见；旧数据只由第一个用户认领一次；切换账号不会删除磁盘目录或另一用户命名空间，且 ready gate 生效前不渲染项目库或画布。

- [ ] **Step 9: 运行聚焦与静态验证**

Run: `node --test src/lib/browser-user-storage.test.ts src/lib/agent-history.test.ts src/lib/project-storage-audio.test.ts src/lib/project-open-transition.test.ts src/store/prompt-library-store.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit && npm run lint`

Expected: exit 0。

- [ ] **Step 10: 提交浏览器隔离**

```bash
git add src/lib/browser-user-storage.ts src/lib/browser-user-storage.test.ts src/lib/project-storage.ts src/lib/project-storage-audio.test.ts src/lib/agent-history.ts src/lib/agent-history.test.ts src/lib/update-refresh-restore.ts src/lib/project-open-transition.test.ts src/store/canvas-store.ts src/store/prompt-library-store.ts src/store/prompt-library-store.test.ts src/app/page.tsx src/components/project/ProjectLibrary.tsx src/components/canvas/InfiniteCanvas.tsx
git commit -m "fix: isolate browser data by authenticated user"
```

### Task 11: 让 Media Worker fail closed 并隔离任务

**Files:**
- Modify: `src/lib/video/clip-types.ts`
- Modify: `src/app/api/video/clip-jobs/route.ts`
- Modify: `src/app/api/video/clip-jobs/[jobId]/route.ts`
- Modify: `media-worker/app/main.py`
- Create: `media-worker/tests/test_auth_ownership.py`
- Create: `media-worker/requirements-dev.txt`

- [ ] **Step 1: 写 Worker 安全失败测试**

测试三项：缺少 `MEDIA_WORKER_TOKEN` 时模块启动失败；owner A 创建的任务由 owner B 查询得到 404；SQLite `jobs.payload` 中不包含 `apiKey` 或 `aiCredentials`。

- [ ] **Step 2: 固定测试依赖**

```txt
# media-worker/requirements-dev.txt
-r requirements.txt
pytest==8.4.1
httpx==0.28.1
```

- [ ] **Step 3: Worker 缺少 Token 时拒绝启动**

```py
WORKER_TOKEN = os.environ.get("MEDIA_WORKER_TOKEN", "").strip()
if not WORKER_TOKEN:
    raise RuntimeError("MEDIA_WORKER_TOKEN is required")
```

`authorize()` 始终要求精确 Bearer token，不再存在空 token 放行分支。

- [ ] **Step 4: 由 Next.js 代理传递内部 owner**

两个 clip-jobs route 先调用 `requireAuth()`，并同时要求 `WORKER_BASE_URL` 和 `WORKER_TOKEN` 非空，否则返回 503。发给 Worker 的 header 固定包含：

```ts
{
  Authorization: `Bearer ${WORKER_TOKEN}`,
  "X-GenLink-Owner-User-Id": access.session.user.id,
}
```

忽略任何浏览器传入的同名 owner header。

- [ ] **Step 5: Worker 持久化 owner 并校验查询**

创建任务时要求 `x_genlink_owner_user_id: str = Header(...)`，保存 `ownerUserId`。GET 读取任务后执行：

```py
if job.get("ownerUserId") != x_genlink_owner_user_id:
    raise HTTPException(status_code=404, detail="Job not found")
```

- [ ] **Step 6: API Key 只保存在进程内存**

```py
AI_CREDENTIALS: dict[str, list[dict[str, str]]] = {}

payload = request.model_dump(mode="json", exclude={"aiCredentials"})
if request.aiCredentials:
    AI_CREDENTIALS[job_id] = [item.model_dump() for item in request.aiCredentials]

# process_job 内只取一次，finally 删除
ai_credentials = AI_CREDENTIALS.pop(job_id, [])
```

SQLite job payload、日志和错误响应不得出现第三方 API Key。进程重启后尚未执行的 smart clip 可失败并提示重新提交，不能为了续跑把 Key 写入磁盘。

- [ ] **Step 7: 运行 Worker 测试**

Run: `python -m pip install -r media-worker/requirements-dev.txt`

Expected: install succeeds。

Run: `python -m pytest media-worker/tests/test_auth_ownership.py -q`

Expected: PASS。

Run: `npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 8: 提交 Worker 安全改造**

```bash
git add src/lib/video/clip-types.ts src/app/api/video/clip-jobs media-worker/app/main.py media-worker/tests/test_auth_ownership.py media-worker/requirements-dev.txt
git commit -m "fix: secure media worker jobs by owner"
```

### Task 12: 增加线上备份、迁移、候选启动和回滚门禁

**Files:**
- Create: `scripts/backup-production-sqlite.py`
- Create: `scripts/backup-production-sqlite.test.py`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy.test.ts`

- [ ] **Step 1: 写 SQLite 在线备份测试**

测试创建含一张表的活动 SQLite 数据库，执行脚本后检查备份文件非零、`PRAGMA integrity_check` 返回 `ok`、源库和备份库行数相同。

- [ ] **Step 2: 实现在线 Backup API 脚本**

```py
from pathlib import Path
import sqlite3
import sys

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
target.parent.mkdir(parents=True, exist_ok=True)

with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
    src.backup(dst)

if target.stat().st_size == 0:
    raise SystemExit("backup is empty")

with sqlite3.connect(target) as db:
    result = db.execute("PRAGMA integrity_check").fetchone()
if not result or result[0] != "ok":
    raise SystemExit(f"integrity_check failed: {result}")

print(f"backup_ok={target}")
```

- [ ] **Step 3: 扩展 deploy 静态测试**

断言 workflow 包含：`backup-production-sqlite.py`、`.env.production` 备份、`prisma migrate deploy`、候选端口 `3003`、候选检查成功后才执行 `ln -sfn "$RELEASE_DIR" "$CURRENT"`，以及失败时不切换 CURRENT。

- [ ] **Step 4: 在远端发布脚本中先备份**

依赖安装和 build 成功后创建：

```bash
BACKUP_DIR="$SHARED/backups/$(date +%Y%m%d%H%M%S)-${RELEASE_SHA:0:7}"
mkdir -p "$BACKUP_DIR"
python3 "$RELEASE_DIR/scripts/backup-production-sqlite.py" \
  "$SHARED/prisma/dev.db" "$BACKUP_DIR/dev.db"
cp -p "$SHARED/.env.production" "$BACKUP_DIR/.env.production"
test -s "$BACKUP_DIR/dev.db"
test -s "$BACKUP_DIR/.env.production"
```

不得输出 `.env.production` 内容。

- [ ] **Step 5: 备份后部署兼容 migration**

```bash
cd "$RELEASE_DIR"
export PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"
$DEPLOY_NPM exec prisma migrate deploy
```

- [ ] **Step 6: 在 3003 启动候选版本**

使用独立 PM2 名称 `genlink-agent-candidate` 和 release cwd 启动 `npm run start -- -p 3003`。依次检查 `/api/app-version` 包含当前 SHA、首页返回 200、Better Auth `/api/auth/get-session` 可访问、数据库可读取；成功后删除 candidate 进程。

- [ ] **Step 7: 候选成功后才切换**

候选检查通过后记录 `PREVIOUS_CURRENT="$(readlink -f "$CURRENT")"`，再执行现有 `ln -sfn "$RELEASE_DIR" "$CURRENT"`、`restart_worker`、`restart_app`。切换后的两个 restart 包在显式失败处理里：任一失败立即把 CURRENT 指回 `$PREVIOUS_CURRENT`，用旧 release 重启 Worker 和 App，然后以非零状态退出。任何备份、migration 或候选检查失败时 shell 的 `set -euo pipefail` 直接退出，CURRENT 保持旧 release。

- [ ] **Step 8: 保留兼容回滚**

workflow_dispatch 回滚只切回上一 release 并重启；由于 migration 仅增加可空列和更新验证标记，旧 release 仍可读取数据库。只有 integrity 异常才人工恢复 `BACKUP_DIR/dev.db`，普通应用回滚不覆盖数据库。

- [ ] **Step 9: 运行发布脚本测试**

Run: `python -m unittest scripts/backup-production-sqlite.test.py`

Expected: PASS。

Run: `node --test .github/workflows/deploy.test.ts`

Expected: PASS。

- [ ] **Step 10: 提交发布门禁**

```bash
git add scripts/backup-production-sqlite.py scripts/backup-production-sqlite.test.py .github/workflows/deploy.yml .github/workflows/deploy.test.ts
git commit -m "ci: add safe production migration rollout"
```

### Task 13: 全量验收与生产发布检查

**Files:**
- Modify only if a gate exposes a defect: the file owned by the failing task
- Verify: entire repository and Aliyun candidate/production endpoints

- [ ] **Step 1: 检查数据库迁移内容**

Run: `git diff d72aeab -- prisma/schema.prisma prisma/migrations`

Expected: 只有 `ImageJob.userId`/索引和现有用户 `emailVerified=1`；无 DROP TABLE、DELETE、VACUUM、User/Session/Account 重建。

- [ ] **Step 2: 运行全部本地门禁**

Run: `npx tsc --noEmit`

Expected: exit 0。

Run: `npm run lint`

Expected: exit 0。

Run: `npm test`

Expected: 0 failed。

Run: `npm run test:mcp:planf && npm run test:mcp:genlink-canvas`

Expected: 两组 PASS。

Run: `python -m pytest media-worker/tests/test_auth_ownership.py -q`

Expected: PASS。

Run: `npm audit --audit-level=high --registry=https://registry.npmjs.org`

Expected: 无 high/critical。

Run: `npm run build`

Expected: exit 0。

- [ ] **Step 3: 做本地双账号验收**

准备 user A 和 user B：A 创建项目、保存 API Key、Agent 草稿、提示词收藏和图像任务；退出后登录 B。B 不得看到 A 的项目句柄、Key、草稿、收藏或任务；切回 A 后原数据仍可见且项目目录文件未移动。

- [ ] **Step 4: 做 OTP 验收**

新邮箱注册应收到 6 位验证码；错误 3 次后旧 OTP 失效；10 分钟后过期；重发受 60 秒 3 次限制；未验证账号直接调用 Better Auth 密码登录必须失败；验证成功后才创建登录 Session。

- [ ] **Step 5: 发布前人工确认**

确认 GitHub Secrets 可连接阿里云、`SHARED/.env.production` 中已有且未更改 `BETTER_AUTH_SECRET`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`MEDIA_WORKER_TOKEN`，共享数据库路径为 `/www/GenLink_shared/prisma/dev.db`。不在聊天、提交或 CI 日志中展示这些值。

- [ ] **Step 6: 触发发布并观察门禁**

仅在所有本地门禁通过且用户明确同意上线后 push。确认 Actions 日志依次出现非空备份、integrity ok、migration success、3003 candidate success，然后才出现 CURRENT switch 和 PM2 restart。

- [ ] **Step 7: 生产冒烟测试**

验证现有用户保持登录或可用原密码登录；新用户 OTP 注册；项目库和现有本地项目；图片/视频/音频请求；上传；剪辑 Worker；MCP 读操作和需确认的写/生成操作。伪造 Cookie、`x-genlink-user-id` 和另一用户 job ID 均不得取得数据。

- [ ] **Step 8: 完成或回滚**

全部冒烟通过后保留 release 和时间戳备份并记录版本 SHA。若应用异常，立即通过 workflow_dispatch 切回上一 release；只有 SQLite integrity 异常时才停服务并从本次备份恢复数据库。

## 设计覆盖自审索引

- 官方 Email OTP、10 分钟、6 位、3 次错误、hash、发送限流：Tasks 4-5。
- 现有用户先标记验证、密码/Session/Cookie 不变：Task 6。
- Route 内真实 Session、伪造 Cookie 无效、统一 401：Task 7。
- ImageJob 用户归属、旧无归属任务不可见、不再写 base64 历史：Task 8。
- MCP 不信任身份头、OSS 用户目录：Task 9。
- IndexedDB、API Key、Agent、收藏隔离和一次性认领：Task 10。
- Worker fail closed、owner 校验、API Key 不落盘：Task 11。
- Next.js 安全升级、离线字体、tracing 和锁文件：Task 3。
- 线上 Backup API、migration、候选启动、切换与回滚：Task 12。
- 全量质量门禁和不影响现有用户的验收：Task 13。
