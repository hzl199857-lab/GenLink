# Node Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a node right-click menu that matches the existing blank-canvas context menu and supports the confirmed node actions.

**Architecture:** Add a focused presentational `NodeContextMenu` plus a small testable helper module for node capabilities, clipboard payloads, and export metadata. Wire the menu into `InfiniteCanvas.tsx` through ReactFlow `onNodeContextMenu`, reusing existing selection, internal copy/paste, Agent quick-reference, download, and title-edit patterns where possible.

**Tech Stack:** Next.js 16, React 19, ReactFlow 11, Zustand, Tailwind CSS, lucide-react, node:test, TypeScript.

---

## File Structure

- Create `src/components/canvas/NodeContextMenu.tsx`: presentational node right-click menu, disabled states, dividers, icons, and viewport clamping.
- Create `src/components/canvas/NodeContextMenu.test.ts`: server-render tests for order, disabled rows, removed file-manager item, placeholder asset row, and clamped positioning.
- Create `src/lib/canvas/node-context-actions.ts`: pure helper functions for node capability checks, clipboard text, export metadata, and Agent image attachment creation.
- Create `src/lib/canvas/node-context-actions.test.ts`: tests for representative node types and disabled/enabled behavior.
- Modify `src/components/nodes/EditableNodeTitle.tsx`: add an external edit request prop so the context menu can trigger inline rename.
- Modify node components that render `EditableNodeTitle`: pass the external edit request id to the title component.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: add `nodeContextMenu` state, ReactFlow `onNodeContextMenu`, menu rendering, action handlers, save-as helpers, title edit requests, and selection/multi-selection handling.

## Tasks

### Task 1: Build `NodeContextMenu`

**Files:**
- Create: `src/components/canvas/NodeContextMenu.tsx`
- Create: `src/components/canvas/NodeContextMenu.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/canvas/NodeContextMenu.test.ts`:

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
  NodeContextMenu,
  getNodeContextMenuPosition,
} = require("./NodeContextMenu.tsx") as typeof import("./NodeContextMenu");

const allEnabled = {
  canAddToConversation: true,
  canCopyContent: true,
  canSaveAs: true,
  canRename: true,
  canCopyNode: true,
  canDelete: true,
};

test("renders node actions in the confirmed order", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  const addToConversation = html.indexOf("\u6dfb\u52a0\u5230\u5bf9\u8bdd");
  const copy = html.indexOf("\u590d\u5236");
  const saveAs = html.indexOf("\u53e6\u5b58\u4e3a");
  const rename = html.indexOf("\u91cd\u547d\u540d");
  const copyNode = html.indexOf("\u590d\u5236\u8282\u70b9");
  const saveAsset = html.indexOf("\u5b58\u4e3a\u8d44\u4ea7");
  const deleteItem = html.indexOf("\u5220\u9664");

  assert.notEqual(addToConversation, -1);
  assert.ok(addToConversation < copy);
  assert.ok(copy < saveAs);
  assert.ok(saveAs < rename);
  assert.ok(rename < copyNode);
  assert.ok(copyNode < saveAsset);
  assert.ok(saveAsset < deleteItem);
});

test("keeps save-as-asset visible but disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  assert.match(html, /\u5b58\u4e3a\u8d44\u4ea7/);
  assert.match(html, /data-action="save-as-asset"[^>]*disabled=""/);
});

test("does not render show-in-file-manager", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      ...allEnabled,
    }),
  );

  assert.doesNotMatch(html, /\u6587\u4ef6\u7ba1\u7406\u5668/);
});

test("renders unavailable actions as disabled", () => {
  const html = renderToStaticMarkup(
    React.createElement(NodeContextMenu, {
      x: 24,
      y: 36,
      canAddToConversation: false,
      canCopyContent: false,
      canSaveAs: false,
      canRename: false,
      canCopyNode: true,
      canDelete: true,
    }),
  );

  const disabledMatches = html.match(/aria-disabled="true"/g) ?? [];
  assert.equal(disabledMatches.length, 5);
});

