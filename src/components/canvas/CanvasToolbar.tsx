'use client';

import React from 'react';
import { Type, Wand2, MousePointer2, Hand, Settings2, Upload } from 'lucide-react';

export interface CanvasToolbarProps {
  onAddTextNode?: () => void;
  onAddPromptNode?: () => void;
  onUploadImage?: () => void;
  onOpenApiSettings?: () => void;
}

export function CanvasToolbar({
  onAddTextNode,
  onAddPromptNode,
  onUploadImage,
  onOpenApiSettings,
}: CanvasToolbarProps) {
  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 bg-gl-panel/80 backdrop-blur-md border border-gl-stroke-subtle rounded-gl-lg shadow-gl-toolbar p-2 flex flex-col gap-1">
      {/* View Tools (Placeholders) */}
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="选择 (Select)"
      >
        <MousePointer2 size={16} />
      </button>
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="画布拖拽 (Pan)"
      >
        <Hand size={16} />
      </button>

      <div className="bg-gl-stroke-subtle h-px mx-1 my-1" />

      {/* Add Node Tools */}
      <button
        type="button"
        onClick={onAddTextNode}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="添加文本节点"
      >
        <Type size={16} />
      </button>
      <button
        type="button"
        onClick={onAddPromptNode}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="添加 Prompt 节点"
      >
        <Wand2 size={16} />
      </button>
      <button
        type="button"
        onClick={onUploadImage}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="上传图片"
      >
        <Upload size={16} />
      </button>

      <div className="bg-gl-stroke-subtle h-px mx-1 my-1" />

      <button
        type="button"
        onClick={onOpenApiSettings}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="API 设置"
      >
        <Settings2 size={16} />
      </button>
    </div>
  );
}
