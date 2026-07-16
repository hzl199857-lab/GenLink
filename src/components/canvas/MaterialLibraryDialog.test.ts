import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dialogSource = readFileSync(
  new URL("./MaterialLibraryDialog.tsx", import.meta.url),
  "utf8",
);
const canvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("material dialog exposes single, batch, and move modes", () => {
  assert.match(
    dialogSource,
    /MaterialLibraryDialogMode = 'save' \| 'batch' \| 'move'/,
  );
  assert.match(dialogSource, /sources: PendingMaterialSource\[\]/);
  assert.match(
    dialogSource,
    /onConfirmBatchSave: \([\s\S]*?sources: PendingMaterialSource\[\][\s\S]*?category: MaterialLibraryCategory; folderId\?: string/,
  );
  assert.match(dialogSource, /mode === 'batch' \? sources\.length > 0/);
});

test("batch save chooses one location without asking for item names", () => {
  assert.match(dialogSource, /mode === 'save' \? \([\s\S]*?素材名称/);
  assert.match(dialogSource, /已选择\s*\{sources\.length\}\s*个素材/);
  assert.match(
    dialogSource,
    /onConfirmBatchSave\(sources, \{[\s\S]*?category: currentDraft\.category,[\s\S]*?folderId: selectedFolderId/,
  );
});

test("canvas opens one batch dialog and commits materials atomically", () => {
  assert.match(
    canvasSource,
    /const \[pendingMaterialSources, setPendingMaterialSources\] = useState<PendingMaterialSource\[]>\(\[\]\)/,
  );
  assert.match(canvasSource, /const addMaterials = useCanvasStore\(\(s\) => s\.addMaterials\)/);
  assert.match(canvasSource, /mode=\{materialDialogMode\}[\s\S]*?sources=\{pendingMaterialSources\}/);
  assert.match(canvasSource, /onConfirmBatchSave=\{handleConfirmBatchSave\}/);
});
