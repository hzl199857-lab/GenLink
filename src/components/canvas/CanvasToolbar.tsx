'use client';

import React, { useRef } from 'react';
import {
  Clock3,
  Folder,
  LayoutList,
  MessageCircle,
  Plus,
  Save,
  Settings,
  X,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface CanvasToolbarProps {
  onOpenAddMenu?: (position: { x: number; y: number }) => void;
  onScheduleCloseAddMenu?: () => void;
  onOpenApiSettings?: () => void;
  onToggleMaterialLibrary?: (anchor: DOMRect) => void;
  onToggleHistory?: (anchor: DOMRect) => void;
  onSaveProject?: () => void;
  materialLibraryOpen?: boolean;
  historyOpen?: boolean;
}

function ToolbarButton({
  icon: Icon,
  title,
  active = false,
  onClick,
  onMouseLeave,
  historyToggle = false,
  materialLibraryToggle = false,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  active?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  historyToggle?: boolean;
  materialLibraryToggle?: boolean;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label={title}
        data-history-toggle={historyToggle ? 'true' : undefined}
        data-material-library-toggle={materialLibraryToggle ? 'true' : undefined}
        onClick={onClick}
        onMouseLeave={onMouseLeave}
        className={[
          'flex h-[31px] w-[31px] items-center justify-center rounded-full border border-white/0 transition duration-150 hover:bg-white/8 hover:text-white focus-visible:bg-white/8 focus-visible:text-white focus-visible:outline-none',
          active ? 'bg-white/10 text-white' : 'text-white/72',
        ].join(' ')}
      >
        <Icon size={15} strokeWidth={1.9} />
      </button>
      <Tooltip label={title} side="right" />
    </div>
  );
}

export function CanvasToolbar({
  onOpenAddMenu,
  onScheduleCloseAddMenu,
  onOpenApiSettings,
  onToggleMaterialLibrary,
  onToggleHistory,
  onSaveProject,
  materialLibraryOpen = false,
  historyOpen = false,
}: CanvasToolbarProps) {
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const openAddMenu = () => {
    const button = addButtonRef.current;

    if (!button || !onOpenAddMenu) {
      return;
    }

    const rect = button.getBoundingClientRect();
    onOpenAddMenu({
      x: rect.right + 18,
      y: rect.top - 6,
    });
  };

  return (
    <div className="fixed left-4 top-1/2 z-50 -translate-y-1/2">
      <div className="flex w-[44px] flex-col items-center rounded-[22px] border border-white/10 bg-[#17181b]/95 px-1.5 py-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <div className="group/tooltip relative mb-2">
          <button
            ref={addButtonRef}
            type="button"
            aria-label="添加"
            className="group relative flex h-[25px] w-[25px] items-center justify-center rounded-full border border-black/5 bg-[#f1f1ef] text-[#111214] shadow-[0_4px_12px_rgba(0,0,0,0.26)] transition duration-200 ease-out hover:rotate-90 hover:bg-[#2a2b2f] hover:text-white focus-visible:bg-[#2a2b2f] focus-visible:text-white focus-visible:outline-none"
            onMouseEnter={openAddMenu}
            onMouseLeave={(event) => {
              onScheduleCloseAddMenu?.();
              event.currentTarget.blur();
            }}
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
          <Tooltip label="添加" side="right" />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <ToolbarButton
            icon={Folder}
            title="素材库"
            active={materialLibraryOpen}
            materialLibraryToggle
            onMouseLeave={(event) => event.currentTarget.blur()}
            onClick={(event) => onToggleMaterialLibrary?.(event.currentTarget.getBoundingClientRect())}
          />
          <ToolbarButton
            icon={LayoutList}
            title="列表"
            onMouseLeave={(event) => event.currentTarget.blur()}
          />
          <ToolbarButton
            icon={MessageCircle}
            title="消息"
            onMouseLeave={(event) => event.currentTarget.blur()}
          />
          <ToolbarButton
            icon={Clock3}
            title="历史"
            active={historyOpen}
            historyToggle
            onMouseLeave={(event) => event.currentTarget.blur()}
            onClick={(event) => onToggleHistory?.(event.currentTarget.getBoundingClientRect())}
          />
          <ToolbarButton
            icon={Save}
            title="保存"
            onMouseLeave={(event) => event.currentTarget.blur()}
            onClick={() => onSaveProject?.()}
          />
        </div>

        <div className="mb-2 mt-1 h-px w-3 rounded-full bg-white/10" />

        <div className="group/tooltip relative">
          <button
            type="button"
            onClick={onOpenApiSettings}
            onMouseLeave={(event) => event.currentTarget.blur()}
            aria-label="设置"
            className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-[#2a2b2f] text-[#8f8f94] transition duration-150 hover:bg-[#323338] hover:text-white focus-visible:bg-[#323338] focus-visible:text-white focus-visible:outline-none"
          >
            <Settings size={14} strokeWidth={1.9} />
          </button>
          <Tooltip label="设置" side="right" />
        </div>
      </div>
    </div>
  );
}
