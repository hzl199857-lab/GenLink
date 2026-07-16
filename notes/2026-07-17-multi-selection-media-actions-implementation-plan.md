# Multi-Selection Media Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add functional multi-selection layout, batch Agent media attachment, and batch image/video/audio material-library workflows with direct Gemini video understanding.

**Architecture:** Move layout and media conversion rules into focused pure helpers under `src/lib/canvas/`, then keep `InfiniteCanvas.tsx` responsible for orchestration only. Extend Agent and material contracts with explicit media kinds, route videos separately to `generateText.videos`, and make the existing material dialog/panel render mode-specific UI without introducing a second storage path.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, ReactFlow, Tailwind CSS, lucide-react, Node test runner.

---

## File Structure

- Create `src/lib/canvas/selection-layout.ts`: pure grid/horizontal/vertical node layout calculation shared by selected nodes and groups.
- Create `src/lib/canvas/selection-layout.test.ts`: behavioral tests for layout order, anchoring, and dimensions.
- Create `src/lib/canvas/media-sources.ts`: convert canvas nodes to Agent attachments and material sources; media filtering and dedupe keys.
- Create `src/lib/canvas/media-sources.test.ts`: image/video/audio conversion and unsupported-node tests.
- Create `src/lib/material-library.ts`: material URL/kind normalization, batch naming, dedupe, and canvas-node reconstruction helpers.
- Create `src/lib/material-library.test.ts`: legacy image normalization and batch-save tests.
- Modify `src/types/agent.ts`: discriminated image/video Agent attachments.
- Modify `src/types/canvas.ts`: explicit image/video/audio material items and shared pending material sources.
- Modify `src/lib/agent-model-options.ts` and its test: Gemini-only shared Agent models.
- Modify `src/lib/agent-provider-options.ts` and its test: Comfly/Zhenzhen-only Agent providers.
- Modify `src/lib/agent-vision-images.ts` and its test: separate image and video model inputs.
- Modify `src/app/api/agent/run/route.ts` and its test: parse video attachments and call `generateText` with `videos`.
- Modify `src/components/canvas/CanvasAgentPanel.tsx`: accept attachment batches and render video references.
- Create `src/components/canvas/MultiNodeSelectionToolbar.test.ts`: structural integration coverage for toolbar labels, counts, icons, and callbacks.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: wire shared layout, batch Agent addition, batch material save, and media-specific canvas reconstruction.
- Modify `src/components/canvas/MaterialLibraryDialog.tsx`: single and batch save modes.
- Create `src/components/canvas/MaterialLibraryDialog.test.ts`: batch mode contract and no-name behavior.
- Modify `src/components/canvas/MaterialLibraryPanel.tsx`: type-specific rows, hover preview, autoplay, and apply behavior.
- Modify `src/components/canvas/MaterialLibraryPanel.test.ts`: type-specific preview and media-element behavior.
- Modify `src/store/canvas-store.ts` and focused material tests: batch insertion and media persistence.
- Modify `src/lib/project-storage.ts` and focused persistence tests: restore stable image/video/audio material URLs.

### Task 1: Shared Selection And Group Layout

**Files:**
- Create: `src/lib/canvas/selection-layout.ts`
- Create: `src/lib/canvas/selection-layout.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/components/canvas/CanvasViewportControls.test.ts`

- [ ] **Step 1: Write failing pure-layout tests**

Test the wished-for API with unequal bounds and unsorted inputs:

```ts
const items = [
  { id: "b", position: { x: 320, y: 20 }, bounds: { x: 320, y: 20, width: 80, height: 100 } },
  { id: "a", position: { x: 20, y: 20 }, bounds: { x: 20, y: 20, width: 120, height: 60 } },
  { id: "c", position: { x: 20, y: 240 }, bounds: { x: 20, y: 240, width: 90, height: 70 } },
];

assert.deepEqual(
  calculateNodeLayout(items, "horizontal", { x: 20, y: 20 }, { x: 48, y: 48 }),
  new Map([
    ["a", { x: 20, y: 20 }],
    ["b", { x: 188, y: 20 }],
    ["c", { x: 356, y: 20 }],
  ]),
);
```

Add separate assertions for vertical layout and grid layout using `Math.ceil(Math.sqrt(count))` columns.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/canvas/selection-layout.test.ts`

Expected: FAIL because `selection-layout.ts` and `calculateNodeLayout` do not exist.

- [ ] **Step 3: Implement the pure helper**

Export these exact contracts:

```ts
export type CanvasLayoutMode = "grid" | "horizontal" | "vertical";
export type LayoutItem = {
  id: string;
  position: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
};

