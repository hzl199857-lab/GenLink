'use client';

import React from 'react';
import { Type, MoreHorizontal } from 'lucide-react';
import type { TextNodeData } from '../../types/canvas';
import { NodeShell } from './NodeShell';

export interface TextNodeProps {
  id?: string;
  data: TextNodeData;
  selected?: boolean;
  editing?: boolean;
  onChange?: (next: TextNodeData) => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
}

export function TextNode({
  id,
  data,
  selected = false,
  editing = false,
  onChange,
  onStartEdit,
  onEndEdit,
}: TextNodeProps) {
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange({ ...data, text: e.target.value });
    }
  };

  return (
    <NodeShell
      state={selected ? 'selected' : 'default'}
      className="min-w-[320px] min-h-[180px] flex flex-col"
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gl-stroke-subtle">
        <div className="flex items-center gap-2 text-gl-text-tertiary">
          <Type size={14} />
          <span className="text-[12px] font-medium">{data.title || 'Text'}</span>
          {id && <span className="text-gl-text-muted font-mono text-[10px] ml-1">#{id.slice(0, 6)}</span>}
        </div>
        <button className="text-gl-text-tertiary hover:text-gl-text-secondary transition-colors">
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Content Area */}
      <div
        className="flex-1 p-4 cursor-text flex flex-col"
        onDoubleClick={onStartEdit}
      >
        {editing ? (
          <textarea
            autoFocus
            value={data.text}
            onChange={handleContentChange}
            onBlur={onEndEdit}
            className="w-full flex-1 bg-transparent border-none outline-none resize-none text-[13px] leading-6 text-gl-text-primary"
          />
        ) : (
          <div className="whitespace-pre-wrap text-gl-text-primary text-[13px] leading-6 flex-1 w-full">
            {data.text || <span className="text-gl-text-muted">Double click to edit...</span>}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
