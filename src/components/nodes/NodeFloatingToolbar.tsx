'use client';

import React from 'react';
import { Copy, Link2, Trash2, Share2, PlusCircle, MoreHorizontal } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface NodeFloatingToolbarProps {
  visible: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
  onLink?: () => void;
  onShare?: () => void;
  onMore?: () => void;
}

function ToolbarIconButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string;
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button onClick={onClick} aria-label={title} className={className}>
        {children}
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

export function NodeFloatingToolbar({
  visible,
  onCopy,
  onDelete,
  onLink,
  onShare,
  onMore,
}: NodeFloatingToolbarProps) {
  if (!visible) return null;

  return (
    <div
      data-canvas-menu-ignore="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute -top-[44px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-gl-pill border border-gl-stroke-soft bg-gl-panel/90 px-2 py-1 shadow-gl-toolbar backdrop-blur-md transition-opacity duration-150 ease-out"
    >
      <ToolbarIconButton
        onClick={onCopy}
        title="复制"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <Copy size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={onLink}
        title="连接节点"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <Link2 size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={onShare}
        title="分享"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <Share2 size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={() => console.log('Placeholder action')}
        title="添加操作"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <PlusCircle size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={onMore}
        title="更多"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <MoreHorizontal size={14} />
      </ToolbarIconButton>

      <div className="mx-0.5 h-3.5 w-px bg-gl-stroke-soft" />

      <ToolbarIconButton
        onClick={onDelete}
        title="删除"
        className="flex h-7 w-7 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-error"
      >
        <Trash2 size={14} />
      </ToolbarIconButton>
    </div>
  );
}
