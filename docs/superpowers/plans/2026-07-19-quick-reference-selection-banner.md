# Quick Reference Selection Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有由节点发起的快捷参考选择状态增加底部常驻提示条，并支持返回来源节点和退出选择状态。

**Architecture:** 保留 `InfiniteCanvas` 中现有的 `quickReferenceConnect` 临时状态和 ReactFlow 聚焦逻辑。新增一个无状态画布 UI 组件负责提示条展示，`InfiniteCanvas` 仅在节点目标模式下渲染它，并通过回调完成选择、聚焦和退出。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Tailwind CSS、ReactFlow、Lucide React、Node.js 原生测试运行器。

---

## File Structure

- Create: `src/components/canvas/QuickReferenceSelectionBanner.tsx` — 底部提示条的视觉结构、可访问标签和按钮回调。
- Create: `src/components/canvas/QuickReferenceSelectionBanner.test.ts` — 渲染组件验证文案和布局，并检查 `InfiniteCanvas` 接线。
- Modify: `src/components/canvas/InfiniteCanvas.tsx` — 接入提示条、返回节点处理器和退出处理器。
- Include: `docs/superpowers/plans/2026-07-19-quick-reference-selection-banner.md` — 本实施计划。

### Task 1: Add failing banner and canvas-wiring tests

**Files:**
- Create: `src/components/canvas/QuickReferenceSelectionBanner.test.ts`
- Inspect: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write the failing component and integration-source tests**

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const componentPath = fileURLToPath(
  new URL("./QuickReferenceSelectionBanner.tsx", import.meta.url),
);

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const bannerModule = existsSync(componentPath)
  ? require(componentPath) as typeof import("./QuickReferenceSelectionBanner")
  : null;
const infiniteCanvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("renders the persistent quick reference selection controls", () => {
  assert.ok(bannerModule, "expected QuickReferenceSelectionBanner to exist");

  const html = renderToStaticMarkup(
    React.createElement(bannerModule.QuickReferenceSelectionBanner, {
      onReturnToNode: () => {},
      onExit: () => {},
    }),
  );

  assert.match(html, /从画布选择参考/u);
  assert.match(html, /返回节点/u);
  assert.match(html, /退出/u);
  assert.match(html, /fixed/);
  assert.match(html, /bottom-6/);
  assert.match(html, /pointer-events-auto/);
});

test("wires the banner buttons to return and exit callbacks", () => {
  const source = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";

  assert.match(source, /onClick=\{onReturnToNode\}/);
  assert.match(source, /onClick=\{onExit\}/);
});

