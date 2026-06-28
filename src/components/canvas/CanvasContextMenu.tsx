import { Clipboard, Plus, RotateCcw, RotateCw, Upload } from "lucide-react";
import type { ReactNode } from "react";

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

interface CanvasContextMenuPositionInput {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}

const MENU_WIDTH = 196;
const MENU_HEIGHT = 182;
const VIEWPORT_MARGIN = 8;

export function getCanvasContextMenuShortcuts(platform: CanvasContextMenuPlatform) {
  if (platform === "mac") {
    return {
      undo: "\u2318Z",
      redo: "\u21e7\u2318Z",
      paste: "\u2318V",
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
}: CanvasContextMenuPositionInput) {
  const maxX = viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN;
  const maxY = viewportHeight - MENU_HEIGHT - VIEWPORT_MARGIN;

  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, maxX)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, maxY)),
  };
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
  const shortcuts = getCanvasContextMenuShortcuts(platform);

  return (
    <div
      className="fixed z-[70] w-[196px] rounded-[12px] border border-white/10 bg-[#191A1C]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
      style={{ left: x, top: y }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuButton icon={<Upload size={16} />} label={"\u4e0a\u4f20"} onClick={onUpload} />
      <MenuButton icon={<Plus size={16} />} label={"\u6dfb\u52a0\u8282\u70b9"} onClick={onAddNode} />
      <MenuDivider />
      <MenuButton
        icon={<RotateCcw size={16} />}
        label={"\u64a4\u9500"}
        shortcut={shortcuts.undo}
        disabled={!canUndo}
        onClick={canUndo ? onUndo : undefined}
      />
      <MenuButton
        icon={<RotateCw size={16} />}
        label={"\u91cd\u505a"}
        shortcut={shortcuts.redo}
        disabled={!canRedo}
        onClick={canRedo ? onRedo : undefined}
      />
      <MenuDivider />
      <MenuButton
        icon={<Clipboard size={16} />}
        label={"\u7c98\u8d34"}
        shortcut={shortcuts.paste}
        disabled={!canPaste}
        onClick={canPaste ? onPaste : undefined}
      />
    </div>
  );
}

interface MenuButtonProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function MenuButton({ icon, label, shortcut, disabled = false, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
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
      {shortcut ? <span className="text-xs text-white/45">{shortcut}</span> : null}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-white/10" role="separator" />;
}
