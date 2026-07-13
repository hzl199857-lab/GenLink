import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./ImageGenerationNode.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("./ImageGenerationNodeToolbar.tsx", import.meta.url), "utf8");
const promptBarSource = readFileSync(new URL("./ImageGenerationPromptBar.tsx", import.meta.url), "utf8");
const cardSideHandleSource = readFileSync(new URL("./CardSideHandle.tsx", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("../canvas/InfiniteCanvas.tsx", import.meta.url), "utf8");

test("keeps transparent image generation stage out of the pointer hitbox", () => {
  assert.doesNotMatch(source, /cardStageHeight/);
  assert.match(source, /style=\{\{\s*width: `\$\{cardDimensions\.width\}px`,\s*height: `\$\{cardDimensions\.height\}px`,\s*\}\}/);
  assert.match(source, /className="relative group node-connectable-root"/);
  assert.doesNotMatch(source, /className="relative mx-auto pointer-events-none"/);
  assert.match(source, /node-visible-title[^"]*pointer-events-none/);
  assert.match(source, /<ImageIcon size=\{24\} className="pointer-events-auto" \/>/);
  assert.match(source, /className="pointer-events-auto text-\[22px\]/);
  assert.match(source, /node-connectable-card[^']*pointer-events-auto/);
});

test("keeps the real result count visible without a hover tooltip", () => {
  assert.match(
    source,
    /aria-label="展开生成结果"[\s\S]*?<span>\{resultCount\}<\/span>[\s\S]*?<ChevronDown size=\{15\} \/>/,
  );
  assert.match(
    source,
    /aria-label="收起生成结果"[\s\S]*?<span>\{resultCount\}<\/span>[\s\S]*?<ChevronDown size=\{15\} className="rotate-180" \/>/,
  );
  assert.doesNotMatch(source, /<Tooltip label="\?+" side="left" \/>/);
});

test("keeps image generation toolbar wrapper pass-through outside actual controls", () => {
  assert.match(toolbarSource, /className="pointer-events-none absolute left-1\/2/);
  assert.match(toolbarSource, /className="pointer-events-auto flex items-center/);
  assert.match(toolbarSource, /className="group\/tooltip pointer-events-auto relative"/);
});

test("exports reusable magnetic side plus behavior for canvas overlays", () => {
  assert.match(cardSideHandleSource, /export interface MagneticSidePlusProps/);
  assert.match(cardSideHandleSource, /export function MagneticSidePlus/);
  assert.match(cardSideHandleSource, /SIDE_PLUS_THRESHOLD/);
  assert.match(cardSideHandleSource, /SIDE_PLUS_MAGNET_MAX/);
  assert.match(cardSideHandleSource, /card-side-plus-btn--magnet/);
  assert.match(cardSideHandleSource, /<MagneticSidePlus[\s\S]*?active=\{visible \|\| isConnectingFromPlus\}/);
});

test("right side magnetic plus subtracts its rendered wrapper offset", () => {
  assert.match(cardSideHandleSource, /function getSidePlusWrapperLocalX\(edge: 'left' \| 'right', overlayElement: HTMLElement\)/);
  assert.match(cardSideHandleSource, /overlayElement\.offsetLeft/);
  assert.match(cardSideHandleSource, /anchorLocalX - wrapperLocalX \+ offsetX - HANDLE_BADGE_HALF/);
});

test("magnetic side plus uses canvas zoom only in canvas coordinate overlays", () => {
  assert.match(cardSideHandleSource, /coordinateSpace\?: 'canvas' \| 'screen';/);
  assert.match(cardSideHandleSource, /const localScale = coordinateSpace === 'canvas' \? zoom : 1;/);
  assert.match(cardSideHandleSource, /SIDE_PLUS_GAP : SIDE_PLUS_GAP\) \* localScale/);
  assert.match(cardSideHandleSource, /\(anchorScreenX - containerRect\.left\) \/ localScale/);
});

test("closes image generation prompt bar menus when the selected node changes", () => {
  assert.match(promptBarSource, /closePromptBarMenus = useCallback/);
  assert.match(canvasSource, /const selectSingleNode = useCallback\(\(nodeId: string\) => \{\s*clearCanvasNodeUi\(\);/);
  assert.match(source, /key=\{`prompt-bar-\$\{id\}-\$\{promptBarVisible \? 'visible' : 'hidden'\}`\}/);
});

test("image generation organize action opens the material save dialog directly", () => {
  assert.match(
    canvasSource,
    /if \(action === 'organize'\) \{\s*const source = createMaterialSourceFromImageGenerationData\(imageData, cardDimensions\);[\s\S]*?requestMaterialLibrarySave\(source\);[\s\S]*?return;[\s\S]*?\}\s*notifyImageToolbarAction\?\.\(action, data as ImageGenerationNodeData\);/,
  );
});

test("material save dialog remounts for repeated organize requests", () => {
  assert.match(canvasSource, /const \[materialDialogOpenKey, setMaterialDialogOpenKey\] = useState\(0\);/);
  assert.match(
    canvasSource,
    /const openMaterialLibraryDialog = \(source: PendingMaterialSource\) => \{\s*setMaterialDialogMode\('save'\);[\s\S]*?setMaterialDialogOpenKey\(\(value\) => value \+ 1\);[\s\S]*?setPendingMaterialSource\(source\);/,
  );
  assert.match(canvasSource, /<MaterialLibraryDialog\s+key=\{`material-dialog-\$\{materialDialogOpenKey\}`\}/);
});

test("material save requests use a window event instead of depending on a global callback", () => {
  assert.match(canvasSource, /const MATERIAL_LIBRARY_REQUEST_EVENT = 'genlink:material-library-request';/);
  assert.match(canvasSource, /function requestMaterialLibrarySave\(source: PendingMaterialSource\): void \{/);
  assert.match(canvasSource, /window\.dispatchEvent\(\s*new CustomEvent<PendingMaterialSource>\(MATERIAL_LIBRARY_REQUEST_EVENT,/);
  assert.match(canvasSource, /window\.addEventListener\(MATERIAL_LIBRARY_REQUEST_EVENT, handleMaterialLibraryRequest\);/);
  assert.match(canvasSource, /if \(notifyMaterialLibraryRequest === openMaterialLibraryDialog\) \{/);
});