export function calculateNodeLayout(
  items: LayoutItem[],
  mode: CanvasLayoutMode,
  anchor: { x: number; y: number },
  gap: { x: number; y: number },
): Map<string, { x: number; y: number }>;
```

Sort by `bounds.y`, then `bounds.x`, then `id`; calculate target bounds using the maximum width/height and translate each original node position by the bounds delta.

- [ ] **Step 4: Replace `layoutGroupNodes` arithmetic and add selected-node orchestration**

In `InfiniteCanvas.tsx`, map each target node to `{ id, position, bounds: getNodeGroupBounds(node) }`. Group layout anchors at `group.x + padding, group.y + padding` and recalculates group bounds. Selection layout anchors at the current selected content bounds and updates nodes only.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test src/lib/canvas/selection-layout.test.ts src/components/canvas/CanvasViewportControls.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas/selection-layout.ts src/lib/canvas/selection-layout.test.ts src/components/canvas/InfiniteCanvas.tsx src/components/canvas/CanvasViewportControls.test.ts
git commit -m "feat: share canvas selection layouts"
```

### Task 2: Agent Models, Providers, And Media Attachments

**Files:**
- Modify: `src/types/agent.ts`
- Modify: `src/types/canvas.ts`
- Modify: `src/lib/agent-model-options.ts`
- Modify: `src/lib/agent-model-options.test.ts`
- Modify: `src/lib/agent-provider-options.ts`
- Modify: `src/lib/agent-provider-options.test.ts`
- Create: `src/lib/canvas/media-sources.ts`
- Create: `src/lib/canvas/media-sources.test.ts`
- Modify: `src/lib/canvas/node-context-actions.ts`
- Modify: `src/lib/canvas/node-context-actions.test.ts`

- [ ] **Step 1: Write failing model/provider tests**

Assert exact option arrays:

```ts
assert.deepEqual(AGENT_MODEL_OPTIONS, [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
]);
assert.deepEqual(AGENT_TEXT_PROVIDER_OPTIONS.map((item) => item.id), ["comfly", "zhenzhen"]);
```

Also assert `isAgentModelId("gpt-5.5") === false` and `isAgentModelId("gemini-3.5-flash") === true`.

- [ ] **Step 2: Write failing media conversion tests**

Create an uploaded image, generated video, uploaded video, and audio node. Assert `createAgentAttachmentFromCanvasNode` returns image/video attachments for the first three and `null` for audio. Assert `createMaterialSourceFromCanvasNode` returns image/video/audio sources with stable URLs and correct metadata.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test src/lib/agent-model-options.test.ts src/lib/agent-provider-options.test.ts src/lib/canvas/media-sources.test.ts src/lib/canvas/node-context-actions.test.ts`

Expected: FAIL on old GPT/provider arrays and missing media helper.

- [ ] **Step 4: Implement discriminated Agent attachments**

Use a common base and exact media-specific fields:

```ts
type AgentAttachmentBase = {
  id: string;
  name: string;
  mimeType: string;
  mediaUrl: string;
  previewUrl: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  status: "attached" | "uploading" | "ready" | "error";
  sourceNodeId?: string;
};

export type AgentTaskAttachment =
  | (AgentAttachmentBase & { kind: "image"; imageUrl: string; semanticImageUrl?: string })
  | (AgentAttachmentBase & { kind: "video"; videoUrl: string; durationSeconds?: number });
```

Keep image-only ecommerce fields on the image branch. Update image attachment constructors to set both `mediaUrl` and `imageUrl`.

- [ ] **Step 5: Implement model/provider options and media conversion**

Default the first shared model option to Flash. In `media-sources.ts`, export:

```ts
export function createAgentAttachmentFromCanvasNode(node: CanvasNode): AgentTaskAttachment | null;
export function createMaterialSourceFromCanvasNode(node: CanvasNode): PendingMaterialSource | null;
export function getAgentAttachmentDedupeKey(attachment: AgentTaskAttachment): string;
```

Move `PendingMaterialSource` from `MaterialLibraryDialog.tsx` to `src/types/canvas.ts` so canvas helpers and the dialog share one data contract. Use hosted URLs before local URLs and reject empty or `blob:`-only long-lived material sources.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/agent.ts src/types/canvas.ts src/lib/agent-model-options.ts src/lib/agent-model-options.test.ts src/lib/agent-provider-options.ts src/lib/agent-provider-options.test.ts src/lib/canvas/media-sources.ts src/lib/canvas/media-sources.test.ts src/lib/canvas/node-context-actions.ts src/lib/canvas/node-context-actions.test.ts
git commit -m "feat: add agent media attachment contracts"
```

