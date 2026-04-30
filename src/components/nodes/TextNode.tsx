'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { AlignLeft } from 'lucide-react';
import type { TextNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { TextNodeFloatingToolbar } from './TextNodeFloatingToolbar';
import { TextNodePromptBar } from './TextNodePromptBar';

const TEXT_NODE_SCROLL_THRESHOLD_PX = 433;

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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const [cardMetrics, setCardMetrics] = useState({
    left: 0,
    width: 0,
  });

  const handleContentWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.({ ...data, text: e.target.value });
  };

  const handlePromptChange = (next: string) => {
    onChange?.({
      ...data,
      aiPrompt: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleModelChange = (next: string) => {
    onChange?.({
      ...data,
      model: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
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

  useEffect(() => {
    const stageElement = stageRef.current;
    const cardElement = cardRef.current;

    if (!stageElement || !cardElement) {
      return;
    }

    const updateCardMetrics = () => {
      setCardMetrics((current) => {
        const next = {
          left: cardElement.offsetLeft,
          width: cardElement.offsetWidth,
        };

        if (current.left === next.left && current.width === next.width) {
          return current;
        }

        return next;
      });
    };

    updateCardMetrics();

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => updateCardMetrics())
      : null;

    resizeObserver?.observe(stageElement);
    resizeObserver?.observe(cardElement);
    window.addEventListener('resize', updateCardMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateCardMetrics);
    };
  }, []);

  useEffect(() => {
    if (!id || cardMetrics.width <= 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [cardMetrics.left, cardMetrics.width, id, updateNodeInternals]);

  return (
    <div className="relative">
      <div ref={stageRef} className="relative inline-block group node-connectable-root">
        <div className="-mt-2 mb-1.5 ml-1 flex select-none items-center gap-1.5 text-gl-text-tertiary nodrag nopan">
          <AlignLeft size={24} />
          <span className="text-[22px] font-medium leading-none">{data.title || 'Text'}</span>
        </div>

        <div
          ref={cardRef}
          className={[
            'node-connectable-card text-node-drag-handle relative rounded-gl-lg border bg-gl-panel shadow-gl-card',
            'h-[433px] w-[767px] px-5 py-4',
            'flex cursor-grab flex-col transition-colors duration-150',
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
            className="text-node-scrollable nodrag nopan w-full flex-1 resize-none overflow-y-auto border-none bg-transparent pr-1 text-[16px] leading-7 text-gl-text-primary outline-none placeholder:text-gl-text-muted break-words"
            style={{ maxHeight: TEXT_NODE_SCROLL_THRESHOLD_PX }}
          />
        ) : (
          <div
            onWheelCapture={handleContentWheel}
            onWheel={handleContentWheel}
            className="text-node-scrollable flex-1 w-full overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[16px] leading-7"
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

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={showAccessories}
          cardTopOffset={18}
          cardLeftOffset={cardMetrics.left}
          cardWidth={cardMetrics.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={showAccessories}
          cardTopOffset={18}
          cardLeftOffset={cardMetrics.left}
          cardWidth={cardMetrics.width}
        />
      </div>

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
