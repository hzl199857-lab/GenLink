# GenLink 项目专属规则

通用 workflow 见用户级 `~/.claude/CLAUDE.md`。这里只列 GenLink 特有的。

## 技术栈

- Next.js (TypeScript)
- Prisma
- ESLint
- Tailwind

## 验证命令

- 类型检查: `npx tsc --noEmit`
- Lint: `npm run lint`

## Prisma（重要）

`prisma generate` 和 `prisma migrate` 在国内必须走 npmmirror 镜像，否则下载引擎会卡死：

```bash
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma npx prisma generate
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma npx prisma migrate dev --name <name>
```

## 跨 AI 协作注意

如果用 Gemini 作为 sub-agent 干活：Gemini 倾向于无视"不要 commit"指令，措辞要强硬——直接写"严禁执行任何 git commit / git add / git push 命令，违反则任务作废"，不要用委婉说法。