test("clamps node context menu inside the viewport", () => {
  assert.deepEqual(
    getNodeContextMenuPosition({
      x: 900,
      y: 700,
      viewportWidth: 920,
      viewportHeight: 720,
    }),
    { x: 716, y: 464 },
  );
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
node --test src/components/canvas/NodeContextMenu.test.ts
```

Expected: FAIL because `NodeContextMenu.tsx` does not exist.

- [ ] **Step 3: Implement `NodeContextMenu.tsx`**

Create `src/components/canvas/NodeContextMenu.tsx`:

```tsx
import {
  Copy,
  Download,
  FolderPlus,
  MessageSquarePlus,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

export interface NodeContextMenuProps {
  x: number;
  y: number;
  canAddToConversation: boolean;
  canCopyContent: boolean;
  canSaveAs: boolean;
  canRename: boolean;
  canCopyNode: boolean;
  canDelete: boolean;
  onAddToConversation?: () => void;
  onCopyContent?: () => void;
  onSaveAs?: () => void;
  onRename?: () => void;
  onCopyNode?: () => void;
  onDelete?: () => void;
}

interface NodeContextMenuPositionInput {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}

const MENU_WIDTH = 196;
const MENU_HEIGHT = 248;
const VIEWPORT_MARGIN = 8;
const FALLBACK_VIEWPORT_WIDTH = 1024;
const FALLBACK_VIEWPORT_HEIGHT = 768;

export function getNodeContextMenuPosition({
  x,
  y,
  viewportWidth,
  viewportHeight,
}: NodeContextMenuPositionInput) {
  const maxX = viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN;
  const maxY = viewportHeight - MENU_HEIGHT - VIEWPORT_MARGIN;

  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, maxX)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, maxY)),
  };
}

export function NodeContextMenu({
  x,
  y,
  canAddToConversation,
  canCopyContent,
  canSaveAs,
  canRename,
  canCopyNode,
  canDelete,
  onAddToConversation,
  onCopyContent,
  onSaveAs,
  onRename,
  onCopyNode,
  onDelete,
}: NodeContextMenuProps) {
  const viewportWidth =
    typeof window === "undefined" ? FALLBACK_VIEWPORT_WIDTH : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? FALLBACK_VIEWPORT_HEIGHT : window.innerHeight;
  const position = getNodeContextMenuPosition({ x, y, viewportWidth, viewportHeight });

  return (
    <div
      className="fixed z-[70] w-[196px] rounded-[12px] border border-white/10 bg-[#191A1C]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuButton
        action="add-to-conversation"
        icon={<MessageSquarePlus size={16} />}
        label={"\u6dfb\u52a0\u5230\u5bf9\u8bdd"}
        disabled={!canAddToConversation}
        onClick={canAddToConversation ? onAddToConversation : undefined}
      />
      <MenuButton
        action="copy-content"
        icon={<Copy size={16} />}
        label={"\u590d\u5236"}
        disabled={!canCopyContent}
        onClick={canCopyContent ? onCopyContent : undefined}
      />
      <MenuButton
        action="save-as"
        icon={<Download size={16} />}
        label={"\u53e6\u5b58\u4e3a"}
        disabled={!canSaveAs}
        onClick={canSaveAs ? onSaveAs : undefined}
      />
      <MenuButton
        action="rename"
        icon={<Pencil size={16} />}
        label={"\u91cd\u547d\u540d"}
        disabled={!canRename}
        onClick={canRename ? onRename : undefined}
      />
      <MenuDivider />
      <MenuButton
        action="copy-node"
        icon={<Save size={16} />}
        label={"\u590d\u5236\u8282\u70b9"}
        disabled={!canCopyNode}
        onClick={canCopyNode ? onCopyNode : undefined}
      />
      <MenuButton
        action="save-as-asset"
        icon={<FolderPlus size={16} />}
        label={"\u5b58\u4e3a\u8d44\u4ea7"}
        disabled
      />
      <MenuDivider />
      <MenuButton
        action="delete"
        icon={<Trash2 size={16} />}
        label={"\u5220\u9664"}
        disabled={!canDelete}
        onClick={canDelete ? onDelete : undefined}
      />
    </div>
  );
}

