'use client';

import React from 'react';
import { Type, MousePointer2, Hand, Settings2, Upload } from 'lucide-react';

export interface CanvasToolbarProps {
  onAddTextNode?: () => void;
  onUploadImage?: () => void;
  onOpenApiSettings?: () => void;
}

export function CanvasToolbar({
  onAddTextNode,
  onUploadImage,
  onOpenApiSettings,
}: CanvasToolbarProps) {
  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 bg-gl-panel/80 backdrop-blur-md border border-gl-stroke-subtle rounded-gl-lg shadow-gl-toolbar p-2 flex flex-col gap-1">
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="閫夋嫨 (Select)"
      >
        <MousePointer2 size={16} />
      </button>
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="鐢诲竷鎷栨嫿 (Pan)"
      >
        <Hand size={16} />
      </button>

      <div className="bg-gl-stroke-subtle h-px mx-1 my-1" />

      <button
        type="button"
        onClick={onAddTextNode}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="娣诲姞鏂囨湰鑺傜偣"
      >
        <Type size={16} />
      </button>
      <button
        type="button"
        onClick={onUploadImage}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="涓婁紶鍥剧墖"
      >
        <Upload size={16} />
      </button>

      <div className="bg-gl-stroke-subtle h-px mx-1 my-1" />

      <button
        type="button"
        onClick={onOpenApiSettings}
        className="w-9 h-9 flex items-center justify-center rounded-gl-md text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors duration-150"
        title="API 璁剧疆"
      >
        <Settings2 size={16} />
      </button>
    </div>
  );
}
