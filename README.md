# GenLink

AI-native creative canvas scaffolded with Next.js App Router, TypeScript, Tailwind, React Flow, Zustand, and Prisma.

## Current Status
- **Core MVP Completed:** Infinite canvas UI, React Flow integration, custom node components (Text, Prompt, AI Text, Image), floating toolbars, and global Zustand state management are fully implemented.

## Quick Start

```bash
npm install
npx prisma generate
npm run dev
```

Open `http://localhost:3000` to view the GenLink creative workspace.

## Image Input

Claude image-to-text flows now work best with Anthropic-style `base64` image blocks instead of public URLs. Public image hosting is optional and is mainly useful for sharing or external asset delivery.

See the full write-up here:

- [docs/claude-image-integration.md](/E:/GenLink/docs/claude-image-integration.md)

## Optional Image Hosting

If you still want OSS/CDN-backed public image URLs, configure Aliyun OSS in `.env`:

```bash
ALIYUN_OSS_BUCKET="your-bucket"
ALIYUN_OSS_REGION="cn-hangzhou"
ALIYUN_OSS_ACCESS_KEY_ID="your-access-key-id"
ALIYUN_OSS_ACCESS_KEY_SECRET="your-access-key-secret"
ALIYUN_OSS_PUBLIC_BASE_URL="https://your-cdn-or-bucket-domain"
```

`ALIYUN_OSS_PUBLIC_BASE_URL` is optional. If omitted, the app uses the default bucket URL.

## Available Scripts

```bash
npm run dev
npm run build
npm run lint
```
