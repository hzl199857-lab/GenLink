# Canvas Context Menu Design

## Context

GenLink uses a ReactFlow infinite canvas in `src/components/canvas/InfiniteCanvas.tsx`. The canvas already has:

- `AddNodeMenu`, used by the left toolbar and blank-canvas double click.
- A hidden file input for importing image, video, and audio files.
- Store-backed `undoStack`, `redoStack`, `undo`, and `redo`.
- In-memory canvas node copy/paste handlers for `Ctrl+C` and `Ctrl+V`.

The new feature adds a custom right-click menu only for blank canvas space. It must not appear when right-clicking nodes, edges, groups, or floating UI.

## Goals

- Show a custom context menu when the user right-clicks blank canvas space.
- Match the project's existing dark visual language and the current add-node menu styling.
- Provide these actions:
  - Upload
  - Add node
  - Undo
  - Redo
  - Paste
- Reuse existing behavior where possible instead of introducing duplicate flows.
- Disable undo, redo, and paste when they cannot run.
- Place uploaded or pasted nodes at the right-click canvas position.

## Non-Goals

- Add node-specific, edge-specific, or group-specific context menus.
- Support system clipboard image reads from the right-click menu.
- Replace the existing `AddNodeMenu`.
- Change keyboard shortcut behavior.

## UX Behavior

The menu opens from `ReactFlow`'s blank pane context-menu event. The browser's native context menu is prevented only for the blank pane. The menu stores both screen coordinates for rendering and projected canvas coordinates for actions.

The menu is positioned at the pointer location and clamped to the viewport so it does not render off the right or bottom edge. If the user right-clicks another blank canvas location, the menu moves to the new position.

Menu actions:

- **Upload** closes the context menu and opens the existing hidden file picker. Files selected from that picker are imported starting at the recorded right-click canvas position.
- **Add node** closes the context menu and opens the existing `AddNodeMenu` at the same screen and canvas position. The add-node menu keeps its current behavior and creates the selected node at that canvas location.
- **Undo** calls the existing store `undo` action when `undoStack.length > 0`.
- **Redo** calls the existing store `redo` action when `redoStack.length > 0`.
- **Paste** uses the existing canvas node copy buffer. It only supports project-internal copied nodes, matching the current `Ctrl+C` / `Ctrl+V` node paste behavior. Pasted nodes are translated as a group so their top-left bounding point starts at the recorded right-click canvas position.

The menu closes when:

- A menu action is selected.
- The user left-clicks the canvas, nodes, or other UI.
- The canvas moves or scrolls.
- The user presses `Esc`.
- Another blank-canvas right-click opens it at a new position.

## Visual Design

Create a new `CanvasContextMenu` component in `src/components/canvas/CanvasContextMenu.tsx`.

The visual treatment should align with the existing dark add-node menu:

- Fixed-position popover.
- Approximately 196px wide.
- 12px border radius.
- `#191A1C/95` dark translucent background.
- Subtle `border-white/10`, blur, and dark shadow.
- Compact row layout with light hover state.
- Dividers between action groups.
- Platform-specific shortcut labels:
  - macOS: Command-Z, Shift-Command-Z, Command-V, displayed with the standard Mac modifier symbols in the UI.
  - Windows/Linux: `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+V`

Disabled items stay visible with reduced opacity and no action.

## Architecture

`CanvasContextMenu` should be a presentational component. It receives:

- `x` and `y` screen coordinates.
- Boolean availability for undo, redo, and paste.
- Platform shortcut mode.
- Action callbacks for upload, add node, undo, redo, paste, and close.

`InfiniteCanvas.tsx` remains responsible for:

- Opening the menu from `onPaneContextMenu`.
- Projecting screen coordinates to canvas coordinates.
- Closing competing overlays where needed.
- Dispatching store actions.
- Reusing the existing file input and add-node menu.
- Providing a context-menu-specific paste handler.

The paste handler should avoid changing the current keyboard paste behavior. It can reuse clone helpers but must calculate a group translation from copied node positions to the target canvas position.

## Data Flow

1. User right-clicks blank pane.
2. `InfiniteCanvas` prevents default browser menu and records `{ screen, canvas }`.
3. `CanvasContextMenu` renders at clamped screen coordinates.
4. User selects an action.
5. `InfiniteCanvas` closes the context menu and calls the existing action flow.
6. Store updates mark the canvas dirty and push history through existing store behavior.

## Testing

Focused coverage should include:

- Presentational behavior for `CanvasContextMenu`: enabled rows call handlers, disabled rows do not, shortcut labels render for Mac and Windows/Linux modes.
- Manual verification in the running app:
  - Blank-canvas right-click opens the menu.
  - Right-click on node, edge, group, or floating UI does not open it.
  - Menu clamps near the viewport edges.
  - Upload imports at the right-click canvas location.
  - Add node opens the existing add menu at the same location.
  - Undo, redo, and paste disable correctly.
  - Paste places copied nodes at the right-click canvas location.
  - Closing rules work for click, canvas move, `Esc`, and repeated right-click.
