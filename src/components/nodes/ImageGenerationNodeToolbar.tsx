'use client';

import React from 'react';
import { useViewport } from 'reactflow';
import {
  Crop,
  Boxes,
  Wand2,
  Hand,
  MoreHorizontal,
  FolderPlus,
  Download,
  Expand,
  Upload,
} from 'lucide-react';

export type ImageGenerationToolbarAction =
  | 'crop'
  | 'variations'
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
  onUpload?: () => void;
  onAction?: (action: ImageGenerationToolbarAction) => void;
}

type ToolbarActionConfig = {
  id: ImageGenerationToolbarAction;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const GENERATED_IMAGE_ACTIONS: ToolbarActionConfig[] = [
  { id: 'crop', title: 'Crop', icon: Crop },
  { id: 'variations', title: 'Variations', icon: Boxes },
  { id: 'edit', title: 'Edit', icon: Wand2 },
  { id: 'pan', title: 'Pan', icon: Hand },
  { id: 'more', title: 'More', icon: MoreHorizontal },
  { id: 'organize', title: 'Organize', icon: FolderPlus },
  { id: 'download', title: 'Download', icon: Download },
  { id: 'expand', title: 'Expand', icon: Expand },
];

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
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      title={title}
      aria-label={title}
    >
      <Icon size={16} strokeWidth={1.9} />
    </button>
  );
}

export function ImageGenerationNodeToolbar({
  visible,
  top,
  hasGeneratedImage,
  onUpload,
  onAction,
}: ImageGenerationNodeToolbarProps) {
  const { zoom } = useViewport();

  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 z-20 transition-[top,transform] duration-300 ease-out"
      style={{
        top: `${top}px`,
        transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
        transformOrigin: 'bottom center',
      }}
    >
      {hasGeneratedImage ? (
        <div
          className="flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {GENERATED_IMAGE_ACTIONS.slice(0, 5).map((action) => (
            <ToolbarIconButton
              key={action.id}
              title={action.title}
              icon={action.icon}
              onClick={() => onAction?.(action.id)}
            />
          ))}
          <div className="mx-1 h-5 w-px bg-white/10" />
          {GENERATED_IMAGE_ACTIONS.slice(5).map((action) => (
            <ToolbarIconButton
              key={action.id}
              title={action.title}
              icon={action.icon}
              onClick={() => onAction?.(action.id)}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onUpload}
          className="flex h-[40px] items-center gap-2 rounded-gl-pill border border-white/10 bg-gl-panel/95 px-4 text-[15px] font-medium text-gl-text-primary shadow-gl-toolbar backdrop-blur-md transition-colors hover:bg-gl-panel-hover"
          title="Upload reference image"
        >
          <Upload size={15} />
          <span>上传</span>
        </button>
      )}
    </div>
  );
}