### Task 3: Multi-Selection Toolbar And Batch Agent Addition

**Files:**
- Create: `src/components/canvas/MultiNodeSelectionToolbar.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/components/canvas/CanvasAgentPanel.tsx`

- [ ] **Step 1: Write failing toolbar integration tests**

Extract the `MultiNodeSelectionOverlay` source and assert it contains `布局`, `加入对话`, `保存到素材库`, uses `MessageSquarePlus` and `Library`, displays eligible counts, and does not render `<MultiNodeSelectionToolbarButton icon={Plus} compact />`.

Assert `MultiNodeSelectionOverlayProps` includes:

```ts
onLayout: (nodeIds: string[], mode: CanvasLayoutMode) => void;
onAddToConversation: (nodeIds: string[]) => void;
onSaveToMaterialLibrary: (nodeIds: string[]) => void;
```

- [ ] **Step 2: Write failing Agent batch-state test**

Extract a pure `mergeAgentAttachments` helper into `src/lib/agent-attachments.ts` and test that one existing image plus a batch containing the same image and two videos produces three attachments in stable order.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test src/components/canvas/MultiNodeSelectionToolbar.test.ts src/lib/agent-attachments.test.ts`

Expected: FAIL because labels, callbacks, batch helper, and video file support are absent.

- [ ] **Step 4: Wire the toolbar**

Wrap the selection toolbar in `GroupLayoutMenuContext.Provider` with a callback that calls `onLayout(selectedIds, mode)`. Compute Agent count from non-null Agent attachments and material count from non-null material sources. Disable actionable buttons at zero and show Chinese feedback from the parent handler.

- [ ] **Step 5: Add a batch pending attachment contract**

Replace `pendingReferenceAttachment` with `pendingReferenceAttachments: AgentTaskAttachment[]` across `InnerCanvas`, `CanvasAgentDock`, and `CanvasAgentPanel`. In one state update, merge by source node ID first and media URL second, then report `{ addedCount, duplicateCount }` to the canvas toast.

- [ ] **Step 6: Render video references in the Agent panel**

For image attachments keep `NextImage`. For video attachments render:

```tsx
<video
  src={attachment.previewUrl}
  muted
  playsInline
  preload="metadata"
  className="h-full w-full object-cover"
/>
```

Show a video icon overlay and keep remove/hover/history behavior. The home Agent upload control remains image-only; its shared model and Provider selectors change automatically through `AGENT_MODEL_OPTIONS` and `AGENT_TEXT_PROVIDER_OPTIONS`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/MultiNodeSelectionToolbar.test.ts src/components/canvas/InfiniteCanvas.tsx src/components/canvas/CanvasAgentPanel.tsx src/lib/agent-attachments.ts src/lib/agent-attachments.test.ts
git commit -m "feat: activate multi-selection media actions"
```

### Task 4: Direct Gemini Video Input In Agent Runtime

**Files:**
- Modify: `src/lib/agent-vision-images.ts`
- Modify: `src/lib/agent-vision-images.test.ts`
- Modify: `src/app/api/agent/run/route.ts`
- Modify: `src/app/api/agent/run/route.test.ts`

- [ ] **Step 1: Write failing video input selection tests**

Add `getAgentVisionVideos` expectations:

```ts
assert.deepEqual(getAgentVisionVideos([imageAttachment, videoAttachment]), [
  { attachmentId: videoAttachment.id, url: videoAttachment.videoUrl },
]);
```

Assert images exclude video attachments and both helpers dedupe URLs independently.

- [ ] **Step 2: Write a failing route test**

Post one image and one video attachment. Capture mocked `generateText` params and assert:

```ts
assert.deepEqual(calls[0].images, [{ url: "https://cdn.example/image.png" }]);
assert.deepEqual(calls[0].videos, [{ url: "https://cdn.example/video.mp4" }]);
```

Add a malformed video attachment case that returns HTTP 400 rather than silently dropping it.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test src/lib/agent-vision-images.test.ts src/app/api/agent/run/route.test.ts`

Expected: FAIL because videos are rejected by `parseAttachment` and never passed to `generateText`.

- [ ] **Step 4: Implement strict attachment parsing and Gemini payloads**

Parse `kind`, `mediaUrl`, `videoUrl`, and `durationSeconds`; require HTTP(S) video URLs for ready video attachments. In `createAgentUserPrompt`, label attachments by media kind and include duration. In `generateAgentWorkflowCandidate`, pass both arrays:

```ts
images: getAgentVisionImages(attachments).map(({ url }) => ({ url })),
videos: getAgentVisionVideos(attachments).map(({ url }) => ({ url })),
```

Return a Chinese 400 error for unsupported provider/model combinations before invoking the model.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-vision-images.ts src/lib/agent-vision-images.test.ts src/app/api/agent/run/route.ts src/app/api/agent/run/route.test.ts
git commit -m "feat: send agent videos to gemini"
```

