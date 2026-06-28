# Canvas Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-styled blank-canvas right-click menu with upload, add-node, undo, redo, and node paste actions.

**Architecture:** Add a focused presentational `CanvasContextMenu` component with its own render tests. Wire it into `InfiniteCanvas.tsx` through ReactFlow blank-pane context-menu handling, keeping upload, add-node, undo, redo, and copy/paste behavior owned by the existing canvas container and store.

**Tech Stack:** Next.js 16, React 19, ReactFlow 11, Zustand, Tailwind CSS, lucide-react, node:test.

---

## File Structure

- Create `src/components/canvas/CanvasContextMenu.tsx`: presentational right-click menu component, shortcut labels, disabled state styling, and viewport clamping helper.
- Create `src/components/canvas/CanvasContextMenu.test.ts`: server-render tests for menu labels, platform shortcuts, disabled state, and clamped style output.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: add context-menu state, close handlers, right-click pane handler, context-menu action dispatchers, right-click upload position, and right-click paste placement.
- No store changes are expected because `undoStack`, `redoStack`, `undo`, `redo`, and node copy buffers already exist.

## Tasks

### Task 1: Build and Test `CanvasContextMenu`

**Files:**
- Create: `src/components/canvas/CanvasContextMenu.tsx`
- Create: `src/components/canvas/CanvasContextMenu.test.ts`

- [ ] **Step 1: Write the failing component test**

Create `src/components/canvas/CanvasContextMenu.test.ts`:

```ts
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
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
const {
  CanvasContextMenu,
  getCanvasContextMenuPosition,
  getCanvasContextMenuShortcuts,
} = require("./CanvasContextMenu.tsx") as typeof import("./CanvasContextMenu");

test("renders canvas context menu actions in the requested order", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 20,
      y: 30,
      canUndo: true,
      canRedo: true,
      canPaste: true,
      platform: "windows",
    }),
  );

  const uploadIndex = html.indexOf("上传");
  const addNodeIndex = html.indexOf("添加节点");
  const undoIndex = html.indexOf("撤销");
  const redoIndex = html.indexOf("重做");
  const pasteIndex = html.indexOf("粘贴");

  assert.ok(uploadIndex !== -1);
  assert.ok(addNodeIndex > uploadIndex);
  assert.ok(undoIndex > addNodeIndex);
  assert.ok(redoIndex > undoIndex);
  assert.ok(pasteIndex > redoIndex);
});

test("renders platform-specific shortcut labels", () => {
  assert.deepEqual(getCanvasContextMenuShortcuts("windows"), {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    paste: "Ctrl+V",
  });
  assert.deepEqual(getCanvasContextMenuShortcuts("mac"), {
    undo: "⌘Z",
    redo: "⇧⌘Z",
    paste: "⌘V",
  });
});

test("marks unavailable undo redo and paste actions as disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasContextMenu, {
      x: 20,
      y: 30,
      canUndo: false,
      canRedo: false,
      canPaste: false,
      platform: "windows",
    }),
  );

  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /opacity-40/);
});

test("clamps menu position to viewport edges", () => {
  assert.deepEqual(
    getCanvasContextMenuPosition({
      x: 490,
      y: 390,
      viewportWidth: 500,
      viewportHeight: 400,
    }),
    { x: 292, y: 218 },
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test src/components/canvas/CanvasContextMenu.test.ts
```

Expected: FAIL because `CanvasContextMenu.tsx` does not exist.

- [ ] **Step 3: Implement the menu component**

Create `src/components/canvas/CanvasContextMenu.tsx`:

