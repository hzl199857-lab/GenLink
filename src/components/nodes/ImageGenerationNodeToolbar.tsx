'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useViewport } from 'reactflow';
import {
  Crop,
  ChevronRight,
  Grid3x3,
  Wand2,
  Hand,
  MoreHorizontal,
  FolderPlus,
  Download,
  Expand,
  Upload,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export type ImageGenerationToolbarAction =
  | 'crop'
  | 'variations'
  | 'split-2x2-crop'
  | 'split-3x3-crop'
  | 'split-5x5-crop'
  | 'edit'
  | 'pan'
  | 'more'
  | 'organize'
  | 'download'
  | 'expand';

export interface ImageGenerationNodeToolbarProps {
  visible: boolean;
  top: number;
  hasGeneratedImage: boolean;
  transformOrigin?: string;
  onUpload?: () => void;
  onOpenLightbox?: () => void;
  onAction?: (action: ImageGenerationToolbarAction) => void;
}

type ToolbarActionConfig = {
  id: ImageGenerationToolbarAction;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const GENERATED_IMAGE_ACTIONS: ToolbarActionConfig[] = [
  { id: 'variations', title: '分割', icon: Grid3x3 },
  { id: 'edit', title: '编辑', icon: Wand2 },
  { id: 'pan', title: '平移', icon: Hand },
  { id: 'more', title: '更多', icon: MoreHorizontal },
  { id: 'organize', title: '整理', icon: FolderPlus },
  { id: 'download', title: '下载', icon: Download },
  { id: 'expand', title: '放大查看', icon: Expand },
];

const SPLIT_GRID_OPTIONS = [
  { id: '2x2', title: '4 宫格裁剪 2x2', action: 'split-2x2-crop' as const },
  { id: '3x3', title: '9 宫格裁剪 3x3', action: 'split-3x3-crop' as const },
  { id: '5x5', title: '25 宫格裁剪 5x5', action: 'split-5x5-crop' as const },
] as const;

function ToolbarIconButton({
  title,
  icon: Icon,
  onClick,
}: {
  title: string;
  icon: ToolbarActionConfig['icon'];
  onClick?: () => void;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        className="nodrag nopan flex h-10 w-10 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
        aria-label={title}
      >
        <Icon size={16} strokeWidth={1.9} />
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

export function ImageGenerationNodeToolbar({
  visible,
  top,
  hasGeneratedImage,
  transformOrigin = 'bottom center',
  onUpload,
  onOpenLightbox,
  onAction,
}: ImageGenerationNodeToolbarProps) {
  const { zoom } = useViewport();
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [activeGridMenu, setActiveGridMenu] = useState<string | null>(null);
  const splitMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!splitMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!splitMenuRef.current?.contains(event.target as Node)) {
        setSplitMenuOpen(false);
        setActiveGridMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [splitMenuOpen]);

  if (!visible) return null;

  return (
    <div
      data-canvas-menu-ignore="true"
      className="absolute left-1/2 z-20 transition-[top,transform] duration-300 ease-out"
      style={{
        top: `${top}px`,
        transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
        transformOrigin,
      }}
    >
      {hasGeneratedImage ? (
        <div
          className="flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ToolbarIconButton title="裁剪" icon={Crop} onClick={() => onAction?.('crop')} />
          {GENERATED_IMAGE_ACTIONS.slice(0, 4).map((action) => (
            action.id === 'variations' ? (
              <div
                key={action.id}
                ref={splitMenuRef}
                className="relative"
                onPointerEnter={() => {
                  if (!splitMenuOpen) {
                    return;
                  }

                  setActiveGridMenu(null);
                }}
              >
                <ToolbarIconButton
                  title={action.title}
                  icon={action.icon}
                  onClick={() => {
                    setSplitMenuOpen((open) => {
                      const nextOpen = !open;
                      if (!nextOpen) {
                        setActiveGridMenu(null);
                      }
                      return nextOpen;
                    });
                  }}
                />

                {splitMenuOpen ? (
                  <div
                    className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[216px] -translate-x-1/2 rounded-[14px] border border-white/10 bg-[#17181B]/95 p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerLeave={() => setActiveGridMenu(null)}
                  >
                    {SPLIT_GRID_OPTIONS.map((option) => (
                      <div
                        key={option.id}
                        className="relative"
                        onPointerEnter={() => setActiveGridMenu(option.id)}
                      >
                        <button
                          type="button"
                          className="flex min-h-[36px] w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13px] font-medium text-gl-text-primary transition-colors hover:bg-white/[0.07]"
                        >
                          <span>{option.title}</span>
                          <ChevronRight size={14} className="text-gl-text-muted" />
                        </button>

                        {activeGridMenu === option.id ? (
                          <div
                            className="absolute left-[calc(100%+8px)] top-0 z-40 w-[168px] rounded-[14px] border border-white/10 bg-[#17181B]/95 p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium text-gl-text-primary transition-colors hover:bg-white/[0.07]"
                              onClick={() => {
                                onAction?.(option.action);
                                setSplitMenuOpen(false);
                                setActiveGridMenu(null);
                              }}
                            >
                              裁剪
                            </button>
                            <button
                              type="button"
                              disabled
                              className="flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium text-gl-text-muted/60"
                            >
                              创建分镜卡片
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <ToolbarIconButton
                key={action.id}
                title={action.title}
                icon={action.icon}
                onClick={() => {
                  if (action.id === 'expand') {
                    onOpenLightbox?.();
                    return;
                  }

                  onAction?.(action.id);
                }}
              />
            )
          ))}
          <div className="mx-1 h-5 w-px bg-white/10" />
          {GENERATED_IMAGE_ACTIONS.slice(4).map((action) => (
            <ToolbarIconButton
              key={action.id}
              title={action.title}
              icon={action.icon}
              onClick={() => {
                if (action.id === 'expand') {
                  onOpenLightbox?.();
                  return;
                }

                onAction?.(action.id);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="group/tooltip relative">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onUpload}
            className="flex h-[40px] items-center gap-2 rounded-gl-pill border border-white/10 bg-gl-panel/95 px-4 text-[15px] font-medium text-gl-text-primary shadow-gl-toolbar backdrop-blur-md transition-colors hover:bg-gl-panel-hover"
            aria-label="上传参考图"
          >
            <Upload size={15} />
            <span>上传</span>
          </button>
          <Tooltip label="上传参考图" side="top" />
        </div>
      )}
    </div>
  );
}
