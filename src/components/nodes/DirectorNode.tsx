'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import type { DirectorNodeData } from '../../types/canvas';

export const DIRECTOR_NODE_CARD_WIDTH = 400;
export const DIRECTOR_NODE_CARD_HEIGHT = 400;
export const DIRECTOR_NODE_TITLE_HEIGHT = 26;

export interface DirectorNodeProps {
  data: DirectorNodeData;
  selected?: boolean;
  onOpen?: () => void;
}

export function DirectorNode({
  data,
  selected = false,
  onOpen,
}: DirectorNodeProps) {
  const title = data.title?.trim() || '导演台';

  return (
    <div
      className="relative node-connectable-root"
      style={{
        width: `${DIRECTOR_NODE_CARD_WIDTH}px`,
        paddingTop: `${DIRECTOR_NODE_TITLE_HEIGHT}px`,
      }}
    >
      <div className="absolute left-0 top-0 flex h-5 items-center gap-1.5 text-[13px] font-medium text-gl-text-secondary">
        <Layers size={14} strokeWidth={1.8} className="text-gl-text-tertiary" />
        <span>{title}</span>
      </div>
      <div
        className={[
          'node-connectable-card relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[12px] bg-[#1f1f20] text-center shadow-[0_12px_30px_rgba(0,0,0,0.32)]',
          selected
            ? 'bg-[#242425] shadow-[0_14px_34px_rgba(0,0,0,0.38)]'
            : 'bg-[#1f1f20]',
        ].join(' ')}
        style={{ height: `${DIRECTOR_NODE_CARD_HEIGHT}px` }}
      >
        <Layers size={46} strokeWidth={1.9} className="mb-8 text-white/30" />
        <div className="px-8 text-[15px] font-medium leading-6 text-white/88">
          在3D空间中搭建场景并进行多视角截图
        </div>
        <button
          type="button"
          aria-label="打开导演台"
          className="nodrag nopan mt-4 h-9 rounded-[8px] bg-white/[0.12] px-4 text-[14px] font-medium text-white/86 transition-colors hover:bg-white/[0.16] focus-visible:outline-none"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen?.();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          打开导演台
        </button>
      </div>
    </div>
  );
}
