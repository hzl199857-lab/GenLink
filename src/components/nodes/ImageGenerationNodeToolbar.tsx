'use client';

import React from 'react';
import { Upload } from 'lucide-react';

export interface ImageGenerationNodeToolbarProps {
  visible: boolean;
  top: number;
  onUpload?: () => void;
}

export function ImageGenerationNodeToolbar({
  visible,
  top,
  onUpload,
}: ImageGenerationNodeToolbarProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 z-20 -translate-x-1/2 transition-[top,transform] duration-300 ease-out"
      style={{ top: `${top}px` }}
    >
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
    </div>
  );
}
