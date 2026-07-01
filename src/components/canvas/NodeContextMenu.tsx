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
