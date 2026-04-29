'use client';

import React from 'react';
import { Position } from 'reactflow';
import { AlignLeft } from 'lucide-react';
import type { TextNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { TextNodeFloatingToolbar } from './TextNodeFloatingToolbar';
import { TextNodePromptBar } from './TextNodePromptBar';

const TEXT_NODE_SCROLL_THRESHOLD_PX = 520;

export interface TextNodeProps {
  id?: string;
  data: TextNodeData;
  selected?: boolean;
  editing?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    alt: string;
  }>;
  onChange?: (next: TextNodeData) => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
  onRun?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}

export function TextNode({
  id,
  data,
  selected = false,
  editing = false,
  connectedImages = [],
  onChange,
  onStartEdit,
  onEndEdit,
  onRun,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: TextNodeProps) {
  const handleContentWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.({ ...data, text: e.target.value });
  };

  const handlePromptChange = (next: string) => {
    onChange?.({ ...data, aiPrompt: next, status: data.status === 'error' ? 'idle' : data.status, errorMessage: undefined });
  };

  const handleModelChange = (next: string) => {
    onChange?.({ ...data, model: next, status: data.status === 'error' ? 'idle' : data.status, errorMessage: undefined });
  };

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(data.text || '');
    } catch {
      console.warn('clipboard write failed');
    }
  };

  const handleSetHeading = (level: 1 | 2 | 3 | 0) => {
    console.log('heading level requested', level);
  };

  const showAccessories = selected;
  const isGenerating = data.status === 'generating';

  return (
    <div className="relative group node-connectable-root">
      <div className="flex items-center gap-1.5 text-gl-text-tertiary mb-1.5 ml-1 select-none nodrag nopan">
        <AlignLeft size={12} />
        <span className="text-[11px] font-medium leading-none">{data.title || 'Text'}</span>
      </div>

      <div
        className={[
          'node-connectable-card text-node-drag-handle relative rounded-gl-lg bg-gl-panel border shadow-gl-card',
          'min-w-[380px] max-w-[460px] min-h-[260px]',
          'px-5 py-4 flex flex-col cursor-grab transition-colors duration-150',
          isGenerating
            ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
            : selected
              ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_8px_rgba(255,255,255,0.08)]'
              : 'border-gl-stroke-subtle',
        ].join(' ')}
        onDoubleClick={onStartEdit}
      >
        {editing ? (
          <textarea
            autoFocus
            value={data.text}
            onChange={handleContentChange}
            onBlur={onEndEdit}
            onWheelCapture={handleContentWheel}
            onWheel={handleContentWheel}
            placeholder="双击开始编辑..."
            className="text-node-scrollable nodrag nopan w-full flex-1 overflow-y-auto bg-transparent border-none outline-none resize-none pr-1 text-[13px] leading-6 text-gl-text-primary placeholder:text-gl-text-muted"
            style={{ maxHeight: TEXT_NODE_SCROLL_THRESHOLD_PX }}
          />
        ) : (
          <div
            onWheelCapture={handleContentWheel}
            onWheel={handleContentWheel}
            className="text-node-scrollable whitespace-pre-wrap text-[13px] leading-6 flex-1 w-full overflow-y-auto pr-1"
            style={{ maxHeight: TEXT_NODE_SCROLL_THRESHOLD_PX }}
          >
            {data.text ? (
              <span className="text-gl-text-secondary">{data.text}</span>
            ) : (
              <span className="text-gl-text-muted">双击开始编辑...</span>
            )}
          </div>
        )}

        {data.status === 'error' && data.errorMessage ? (
          <div className="mt-3 text-[11px] text-gl-error">{data.errorMessage}</div>
        ) : null}
      </div>

      <CardSideHandle type="target" position={Position.Left} visible={showAccessories} cardTopOffset={18} />
      <CardSideHandle type="source" position={Position.Right} visible={showAccessories} cardTopOffset={18} />

      <TextNodeFloatingToolbar
        nodeId={id}
        visible={selected}
        onPickBgColor={() => console.log('bg color picker')}
        onSetHeading={handleSetHeading}
        onCopyContent={handleCopyContent}
      />

      <TextNodePromptBar
        nodeId={id}
        visible={selected}
        prompt={data.aiPrompt || ''}
        model={data.model || 'gpt-5.4'}
        connectedImages={connectedImages}
        onPromptChange={handlePromptChange}
        onModelChange={handleModelChange}
        onRun={onRun}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
}
