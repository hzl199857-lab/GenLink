"use client";

import { BookOpen } from "lucide-react";

export interface PromptLibraryEntryButtonProps {
  onClick: () => void;
  open?: boolean;
}

export function PromptLibraryEntryButton({
  onClick,
  open = false,
}: PromptLibraryEntryButtonProps) {
  return (
    <button
      type="button"
      data-canvas-menu-ignore="true"
      aria-label="提示词库"
      aria-pressed={open}
      className={[
        "flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.34)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0d0f]",
        open
          ? "bg-[#26272c] text-white"
          : "bg-[#1b1c20] text-white/92 hover:bg-[#232429] hover:text-white",
      ].join(" ")}
      onClick={onClick}
    >
      <BookOpen size={16} strokeWidth={2} />
      提示词库
    </button>
  );
}
