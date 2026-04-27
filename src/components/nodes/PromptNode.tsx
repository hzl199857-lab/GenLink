'use client';

import React from 'react';
import { Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import type { PromptNodeData } from '../../types/canvas';
import { NodeShell } from './NodeShell';

export interface PromptNodeProps {
  id?: string;
  data: PromptNodeData;
  selected?: boolean;
  onChange?: (next: PromptNodeData) => void;
  onGenerateText?: () => void;
  onGenerateImage?: () => void;
}

export function PromptNode({
  id,
  data,
  selected = false,
  onChange,
  onGenerateText,
  onGenerateImage,
}: PromptNodeProps) {
  const isGenerating = data.status === 'generating';

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange({ ...data, prompt: e.target.value });
    }
  };

  return (
    <NodeShell
      state={data.status === 'error' ? 'error' : selected ? 'selected' : 'default'}
      className="min-w-[320px] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gl-stroke-subtle text-gl-text-tertiary">
        <Sparkles size={14} />
        <span className="text-[12px] font-medium text-gl-text-secondary">Prompt</span>
        {id && <span className="text-gl-text-muted font-mono text-[10px] ml-1">#{id.slice(0, 6)}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-4">
        <textarea
          value={data.prompt}
          onChange={handlePromptChange}
          placeholder="Describe what you want to create..."
          className="w-full bg-transparent border-none outline-none resize-none text-[13px] leading-6 text-gl-text-primary h-[80px]"
          disabled={isGenerating}
        />

        {/* Tags */}
        <div className="flex items-center gap-2">
          {data.model && (
            <span className="px-2 py-1 rounded-gl-pill bg-white/[0.06] text-[11px] text-gl-text-tertiary">
              {data.model}
            </span>
          )}
          <span className="px-2 py-1 rounded-gl-pill bg-white/[0.06] text-[11px] text-gl-text-tertiary">
            {data.mode}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onGenerateText}
            disabled={isGenerating}
            className="flex-1 flex justify-center items-center gap-2 py-2 rounded-gl-sm bg-gl-accent-cool/[0.08] border border-gl-accent-cool/40 text-gl-accent-cool hover:bg-gl-accent-cool/10 transition-colors disabled:opacity-50 text-[12px] font-medium"
          >
            {isGenerating && data.mode === 'text' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Generate Text
          </button>
          
          <button
            onClick={onGenerateImage}
            disabled={isGenerating}
            className="flex-1 flex justify-center items-center gap-2 py-2 rounded-gl-sm bg-white/[0.04] border border-gl-stroke-soft text-gl-text-secondary hover:bg-white/[0.08] transition-colors disabled:opacity-50 text-[12px] font-medium"
          >
            {isGenerating && data.mode === 'image' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ImageIcon size={14} />
            )}
            Generate Image
          </button>
        </div>

        {/* Error Message */}
        {data.status === 'error' && data.errorMessage && (
          <div className="text-[11px] text-gl-error mt-1">
            {data.errorMessage}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
