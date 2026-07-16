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
      aria-label="提示词库"
      aria-pressed={open}
      className={[
        "fixed top-5 z-50 flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.34)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0d0f]",
        open
          ? "border-white/30 bg-[#24262b] text-white"
          : "border-white/14 bg-[#111214] text-white/92 hover:border-white/24 hover:bg-[#1b1d20] hover:text-white",
      ].join(" ")}
      style={{ right: rightOffset }}
      onClick={onClick}
    >
      <BookOpen size={16} strokeWidth={2} />
      提示词库
    </button>
  );
}