interface MenuButtonProps {
  action: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}

function MenuButton({ action, icon, label, disabled = false, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      data-action={action}
      className={[
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-white transition-colors",
        disabled ? "cursor-default opacity-40" : "hover:bg-white/10",
      ].join(" ")}
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      onClick={disabled ? undefined : onClick}
    >
      <span className="flex size-4 items-center justify-center text-white/70">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-white/10" role="separator" />;
}
```

- [ ] **Step 4: Verify the component test passes**

Run:

```bash
node --test src/components/canvas/NodeContextMenu.test.ts
```

Expected: PASS.

### Task 2: Add Pure Node Action Helpers

**Files:**
- Create: `src/lib/canvas/node-context-actions.ts`
- Create: `src/lib/canvas/node-context-actions.test.ts`

- [ ] **Step 1: Write helper tests**

Create `src/lib/canvas/node-context-actions.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanvasNode } from "@/types/canvas";
import {
  createAgentAttachmentFromNode,
  getNodeClipboardText,
  getNodeExport,
  getNodeTitle,
  isNodeRenameable,
} from "./node-context-actions";

const imageNode: CanvasNode = {
  id: "image-1",
  type: "image",
  position: { x: 0, y: 0 },
  data: {
    title: "Product",
    imageUrl: "https://example.com/image.png",
    hostedImageUrl: "https://cdn.example.com/image.png",
    prompt: "product image",
    width: 640,
    height: 480,
    generatedAt: "2026-07-01T00:00:00.000Z",
  },
};

const textNode: CanvasNode = {
  id: "text-1",
  type: "text",
  position: { x: 0, y: 0 },
  data: {
    title: "Brief",
    text: "Line one\nLine two",
  },
};

test("creates Agent image attachment only from image-capable nodes", () => {
  const attachment = createAgentAttachmentFromNode(imageNode);

  assert.equal(attachment?.sourceNodeId, "image-1");
  assert.equal(attachment?.kind, "image");
  assert.equal(attachment?.imageUrl, "https://cdn.example.com/image.png");
  assert.equal(createAgentAttachmentFromNode(textNode), null);
});

test("gets clipboard text from text and media nodes", () => {
  assert.equal(getNodeClipboardText(textNode), "Line one\nLine two");
  assert.equal(getNodeClipboardText(imageNode), "https://cdn.example.com/image.png");
});

test("gets export metadata for text and image nodes", () => {
  assert.deepEqual(getNodeExport(textNode), {
    kind: "text",
    text: "Line one\nLine two",
    fileName: "Brief.txt",
    mimeType: "text/plain;charset=utf-8",
  });

  assert.deepEqual(getNodeExport(imageNode), {
    kind: "url",
    url: "https://cdn.example.com/image.png",
    fileName: "Product.png",
    mimeType: "image/png",
  });
});

