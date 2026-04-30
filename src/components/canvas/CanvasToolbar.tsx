'use client';

import React from 'react';
import {
  Type,
  MousePointer2,
  Hand,
  Settings2,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

export interface CanvasToolbarProps {
  onAddTextNode?: () => void;
  onAddImageGenerationNode?: () => void;
  onUploadImage?: () => void;
  onOpenApiSettings?: () => void;
}

export function CanvasToolbar({
  onAddTextNode,
  onAddImageGenerationNode,
  onUploadImage,
  onOpenApiSettings,
}: CanvasToolbarProps) {
  return (
    <div className="fixed left-4 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-1 rounded-gl-lg border border-gl-stroke-subtle bg-gl-panel/80 p-2 shadow-gl-toolbar backdrop-blur-md">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="选择"
      >
        <MousePointer2 size={16} />
      </button>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="平移"
      >
        <Hand size={16} />
      </button>

      <div className="mx-1 my-1 h-px bg-gl-stroke-subtle" />

      <button
        type="button"
        onClick={onAddTextNode}
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="添加文本节点"
      >
        <Type size={16} />
      </button>
      <button
        type="button"
        onClick={onAddImageGenerationNode}
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="添加图片生成节点"
      >
        <ImageIcon size={16} />
      </button>
      <button
        type="button"
        onClick={onUploadImage}
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="上传图片"
      >
        <Upload size={16} />
      </button>

      <div className="mx-1 my-1 h-px bg-gl-stroke-subtle" />

      <button
        type="button"
        onClick={onOpenApiSettings}
        className="flex h-9 w-9 items-center justify-center rounded-gl-md text-gl-text-secondary transition-colors duration-150 hover:bg-gl-panel-hover hover:text-gl-text-primary"
        title="API 设置"
      >
        <Settings2 size={16} />
      </button>
    </div>
  );
}