```tsx
"use client";

import React from "react";
import { Plus, RotateCcw, RotateCw, Upload, Clipboard } from "lucide-react";

export type CanvasContextMenuPlatform = "mac" | "windows";

export interface CanvasContextMenuProps {
  x: number;
  y: number;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  platform: CanvasContextMenuPlatform;
  onUpload?: () => void;
  onAddNode?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPaste?: () => void;
}

const MENU_WIDTH = 196;
const MENU_HEIGHT = 182;
const VIEWPORT_MARGIN = 8;

export function getCanvasContextMenuShortcuts(platform: CanvasContextMenuPlatform) {
  if (platform === "mac") {
    return {
      undo: "⌘Z",
      redo: "⇧⌘Z",
      paste: "⌘V",
    };
  }

  return {
    undo: "Ctrl+Z",
    redo: "Ctrl+Shift+Z",
    paste: "Ctrl+V",
  };
}

export function getCanvasContextMenuPosition({
  x,
  y,
  viewportWidth,
  viewportHeight,
}: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, viewportHeight - MENU_HEIGHT - VIEWPORT_MARGIN)),
  };
}

function MenuButton({
  label,
  shortcut,
  disabled = false,
  icon: Icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        "flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-medium text-gl-text-primary transition-colors",
        disabled
          ? "cursor-default opacity-40"
          : "hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none",
      ].join(" ")}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-white/[0.06] text-gl-text-secondary">
        <Icon size={14} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <span className="shrink-0 text-[11px] font-medium text-gl-text-muted">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-white/[0.06]" />;
}

export function CanvasContextMenu({
  x,
  y,
  canUndo,
  canRedo,
  canPaste,
  platform,
  onUpload,
  onAddNode,
  onUndo,
  onRedo,
  onPaste,
}: CanvasContextMenuProps) {
  const position = getCanvasContextMenuPosition({
    x,
    y,
    viewportWidth: typeof window === "undefined" ? 1024 : window.innerWidth,
    viewportHeight: typeof window === "undefined" ? 768 : window.innerHeight,
  });
  const shortcuts = getCanvasContextMenuShortcuts(platform);

  return (
    <div
      className="fixed z-[70] w-[196px] rounded-[12px] border border-white/10 bg-[#191A1C]/95 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <MenuButton label="上传" icon={Upload} onClick={onUpload} />
      <MenuButton label="添加节点" icon={Plus} onClick={onAddNode} />
      <Divider />
      <MenuButton
        label="撤销"
        shortcut={shortcuts.undo}
        icon={RotateCcw}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <MenuButton
        label="重做"
        shortcut={shortcuts.redo}
        icon={RotateCw}
        disabled={!canRedo}
        onClick={onRedo}
      />
      <Divider />
      <MenuButton
        label="粘贴"
        shortcut={shortcuts.paste}
        icon={Clipboard}
        disabled={!canPaste}
        onClick={onPaste}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the component test and verify it passes**

Run:

```bash
node --test src/components/canvas/CanvasContextMenu.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/components/canvas/CanvasContextMenu.tsx src/components/canvas/CanvasContextMenu.test.ts
git commit -m "Add canvas context menu component"
```

### Task 2: Wire Right-Click State Into `InfiniteCanvas`

**Files:**
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add imports and store selectors**

Modify imports near the existing `AddNodeMenu` import:

```tsx
import { CanvasContextMenu, type CanvasContextMenuPlatform } from './CanvasContextMenu';
```

Add store selectors near existing `undo` and `redo` selectors:

```tsx
const undoStackLength = useCanvasStore((s) => s.undoStack.length);
const redoStackLength = useCanvasStore((s) => s.redoStack.length);
```

- [ ] **Step 2: Add context-menu state and refs**

Add state near the existing `addMenu` state:

```tsx
const [contextMenu, setContextMenu] = useState<{
  screen: { x: number; y: number };
  canvas: { x: number; y: number };
} | null>(null);
const contextMenuUploadPositionRef = useRef<{ x: number; y: number } | null>(null);
```

Add platform detection near other memoized UI values:

```tsx
const contextMenuPlatform = useMemo<CanvasContextMenuPlatform>(() => {
  if (typeof navigator === 'undefined') {
    return 'windows';
  }

  return /mac/i.test(navigator.platform) ? 'mac' : 'windows';
}, []);
```

- [ ] **Step 3: Add close and open handlers**

Add handlers near other pane handlers:

```tsx
const closeContextMenu = useCallback(() => {
  setContextMenu(null);
}, []);

