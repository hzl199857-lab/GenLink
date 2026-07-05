"use client";

import { BookOpen } from "lucide-react";

export interface PromptLibraryEntryButtonProps {
  onClick: () => void;
  open?: boolean;
  rightOffset?: number;
}

export function PromptLibraryEntryButton({
  onClick,
  open = false,
  rightOffset = 20,
}: PromptLibraryEntryButtonProps) {
  return (
    <button
      type="button"
      data-canvas-menu-ignore="true"
      aria-pressed={open}
      className={[
        "fixed top-5 z-50 flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-md transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "bg-white text-[#141510]"
          : "bg-[#17181B]/92 text-white/78 hover:bg-[#202124] hover:text-white",
      ].join(" ")}
      style={{ right: rightOffset }}
      onClick={onClick}
    >
      <BookOpen size={15} strokeWidth={1.9} />
      提示词库
    </button>
  );
}
