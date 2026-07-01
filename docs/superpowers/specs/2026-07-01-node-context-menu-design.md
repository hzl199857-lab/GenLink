# Node Context Menu Design

## Context

GenLink uses a ReactFlow infinite canvas in `src/components/canvas/InfiniteCanvas.tsx`.
The canvas already has a blank-pane context menu implemented by
`src/components/canvas/CanvasContextMenu.tsx`. That menu defines the visual baseline:
a compact fixed-position dark translucent menu with icons, dividers, disabled rows,
and viewport edge clamping.

The new feature adds a node-specific right-click menu. It should appear when the user
right-clicks any content that belongs to a canvas node, and it should use the same
visual language as the existing blank-canvas context menu.

## Goals

- Show a custom context menu when the user right-clicks a canvas node.
- Match the existing blank-canvas context menu style.
- Keep node menu logic centralized instead of adding separate handlers to every node
  component.
- Implement these real actions:
  - Add to conversation
  - Copy
  - Save as
  - Rename
  - Copy node
  - Delete
- Keep a disabled placeholder entry for Save as asset.
- Support multi-selection behavior for copy-node and delete.
- Disable menu rows when the clicked node cannot provide the required content.

## Non-Goals

- Do not add a "Show in file manager" menu item.
- Do not implement Save as asset in this phase.
- Do not add a separate context menu for edges, groups, or blank canvas.
- Do not change existing keyboard shortcuts.
- Do not redesign node title editing.

## Menu Items

The menu contains these rows in this order:

1. Add to conversation
2. Copy
3. Save as
4. Rename
5. Copy node
6. Save as asset
7. Delete

Rows are grouped with dividers:

- Add to conversation, Copy, Save as, Rename
- Copy node, Save as asset
- Delete

Save as asset remains visible but disabled. It is a placeholder for a later asset
library workflow.

## UX Behavior

The menu opens from ReactFlow's `onNodeContextMenu`. The handler prevents the native
browser context menu for node content, records the right-clicked node id, and stores
the screen position for rendering. It also closes competing overlays such as the
blank-canvas context menu, add-node menu, connection menu, and image info popover.

Right-clicking any content that belongs to a node opens the node menu. This includes
node cards, media previews, titles, prompt bars, and controls. The node menu takes
priority over the browser's native context menu.

When a node menu opens, the right-clicked node becomes the active node. If the node is
already part of the current multi-selection, the selection is preserved. If it is not
part of the current multi-selection, selection changes to only that node.

The menu closes when:

- A menu action runs.
- The user clicks elsewhere.
- The canvas moves or scrolls.
- The user presses `Esc`.
- Another node or blank-canvas context menu opens.

The menu is clamped to the viewport so it does not overflow the right or bottom edge.

## Action Semantics

### Add to Conversation

This action adds the clicked node as an Agent conversation reference.

It is enabled only for nodes that can provide an Agent image attachment:

- `image_generation` with a generated image URL.
- `image` with an image URL.
- `uploaded_image` with an image URL.

Clicking the action opens the Agent panel and appends the image as a reference
attachment. Existing duplicate detection should be reused. If the attachment already
exists, the app should show the same duplicate feedback used by the current quick
reference flow.

Other node types keep this row visible but disabled.

### Copy

This action copies the clicked node's content to the system clipboard.

Rules:

- Text-like nodes copy their primary text content.
- Image nodes copy the best available image URL.
- Video nodes copy the best available video URL.
- Audio nodes copy the best available audio URL.
- Generation nodes copy their output URL when an output exists; otherwise copy their
  prompt text when that is the primary available content.

If no meaningful content or URL exists, the row is disabled.

### Save As

This action saves the clicked node's exportable content to a user-selected location
when supported by the browser, falling back to a normal browser download when needed.

Rules:

- Image nodes save image files.
- Video nodes save video files.
- Audio nodes save audio files.
- Text-like nodes save `.txt` files.

If a node has no exportable content, the row is disabled.

### Rename