test("shows the banner only for node targets and returns without exiting", () => {
  assert.match(
    infiniteCanvasSource,
    /quickReferenceConnect\?\.targetKind === 'node'[\s\S]*?<QuickReferenceSelectionBanner/,
  );
  assert.match(
    infiniteCanvasSource,
    /const handleReturnToQuickReferenceTarget = useCallback\([\s\S]*?selectSingleNode\(targetNodeId\);[\s\S]*?focusSingleNodeViewport\(targetNodeId\);/,
  );
  assert.match(
    infiniteCanvasSource,
    /<QuickReferenceSelectionBanner[\s\S]*?onReturnToNode=\{handleReturnToQuickReferenceTarget\}[\s\S]*?onExit=\{stopQuickReferenceConnect\}/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the RED state**

Run: `node --test src/components/canvas/QuickReferenceSelectionBanner.test.ts`

Expected: FAIL with assertion failures stating that `QuickReferenceSelectionBanner` and the `InfiniteCanvas` wiring are missing. Fix syntax or loader errors until the failures come from the intended assertions.

### Task 2: Implement the stateless banner and canvas behavior

**Files:**
- Create: `src/components/canvas/QuickReferenceSelectionBanner.tsx`
- Modify: `src/components/canvas/InfiniteCanvas.tsx:202-218`
- Modify: `src/components/canvas/InfiniteCanvas.tsx:11777-11785`
- Modify: `src/components/canvas/InfiniteCanvas.tsx:15549-15558`

- [ ] **Step 1: Create the banner component with the approved visual hierarchy**

```tsx
'use client';

import { MousePointer2 } from 'lucide-react';

export function QuickReferenceSelectionBanner({
  onReturnToNode,
  onExit,
}: {
  onReturnToNode: () => void;
  onExit: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[75] flex justify-center px-4">
      <div
        data-canvas-menu-ignore="true"
        className="nodrag nopan pointer-events-auto flex items-center gap-2 rounded-[16px] border border-white/10 bg-[#242527]/95 p-2 text-white shadow-[0_18px_42px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-white/80">
          <MousePointer2 size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="whitespace-nowrap px-1 text-[14px] font-semibold">
          从画布选择参考
        </span>
        <button
          type="button"
          className="h-9 rounded-[9px] bg-white/[0.09] px-4 text-[13px] font-semibold text-white/86 transition-colors hover:bg-white/[0.14] hover:text-white"
          onClick={onReturnToNode}
        >
          返回节点
        </button>
        <button
          type="button"
          className="h-9 rounded-[9px] bg-white px-4 text-[13px] font-semibold text-[#202124] transition-colors hover:bg-white/90"
          onClick={onExit}
        >
          退出
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Import the component into `InfiniteCanvas.tsx`**

```ts
import { QuickReferenceSelectionBanner } from './QuickReferenceSelectionBanner';
```

- [ ] **Step 3: Add the return-to-target handler after `selectSingleNode`**

```ts
  const handleReturnToQuickReferenceTarget = useCallback(() => {
    if (!quickReferenceConnect || quickReferenceConnect.targetKind !== 'node') {
      return;
    }

    const targetNodeId = quickReferenceConnect.targetNodeId;
    selectSingleNode(targetNodeId);
    focusSingleNodeViewport(targetNodeId);
  }, [focusSingleNodeViewport, quickReferenceConnect, selectSingleNode]);
```

This handler intentionally does not call `setQuickReferenceConnect(null)` or `stopQuickReferenceConnect()`.

- [ ] **Step 4: Render the banner only for node-target selection mode**

Place it after the existing `saveMessage` block in the `InnerCanvas` return fragment:

```tsx
      {quickReferenceConnect?.targetKind === 'node' ? (
        <QuickReferenceSelectionBanner
          onReturnToNode={handleReturnToQuickReferenceTarget}
          onExit={stopQuickReferenceConnect}
        />
      ) : null}
```

- [ ] **Step 5: Run the focused test and verify the GREEN state**

Run: `node --test src/components/canvas/QuickReferenceSelectionBanner.test.ts`

Expected: PASS with 3 tests and 0 failures. The package-type warning is acceptable because existing tests produce it too.

- [ ] **Step 6: Review the diff for scope and interaction regressions**

Run:

```powershell
git diff --check
git diff -- src/components/canvas/QuickReferenceSelectionBanner.tsx src/components/canvas/QuickReferenceSelectionBanner.test.ts src/components/canvas/InfiniteCanvas.tsx
```

Expected: no whitespace errors; changes limited to the new component, focused test, import, return handler and conditional render.

### Task 3: Run project verification and commit the feature

**Files:**
- Verify: `src/components/canvas/QuickReferenceSelectionBanner.tsx`
- Verify: `src/components/canvas/QuickReferenceSelectionBanner.test.ts`
- Verify: `src/components/canvas/InfiniteCanvas.tsx`
- Include: `docs/superpowers/plans/2026-07-19-quick-reference-selection-banner.md`

- [ ] **Step 1: Re-run the focused regression test**

Run: `node --test src/components/canvas/QuickReferenceSelectionBanner.test.ts`

Expected: PASS, 3 tests and 0 failures.

- [ ] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run lint validation**

Run: `npm run lint`

Expected: exit code 0. If unrelated pre-existing warnings or errors exist, record their exact file and message without expanding feature scope.

- [ ] **Step 4: Confirm repository scope before staging**

Run:

```powershell
git status --short
git diff --check
```

Expected: only feature files are unstaged; no whitespace errors.

- [ ] **Step 5: Stage only this feature and commit**

```powershell
git add -- src/components/canvas/QuickReferenceSelectionBanner.tsx src/components/canvas/QuickReferenceSelectionBanner.test.ts src/components/canvas/InfiniteCanvas.tsx
git add -f -- docs/superpowers/plans/2026-07-19-quick-reference-selection-banner.md
git commit -m "feat: add quick reference selection controls"
```

- [ ] **Step 6: Verify the committed result**

```powershell
git status --short
git show --stat --oneline HEAD
```

Expected: clean worktree and a commit containing exactly the banner component, its test, `InfiniteCanvas` wiring and this plan.

## Follow-up: Agent panel quick reference mode

The Agent panel uses the same `quickReferenceConnect` state and the same bottom banner. `onReturnToNode` is optional: node targets receive the existing return handler, while Agent targets omit it and therefore render only “退出”. The legacy Agent-only `showProjectMessage` call is removed so the persistent banner is the sole selection-state prompt.
