import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("canvas zoom slider blocks pane and group drag mouse handling", () => {
  const sliderMatch = source.match(
    /<input\s+[^>]*type="range"[\s\S]*?aria-label="[^"]*"/,
  );

  assert.ok(sliderMatch, "expected the canvas zoom range input to render");
  const sliderMarkup = sliderMatch[0];

  assert.match(sliderMarkup, /data-canvas-menu-ignore="true"/);
  assert.match(sliderMarkup, /group-frame-no-drag/);
  assert.match(sliderMarkup, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("pane selection ignores click jitter below the drag threshold", () => {
  assert.match(source, /const PANE_SELECTION_DRAG_THRESHOLD = 6;/);
  assert.match(
    source,
    /Math\.hypot\(dx, dy\) >= PANE_SELECTION_DRAG_THRESHOLD[\s\S]*?paneSelectionMovedRef\.current = true;/,
  );

  const selectionEnd = source.match(
    /const handleSelectionEnd = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[clearEdgeSelection, selectGroup\]\);/,
  )?.[0] ?? "";

  assert.match(selectionEnd, /if \(!selectionMoved\)/);
  assert.match(selectionEnd, /selectedNodeIdsRef\.current = emptySelection;/);
  assert.match(selectionEnd, /clearEdgeSelection\(\);/);
});

test("node multi-selection uses Shift and commits the exact selection synchronously", () => {
  assert.match(source, /multiSelectionKeyCode="Shift"/);

  const nodeClick = source.match(
    /const handleNodeClick = useCallback\([\s\S]*?(?=\n  const handleNodeContextMenu)/,
  )?.[0] ?? "";

  assert.match(nodeClick, /if \(event\.shiftKey\) \{[\s\S]*?const nextSelection = new Set\(selectedNodeIdsRef\.current\);/);
  assert.match(nodeClick, /selectedNodeIdsRef\.current = nextSelection;/);
  assert.match(nodeClick, /setSelectedNodeIds\(nextSelection\);/);
});

test("multi-node selection frame stays visible for nodes inside an existing group", () => {
  const multiNodeSelectionOverlay = source.match(
    /function MultiNodeSelectionOverlay[\s\S]*?\n}\n\nconst CanvasMiniMap/,
  )?.[0] ?? "";

  assert.doesNotMatch(multiNodeSelectionOverlay, /findContainingGroupForNodeSelection/);
  assert.match(multiNodeSelectionOverlay, /if \(!visible \|\| !bounds \|\| selectedNodes\.length <= 1\)/);
});

test("a node selection resolves to a group only when every group node is selected", () => {
  const containingGroup = source.match(
    /function findContainingGroupForNodeSelection[\s\S]*?\n}\n\nfunction findGroupAtCanvasPoint/,
  )?.[0] ?? "";

  assert.match(containingGroup, /if \(groupNodeIds\.size !== selectedNodeIds\.size\)/);
});

test("canvas viewport controls expose a grid snap toggle", () => {
  assert.match(source, /aria-label=\{gridSnapLabel\}/);
  assert.match(source, /aria-pressed=\{gridSnapEnabled\}/);
  assert.match(source, /onToggleGridSnap/);
  assert.match(source, /<Grid3x3 size=\{15\}/);
});

test("canvas edges default to curve style", () => {
  const storedStyleReader = source.match(
    /function readStoredCanvasEdgeStyle\(userId: string\): CanvasEdgeStyle \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  const serverSnapshot = source.match(
    /function getServerCanvasEdgeStyleSnapshot\(\): CanvasEdgeStyle \{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(storedStyleReader, /return 'curve';/);
  assert.match(storedStyleReader, /\? 'straight'\s*: 'curve'/);
  assert.match(
    storedStyleReader,
    /readUserScopedCanvasSetting\(CANVAS_EDGE_STYLE_STORAGE_KEY, userId\)/,
  );
  assert.match(serverSnapshot, /return 'curve';/);
});

test("grid snap is applied after node and group drag ends", () => {
  assert.match(source, /function snapCanvasPositionToGrid/);
  assert.match(source, /const CANVAS_SNAP_GRID_SIZE = 24;/);
  assert.match(source, /snapCanvasPositionToGrid\(node\.position\)/);
  assert.match(source, /snapGroupToGrid\(groupId\)/);
});

test("grid snap is applied during node drag for stepped movement", () => {
  assert.match(source, /function applyGridSnapToNodeChanges/);
  assert.match(source, /gridSnapEnabledRef\.current/);
  assert.match(source, /snapCanvasPositionToGrid\(change\.position\)/);
  assert.match(source, /applyGridSnapToNodeChanges\(changes\)/);
});

test("alignment guides are shown while grid snap dragging", () => {
  assert.match(source, /type CanvasAlignmentGuide/);
  assert.match(source, /function getCanvasAlignmentGuides/);
  assert.match(source, /CanvasAlignmentGuidesOverlay/);
  assert.match(source, /setAlignmentGuides\(getCanvasAlignmentGuides/);
});

test("alignment guides use main card bounds instead of selection bounds", () => {
  assert.match(source, /function getAlignmentGuideNodeBounds/);

  const guideFunction = source.match(
    /function getCanvasAlignmentGuides[\s\S]*?\n}\n\nfunction clampLightboxZoomLevel/,
  )?.[0] ?? "";

  assert.match(guideFunction, /getAlignmentGuideNodeBounds\(draggingNode\)/);
  assert.match(guideFunction, /getAlignmentGuideNodeBounds\(node\)/);
  assert.doesNotMatch(guideFunction, /getEstimatedNodeBounds/);
});

test("multi-node selection exposes the same multi-source connection handle as groups", () => {
  assert.match(source, /onStartSelectionConnection: \(nodeIds: string\[\], event: React\.MouseEvent<HTMLElement>\) => void;/);
  assert.match(source, /function getConnectionSourcesFromNodeIds\(nodeIds: Iterable<string>\): GroupConnectionSource\[\]/);
  assert.match(source, /function getGroupConnectionSourcesFromDom\(group: NodeGroup\): GroupConnectionSource\[\][\s\S]*?return getConnectionSourcesFromNodeIds\(group\.nodeIds\);/);
  assert.match(source, /onMouseDown=\{\(event\) => onStartSelectionConnection\(selectedNodes\.map\(\(node\) => node\.id\), event\)\}/);
  assert.match(source, /onStartSelectionConnection=\{handleStartSelectionConnection\}/);
});

test("group and multi-node selection connection handles reuse the node magnetic plus", () => {
  assert.match(source, /import \{[\s\S]*MagneticSidePlus[\s\S]*\} from '..\/nodes\/CardSideHandle';/);
  assert.match(source, /<MagneticSidePlus[\s\S]*?edge="right"[\s\S]*?active=\{showSourceHandle\}[\s\S]*?coordinateSpace="screen"[\s\S]*?onMouseDown=\{onStartConnection\}/);
  assert.match(source, /<MagneticSidePlus[\s\S]*?edge="right"[\s\S]*?active=\{true\}[\s\S]*?coordinateSpace="screen"[\s\S]*?onMouseDown=\{\(event\) => onStartSelectionConnection\(selectedNodes\.map\(\(node\) => node\.id\), event\)\}/);
  assert.doesNotMatch(source, /GROUP_SOURCE_HANDLE_BADGE_BASE/);
});

test("video generation nodes use aspect-driven dimensions for selection bounds", () => {
  const estimatedBoundsFunction = source.match(
    /function getEstimatedNodeBounds[\s\S]*?\n}\n\nfunction getAlignmentGuideNodeBounds/,
  )?.[0] ?? "";

  assert.match(estimatedBoundsFunction, /if \(node\.type === 'video_generation'\)/);
  assert.match(estimatedBoundsFunction, /const dimensions = resolveAspectDrivenCardDimensions\(data\.ratio\);/);
  assert.match(estimatedBoundsFunction, /width: dimensions\.width/);
  assert.match(estimatedBoundsFunction, /height: dimensions\.height/);
});

test("group bounds reserve generation node title space", () => {
  const groupBoundsFunction = source.match(
    /function getNodeGroupBounds[\s\S]*?\n}\n\nfunction getBoundsForNodes/,
  )?.[0] ?? "";

  assert.match(groupBoundsFunction, /node\.type === 'image_generation'/);
  assert.match(groupBoundsFunction, /node\.type === 'video_generation'/);
  assert.match(groupBoundsFunction, /node\.type === 'audio_generation'/);
  assert.match(groupBoundsFunction, /GENERATION_NODE_GROUP_TOP_RESERVE/);
});

test("multi-node selection uses group bounds so labels remain inside the frame", () => {
  const multiNodeSelectionOverlay = source.match(
    /function MultiNodeSelectionOverlay[\s\S]*?\n}\n\nconst CanvasMiniMap/,
  )?.[0] ?? "";

  assert.match(multiNodeSelectionOverlay, /const estimatedBounds = getNodeGroupBounds\(node\);/);
  assert.doesNotMatch(multiNodeSelectionOverlay, /const estimatedBounds = getEstimatedNodeBounds\(node\);/);
});

test("group layout uses group bounds so generation labels remain inside the frame", () => {
  const canvasNodeLayoutFunction = source.match(
    /function getCanvasNodeLayout[\s\S]*?\n}\n\nfunction layoutGroupNodes/,
  )?.[0] ?? "";

  assert.match(canvasNodeLayoutFunction, /bounds: getNodeGroupBounds\(node\)/);
  assert.doesNotMatch(canvasNodeLayoutFunction, /bounds: getEstimatedNodeBounds\(node\)/);
});

test("multi-node selection delegates to the shared layout helper", () => {
  assert.match(source, /function layoutSelectedNodes[\s\S]*?getCanvasNodeLayout\(nodeIds, mode/);
  assert.match(source, /<GroupLayoutMenuContext\.Provider[\s\S]*?onLayout\(selectedNodes\.map/);
});
