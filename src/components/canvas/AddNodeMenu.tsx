'use client';

import React from 'react';
import { AlignLeft, Grid2X2, Image as ImageIcon, Upload, Video, Volume2 } from 'lucide-react';

export type AddNodeMenuAction = 'text' | 'image' | 'video' | 'audio' | 'storyboard' | 'upload';

export interface AddNodeMenuProps {
  x: number;
  y: number;
  onSelect?: (action: AddNodeMenuAction) => void;
}

const NODE_ITEMS: Array<{
  action: AddNodeMenuAction;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  {
    action: 'text',
    title: '文本',
    subtitle: '广告词、品牌文案',
    icon: AlignLeft,
  },
  {
    action: 'image',
    title: '图片',
    subtitle: '宣传图、海报、封面',
    icon: ImageIcon,
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

export function AddNodeMenu({ x, y, onSelect }: AddNodeMenuProps) {
  return (
    <div
      className="fixed z-[65] w-[288px] rounded-[16px] border border-white/10 bg-[#191A1C]/95 p-3 shadow-[0_18px_42px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="px-1 pb-2 text-[13px] font-medium text-gl-text-muted">添加节点</div>
      <div className="flex flex-col gap-1">
        {NODE_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.action}
              type="button"
              onClick={() => onSelect?.(item.action)}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-gl-text-secondary">
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-5 text-gl-text-secondary">
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span className="mt-0.5 block truncate text-[12px] leading-4 text-gl-text-muted">
                    {item.subtitle}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-1 pb-2 pt-4 text-[13px] font-medium text-gl-text-muted">添加资源</div>
      <button
        type="button"
        onClick={() => onSelect?.('upload')}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-gl-text-secondary">
          <Upload size={17} strokeWidth={2} />
        </span>
        <span className="text-[15px] font-semibold leading-5 text-gl-text-secondary">上传</span>
      </button>
    </div>
  );
}
