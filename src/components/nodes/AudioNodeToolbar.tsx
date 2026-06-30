'use client';

import React from 'react';
import { useViewport } from 'reactflow';
import { Loader2, Scissors } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface AudioNodeToolbarProps {
  visible: boolean;
  top: number;
  disabled?: boolean;
  separating?: boolean;
  onSeparateAudio?: () => void;
}

export function AudioNodeToolbar({
  visible,
  top,
  disabled = false,
  separating = false,
  onSeparateAudio,
}: AudioNodeToolbarProps) {
  const { zoom } = useViewport();

  if (!visible) {
    return null;
  }

  const label = separating ? '正在分离' : '人声/伴奏分离';
  const Icon = separating ? Loader2 : Scissors;

  return (
    <div
      data-canvas-menu-ignore="true"
      className="pointer-events-none absolute left-1/2 z-20 transition-[top,transform] duration-300 ease-out"
      style={{
        top: `${top}px`,
        transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
        transformOrigin: 'bottom center',
      }}
    >
      <div
        className="pointer-events-auto flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="group/tooltip relative">
          <button
            type="button"
            disabled={disabled || separating}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSeparateAudio?.();
            }}
            className={[
              'nodrag nopan flex h-10 w-10 items-center justify-center rounded-gl-pill transition-colors',
              disabled || separating
                ? 'cursor-not-allowed text-gl-text-muted/60'
                : 'text-gl-text-secondary hover:bg-gl-panel-hover hover:text-gl-text-primary',
            ].join(' ')}
            aria-label={label}
          >
            <Icon size={16} strokeWidth={1.9} className={separating ? 'animate-spin' : undefined} />
          </button>
          <Tooltip label={label} side="top" />
        </div>
      </div>
    </div>
  );
}
