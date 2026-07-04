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
      aria-pressed={open}
      className={[
        "fixed right-5 top-5 z-50 flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-md transition",
        open
          ? "bg-white text-[#141510]"
          : "bg-[#17181B]/92 text-white/78 hover:bg-[#202124] hover:text-white",
      ].join(" ")}
      onClick={onClick}
    >
      <BookOpen size={15} strokeWidth={1.9} />
      提示词库
    </button>
  );
}
