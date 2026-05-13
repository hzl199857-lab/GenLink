'use client';

import React from 'react';
import NextImage from 'next/image';
import { Image as ImageIcon, Maximize2, RefreshCw } from 'lucide-react';
import type { ImageNodeData } from '../../types/canvas';
import { EditableNodeTitle } from './EditableNodeTitle';
import { NodeShell } from './NodeShell';
import { Tooltip } from '@/components/ui/Tooltip';

export interface ImageNodeProps {
  id?: string;
  data: ImageNodeData;
  selected?: boolean;
  loading?: boolean;
  onOpenFullscreen?: () => void;
  onRegenerate?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onShowInfo?: () => void;
}

export function ImageNode({
  id,
  data,
  selected = false,
  loading = false,
  onOpenFullscreen,
  onRegenerate,
  onTitleChange,
  onSelectNode,
  onShowInfo,
}: ImageNodeProps) {
  let formattedTime = '';
  try {
    const date = new Date(data.generatedAt);
    if (!isNaN(date.getTime())) {
      formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    // Ignore invalid date
  }

  return (
    <NodeShell
      state={loading ? 'loading' : selected ? 'selected' : 'default'}
      className="min-w-[320px] w-[320px] sm:w-[420px] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gl-stroke-subtle px-4 py-3">
        <div className="-mt-2 flex items-center gap-1.5 text-gl-accent-cyan">
          <ImageIcon size={24} />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Image"
            className="text-[22px] font-medium leading-none text-gl-text-secondary"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
          {id && <span className="text-gl-text-muted font-mono text-[10px] ml-1">#{id.slice(0, 6)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <div className="group/tooltip relative">
              <button onClick={onRegenerate} aria-label="重新生成" className="text-gl-text-tertiary hover:text-gl-text-primary transition-colors">
                <RefreshCw size={14} />
              </button>
              <Tooltip label="重新生成" side="top" />
            </div>
          )}
          {onOpenFullscreen && (
            <div className="group/tooltip relative">
              <button onClick={onOpenFullscreen} aria-label="全屏查看" className="text-gl-text-tertiary hover:text-gl-text-primary transition-colors">
                <Maximize2 size={14} />
              </button>
              <Tooltip label="全屏查看" side="top" />
            </div>
          )}
        </div>
      </div>

      {/* Image Area */}
      <div className="p-4 pb-2">
        <div
          className="relative w-full aspect-[4/3] rounded-gl-md overflow-hidden bg-gl-panel-soft cursor-pointer group"
          onClick={(event) => {
            event.stopPropagation();
            onSelectNode?.();
            onShowInfo?.();
          }}
        >
          {loading ? (
            <div className="absolute inset-0 bg-gl-panel-soft animate-pulse" />
          ) : data.imageUrl ? (
            <NextImage
              src={data.imageUrl}
              alt={data.prompt}
              fill
              unoptimized
              sizes="420px"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
              <ImageIcon size={24} />
            </div>
          )}
          
          {/* Hover Overlay */}
          {!loading && data.imageUrl && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 size={24} className="text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Prompt / Meta Area */}
      <div className="px-4 pb-4">
        <p className="line-clamp-2 text-[11px] text-gl-text-tertiary leading-relaxed mb-2" title={data.prompt}>
          {data.prompt}
        </p>
        <div className="flex items-center justify-between text-[11px] text-gl-text-muted">
          <span>{data.model || 'Unknown Model'}</span>
          <span>{formattedTime}</span>
        </div>
      </div>
    </NodeShell>
  );
}