This action closes the menu and puts the clicked node's existing title into inline
edit mode. It should reuse the current `EditableNodeTitle` experience rather than
showing a separate prompt or modal.

All node types with editable titles should support this action. If a node type does
not expose an editable title, the row should stay visible but disabled.

### Copy Node

This action copies canvas node data into the existing internal canvas copy buffer.

If the right-clicked node belongs to the current multi-selection, copy the whole
selection and preserve eligible connected-copy behavior. If it does not belong to the
current multi-selection, copy only the right-clicked node.

The existing blank-canvas Paste action should then be able to paste the copied node or
selection.

### Save As Asset

This row is shown as a disabled placeholder. It does not run an action in this phase.

### Delete

This action deletes canvas nodes.

If the right-clicked node belongs to the current multi-selection, delete the whole
selection. If it does not belong to the current multi-selection, delete only the
right-clicked node.

Deletion should reuse existing store delete behavior so edges and groups are cleaned
up consistently.

## Visual Design

Create `src/components/canvas/NodeContextMenu.tsx`.

The component should visually match `CanvasContextMenu`:

- Fixed-position popover.
- Approximately `196px` wide.
- `rounded-[12px]`.
- `border-white/10`.
- `bg-[#191A1C]/95`.
- `shadow-2xl shadow-black/30`.
- `backdrop-blur-xl`.
- Compact rows with lucide icons.
- `hover:bg-white/10` on enabled rows.
- Disabled rows use reduced opacity and do not call handlers.
- Dividers use the same subtle white line style as the blank-canvas menu.

The node menu should use familiar lucide icons for each action where available.

## Architecture

`NodeContextMenu` is a presentational component. It receives:

- `x` and `y` screen coordinates.
- Availability flags for each action.
- Action callbacks.

`InfiniteCanvas.tsx` owns:

- `nodeContextMenu` state.
- Opening the menu from `onNodeContextMenu`.
- Selecting or preserving selection for the right-clicked node.
- Closing other overlays.
- Resolving the clicked node's capabilities.
- Dispatching store actions.
- Triggering Agent panel reference insertion.
- Triggering title edit requests.

Title editing needs a small external trigger path. The existing `EditableNodeTitle`
component should gain a controlled "edit request" mechanism, and node adapters should
pass the request through to node components that render editable titles.

## Data Flow

1. User right-clicks node content.
2. `InfiniteCanvas` prevents the native menu, records the node id and screen point,
   and closes competing overlays.
3. `NodeContextMenu` renders with enabled and disabled rows based on the clicked node.
4. User selects an enabled action.
5. `InfiniteCanvas` closes the menu and runs the corresponding existing flow or helper.
6. Store changes, clipboard writes, downloads, or Agent attachment updates happen
   through existing app mechanisms where possible.

## Error Handling

Clipboard and save operations can fail due to browser permissions, unsupported APIs,
or unavailable URLs. Failures should show the existing project save/message feedback
rather than throwing into React rendering.

Cancelled save-file dialogs should be treated as no-op, not errors.

Disabled placeholder rows should not show error messages when clicked because they are
not clickable.

## Testing

Focused automated coverage should include:

- `NodeContextMenu` renders rows in the expected order.
- Enabled rows call their handlers.
- Disabled rows do not call handlers and render as disabled.
- Viewport positioning clamps near edges.
- Capability helpers enable and disable Add to conversation, Copy, Save as, Rename,
  and Delete correctly for representative node types.

Manual verification should include:

- Right-clicking any node content opens the node context menu.
- Right-clicking blank canvas still opens the blank-canvas context menu.
- Add to conversation works for image-capable nodes and is disabled elsewhere.
- Copy writes text or URLs to the system clipboard.
- Save as exports media and `.txt` content.
- Rename enters inline title editing.
- Copy node followed by blank-canvas Paste works for one node.
- Copy node followed by blank-canvas Paste works for a selected group when
  right-clicking inside the selection.
- Delete removes either the clicked node or the selected group according to selection
  state.
- Save as asset is visible and disabled.
