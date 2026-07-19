# Canvas Create Draft and Active Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new canvases collect a name before creation, show the existing canvas-entry loading animation during persistence, and make the active canvas unmistakable in the switcher.

**Architecture:** Keep the uncommitted name draft local to `CanvasSwitcher`, pass only the final name through `CanvasHeader` into `InfiniteCanvas`, and let the existing Zustand Store remain the single source of persisted canvas data. Reuse `UniqueLoading` for a focused creation overlay and extend the existing default-name helper so both legacy spaced names and new compact names share one collision-free sequence.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Zustand, Node test runner with `tsx`.

---

## File map

- `src/lib/canvas/multi-canvas.ts`: generate compact collision-free default canvas names.
- `src/lib/canvas/multi-canvas.test.ts`: specify legacy and compact default-name compatibility.
- `src/store/canvas-store.ts`: accept the confirmed canvas name and persist it.
- `src/store/canvas-store-multi-canvas.test.ts`: verify custom and empty-name creation behavior.
- `src/components/canvas/CanvasSwitcher.tsx`: own the temporary creation input and active-row indicator behavior.
- `src/components/canvas/CanvasHeader.tsx`: update the create callback contract.
- `src/components/canvas/CanvasHeader.test.ts`: specify the draft input, submit/cancel, indicator, and loader wiring.
- `src/components/canvas/InfiniteCanvas.tsx`: pass the final name and display the creation loading overlay.

### Task 1: Default name allocation and Store contract

**Files:**
- Modify: `src/lib/canvas/multi-canvas.test.ts`
- Modify: `src/lib/canvas/multi-canvas.ts`
- Modify: `src/store/canvas-store-multi-canvas.test.ts`
- Modify: `src/store/canvas-store.ts`

- [ ] **Step 1: Write failing helper tests**

Add assertions that the allocator reads both historical and new formats but emits the new compact format:

```ts
test("allocates the first compact canvas name across legacy and compact names", () => {
  assert.equal(getNextCanvasName(["画布 1", "画布2", "画布 3", "概念设计"]), "画布4");
  assert.equal(getNextCanvasName(["画布2", "画布 4"]), "画布1");
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```powershell
npx tsx --test src/lib/canvas/multi-canvas.test.ts
```

Expected: FAIL because `getNextCanvasName` only recognizes whitespace-separated names and returns `画布 N`.

- [ ] **Step 3: Implement compact compatible allocation**

Replace the name parser and return value with:

```ts
export function getNextCanvasName(existingNames: string[]): string {
  const usedNumbers = new Set(
    existingNames.flatMap((name) => {
      const match = /^画布\s*(\d+)$/.exec(name.trim());
      return match ? [Number.parseInt(match[1], 10)] : [];
    }),
  );

  let index = 1;
  while (usedNumbers.has(index)) index += 1;
  return `画布${index}`;
}
```

- [ ] **Step 4: Write failing Store tests**

Extend the blank-canvas test so the public API accepts a name and falls back on empty input:

```ts
const customCanvasId = await canvasStore.useCanvasStore.getState().createCanvas("  分镜方案  ");
assert.equal(
  canvasStore.useCanvasStore.getState().projectCanvases.find((item) => item.id === customCanvasId)?.name,
  "分镜方案",
);

const defaultCanvasId = await canvasStore.useCanvasStore.getState().createCanvas("   ");
assert.equal(
  canvasStore.useCanvasStore.getState().projectCanvases.find((item) => item.id === defaultCanvasId)?.name,
  "画布1",
);
```

Use a fixture whose existing name is not a default-number name when asserting the `画布1` fallback.

- [ ] **Step 5: Run the Store test and verify RED**

Run:

```powershell
npx tsx --test src/store/canvas-store-multi-canvas.test.ts
```

Expected: FAIL because `createCanvas` has no name parameter and always allocates internally.

- [ ] **Step 6: Implement the Store signature and sanitization**

Change the interface and implementation to:

```ts
createCanvas: (name?: string) => Promise<string>;