### Task 5: Multi-Media Material Model And Persistence

**Files:**
- Modify: `src/types/canvas.ts`
- Create: `src/lib/material-library.ts`
- Create: `src/lib/material-library.test.ts`
- Modify: `src/store/canvas-store.ts`
- Modify: `src/lib/project-storage.ts`
- Modify: focused `src/lib/project-storage-*.test.ts` files selected by existing coverage

- [ ] **Step 1: Write failing material normalization tests**

Test that a legacy `{ imageUrl }` material normalizes to `kind: "image"`, video/audio URLs survive snapshot sanitation as `output:<fileName>`, and a batch with same media URL reuses the item while same name/different URL becomes `name (2)`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/lib/material-library.test.ts src/lib/project-storage-ownership.test.ts`

Expected: FAIL because material kind/media URL and batch naming do not exist.

- [ ] **Step 3: Define the material contract**

Use a single explicit contract:

```ts
export interface MaterialLibraryItem {
  id: string;
  kind?: "image" | "video" | "audio";
  name: string;
  category: MaterialLibraryCategory;
  folderId?: string;
  mediaUrl?: string;
  imageUrl?: string;
  hostedMediaUrl?: string;
  hostedImageUrl?: string;
  previewUrl?: string;
  fileName?: string;
  outputFileName?: string;
  sourceNodeType?: NodeType;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  durationSeconds?: number;
  mimeType?: string;
  sizeBytes?: number;
  format?: string;
  createdAt: string;
}
```

Treat omitted `kind` and existing `imageUrl` as legacy image data at read boundaries.

- [ ] **Step 4: Add material helpers and atomic batch insertion**

Export `getMaterialKind`, `getMaterialMediaUrl`, `createMaterialItemsForTarget`, and `createCanvasNodeFromMaterial`. Add store action:

```ts
addMaterials: (
  items: Array<Omit<MaterialLibraryItem, "id" | "createdAt">>,
) => { added: MaterialLibraryItem[]; reused: MaterialLibraryItem[] };
```

Perform one Zustand `set` and one undo snapshot for the batch.

- [ ] **Step 5: Generalize project persistence**

When `outputFileName` exists, write the stable `output:` value into `mediaUrl`; for legacy images also keep `imageUrl`. During restore, assign the created object URL to `mediaUrl`, the kind-specific hosted field, and `previewUrl` without persisting that object URL later.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the command from Step 2 plus any project-storage test modified in Step 5.

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/canvas.ts src/lib/material-library.ts src/lib/material-library.test.ts src/store/canvas-store.ts src/lib/project-storage.ts src/lib/project-storage-ownership.test.ts
git commit -m "feat: persist multi-media library items"
```

### Task 6: Batch Material Save Dialog