const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();

  const canvasPosition = project({
    x: event.clientX,
    y: event.clientY,
  });

  setContextMenu({
    screen: {
      x: event.clientX,
      y: event.clientY,
    },
    canvas: canvasPosition,
  });
  setAddMenu(null);
  clearConnectionMenu();
  setImageInfoPopover(null);
}, [clearConnectionMenu, project]);
```

Add `Esc` close effect:

```tsx
useEffect(() => {
  if (!contextMenu) {
    return;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setContextMenu(null);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [contextMenu]);
```

- [ ] **Step 4: Close the menu from existing canvas interactions**

At the top of `handlePaneClick`, `handleViewportMove`, and any pane mouse-down handler that clears selection, call:

```tsx
setContextMenu(null);
```

Add the ReactFlow prop:

```tsx
onPaneContextMenu={handlePaneContextMenu}
```

- [ ] **Step 5: Render the menu**

Render after the `AddNodeMenu` blocks:

```tsx
{contextMenu ? (
  <CanvasContextMenu
    x={contextMenu.screen.x}
    y={contextMenu.screen.y}
    canUndo={undoStackLength > 0}
    canRedo={redoStackLength > 0}
    canPaste={copiedNodesRef.current.length > 0}
    platform={contextMenuPlatform}
    onUpload={handleContextMenuUpload}
    onAddNode={handleContextMenuAddNode}
    onUndo={handleContextMenuUndo}
    onRedo={handleContextMenuRedo}
    onPaste={handleContextMenuPaste}
  />
) : null}
```

This step will not compile until Task 3 adds the action handlers.

### Task 3: Implement Context Menu Actions

**Files:**
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add a target-position clone helper**

Near `handlePasteNodes`, add:

```tsx
const handlePasteNodesAtPosition = useCallback((targetPosition: { x: number; y: number }) => {
  if (copiedNodesRef.current.length === 0) {
    return false;
  }

  const minX = Math.min(...copiedNodesRef.current.map((node) => node.position.x));
  const minY = Math.min(...copiedNodesRef.current.map((node) => node.position.y));
  const dx = targetPosition.x - minX;
  const dy = targetPosition.y - minY;

  pasteCountRef.current += 1;

  const pastedNodes = copiedNodesRef.current.map((node) => {
    const cloned = cloneCanvasNode(node, pasteCountRef.current);
    return {
      ...cloned,
      position: {
        x: node.position.x + dx,
        y: node.position.y + dy,
      },
    };
  });

  addNodes(pastedNodes);
  setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
  setActiveNodeId(pastedNodes.length === 1 ? pastedNodes[0].id : null);
  clearEdgeSelection();
  return true;
}, [addNodes, clearEdgeSelection]);
```

- [ ] **Step 2: Add menu action handlers**

Add these handlers before the return:

```tsx
const handleContextMenuUpload = useCallback(() => {
  if (!contextMenu) {
    return;
  }

  contextMenuUploadPositionRef.current = contextMenu.canvas;
  setContextMenu(null);
  uploadInputRef.current?.click();
}, [contextMenu]);

const handleContextMenuAddNode = useCallback(() => {
  if (!contextMenu) {
    return;
  }

  setAddMenu({
    screen: contextMenu.screen,
    canvas: contextMenu.canvas,
  });
  setContextMenu(null);
}, [contextMenu]);

const handleContextMenuUndo = useCallback(() => {
  if (undoStackLength === 0) {
    return;
  }

  setContextMenu(null);
  undo();
}, [undo, undoStackLength]);

const handleContextMenuRedo = useCallback(() => {
  if (redoStackLength === 0) {
    return;
  }

  setContextMenu(null);
  redo();
}, [redo, redoStackLength]);

const handleContextMenuPaste = useCallback(() => {
  if (!contextMenu) {
    return;
  }

  if (handlePasteNodesAtPosition(contextMenu.canvas)) {
    setContextMenu(null);
  }
}, [contextMenu, handlePasteNodesAtPosition]);
```

- [ ] **Step 3: Route file input uploads to the context-menu position**

In `handleUploadInputChange`, find the base position calculation. Replace the default base position with:

```tsx
const contextMenuUploadPosition = contextMenuUploadPositionRef.current;
contextMenuUploadPositionRef.current = null;
const basePosition = contextMenuUploadPosition ?? project({
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
});
```

Keep existing file filtering and `addUploadedImages`, `addUploadedVideos`, and audio import calls using `basePosition`.

- [ ] **Step 4: Run typecheck and focused tests**

Run:

```bash
node --test src/components/canvas/CanvasContextMenu.test.ts
npx tsc --noEmit
```

Expected: both commands pass.

- [ ] **Step 5: Commit Tasks 2 and 3**

Run:

```bash
git add src/components/canvas/InfiniteCanvas.tsx
git commit -m "Wire canvas context menu actions"
```

### Task 4: Verify UI Behavior in the App

**Files:**
- Verify: `src/components/canvas/CanvasContextMenu.tsx`
- Verify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Run lint and tests**

Run:

```bash
npm run lint
node --test src/components/canvas/CanvasContextMenu.test.ts src/components/canvas/AddNodeMenu.test.ts
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 2: Start or reuse the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js serves the app on an available local port, usually `http://localhost:3000`.

- [ ] **Step 3: Manual verification checklist**

In the browser:

- Right-click blank canvas space. Expected: dark context menu appears at the pointer.
- Right-click near the bottom-right viewport edge. Expected: menu stays inside the viewport.
- Right-click a node. Expected: the blank-canvas context menu does not open.
- Click Upload and select a media file. Expected: imported node appears from the right-click canvas location.
- Click Add node. Expected: context menu closes and existing add-node menu opens at the same location.
- Copy a node with `Ctrl+C`, right-click blank canvas, click Paste. Expected: pasted node appears at the right-click canvas location and becomes selected.
- With no copied node, right-click blank canvas. Expected: Paste is visible but disabled.
- After a canvas edit, right-click blank canvas. Expected: Undo is enabled; after undo, Redo is enabled.
- Open the menu and press `Esc`. Expected: menu closes.
- Open the menu and left-click elsewhere. Expected: menu closes.

- [ ] **Step 4: Commit any verification fixes**

If fixes were needed, run:

```bash
git add src/components/canvas/CanvasContextMenu.tsx src/components/canvas/CanvasContextMenu.test.ts src/components/canvas/InfiniteCanvas.tsx
git commit -m "Polish canvas context menu behavior"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: tasks cover blank-pane trigger, project visual style, upload, add-node, undo, redo, paste, disabled states, viewport clamping, closing rules, tests, and manual verification.
- Placeholder scan: the plan contains no TODO/TBD placeholders and no undefined follow-up tasks.
- Type consistency: `CanvasContextMenuPlatform`, `contextMenu`, `contextMenuUploadPositionRef`, and `handlePasteNodesAtPosition` are introduced before later steps reference them.