createCanvas: async (name) => {
  // existing scope/save setup
  const requestedName = name?.trim();
  const canvasName = requestedName
    || getNextCanvasName(state.projectCanvases.map((canvas) => canvas.name));
  // existing metadata, save, and state update
}
```

- [ ] **Step 7: Run helper and Store tests and verify GREEN**

Run:

```powershell
npx tsx --test src/lib/canvas/multi-canvas.test.ts src/store/canvas-store-multi-canvas.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/lib/canvas/multi-canvas.ts src/lib/canvas/multi-canvas.test.ts src/store/canvas-store.ts src/store/canvas-store-multi-canvas.test.ts
git commit -m "feat: accept names when creating canvases"
```

### Task 2: Draft creation input and active-row affordance

**Files:**
- Modify: `src/components/canvas/CanvasHeader.test.ts`
- Modify: `src/components/canvas/CanvasHeader.tsx`
- Modify: `src/components/canvas/CanvasSwitcher.tsx`

- [ ] **Step 1: Write failing switcher contract tests**

Add source-level assertions matching the project’s existing component tests:

```ts
test("new canvas creation is drafted before the callback runs", () => {
  const source = readSource("CanvasSwitcher.tsx");
  assert.match(source, /const \[creatingCanvas, setCreatingCanvas\] = useState\(false\)/);
  assert.match(source, /const \[createDefaultName, setCreateDefaultName\] = useState\(''\)/);
  assert.match(source, /const \[createDraft, setCreateDraft\] = useState\(''\)/);
  assert.match(source, /onCreateCanvas\?: \(name: string\)/);
  assert.match(source, /onBlur=\{commitCreate\}/);
  assert.match(source, /event\.key === 'Escape'[\s\S]*cancelCreate\(\)/);
  assert.match(source, /createDraft\.trim\(\) \|\| createDefaultName/);
});

test("the active canvas check swaps with a fixed-width action button", () => {
  const source = readSource("CanvasSwitcher.tsx");
  assert.match(source, /aria-checked=\{current\}/);
  assert.match(source, /group-hover\/canvas-row:hidden/);
  assert.match(source, /group-hover\/canvas-row:opacity-100/);
  assert.match(source, /shrink-0/);
});
```

- [ ] **Step 2: Run the Header test and verify RED**

Run:

```powershell
npx tsx --test src/components/canvas/CanvasHeader.test.ts
```

Expected: FAIL because the plus button calls `onCreateCanvas` immediately and the callback takes no name.

- [ ] **Step 3: Implement the temporary creation state**

In `CanvasSwitcher`, add:

```ts
const createInputRef = useRef<HTMLInputElement | null>(null);
const createSubmittingRef = useRef(false);
const [creatingCanvas, setCreatingCanvas] = useState(false);
const [createDefaultName, setCreateDefaultName] = useState('');
const [createDraft, setCreateDraft] = useState('');
```

Use `getNextCanvasName(canvases.map(({ name }) => name))` when the plus button is clicked. Set both name states, clear rename/action states, and focus/select `createInputRef` in an effect.

- [ ] **Step 4: Implement submit, blur deduplication, and Escape cancellation**

Add focused handlers:

```ts
const cancelCreate = () => {
  createSubmittingRef.current = false;
  setCreatingCanvas(false);
  setCreateDefaultName('');
  setCreateDraft('');
};

const commitCreate = () => {
  if (!creatingCanvas || createSubmittingRef.current) return;
  createSubmittingRef.current = true;
  const name = createDraft.trim() || createDefaultName;
  setCreatingCanvas(false);
  onOpenChange(false);
  void Promise.resolve(onCreateCanvas?.(name)).finally(() => {
    createSubmittingRef.current = false;
    setCreateDefaultName('');
    setCreateDraft('');
  });
};
```

Render the temporary input above persisted canvas rows. Enter calls `blur()`, blur calls `commitCreate`, and Escape prevents propagation and calls `cancelCreate`.

- [ ] **Step 5: Keep creation state mutually exclusive and accessible**

Update `changeOpen(false)` to clear creation state, make arrow-key navigation return early while creating, and use `aria-label="新画布名称"`. Disable the plus button while a draft is already active.

- [ ] **Step 6: Stabilize the current check and ellipsis layout**

Wrap the right-side affordances in a fixed-size container:

```tsx
<span className="relative ml-2 h-7 w-7 shrink-0">
  <Check className={current ? 'absolute inset-0 m-auto group-hover/canvas-row:hidden group-focus-within/canvas-row:hidden' : 'hidden'} />
  <button className={current ? '... opacity-0 group-hover/canvas-row:opacity-100 group-focus-within/canvas-row:opacity-100' : '...'}>
    <Ellipsis />
  </button>
