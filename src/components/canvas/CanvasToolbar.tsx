'use client';

import React, { useRef } from 'react';
import { Clock3, Folder, LayoutList, MessageCircle, Plus, Settings, X } from 'lucide-react';

export interface CanvasToolbarProps {
  onOpenAddMenu?: (position: { x: number; y: number }) => void;
  onScheduleCloseAddMenu?: () => void;
  onOpenApiSettings?: () => void;
}

function ToolbarButton({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
}) {
  return (
    <button
      type="button"
      className="flex h-[31px] w-[31px] items-center justify-center rounded-full border border-white/0 text-white/72 transition duration-150 hover:bg-white/8 hover:text-white"
      title={title}
    >
      <Icon size={15} strokeWidth={1.9} />
    </button>
  );
}

export function CanvasToolbar({
  onOpenAddMenu,
  onScheduleCloseAddMenu,
  onOpenApiSettings,
}: CanvasToolbarProps) {
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const openAddMenu = () => {
    const button = addButtonRef.current;

    if (!button || !onOpenAddMenu) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const screen = {
      x: rect.right + 18,
      y: rect.top - 6,
    };

    onOpenAddMenu(screen);
  };

  return (
    <div className="fixed left-4 top-1/2 z-50 -translate-y-1/2">
      <div className="flex w-[44px] flex-col items-center rounded-[22px] border border-white/10 bg-[#17181b]/95 px-1.5 py-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <button
          ref={addButtonRef}
          type="button"
          className="group relative mb-2 flex h-[25px] w-[25px] items-center justify-center rounded-full border border-black/5 bg-[#f1f1ef] text-[#111214] shadow-[0_4px_12px_rgba(0,0,0,0.26)] transition duration-200 ease-out hover:rotate-90 hover:bg-[#2a2b2f] hover:text-white"
          title="placeholder"
          onMouseEnter={openAddMenu}
          onMouseLeave={onScheduleCloseAddMenu}
          onFocus={openAddMenu}
        >
          <Plus
            size={11}
            strokeWidth={2.3}
            className="absolute transition duration-150 ease-out group-hover:scale-75 group-hover:opacity-0"
          />
          <X
            size={11}
            strokeWidth={2.3}
            className="absolute opacity-0 transition duration-150 ease-out group-hover:scale-100 group-hover:opacity-100"
          />
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <ToolbarButton icon={Folder} title="placeholder" />
          <ToolbarButton icon={LayoutList} title="placeholder" />
          <ToolbarButton icon={MessageCircle} title="placeholder" />
          <ToolbarButton icon={Clock3} title="placeholder" />
        </div>

        <div className="mb-2 mt-1 h-px w-3 rounded-full bg-white/10" />

        <button
          type="button"
          onClick={onOpenApiSettings}
          className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-[#2a2b2f] text-[#8f8f94] transition duration-150 hover:bg-[#323338] hover:text-white"
          title="API 设置"
        >
          <Settings size={14} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}
