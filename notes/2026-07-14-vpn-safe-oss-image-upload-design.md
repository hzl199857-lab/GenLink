# VPN 环境下的 OSS 图片上传设计

## 背景

GenLink 线上站点部署在阿里云，图片最终保存到阿里云 OSS。当前浏览器图片上传存在两类实现：

- `src/lib/browser-oss-upload.ts` 已支持浏览器直传 OSS，并在网络异常或非成功响应时回退到同源服务端上传。
- `src/components/canvas/CanvasAgentPanel.tsx` 和 `src/store/canvas-store.ts` 仍保留各自的 OSS 直传实现。这些实现拿到签名 URL 后直接执行跨域 `PUT`，失败时不会走服务端回退。

当用户开启全局 VPN 或代理后，浏览器到阿里云 OSS 的跨域上传可能在 TLS、跨境链路或代理节点处失败。站点和同源 API 仍可访问，但参考图或生成图无法上传。

## 目标

- 线上环境的浏览器不直接向 OSS 上传图片。
- 浏览器只向 GenLink 同源 API 上传图片，由阿里云服务器写入 OSS。
- 用户是否开启 VPN 不影响图片上传。
- 保留公共上传 helper 的直传加回退能力，供本地开发或其他部署环境按需使用。
- 不改变图片 URL、OSS 对象目录和项目快照字段。

## 非目标

- 本次不修改视频或音频上传策略。
- 本次不引入 CDN、分片上传或断点续传。
- 本次不改变旧 JSON、Data URL 和 `multipart/form-data` 上传契约已有的 20MB 限制；新的浏览器主链路使用独立的流式上传契约。
- 本次不修改 OSS Bucket、CORS 或域名解析配置。

## 方案

### 1. 统一图片上传入口

所有浏览器图片 Blob 上传统一调用 `uploadImageAsset`：

- `CanvasAgentPanel` 的原图、预览图和语义图上传不再自行申请签名 URL 和执行 OSS `PUT`。
- `canvas-store` 中的 `uploadImageBlobToOss` 改为调用同一个 helper，覆盖生成图和同源图片持久化场景。
- `InfiniteCanvas` 已使用该 helper，保持现状。

公共 helper 继续返回：

```ts
{
  hostedUrl: string;
  mode: "direct" | "server";
}
```

调用方只使用稳定的 `hostedUrl`，不依赖具体上传模式。

### 2. 线上强制服务端上传

阿里云生产部署设置：

```env
NEXT_PUBLIC_IMAGE_UPLOAD_MODE=server
```

部署工作流在构建前写入该变量。因为它是 `NEXT_PUBLIC_` 变量，必须在 `next build` 前存在，不能只在 PM2 重启时设置。

生产数据流为：

```text
浏览器
  -> POST /api/image-hosting/upload-stream（原始图片请求体）
  -> Next.js 服务端校验登录、类型和 100MB 上限
  -> 服务端边接收边写入阿里云 OSS 内网 endpoint
  -> 返回公开 imageUrl
```

浏览器不再访问 OSS 签名上传地址，因此用户 VPN 路由不会影响上传链路。

### 3. 流式上传契约

新增 `POST /api/image-hosting/upload-stream`，专门处理浏览器图片 Blob：

- 必须登录。
- 请求体直接使用图片 Blob，不包装成 JSON、Data URL 或 `multipart/form-data`。
- `Content-Type` 必须为 `image/*`。
- `Content-Length` 必须存在且不能超过 100MB。
- `fileName` 和 `folder` 作为 URL 查询参数传递，服务端继续使用现有 helper 清理文件名和对象目录。
- 服务端为 OSS 内网 endpoint 创建签名目标，并将请求体以流的形式转发到 OSS。
- 转发流必须统计实际字节数；即使声明的 `Content-Length` 不正确，实际超过 100MB 时也立即中止并返回 413。
- 客户端取消上传时，服务端同时取消 OSS 上游请求。
- API Key、OSS 签名、内部 endpoint 和本地绝对路径不返回浏览器。

现有 `/api/image-hosting/upload` 继续服务旧 JSON、Data URL、远程图片导入和兼容调用，保留原有 20MB 限制。新的浏览器主链路不再把完整图片读入 Buffer，也不再进行 Base64 编解码。

## 错误处理

- 同源上传请求失败时，显示服务端返回的中文错误信息。
- `direct-with-fallback` 模式下，网络异常和 OSS 非 2xx 响应继续自动回退服务端上传。
- `server` 模式不申请签名 URL，也不发起跨域 OSS `PUT`。
- 缺少长度、类型非法或元数据非法时返回 400；超过 100MB 时返回 413；OSS 上游失败时返回摘要化的 502。
- 不静默返回本地 `blob:` URL 作为长期项目数据。

## 涉及文件

- `src/lib/browser-oss-upload.ts`
- `src/lib/browser-oss-upload.test.ts`
- `src/app/api/image-hosting/upload-stream/route.ts`
- `src/app/api/image-hosting/upload-stream/route.test.ts`
- `src/lib/image-host.ts`
- `src/components/canvas/CanvasAgentPanel.tsx`
- `src/store/canvas-store.ts`
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy.test.ts`
- `.env.example`
- `deploy/.env.production.example`

## 测试设计

### 聚焦测试

- `server` 策略只请求 `/api/image-hosting/upload-stream`。
- `direct-with-fallback` 在 OSS `PUT` 抛出网络异常时改走服务端。
- `direct-with-fallback` 在 OSS 返回非 2xx 时改走服务端。
- 流式路由拒绝非图片类型、缺少长度和超过 100MB 的请求。
- 流式路由不会把完整请求体转换为 Buffer 或 Base64，并在实际流量超过限制时中止。
- 流式路由通过 OSS 内网签名目标返回稳定的公开 URL。
- Agent 图片上传和生成图持久化不再包含独立的签名 URL 加跨域 `PUT` 实现。
- 部署工作流在 `npm run build` 前写入 `NEXT_PUBLIC_IMAGE_UPLOAD_MODE=server`。

### 验证命令

```bash
node --test src/lib/browser-oss-upload.test.ts
node --test src/app/api/image-hosting/upload-stream/route.test.ts
node --test .github/workflows/deploy.test.ts
npx tsc --noEmit
npm run lint
```

### 线上验收

1. 开启全局 VPN。
2. 在 Agent 面板上传参考图。
3. 在画布上传图片，并触发生成图持久化。
4. 浏览器网络面板中应看到同源 `/api/image-hosting/upload-stream`，不应出现浏览器到 `*.aliyuncs.com` 的上传 `PUT`。
5. 分别验证普通图片和大于 20MB、小于等于 100MB 的图片都能上传。
6. 超过 100MB 的图片应立即得到明确的大小限制提示。
7. 返回 URL 应为稳定的 OSS 公网 URL，刷新项目后图片仍可加载。

## 风险与取舍

- 图片流量会经过 GenLink 服务器，增加服务器入口和出口流量；流式转发避免图片体积等量占用 Node.js 内存。
- 单图上限与现有 Nginx `client_max_body_size 100m` 对齐。若以后调整任一侧，上限必须同步，避免代理层与应用层行为不一致。
- 服务端中转比正常的 OSS 浏览器直传多一跳，但服务器与 OSS 可使用阿里云内网 endpoint，稳定性优先于少量延迟差异。
- 视频和音频仍保留现有策略；若后续确认 VPN 环境也受影响，应单独设计分片、断点续传和更长超时，不能直接照搬图片的单请求上传契约。
