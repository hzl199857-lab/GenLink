import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readSource(fileName: string): string {
  return readFileSync(path.join(process.cwd(), "src/components/canvas", fileName), "utf8");
}

function readProjectSource(fileName: string): string {
  return readFileSync(path.join(process.cwd(), fileName), "utf8");
}

test("project menu exposes the video project commands", () => {
  const source = readSource("ProjectMenu.tsx");

  for (const label of ["回到主页", "全部项目", "创建新项目", "删除项目"]) {
    assert.match(source, new RegExp(label));
  }
});

test("canvas switcher exposes creation and item management commands", () => {
  const source = readSource("CanvasSwitcher.tsx");

  for (const label of ["新建画布", "在新窗口打开", "重命名画布", "复制画布", "删除画布"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /canvases\.length <= 1/);
  assert.match(source, /event\.key === 'Escape'/);
});

test("new canvas creation is drafted before the callback runs", () => {
  const source = readSource("CanvasSwitcher.tsx");

  assert.match(source, /const \[creatingCanvas, setCreatingCanvas\] = useState\(false\)/);
  assert.match(source, /const \[createDefaultName, setCreateDefaultName\] = useState\(''\)/);
  assert.match(source, /const \[createDraft, setCreateDraft\] = useState\(''\)/);
  assert.match(source, /onCreateCanvas\?: \(name: string\)/);
  assert.match(source, /onBlur=\{\(\) => void commitCreate\(\)\}/);
  assert.match(source, /event\.key === 'Escape'[\s\S]*cancelCreate\(\)/);
  assert.match(source, /createDraft\.trim\(\) \|\| createDefaultName/);
  assert.match(source, /aria-label="新画布名称"/);
});

test("failed canvas creation keeps the draft available for retry", () => {
  const switcherSource = readSource("CanvasSwitcher.tsx");
  const canvasSource = readSource("InfiniteCanvas.tsx");

  assert.match(switcherSource, /onCreateCanvas\?: \(name: string\) => boolean \| Promise<boolean>/);
  assert.match(switcherSource, /const created = await onCreateCanvas\?\.\(name\)/);
  assert.match(switcherSource, /if \(created\)[\s\S]*setCreatingCanvas\(false\)[\s\S]*onOpenChange\(false\)/);
  assert.match(switcherSource, /onOpenChange\(true\)[\s\S]*createInputRef\.current\?\.focus\(\)/);
  assert.match(switcherSource, /if \(!open && creatingCanvas && !createSubmittingRef\.current\)[\s\S]*commitCreate\(\)/);
  assert.match(canvasSource, /const runCanvasHeaderAction = useCallback[\s\S]*return true;[\s\S]*return false;/);
  assert.match(canvasSource, /const handleCreateCanvas = useCallback\(async \(name: string\): Promise<boolean>/);
});

test("the active canvas check swaps with a fixed-width action button", () => {
  const source = readSource("CanvasSwitcher.tsx");

  assert.match(source, /aria-checked=\{current\}/);
  assert.match(source, /group-hover\/canvas-row:hidden/);
  assert.match(source, /group-hover\/canvas-row:opacity-100/);
  assert.match(source, /focus-visible:opacity-100/);
  assert.match(source, /\[&:has\(button:focus-visible\)>svg\]:hidden/);
  assert.doesNotMatch(source, /group-focus-within\/canvas-row/);
  assert.match(source, /relative ml-2 h-7 w-7 shrink-0/);
});

test("canvas switcher routes controlled closing through pending draft creation", () => {
  const source = readSource("CanvasSwitcher.tsx");
  const changeOpen = source.match(/const changeOpen = \(nextOpen: boolean\) => \{[\s\S]*?\n  \};/)?.[0];

  assert.ok(changeOpen);
  assert.match(changeOpen, /if \(!nextOpen && creatingCanvas\)[\s\S]*commitCreate\(\)/);
  assert.match(changeOpen, /setActionCanvasId\(null\)[\s\S]*setRenamingCanvasId\(null\)[\s\S]*onOpenChange\(nextOpen\)/);
});

test("canvas item actions support keyboard navigation and focus restoration", () => {
  const source = readSource("CanvasSwitcher.tsx");

  for (const key of ["ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.match(source, new RegExp(`event\\.key [!=]== '${key}'`));
  }
  assert.match(source, /querySelectorAll<HTMLButtonElement>\('button:not\(:disabled\)'\)/);
  assert.match(source, /actionTriggerRefs\.current\.get\(canvasId\)\?\.focus\(\)/);
  assert.match(source, /querySelector<HTMLButtonElement>\('button:not\(:disabled\)'\)[\s\S]*?\?\.focus\(\)/);
  assert.match(source, /title=\{activeCanvas\?\.name\}/);
  assert.match(readSource("EditableProjectName.tsx"), /title=\{displayValue\}/);
});

test("the primary canvas menu focuses and navigates its canvas items", () => {
  const source = readSource("CanvasSwitcher.tsx");

  assert.match(source, /const canvasItemRefs = useRef/);
  assert.match(source, /const handleCanvasMenuKeyDown =/);
  assert.match(source, /canvasItemRefs\.current\.get\(activeCanvasId/);
  assert.match(source, /if \(!open\)[\s\S]*return;[\s\S]*requestAnimationFrame/);
  for (const key of ["ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.match(source, new RegExp(`handleCanvasMenuKeyDown[\\s\\S]*event\\.key [!=]== '${key}'`));
  }
});

test("keyboard closing the primary canvas menu restores its trigger focus", () => {
  const source = readSource("CanvasSwitcher.tsx");

  assert.match(source, /const triggerRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(source, /const closeCanvasMenuAndRestoreFocus = \(\) => \{/);
  assert.match(source, /requestAnimationFrame\(\(\) => triggerRef\.current\?\.focus\(\)\)/);
  assert.match(source, /ref=\{triggerRef\}/);
  assert.match(source, /event\.key === 'Escape'[\s\S]*closeCanvasMenuAndRestoreFocus\(\)/);
  assert.match(source, /event\.key === 'Enter'[\s\S]*event\.key === ' '[\s\S]*closeCanvasMenuAndRestoreFocus\(\)/);
});

test("canvas header keeps the GenLink logo without the wordmark", () => {
  const source = readSource("CanvasHeader.tsx");

  assert.match(source, /project-library-logo\.png/);
  assert.doesNotMatch(source, /genlink-canvas-wordmark/);
  assert.match(source, /EditableProjectName/);
  assert.match(source, /CanvasSwitcher/);
});

test("starting a project name edit closes any open header menu", () => {
  const editableSource = readSource("EditableProjectName.tsx");
  const headerSource = readSource("CanvasHeader.tsx");

  assert.match(editableSource, /onEditStart\?: \(\) => void/);
  assert.match(editableSource, /onEditStart\?\.\(\);[\s\S]*setEditing\(true\)/);
  assert.match(headerSource, /onEditStart=\{\(\) => setOpenMenu\(null\)\}/);
});

test("write blocking preserves canvas navigation while disabling write actions", () => {
  const switcherSource = readSource("CanvasSwitcher.tsx");
  const headerSource = readSource("CanvasHeader.tsx");
  const projectMenuSource = readSource("ProjectMenu.tsx");
  const editableSource = readSource("EditableProjectName.tsx");

  assert.match(switcherSource, /writeBlocked\?: boolean/);
  assert.match(switcherSource, /disabled=\{busy \|\| !activeCanvas\}/);
  assert.match(switcherSource, /aria-disabled=\{busy \|\| renaming\}/);
  assert.ok((switcherSource.match(/disabled=\{busy \|\| writeBlocked\}/g)?.length ?? 0) >= 4);
  assert.match(switcherSource, /disabled=\{busy \|\| writeBlocked \|\| creatingCanvas\}/);
  assert.match(switcherSource, /disabled=\{busy \|\| writeBlocked \|\| canvases\.length <= 1\}/);
  assert.match(headerSource, /writeBlocked=\{writeBlocked\}/);
  assert.match(projectMenuSource, /writeBlocked\?: boolean/);
  assert.ok((projectMenuSource.match(/disabled=\{busy \|\| writeBlocked/g)?.length ?? 0) >= 2);
  assert.match(editableSource, /writeBlocked\?: boolean/);
  assert.ok((editableSource.match(/disabled=\{busy \|\| writeBlocked\}/g)?.length ?? 0) >= 2);
});

test("InfiniteCanvas wires all canvas lifecycle actions into the header", () => {
  const source = readSource("InfiniteCanvas.tsx");

  for (const prop of [
    "onBackHome",
    "onAllProjects",
    "onSelectCanvas",
    "onCreateCanvas",
    "onRenameCanvas",
    "onDuplicateCanvas",
    "onDeleteCanvas",
    "onOpenCanvasInNewWindow",
  ]) {
    assert.match(source, new RegExp(prop));
  }
});

test("InfiniteCanvas shows the shared loader while creating a named canvas", () => {
  const source = readSource("InfiniteCanvas.tsx");

  assert.match(source, /const \[canvasCreateLoading, setCanvasCreateLoading\] = useState\(false\)/);
  assert.match(source, /onCreateCanvas=\{handleCreateCanvas\}/);
  assert.match(source, /createCanvas\(name\)/);
  assert.match(source, /setCanvasCreateLoading\(true\)[\s\S]*finally[\s\S]*setCanvasCreateLoading\(false\)/);
  assert.match(source, /<UniqueLoading variant="squares" size="lg" \/>/);
  assert.match(source, /正在创建画布/);
  assert.match(source, /inert=\{canvasCreateLoading \? true : undefined\}/);
  assert.match(source, /aria-busy=\{canvasCreateLoading\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /if \(!canvasCreateLoading\)[\s\S]*return;/);
  assert.match(source, /const blockCanvasCreateKeydown = \(event: KeyboardEvent\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopImmediatePropagation\(\)/);
  assert.match(source, /window\.addEventListener\('keydown', blockCanvasCreateKeydown, true\)/);
  assert.match(source, /window\.removeEventListener\('keydown', blockCanvasCreateKeydown, true\)/);
});

test("InfiniteCanvas serializes every canvas header action behind local busy state", () => {
  const source = readSource("InfiniteCanvas.tsx");

  assert.match(source, /const canvasHeaderActionPendingRef = useRef\(false\)/);
  assert.match(source, /const \[canvasHeaderPending, setCanvasHeaderPending\] = useState\(false\)/);
  assert.match(source, /const canvasHeaderBusy = loading \|\| canvasHeaderPending/);
  assert.match(source, /const runCanvasHeaderAction = useCallback/);
  assert.match(source, /if \(canvasHeaderActionPendingRef\.current\)/);
  assert.match(source, /busy=\{canvasHeaderBusy\}/);
  assert.ok((source.match(/runCanvasHeaderAction\(/g)?.length ?? 0) >= 3);
  assert.ok((source.match(/runCanvasHeaderWriteAction\(/g)?.length ?? 0) >= 3);
  assert.match(source, /const handleCreateCanvas = useCallback[\s\S]*runCanvasHeaderAction\(/);
});

test("InfiniteCanvas rejects blocked writes at runtime without blocking navigation", () => {
  const source = readSource("InfiniteCanvas.tsx");

  assert.match(source, /writeBlocked=\{canvasWriteBlocked\}/);
  assert.match(source, /const ensureCanvasWriteAvailable = useCallback/);
  assert.ok((source.match(/ensureCanvasWriteAvailable\(\)/g)?.length ?? 0) >= 7);
  assert.match(source, /const runCanvasHeaderWriteAction = useCallback/);
  assert.match(source, /onSelectCanvas=\{async \(canvasId\) => \{[\s\S]*await runCanvasHeaderAction\(/);
  assert.match(source, /onCreateCanvas=\{handleCreateCanvas\}/);
  assert.match(source, /const handleCreateCanvas = useCallback[\s\S]*if \(!ensureCanvasWriteAvailable\(\)\)/);
  assert.match(source, /open=\{pendingDeleteCanvas !== null && !canvasWriteBlocked\}/);
  assert.match(
    source,
    /const blockCanvasEditing = useCallback[\s\S]*setPendingDeleteCanvas\(null\)[\s\S]*setDeleteProjectDialogOpen\(false\)[\s\S]*status: 'blocked'/,
  );
  assert.ok((source.match(/blockCanvasEditing\(\)/g)?.length ?? 0) >= 2);
  assert.match(source, /<CreateProjectDialog[\s\S]*loading=\{projectDialogBusy \|\| canvasWriteBlocked\}/);
});

test("canvas edit locks expose keyed idle checking acquired and blocked states", () => {
  const source = readSource("InfiniteCanvas.tsx");

  assert.match(source, /type CanvasEditLockStatus = 'idle' \| 'checking' \| 'acquired' \| 'blocked'/);
  assert.match(source, /canvasEditLockState\.key === canvasEditLockKey[\s\S]*: 'checking'/);
  assert.match(source, /const canvasWriteBlocked = canvasEditLockStatus === 'checking' \|\| canvasEditLockStatus === 'blocked'/);
  for (const status of ["idle", "checking", "acquired", "blocked"]) {
    assert.match(source, new RegExp(`status: '${status}'`));
  }
  assert.match(source, /正在获取画布编辑权/);
  assert.match(source, /该画布已在其他窗口打开/);
  assert.match(
    source,
    /acquireCanvasEditLock\(currentProject\.id, activeCanvasId\)[\s\S]*\.catch\(\(\) => \{[\s\S]*if \(!cancelled\)[\s\S]*blockCanvasEditing\(\)/,
  );
});

test("checking and blocked locks guard every save entry and cover non-header controls", () => {
  const source = readSource("InfiniteCanvas.tsx");
  const headerSource = readSource("CanvasHeader.tsx");
  const saveHandler = source.match(/const handleSaveProject = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0];
  const shortcutEffect = source.match(/const handleSaveShortcut = \(event: KeyboardEvent\) => \{[\s\S]*?window\.addEventListener\('keydown'/)?.[0];
  const autoSaveEffect = source.match(/const timer = window\.setInterval\(\(\) => \{[\s\S]*?5 \* 60 \* 1000/)?.[0];

  assert.ok(saveHandler);
  assert.match(saveHandler, /if \(!ensureCanvasWriteAvailable\(\)\)/);
  assert.ok(shortcutEffect);
  assert.match(shortcutEffect, /ensureCanvasWriteAvailable\(\)/);
  assert.ok(autoSaveEffect);
  assert.match(autoSaveEffect, /ensureCanvasWriteAvailable\(\)/);
  assert.match(source, /fixed inset-0 z-\[60\]/);
  assert.match(headerSource, /fixed left-4 top-4 z-\[70\]/);
  assert.match(source, /<CanvasToolbar[\s\S]*onSaveProject=\{\(\) => void handleSaveProject\(\)\}/);
});

test("canvas deletion uses the dark confirmation dialog and preserves shared media", () => {
  const canvasSource = readSource("InfiniteCanvas.tsx");
  const dialogSource = readSource("DeleteCanvasDialog.tsx");

  assert.doesNotMatch(canvasSource, /window\.confirm/);
  assert.match(canvasSource, /<DeleteCanvasDialog/);
  assert.match(canvasSource, /pendingDeleteCanvas/);
  assert.match(dialogSource, /删除画布/);
  assert.match(dialogSource, /项目共享素材和生成文件会保留/);
  assert.match(dialogSource, /event\.key === 'Escape'/);
  assert.match(dialogSource, /event\.target === event\.currentTarget && !loading/);
  assert.match(dialogSource, /disabled=\{loading\}/);
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
});

test("delete canvas dialog traps focus without refocusing on callback changes", () => {
  const canvasSource = readSource("InfiniteCanvas.tsx");
  const dialogSource = readSource("DeleteCanvasDialog.tsx");

  assert.match(canvasSource, /const handleCloseDeleteCanvasDialog = useCallback/);
  assert.match(canvasSource, /onClose=\{handleCloseDeleteCanvasDialog\}/);
  assert.match(dialogSource, /const onCloseRef = useRef\(onClose\)/);
  assert.match(dialogSource, /event\.key === 'Tab'/);
  assert.match(dialogSource, /event\.shiftKey/);
  assert.match(dialogSource, /querySelectorAll<HTMLElement>/);
  assert.match(dialogSource, /previousFocusRef/);
  assert.match(dialogSource, /previousFocus\?\.isConnected/);
  assert.match(dialogSource, /addEventListener\('keydown', handleKeyDown, true\)/);
  assert.match(dialogSource, /event\.stopPropagation\(\)/);
});

test("InfiniteCanvas retains a blank window handle before isolating its opener", () => {
  const source = readSource("InfiniteCanvas.tsx");
  const openIndex = source.indexOf("window.open('', '_blank');");
  const isolateIndex = source.indexOf('nextWindow.opener = null;');
  const saveIndex = source.indexOf('await saveProject();', openIndex);
  const navigateIndex = source.indexOf('nextWindow.location.href = buildCanvasDeepLink(', openIndex);
  const closeIndex = source.indexOf('nextWindow.close();', navigateIndex);

  assert.ok(openIndex >= 0);
  assert.match(source, /clearCanvasEditOwnerForWindow\(nextWindow\)/);
  assert.ok(source.indexOf('clearCanvasEditOwnerForWindow(nextWindow)', openIndex) < isolateIndex);
  assert.ok(isolateIndex > openIndex);
  assert.ok(saveIndex > isolateIndex);
  assert.ok(navigateIndex > saveIndex);
  assert.ok(closeIndex > navigateIndex);
  assert.doesNotMatch(source, /window\.open\('', '_blank', 'noopener,noreferrer'\)/);
});

test("closing the blank window during save keeps the active edit lock", () => {
  const source = readSource("InfiniteCanvas.tsx");
  const handler = source.match(/const handleOpenCanvasInNewWindow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0];

  assert.ok(handler);
  assert.match(handler, /if \(nextWindow\.closed\)/);
  assert.match(handler, /新窗口已关闭，当前画布仍保留在此窗口/);
  assert.match(handler, /if \(nextWindow\.closed\)[\s\S]*return;[\s\S]*activeCanvasLock\.handoff\(\)/);
});

test("opening the active canvas in a new window requires an acquired edit lock", () => {
  const source = readSource("InfiniteCanvas.tsx");
  const handler = source.match(/const handleOpenCanvasInNewWindow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0];

  assert.ok(handler);
  const guardIndex = handler.indexOf('if (canvasId === activeCanvasId && !canvasEditLockRef.current)');
  const closeIndex = handler.indexOf('nextWindow.close();', guardIndex);
  const messageIndex = handler.indexOf('当前画布编辑权尚未就绪或已被占用，请稍后重试', guardIndex);
  const saveIndex = handler.indexOf('await saveProject();');
  const navigateIndex = handler.indexOf('nextWindow.location.href = buildCanvasDeepLink(');

  assert.ok(guardIndex >= 0);
  assert.ok(closeIndex > guardIndex);
  assert.ok(messageIndex > closeIndex);
  assert.ok(saveIndex > messageIndex);
  assert.ok(navigateIndex > saveIndex);
});

test("the all-projects header action enters the library through its app route", () => {
  const source = readProjectSource("src/app/page.tsx");
  const callback = source.match(/const openProjectLibraryFromCanvas = \(\) => \{[\s\S]*?\n  \};/)?.[0];

  assert.ok(callback);
  assert.match(callback, /router\.push\('\/\?app=library'\)/);
  assert.doesNotMatch(callback, /showAppMode\('library'\)/);
});
