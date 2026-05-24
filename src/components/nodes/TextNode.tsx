'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { AlignLeft } from 'lucide-react';
import type { TextNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { TextNodeFloatingToolbar } from './TextNodeFloatingToolbar';
import { TextNodePromptBar } from './TextNodePromptBar';

const TEXT_NODE_SCROLL_THRESHOLD_PX = 289;

export interface TextNodeProps {
  id?: string;
  data: TextNodeData;
  selected?: boolean;
  dragging?: boolean;
  editing?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    alt: string;
  }>;
  onChange?: (next: TextNodeData) => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onRun?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}

export const TextNode = memo(function TextNode({
  id,
  data,
  selected = false,
  dragging = false,
  editing = false,
  connectedImages = [],
  onChange,
  onStartEdit,
  onEndEdit,
  onTitleChange,
  onRun,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: TextNodeProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const [suppressTransientUi, setSuppressTransientUi] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [draftText, setDraftText] = useState(data.text || '');
  const [cardMetrics, setCardMetrics] = useState({
    left: 0,
    width: 0,
  });

  const handleContentWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.currentTarget.value;
    const composing =
      isComposingRef.current ||
      ('isComposing' in event.nativeEvent && Boolean(event.nativeEvent.isComposing));

    setDraftText(nextText);

    if (!composing) {
      onChange?.({ ...data, text: nextText });
    }
  };

  const handleContentBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current || isComposing) {
      return;
    }

    onChange?.({ ...data, text: event.currentTarget.value });
    onEndEdit?.();
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

  const handleBackgroundColorChange = (backgroundColor: string | undefined) => {
    onChange?.({
      ...data,
      backgroundColor,
    });
  };

  const uiVisible = selected && !dragging && !suppressTransientUi;
  const showAccessories = uiVisible;
  const isGenerating = data.status === 'generating';
  const cardStyle = data.backgroundColor
    ? { backgroundColor: data.backgroundColor }
    : undefined;

  useEffect(() => {
    if (!isComposingRef.current) {
      setDraftText(data.text || '');
    }
  }, [data.text]);

  useEffect(() => {
    if (!suppressTransientUi) {
      return;
    }

    const clearSuppression = () => setSuppressTransientUi(false);

    window.addEventListener('pointerup', clearSuppression);
    window.addEventListener('pointercancel', clearSuppression);

    return () => {
      window.removeEventListener('pointerup', clearSuppression);
      window.removeEventListener('pointercancel', clearSuppression);
    };
  }, [suppressTransientUi]);

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
      <div
        ref={stageRef}
        className="relative inline-block group node-connectable-root"
        onPointerDownCapture={() => {
          if (!selected) {
            setSuppressTransientUi(true);
          }
        }}
      >
        <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex select-none items-center gap-1.5 text-gl-text-tertiary nodrag nopan">
          <AlignLeft size={24} />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Text"
            className="text-[22px] font-medium leading-none"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
        </div>

        <div
          ref={cardRef}
          className={[
            'node-connectable-card text-node-drag-handle relative rounded-gl-lg border shadow-gl-card',
            data.backgroundColor ? '' : 'bg-gl-panel',
            'h-[289px] w-[511px] px-5 py-4',
            'flex cursor-grab flex-col transition-[background-color,border-color,box-shadow] duration-150',
            isGenerating
              ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
              : selected
                ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
                : 'border-gl-stroke-subtle',
          ].join(' ')}
          style={cardStyle}
          onDoubleClick={onStartEdit}
        >
          {editing ? (
            <textarea
              autoFocus
              value={draftText}
              onChange={handleContentChange}
              onBlur={handleContentBlur}
              onCompositionStart={() => {
                isComposingRef.current = true;
                setIsComposing(true);
              }}
              onCompositionEnd={(event) => {
                const nextText = event.currentTarget.value;

                isComposingRef.current = false;
                setIsComposing(false);
                setDraftText(nextText);
                onChange?.({ ...data, text: nextText });
              }}
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
              className="text-node-scrollable w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[16px] leading-7"
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
        visible={uiVisible}
        backgroundColor={data.backgroundColor}
        onBackgroundColorChange={handleBackgroundColorChange}
        onSetHeading={handleSetHeading}
        onCopyContent={handleCopyContent}
      />

      <TextNodePromptBar
        key={uiVisible ? 'visible' : 'hidden'}
        nodeId={id}
        visible={uiVisible}
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
});