**Files:**
- Modify: `src/components/canvas/MaterialLibraryDialog.tsx`
- Create: `src/components/canvas/MaterialLibraryDialog.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write failing batch-dialog tests**

Assert the props include `sources: PendingMaterialSource[]`, batch mode derives `active` from `sources.length`, batch rendering omits the name input, and confirmation calls:

```ts
onConfirmBatchSave(sources, {
  category: currentDraft.category,
  folderId: selectedFolderId,
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/components/canvas/MaterialLibraryDialog.test.ts`

Expected: FAIL because the dialog supports only one source.

- [ ] **Step 3: Add `single | batch | move` dialog modes**

Single mode retains current name validation. Batch mode shows `已选择 N 个素材`, one representative media preview or three compact type counts, the unchanged location tree, and Save/Cancel buttons. Move mode remains unchanged.

- [ ] **Step 4: Wire selection save in `InfiniteCanvas`**

Convert selected nodes through `createMaterialSourceFromCanvasNode`, open the dialog once with all sources, and on confirm call `addMaterials(createMaterialItemsForTarget(...))`. Clear pending sources and show `已保存 X 个素材，复用 Y 个已有素材`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test src/components/canvas/MaterialLibraryDialog.test.ts src/components/canvas/MultiNodeSelectionToolbar.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/MaterialLibraryDialog.tsx src/components/canvas/MaterialLibraryDialog.test.ts src/components/canvas/InfiniteCanvas.tsx
git commit -m "feat: batch save selected media"
```

### Task 7: Material Library Multi-Media Preview And Canvas Application

**Files:**
- Modify: `src/components/canvas/MaterialLibraryPanel.tsx`
- Modify: `src/components/canvas/MaterialLibraryPanel.test.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Write failing panel tests**

Assert the panel branches on `getMaterialKind`, renders `<video autoPlay muted loop playsInline>`, renders an `<audio>` element with a caught `play()` promise path, uses `Video`/`AudioLines` icons for rows, and keeps `NextImage` only for image materials.

- [ ] **Step 2: Write failing canvas-application tests**

Assert `handleSelectMaterial` calls `createCanvasNodeFromMaterial` and does not unconditionally call `createImageNodeFromMaterial`. Assert the upload input accepts `image/*,video/*,audio/*` and uses the existing `readImageFile`, `readVideoFile`, and `readAudioFile` paths.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test src/components/canvas/MaterialLibraryPanel.test.ts src/components/canvas/MaterialLibraryNodeSizing.test.ts`

Expected: FAIL because the panel and apply path assume images.

- [ ] **Step 4: Implement type-specific rows and preview**

Images use `NextImage`; videos use a media element with `muted`, `loop`, `playsInline`, `preload="metadata"`; audio previews use a ref and effect:

```ts
void audio.play().then(
  () => setAudioBlocked(false),
  () => setAudioBlocked(true),
);
```

On preview change/unmount, pause media and reset `currentTime` inside a guarded `try` block. If audio is blocked, render an icon button with `aria-label="播放音频预览"`.

- [ ] **Step 5: Implement media-specific apply, drag, and upload**

Create `image`, `video`, or `audio` nodes using the stored stable URL and metadata. Preserve existing open-position logic and select the created node. Read uploaded files by MIME family, open the single-save dialog, and never retain a temporary object URL as the persisted material URL.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/MaterialLibraryPanel.tsx src/components/canvas/MaterialLibraryPanel.test.ts src/components/canvas/InfiniteCanvas.tsx src/components/canvas/MaterialLibraryNodeSizing.test.ts
git commit -m "feat: preview multi-media materials"
```

### Task 8: Integration Regression And Visual Verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run all focused tests together**

```bash
node --test src/lib/canvas/selection-layout.test.ts src/lib/canvas/media-sources.test.ts src/lib/agent-attachments.test.ts src/lib/agent-model-options.test.ts src/lib/agent-provider-options.test.ts src/lib/agent-vision-images.test.ts src/app/api/agent/run/route.test.ts src/lib/material-library.test.ts src/components/canvas/MultiNodeSelectionToolbar.test.ts src/components/canvas/MaterialLibraryDialog.test.ts src/components/canvas/MaterialLibraryPanel.test.ts src/components/canvas/MaterialLibraryNodeSizing.test.ts src/components/hero/HeroSurface.test.ts
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run repository validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run lint`

Expected: exit code 0 with no new warnings in modified files.

- [ ] **Step 3: Start the development server**

Run: `npm run dev`

Expected: Next.js reports a local URL and remains running for browser verification.

- [ ] **Step 4: Verify desktop canvas workflows in the browser**

At a 1440x900 viewport, verify:

1. Selecting mixed image/video/audio nodes shows the correct Agent and material counts.
2. The toolbar order is 布局, 加入对话, 保存到素材库, 打组, with no standalone plus button.
3. Each layout mode moves nodes without creating a group.
4. 加入对话 opens Agent and adds only image/video references.
5. Both Agent entry points list Gemini 3.5 Flash and Gemini 3.1 Pro, and only Comfly/Zhenzhen; node-specific model menus remain unchanged.
6. One real hosted video is sent through the Agent and Gemini returns a response that refers to visible video content.
7. Batch material save asks only for location and creates image/video/audio rows.
8. Hover image/video/audio previews behave as designed; blocked audio displays the manual play control.
9. Applying or dragging each material type creates the corresponding node type.

- [ ] **Step 5: Inspect final diff and rerun changed-file tests after fixes**

Run: `git diff --check`

Expected: no whitespace errors.

Run the focused command from Step 1 again after any browser-discovered fix.

Expected: all tests PASS.

- [ ] **Step 6: Commit final integration fixes**

```bash
git add src
git commit -m "fix: complete media action integration"
```

Skip this commit when Step 4 requires no additional code changes.
