'use client';

import React from 'react';
import {
  AlignLeft,
  Globe2,
  Grid2X2,
  Image as ImageIcon,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';

export type AddNodeMenuAction =
  | 'text'
  | 'image_generation'
  | 'panorama-360'
  | 'video'
  | 'audio'
  | 'storyboard'
  | 'upload';

export interface AddNodeMenuProps {
  x: number;
  y: number;
  onSelect?: (action: AddNodeMenuAction) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const NODE_ITEMS: Array<{
  action: AddNodeMenuAction;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  {
    action: 'text',
    title: '文本',
    icon: AlignLeft,
  },
  {
    action: 'image_generation',
    title: '图像',
    icon: ImageIcon,
  },
  {
    action: 'panorama-360',
    title: '360全景图',
    icon: Globe2,
  },
  {
    action: 'video',
    title: '视频',
    icon: Video,
  },
  {
    action: 'audio',
    title: '音频',
    icon: Volume2,
  },
  {
    action: 'storyboard',
    title: '分镜格子',
    icon: Grid2X2,
  },
];

export function AddNodeMenu({ x, y, onSelect, onMouseEnter, onMouseLeave }: AddNodeMenuProps) {
  return (
    <div
      className="fixed z-[65] w-[196px] rounded-[12px] border border-white/10 bg-[#191A1C]/95 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left: x, top: y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="px-1 pb-1.5 text-[11px] font-medium text-gl-text-muted">添加节点</div>
      <div className="flex flex-col gap-0.5">
        {NODE_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.action}
              type="button"
              onClick={() => onSelect?.(item.action)}
              className="flex min-h-[28px] w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.08] text-gl-text-secondary">
                <Icon size={12} strokeWidth={2} />
              </span>
              <span className="min-w-0 text-[10px] font-semibold leading-4 text-gl-text-secondary">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-1 pb-1.5 pt-2.5 text-[11px] font-medium text-gl-text-muted">添加资源</div>
      <button
        type="button"
        onClick={() => onSelect?.('upload')}
        className="flex min-h-[28px] w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.08] text-gl-text-secondary">
          <Upload size={12} strokeWidth={2} />
        </span>
        <span className="text-[10px] font-semibold leading-4 text-gl-text-secondary">上传</span>
      </button>
    </div>
  );
}