</span>
```

Keep the existing action menu callbacks and keyboard focus restoration unchanged.

- [ ] **Step 7: Update `CanvasHeader` callback typing**

Change only the create callback contract:

```ts
onCreateCanvas?: (name: string) => void | Promise<void>;
```

- [ ] **Step 8: Run Header tests and verify GREEN**

Run:

```powershell
npx tsx --test src/components/canvas/CanvasHeader.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/components/canvas/CanvasHeader.test.ts src/components/canvas/CanvasHeader.tsx src/components/canvas/CanvasSwitcher.tsx
git commit -m "feat: draft canvas names before creation"
```

### Task 3: Creation loading overlay and final wiring

**Files:**
- Modify: `src/components/canvas/CanvasHeader.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write failing loading and wiring tests**

Add assertions for the name parameter and creation-only loader lifecycle:

```ts
test("InfiniteCanvas shows the shared loader while creating a named canvas", () => {
  const source = readSource("InfiniteCanvas.tsx");
  assert.match(source, /const \[canvasCreateLoading, setCanvasCreateLoading\] = useState\(false\)/);
  assert.match(source, /onCreateCanvas=\{\(name\) =>/);
  assert.match(source, /createCanvas\(name\)/);
  assert.match(source, /setCanvasCreateLoading\(true\)[\s\S]*finally[\s\S]*setCanvasCreateLoading\(false\)/);
  assert.match(source, /<UniqueLoading variant="squares" size="lg" \/>/);
  assert.match(source, /正在创建画布/);
});
```

- [ ] **Step 2: Run the Header test and verify RED**

Run:

```powershell
npx tsx --test src/components/canvas/CanvasHeader.test.ts
```

Expected: FAIL because `InfiniteCanvas` does not pass a name or render a creation loader.

- [ ] **Step 3: Implement a focused named-create handler**

Add state and a callback near the existing Header handlers:

```ts
const [canvasCreateLoading, setCanvasCreateLoading] = useState(false);

const handleCreateCanvas = useCallback(async (name: string) => {
  if (!ensureCanvasWriteAvailable()) return;
  setCanvasCreateLoading(true);
  try {
    await runCanvasHeaderAction(() => createCanvas(name), '新建画布失败');
  } finally {
    setCanvasCreateLoading(false);
  }
}, [createCanvas, ensureCanvasWriteAvailable, runCanvasHeaderAction]);
```

Wire it as `onCreateCanvas={handleCreateCanvas}` and keep all other Header actions on their existing paths.

- [ ] **Step 4: Render the shared creation loader**

Render above the canvas and dialogs with the same loader component and visual language as `page.tsx`:

```tsx
{canvasCreateLoading ? (
  <div className="fixed inset-0 z-[180] flex flex-col items-center justify-center bg-[#08090b] text-white">
    <UniqueLoading variant="squares" size="lg" />
    <div className="mt-6 text-[12px] font-medium text-white/58">正在创建画布</div>
  </div>
) : null}
```

Use the existing Header pending state for operation serialization; do not add a second write-operation gate.

- [ ] **Step 5: Run the focused UI tests and verify GREEN**

Run:

```powershell
npx tsx --test src/components/canvas/CanvasHeader.test.ts src/lib/canvas/canvas-edit-lock.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/components/canvas/CanvasHeader.test.ts src/components/canvas/InfiniteCanvas.tsx
git commit -m "feat: show canvas creation loading state"
```

### Task 4: Regression and visual verification

**Files:**
- Verify only; modify scoped files only if a failing check reveals a regression.

- [ ] **Step 1: Run all multi-canvas regression tests**

```powershell
npx tsx --test src/lib/canvas/multi-canvas.test.ts src/lib/project-storage-multi-canvas.test.ts src/store/canvas-store-multi-canvas.test.ts src/store/canvas-user-scope-async.test.ts src/lib/agent-history-isolation.test.ts src/lib/canvas/canvas-edit-lock.test.ts src/components/canvas/CanvasHeader.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run static and production checks**

```powershell
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0; pre-existing unrelated lint/build warnings may remain but no new errors are introduced.

- [ ] **Step 3: Verify the browser interaction**

At the local application:

1. Open a project and its canvas switcher.
2. Click “+” and confirm no canvas is persisted before submit.
3. Confirm the suggested `画布N` is selected.
4. Clear the input and press Enter; confirm a default-named canvas is created.
5. Start another draft and press Escape; confirm no canvas is created.
6. Start another draft and click outside; confirm the typed name is created.
7. Confirm the nine-square loader and “正在创建画布” appear during creation.
8. Confirm the active row shows a check, and hover/focus swaps it for the ellipsis without layout movement.

- [ ] **Step 4: Inspect final repository state**

```powershell
git status --short
git log -5 --oneline
```

Expected: only intentional commits and no unrelated working-tree changes.
