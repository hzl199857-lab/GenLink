'use client';

import { MousePointer2 } from 'lucide-react';

export function QuickReferenceSelectionBanner({
  onReturnToNode,
  onExit,
}: {
  onReturnToNode: () => void;
  onExit: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[75] flex justify-center px-4">
      <div
        data-canvas-menu-ignore="true"
        className="nodrag nopan pointer-events-auto flex items-center gap-2 rounded-[16px] border border-white/10 bg-[#242527]/95 p-2 text-white shadow-[0_18px_42px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-white/80">
          <MousePointer2 size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="whitespace-nowrap px-1 text-[14px] font-semibold">
          从画布选择参考
        </span>
        <button
          type="button"
          className="h-9 rounded-[9px] bg-white/[0.09] px-4 text-[13px] font-semibold text-white/86 transition-colors hover:bg-white/[0.14] hover:text-white"
          onClick={onReturnToNode}
        >
          返回节点
        </button>
        <button
          type="button"
          className="h-9 rounded-[9px] bg-white px-4 text-[13px] font-semibold text-[#202124] transition-colors hover:bg-white/90"
          onClick={onExit}
        >
          退出
        </button>
      </div>
    </div>
  );
}
