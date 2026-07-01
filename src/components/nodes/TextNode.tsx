'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Position, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import { AlignLeft } from 'lucide-react';
import type { TextNodeData } from '../../types/canvas';
import {
  getTextNodeCardSize,
  normalizeTextNodeCardSize,
  type TextNodeCardSize,
} from '@/lib/text-node/layout';
import {
  NODE_RESIZE_HANDLE_ABSOLUTE_BUTTON_CLASS,
  NODE_RESIZE_HANDLE_INNER_CORNER_CLASS,
  NODE_RESIZE_HANDLE_OUTER_CORNER_CLASS,
} from '@/lib/node-resize-handle/classes';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { TextNodeFloatingToolbar } from './TextNodeFloatingToolbar';
import { TextNodePromptBar } from './TextNodePromptBar';
import {
  readStoredSelectedApiProvider,
  type ApiProvider,
} from '@/store/canvas-store';

const TEXT_NODE_SCROLL_THRESHOLD_PX = 289;
const TEXT_NODE_VERTICAL_PADDING = 32;
const TEXT_NODE_ERROR_SPACE = 34;
const DEFAULT_GEMINI_VIDEO_MODEL = 'gemini-3.1-pro';

export interface TextNodeProps {
  id?: string;
  data: TextNodeData;
  selected?: boolean;
  dragging?: boolean;
  editing?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    previewUrl?: string;
    alt: string;
  }>;
  connectedVideos?: Array<{
    id: string;
    videoUrl: string;
    previewUrl?: string;
    alt: string;
    fileName?: string;
  }>;
  onChange?: (next: TextNodeData) => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onRun?: () => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  titleEditRequestId?: number;
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
  connectedVideos = [],
  onChange,
  onStartEdit,
  onEndEdit,
  onTitleChange,
  onRun,
  onUpload,
  onQuickReferenceConnect,
  onRemoveReference,
  titleEditRequestId,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: TextNodeProps) {
  const reactFlow = useReactFlow();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const [suppressTransientUi, setSuppressTransientUi] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [draftCardSize, setDraftCardSize] = useState<TextNodeCardSize | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [draftText, setDraftText] = useState(data.text || '');
  const [cardMetrics, setCardMetrics] = useState({
    left: 0,
    width: 0,
  });
  const dataRef = useRef(data);
  const resizeFrameRef = useRef<number | null>(null);
  const clearDraftSizeFrameRef = useRef<number | null>(null);
  const pendingResizeSizeRef = useRef<TextNodeCardSize | null>(null);
  const resizeRef = useRef<{
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    latestSize: TextNodeCardSize;
  } | null>(null);

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

  const handleProviderModelChange = (next: { provider: ApiProvider; model: string }) => {
    onChange?.({
      ...data,
      provider: next.provider,
      model: next.model,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const uiVisible = selected && !dragging && !suppressTransientUi;
  const showAccessories = uiVisible;
  const isGenerating = data.status === 'generating';
  const hasVideoReferences = connectedVideos.length > 0;
  const persistedCardSize = getTextNodeCardSize(data);
  const cardSize = draftCardSize ?? persistedCardSize;
  const zoom = reactFlow.getZoom() || 1;
  const resizeHandleScale = 1 / Math.max(zoom, 0.0001);
  const contentMaxHeight = Math.max(
    120,
    cardSize.height -
      TEXT_NODE_VERTICAL_PADDING -
      (data.status === 'error' && data.errorMessage ? TEXT_NODE_ERROR_SPACE : 0),
  );
  const cardStyle = data.backgroundColor
    ? {
        backgroundColor: data.backgroundColor,
        width: `${cardSize.width}px`,
        height: `${cardSize.height}px`,
      }
    : {
        width: `${cardSize.width}px`,
        height: `${cardSize.height}px`,
      };

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (
      resizing ||
      !draftCardSize ||
      persistedCardSize.width !== draftCardSize.width ||
      persistedCardSize.height !== draftCardSize.height
    ) {
      return;
    }

    clearDraftSizeFrameRef.current = window.requestAnimationFrame(() => {
      clearDraftSizeFrameRef.current = null;
      setDraftCardSize(null);
    });

    return () => {
      if (clearDraftSizeFrameRef.current !== null) {
        window.cancelAnimationFrame(clearDraftSizeFrameRef.current);
        clearDraftSizeFrameRef.current = null;
      }
    };
  }, [
    draftCardSize,
    persistedCardSize.height,
    persistedCardSize.width,
    resizing,
  ]);

  useEffect(() => {
    if (!hasVideoReferences) {
      return;
    }

    const currentProvider = data.provider || readStoredSelectedApiProvider('text');
    const nextProvider =
      currentProvider === 'comfly' || currentProvider === 'zhenzhen'
        ? currentProvider
        : 'comfly';
    const nextModel = data.model?.startsWith('gemini-')
      ? data.model
      : DEFAULT_GEMINI_VIDEO_MODEL;

    if (nextProvider === data.provider && nextModel === data.model) {
      return;
    }

    onChange?.({
      ...data,
      provider: nextProvider,
      model: nextModel,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  }, [data, hasVideoReferences, onChange]);

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
  }, [cardMetrics.left, cardMetrics.width, cardSize.height, cardSize.width, id, updateNodeInternals]);

  const patchData = useCallback((partial: Partial<TextNodeData>) => {
    const currentData = dataRef.current;

    onChange?.({
      ...currentData,
      ...partial,
      status: partial.status ?? (currentData.status === 'error' ? 'idle' : currentData.status),
      errorMessage: partial.errorMessage,
    });
  }, [onChange]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSuppressTransientUi(false);
    setResizing(true);
    resizeRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: cardSize.width,
      startHeight: cardSize.height,
      latestSize: cardSize,
    };
    setDraftCardSize(cardSize);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer listeners below keep resize active if capture is unavailable.
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeRef.current;

      if (!resizeState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const nextSize = normalizeTextNodeCardSize(
        resizeState.startWidth + (event.clientX - resizeState.startClientX) / zoom,
        resizeState.startHeight + (event.clientY - resizeState.startClientY) / zoom,
      );
      resizeState.latestSize = nextSize;
      pendingResizeSizeRef.current = nextSize;

      if (resizeFrameRef.current === null) {
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          const pendingSize = pendingResizeSizeRef.current;

          if (pendingSize) {
            setDraftCardSize(pendingSize);
          }
        });
      }
    };

    const stopResize = (event: PointerEvent) => {
      const resizeState = resizeRef.current;

      if (!resizeState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = null;
      pendingResizeSizeRef.current = null;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      patchData({
        cardWidth: resizeState.latestSize.width,
        cardHeight: resizeState.latestSize.height,
      });
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', stopResize, true);
    window.addEventListener('pointercancel', stopResize, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', stopResize, true);
      window.removeEventListener('pointercancel', stopResize, true);

      if (resizeRef.current) {
        resizeRef.current = null;
        pendingResizeSizeRef.current = null;
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        if (clearDraftSizeFrameRef.current !== null) {
          window.cancelAnimationFrame(clearDraftSizeFrameRef.current);
          clearDraftSizeFrameRef.current = null;
        }
        setDraftCardSize(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [patchData, reactFlow]);

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
            editRequestId={titleEditRequestId}
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
            'overflow-hidden px-5 py-4',
            'flex cursor-grab flex-col transition-[background-color,border-color,box-shadow] duration-150',
            isGenerating
              ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
              : selected || resizing
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
              style={{ maxHeight: Math.max(TEXT_NODE_SCROLL_THRESHOLD_PX, contentMaxHeight) }}
            />
          ) : (
            <div
              onWheelCapture={handleContentWheel}
              onWheel={handleContentWheel}
              className="text-node-scrollable w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[16px] leading-7"
              style={{ maxHeight: Math.max(TEXT_NODE_SCROLL_THRESHOLD_PX, contentMaxHeight) }}
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

        <button
          type="button"
          aria-label="Resize text card"
          className={NODE_RESIZE_HANDLE_ABSOLUTE_BUTTON_CLASS}
          style={{
            left: `${cardMetrics.left + cardSize.width - 4}px`,
            top: `${18 + cardSize.height - 4}px`,
            transform: `scale(${resizeHandleScale})`,
            transformOrigin: 'top left',
          }}
          onPointerDown={handleResizePointerDown}
        >
          <span
            className={[
              NODE_RESIZE_HANDLE_OUTER_CORNER_CLASS,
              resizing ? 'opacity-100' : '',
            ].join(' ')}
          />
          <span
            className={[
              NODE_RESIZE_HANDLE_INNER_CORNER_CLASS,
              resizing ? 'opacity-100' : '',
            ].join(' ')}
          />
        </button>

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
        provider={data.provider || readStoredSelectedApiProvider('text')}
        model={data.model || 'gpt-5.4'}
        connectedImages={connectedImages}
        connectedVideos={connectedVideos}
        onPromptChange={handlePromptChange}
        onProviderModelChange={handleProviderModelChange}
        onModelChange={handleModelChange}
        onRun={onRun}
        onUpload={onUpload}
        onQuickReferenceConnect={onQuickReferenceConnect}
        onRemoveReference={onRemoveReference}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
});