test("resolves node titles and renameability", () => {
  assert.equal(getNodeTitle(textNode), "Brief");
  assert.equal(isNodeRenameable(textNode), true);
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
node --test src/lib/canvas/node-context-actions.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/lib/canvas/node-context-actions.ts`:

```ts
import type { AgentTaskAttachment } from "@/types/agent";
import type { CanvasNode } from "@/types/canvas";
import { inferExtension, sanitizeFileStem } from "@/lib/project-storage";

export type NodeExport =
  | {
      kind: "url";
      url: string;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: "text";
      text: string;
      fileName: string;
      mimeType: string;
    };

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function titleStem(node: CanvasNode, fallback: string): string {
  return sanitizeFileStem(getNodeTitle(node) || fallback);
}

function fileNameWithExtension(node: CanvasNode, fallback: string, extension: string): string {
  const stem = titleStem(node, fallback);
  return stem.toLowerCase().endsWith(`.${extension}`) ? stem : `${stem}.${extension}`;
}

function imageUrlFromNode(node: CanvasNode): string {
  if (node.type === "image_generation") {
    return clean(node.data.generatedHostedImageUrl) || clean(node.data.generatedImageUrl);
  }

  if (node.type === "image") {
    return clean(node.data.hostedImageUrl) || clean(node.data.imageUrl);
  }

  if (node.type === "uploaded_image") {
    return clean(node.data.hostedImageUrl) || clean(node.data.imageUrl);
  }

  return "";
}

function videoUrlFromNode(node: CanvasNode): string {
  if (node.type === "video_generation" || node.type === "video_upscale") {
    return clean(node.data.hostedVideoUrl) || clean(node.data.videoUrl);
  }

  if (node.type === "video") {
    return clean(node.data.hostedVideoUrl) || clean(node.data.videoUrl);
  }

  return "";
}

function audioUrlFromNode(node: CanvasNode): string {
  if (node.type === "audio_generation") {
    return clean(node.data.hostedAudioUrl) || clean(node.data.audioUrl);
  }

  if (node.type === "audio") {
    return clean(node.data.hostedAudioUrl) || clean(node.data.audioUrl);
  }

  return "";
}

export function getNodeTitle(node: CanvasNode): string {
  if ("title" in node.data && typeof node.data.title === "string") {
    return node.data.title.trim();
  }

  if (node.type === "audio_generation") {
    return node.data.songTitle?.trim() || node.data.generatedAudioTitle?.trim() || "";
  }

  return "";
}

export function isNodeRenameable(node: CanvasNode): boolean {
  return "title" in node.data || node.type === "audio_generation";
}

export function createAgentAttachmentFromNode(node: CanvasNode): AgentTaskAttachment | null {
  const imageUrl = imageUrlFromNode(node);

  if (!imageUrl) {
    return null;
  }

  const name = getNodeTitle(node) || node.id;
  const width =
    node.type === "image_generation"
      ? node.data.generatedImageWidth
      : node.type === "image" || node.type === "uploaded_image"
        ? node.data.width
        : undefined;
  const height =
    node.type === "image_generation"
      ? node.data.generatedImageHeight
      : node.type === "image" || node.type === "uploaded_image"
        ? node.data.height
        : undefined;

  return {
    id: `node-${node.id}`,
    kind: "image",
    name,
    mimeType: "image/*",
    imageUrl,
    hostedImageUrl: imageUrl,
    originalImageUrl: imageUrl,
    previewUrl: imageUrl,
    thumbnailUrl: imageUrl,
    semanticImageUrl:
      node.type === "image_generation"
        ? node.data.generatedHostedImageUrl || node.data.generatedImageUrl
        : node.type === "image" || node.type === "uploaded_image"
          ? node.data.semanticImageUrl
          : undefined,
    width,
    height,
    sizeBytes:
      node.type === "image_generation"
        ? node.data.generatedImageSizeBytes
        : node.type === "image" || node.type === "uploaded_image"
          ? node.data.sizeBytes
          : undefined,
    status: "attached",
    sourceNodeId: node.id,
  };
}

export function getNodeClipboardText(node: CanvasNode): string | null {
  if (node.type === "text") {
    return clean(node.data.text) || null;
  }

  if (node.type === "storyboard_script") {
    return clean(node.data.rawJson) || clean(node.data.prompt) || null;
  }

  if (node.type === "ai_text_result") {
    return clean(node.data.content) || null;
  }

  const mediaUrl = imageUrlFromNode(node) || videoUrlFromNode(node) || audioUrlFromNode(node);
  if (mediaUrl) {
    return mediaUrl;
  }

  if (
    node.type === "image_generation" ||
    node.type === "video_generation" ||
    node.type === "audio_generation" ||
    node.type === "video_upscale"
  ) {
    return clean(node.data.prompt) || null;
  }

  return null;
}

export function getNodeExport(node: CanvasNode): NodeExport | null {
  if (node.type === "text") {
    const text = clean(node.data.text);
    return text
      ? {
          kind: "text",
          text,
          fileName: fileNameWithExtension(node, "text", "txt"),
          mimeType: "text/plain;charset=utf-8",
        }
      : null;
  }

  if (node.type === "storyboard_script") {
    const text = clean(node.data.rawJson) || clean(node.data.prompt);
    return text
      ? {
          kind: "text",
          text,
          fileName: fileNameWithExtension(node, "storyboard", "txt"),
          mimeType: "text/plain;charset=utf-8",
        }
      : null;
  }

  if (node.type === "ai_text_result") {
    const text = clean(node.data.content);
    return text
      ? {
          kind: "text",
          text,
          fileName: fileNameWithExtension(node, "text-result", "txt"),
          mimeType: "text/plain;charset=utf-8",
        }
      : null;
  }

  const imageUrl = imageUrlFromNode(node);
  if (imageUrl) {
    const extension =
      node.type === "image_generation"
        ? inferExtension(node.data.generatedImageFormat)
        : "png";
    return {
      kind: "url",
      url: imageUrl,
      fileName: fileNameWithExtension(node, "image", extension),
      mimeType: extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`,
    };
  }

  const videoUrl = videoUrlFromNode(node);
  if (videoUrl) {
    return {
      kind: "url",
      url: videoUrl,
      fileName: fileNameWithExtension(node, "video", "mp4"),
      mimeType: "video/mp4",
    };
  }

  const audioUrl = audioUrlFromNode(node);
  if (audioUrl) {
    return {
      kind: "url",
      url: audioUrl,
      fileName: fileNameWithExtension(node, "audio", "mp3"),
      mimeType: "audio/mpeg",
    };
  }

  return null;
}
```

- [ ] **Step 4: Verify helper tests pass**

Run:

```bash
node --test src/lib/canvas/node-context-actions.test.ts
```

Expected: PASS.

### Task 3: Add External Inline Rename Trigger

**Files:**
- Modify: `src/components/nodes/EditableNodeTitle.tsx`
- Modify: node components using `EditableNodeTitle`

- [ ] **Step 1: Update `EditableNodeTitle` API**

Modify `EditableNodeTitleProps`:

```tsx
export interface EditableNodeTitleProps {
  value?: string;
  fallbackValue: string;
  className?: string;
  inputClassName?: string;
  editRequestId?: number;
  onCommit?: (nextTitle: string | undefined) => void;
}
```

Destructure `editRequestId`, add a ref, and add this effect:

```tsx
const lastEditRequestIdRef = useRef<number | undefined>(undefined);

useEffect(() => {
  if (editRequestId === undefined || editRequestId === lastEditRequestIdRef.current) {
    return;
  }

  lastEditRequestIdRef.current = editRequestId;
  setDraft(value?.trim() || fallbackValue);
  setEditing(true);
}, [editRequestId, fallbackValue, value]);
```

- [ ] **Step 2: Thread edit request through node components**

For every component that renders `EditableNodeTitle`, add an optional prop:

```tsx
titleEditRequestId?: number;
```

Pass it to `EditableNodeTitle`:

```tsx
<EditableNodeTitle
  value={data.title}
  fallbackValue="Text"
  editRequestId={titleEditRequestId}
  ...
/>
```

Apply the same pattern to:

- `src/components/nodes/TextNode.tsx`
- `src/components/nodes/StoryboardScriptNode.tsx`
- `src/components/nodes/ImageGenerationNode.tsx`
- `src/components/nodes/VideoGenerationNode.tsx`
- `src/components/nodes/AudioGenerationNode.tsx`
- `src/components/nodes/VideoUpscaleNode.tsx`
- `src/components/nodes/AITextResultNode.tsx`
- `src/components/nodes/UploadedImageNode.tsx`
- `src/components/nodes/UploadedVideoNode.tsx`
- `src/components/nodes/UploadedAudioNode.tsx`
- `src/components/nodes/Panorama360Node.tsx`

- [ ] **Step 3: Thread edit request from node adapters**

In `src/components/canvas/InfiniteCanvas.tsx`, add:

```tsx
const [nodeTitleEditRequest, setNodeTitleEditRequest] = useState<{
  nodeId: string;
  requestId: number;
} | null>(null);
```

Where each adapter renders a node component, pass:

```tsx
titleEditRequestId={renderData.canvasTitleEditRequestId}
```

When mapping store nodes to ReactFlow nodes, add:

```tsx
canvasTitleEditRequestId:
  nodeTitleEditRequest?.nodeId === node.id ? nodeTitleEditRequest.requestId : undefined,
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

### Task 4: Wire Node Context Menu Into `InfiniteCanvas`

**Files:**
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add imports**

Import the component and helpers:

```tsx
import { NodeContextMenu } from './NodeContextMenu';
import {
  createAgentAttachmentFromNode,
  getNodeClipboardText,
  getNodeExport,
  isNodeRenameable,
  type NodeExport,
} from '@/lib/canvas/node-context-actions';
```

- [ ] **Step 2: Add node menu state**

Near `contextMenu` state, add:

```tsx
const [nodeContextMenu, setNodeContextMenu] = useState<{
  nodeId: string;
  screen: { x: number; y: number };
} | null>(null);
```

Update all existing menu close paths that call `setContextMenu(null)` or `setAddMenu(null)` for broad canvas cleanup to also call:

```tsx
setNodeContextMenu(null);
```

- [ ] **Step 3: Add ReactFlow node context handler**

Add:

```tsx
const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: ReactFlowNode) => {
  event.preventDefault();
  event.stopPropagation();

  const nodeId = node.id;
  setSelectedNodeIds((current) => (
    current.has(nodeId) ? current : new Set([nodeId])
  ));
  setActiveNodeId(nodeId);
  clearEdgeSelection();
  setSelectedGroupId(null);
  setNodeContextMenu({
    nodeId,
    screen: { x: event.clientX, y: event.clientY },
  });
  setContextMenu(null);
  setAddMenu(null);
  clearConnectionMenu();
  setImageInfoPopover(null);
  setImageLightbox(null);
}, [clearConnectionMenu, clearEdgeSelection]);
```

Pass it to ReactFlow:

```tsx
onNodeContextMenu={handleNodeContextMenu}
```

- [ ] **Step 4: Add save helper**

Add a browser save helper inside `InfiniteCanvas.tsx` or a small local function:

```tsx
async function saveNodeExport(exportData: NodeExport): Promise<'saved' | 'cancelled'> {
  const blob = exportData.kind === 'text'
    ? new Blob([exportData.text], { type: exportData.mimeType })
    : await fetch(exportData.url).then((response) => {
        if (!response.ok) {
          throw new Error(`Download failed (${response.status})`);
        }
        return response.blob();
      });
  const saveFilePicker = (window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
  }).showSaveFilePicker;

  if (saveFilePicker) {
    try {
      const handle = await saveFilePicker({
        suggestedName: exportData.fileName,
        types: [{
          description: 'File',
          accept: { [exportData.mimeType.split(';')[0]]: [`.${exportData.fileName.split('.').pop() || 'txt'}`] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
      throw error;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = exportData.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return 'saved';
}
```

- [ ] **Step 5: Add node menu action handlers**

Resolve the clicked node:

```tsx
const nodeContextTarget = nodeContextMenu
  ? storeNodes.find((node) => node.id === nodeContextMenu.nodeId) ?? null
  : null;
const nodeContextAttachment = nodeContextTarget ? createAgentAttachmentFromNode(nodeContextTarget) : null;
const nodeContextClipboardText = nodeContextTarget ? getNodeClipboardText(nodeContextTarget) : null;
const nodeContextExport = nodeContextTarget ? getNodeExport(nodeContextTarget) : null;
```

Add handlers:

```tsx
const handleNodeContextAddToConversation = useCallback(() => {
  if (!nodeContextAttachment) return;
  const result = addAgentReferenceAttachment(nodeContextAttachment);
  showProjectMessage(result === 'duplicate' ? '参考图已添加' : '已添加到对话');
  notifyAgentPanelOpenRequest?.();
  setNodeContextMenu(null);
}, [nodeContextAttachment, showProjectMessage]);

const handleNodeContextCopyContent = useCallback(() => {
  if (!nodeContextClipboardText) return;
  void navigator.clipboard.writeText(nodeContextClipboardText)
    .then(() => showProjectMessage('已复制'))
    .catch((error) => showProjectMessage(error instanceof Error ? error.message : '复制失败'));
  setNodeContextMenu(null);
}, [nodeContextClipboardText, showProjectMessage]);

const handleNodeContextSaveAs = useCallback(() => {
  if (!nodeContextExport) return;
  setNodeContextMenu(null);
  void saveNodeExport(nodeContextExport)
    .then((result) => {
      if (result === 'saved') showProjectMessage('已保存');
    })
    .catch((error) => showProjectMessage(error instanceof Error ? error.message : '保存失败'));
}, [nodeContextExport, showProjectMessage]);

const handleNodeContextRename = useCallback(() => {
  if (!nodeContextTarget || !isNodeRenameable(nodeContextTarget)) return;
  setNodeTitleEditRequest({ nodeId: nodeContextTarget.id, requestId: Date.now() });
  setNodeContextMenu(null);
}, [nodeContextTarget]);

const handleNodeContextCopyNode = useCallback(() => {
  if (!nodeContextTarget) return;
  const shouldCopySelection = selectedNodeIds.has(nodeContextTarget.id);
  copyNodesToInternalClipboard(shouldCopySelection ? selectedNodeIds : new Set([nodeContextTarget.id]));
  setNodeContextMenu(null);
}, [nodeContextTarget, selectedNodeIds]);

const handleNodeContextDelete = useCallback(() => {
  if (!nodeContextTarget) return;
  const shouldDeleteSelection = selectedNodeIds.has(nodeContextTarget.id);
  const ids = shouldDeleteSelection ? Array.from(selectedNodeIds) : [nodeContextTarget.id];
  deleteNodes(ids);
  clearCanvasNodeUi();
  setActiveNodeId(null);
  setSelectedNodeIds(new Set());
  setNodeContextMenu(null);
}, [clearCanvasNodeUi, deleteNodes, nodeContextTarget, selectedNodeIds]);
```

Add a local helper for Agent attachments by adapting the existing quick-reference callback pattern:

```tsx
const addAgentReferenceAttachment = useCallback((attachment: AgentTaskAttachment): 'added' | 'duplicate' => {
  let result: 'added' | 'duplicate' = 'added';

  notifyAgentPanelOpenRequest?.();
  notifyQuickReferenceConnectRequest?.({
    targetKind: 'agent',
    onSelect: (candidate) => {
      if (candidate.sourceNodeId === attachment.sourceNodeId) {
        result = 'duplicate';
        return 'duplicate';
      }

      return 'added';
    },
  });

  const quickReference = quickReferenceConnect;
  if (quickReference?.targetKind === 'agent') {
    result = quickReference.onSelect(attachment);
  }

  return result;
}, [quickReferenceConnect]);
```

If this callback shape cannot synchronously access the Agent panel's `onSelect`, replace it with an explicit `pendingAgentAttachment` state passed into `CanvasAgentDock`, and let `CanvasAgentDock` forward that attachment to `CanvasAgentPanel` through a new `pendingReferenceAttachment` prop. `CanvasAgentPanel` should then reuse its existing duplicate detection from `handleQuickReferenceClick`.

Add a local helper for internal node copy by extracting the body of `handleCopySelectedNodes` into:

```tsx
const copyNodeIdsToInternalClipboard = useCallback((nodeIds: Set<string>) => {
  if (nodeIds.size === 0) {
    return false;
  }

  const selectedNodes = storeNodes.filter((node) => nodeIds.has(node.id));

  if (selectedNodes.length === 0) {
    return false;
  }

  copiedNodesRef.current = selectedNodes.map((node) => cloneCanvasNode(node, 0));
  connectedCopyBufferRef.current = createConnectedCopyBuffer(
    selectedNodes,
    storeEdges,
    nodeIds,
  );
  pasteCountRef.current = 0;
  setHasCopiedNodes(true);
  return true;
}, [storeEdges, storeNodes]);
```

Then update `handleCopySelectedNodes` to call `copyNodeIdsToInternalClipboard(selectedNodeIds)`.

- [ ] **Step 6: Render `NodeContextMenu`**

Render near the existing `CanvasContextMenu`:

```tsx
{nodeContextMenu && nodeContextTarget ? (
  <NodeContextMenu
    x={nodeContextMenu.screen.x}
    y={nodeContextMenu.screen.y}
    canAddToConversation={nodeContextAttachment !== null}
    canCopyContent={nodeContextClipboardText !== null}
    canSaveAs={nodeContextExport !== null}
    canRename={isNodeRenameable(nodeContextTarget)}
    canCopyNode
    canDelete
    onAddToConversation={handleNodeContextAddToConversation}
    onCopyContent={handleNodeContextCopyContent}
    onSaveAs={handleNodeContextSaveAs}
    onRename={handleNodeContextRename}
    onCopyNode={handleNodeContextCopyNode}
    onDelete={handleNodeContextDelete}
  />
) : null}
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
node --test src/components/canvas/NodeContextMenu.test.ts src/lib/canvas/node-context-actions.test.ts
npx tsc --noEmit
```

Expected: PASS.

### Task 5: Verify and Commit

**Files:**
- Verify: all files modified above

- [ ] **Step 1: Run verification commands**

Run:

```bash
node --test src/components/canvas/NodeContextMenu.test.ts src/components/canvas/CanvasContextMenu.test.ts src/lib/canvas/node-context-actions.test.ts
npm run lint
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 2: Manual UI verification**

Start the dev server:

```bash
npm run dev
```

Verify:

- Right-click any node content opens the node context menu.
- Right-click blank canvas still opens the blank-canvas context menu.
- The node menu does not include "在文件管理器中显示".
- "存为资产" is visible but disabled.
- Add to conversation is enabled for image-capable nodes and disabled for text/media nodes that cannot become Agent image attachments.
- Copy writes text or media URLs.
- Save as exports text as `.txt` and media as files.
- Rename enters inline title editing.
- Copy node then blank-canvas Paste works for one node.
- Copy node then blank-canvas Paste works for a selected group when right-clicking inside the selection.
- Delete removes one node or the current selection according to selection state.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add src/components/canvas/NodeContextMenu.tsx src/components/canvas/NodeContextMenu.test.ts src/lib/canvas/node-context-actions.ts src/lib/canvas/node-context-actions.test.ts src/components/nodes src/components/canvas/InfiniteCanvas.tsx
git commit -m "feat: add node context menu"
```

Do not stage unrelated existing changes in `src/lib/audio-separation.ts` or `src/lib/audio-separation.test.ts`.

## Self-Review

- Spec coverage: tasks cover menu visuals, item order, disabled Save as asset placeholder, removal of file-manager entry, node right-click trigger, action semantics, multi-selection copy/delete, inline rename, tests, and manual verification.
- Placeholder scan: no task says TODO/TBD or leaves behavior unspecified. Save as asset is explicitly a disabled placeholder by requirement.
- Type consistency: `NodeContextMenu`, `NodeExport`, `nodeContextMenu`, `nodeTitleEditRequest`, and helper function names are introduced before use.
