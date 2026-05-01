'use client';

import React from 'react';
import { Copy, Link2, Trash2, Share2, PlusCircle, MoreHorizontal } from 'lucide-react';

export interface NodeFloatingToolbarProps {
  visible: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
  onLink?: () => void;
  onShare?: () => void;
  onMore?: () => void;
}

export function NodeFloatingToolbar({
  visible,
  onCopy,
  onDelete,
  onLink,
  onShare,
  onMore
}: NodeFloatingToolbarProps) {
  if (!visible) return null;

  return (
    <div
      data-canvas-menu-ignore="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute -top-[44px] left-1/2 -translate-x-1/2 z-50 bg-gl-panel/90 backdrop-blur-md border border-gl-stroke-soft rounded-gl-pill shadow-gl-toolbar px-2 py-1 flex items-center gap-1 transition-opacity duration-150 ease-out"
    >
      <button
        onClick={onCopy}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
        title="Duplicate"
      >
        <Copy size={14} />
      </button>
      <button
        onClick={onLink}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
        title="Link Node"
      >
        <Link2 size={14} />
      </button>
      <button
        onClick={onShare}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
        title="Share"
      >
        <Share2 size={14} />
      </button>
      <button
        onClick={() => console.log('Placeholder action')}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
        title="Add Actions"
      >
        <PlusCircle size={14} />
      </button>
      <button
        onClick={onMore}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
        title="More"
      >
        <MoreHorizontal size={14} />
      </button>
      
      {/* Divider */}
      <div className="w-px h-3.5 bg-gl-stroke-soft mx-0.5" />
      
      <button
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center rounded-gl-pill text-gl-text-secondary hover:text-gl-error hover:bg-gl-panel-hover transition-colors"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
