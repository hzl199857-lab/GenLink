'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AITextResultNodeData } from '../../types/canvas';
import { EditableNodeTitle } from './EditableNodeTitle';
import { NodeShell } from './NodeShell';

export interface AITextResultNodeProps {
  id?: string;
  data: AITextResultNodeData;
  selected?: boolean;
  titleEditRequestId?: number;
  onTitleChange?: (nextTitle: string | undefined) => void;
}

export function AITextResultNode({
  id,
  data,
  selected = false,
  titleEditRequestId,
  onTitleChange,
}: AITextResultNodeProps) {
  // Ensure the date is valid before parsing
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
      state={selected ? 'selected' : 'default'}
      className="min-w-[320px] max-w-[420px] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gl-stroke-subtle text-gl-accent-cool">
        <Sparkles size={14} />
        <EditableNodeTitle
          value={data.title}
          fallbackValue="AI Text Result"
          editRequestId={titleEditRequestId}
          className="text-[12px] font-medium text-gl-text-secondary"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[12px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
        {id && <span className="text-gl-text-muted font-mono text-[10px] ml-1">#{id.slice(0, 6)}</span>}
      </div>

      {/* Content */}
      <div className="p-4 max-h-[400px] overflow-auto">
        <div className="whitespace-pre-wrap text-gl-text-primary text-[13px] leading-7">
          {data.content}
        </div>
      </div>

      {/* Meta Footer */}
      <div className="px-4 py-3 border-t border-gl-stroke-subtle flex items-center justify-between text-[11px] text-gl-text-muted">
        <div className="flex items-center gap-2">
          <span>{data.model}</span>
          {data.tokens && <span>· {data.tokens} tokens</span>}
        </div>
        <span>{formattedTime}</span>
      </div>
    </NodeShell>
  );
}
