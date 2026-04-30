'use client';

import React, { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { NodeToolbar, Position } from 'reactflow';
import {
  Sparkles,
  Maximize2,
  Minimize2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { PromptBarRunControls } from './PromptBarRunControls';

const COLLAPSED_PROMPT_HEIGHT = 54;
const EXPANDED_PROMPT_HEIGHT = 225;
const CIRCLED_NUMBER_LABELS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const;

function getThumbnailIndexLabel(index: number): string {
  return CIRCLED_NUMBER_LABELS[index] ?? String(index + 1);
}

const MODEL_OPTIONS = [
  'gemini-3-flash',
  'gemini-3.1-pro',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'gpt-5.4',
  'gpt-5.5',
] as const;

export interface TextNodePromptBarProps {
  nodeId?: string;
  visible: boolean;
  prompt: string;
  model?: string;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    alt: string;
  }>;
  onPromptChange?: (next: string) => void;
  onModelChange?: (next: string) => void;
  onRun?: () => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

export function TextNodePromptBar({
  nodeId,
  visible,
  prompt,
  model = 'gpt-5.4',
  connectedImages = [],
  onPromptChange,
  onModelChange,
  onRun,
  onPointerDownWithin,
  onFocusWithinChange,
}: TextNodePromptBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modelMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [modelMenuOpen]);

  const handleWheel = (event: React.WheelEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    event.currentTarget.scrollTop += event.deltaY;
  };

  const handlePromptChange = (next: string) => {
    setDraftPrompt(next);

    if (!isComposing) {
      onPromptChange?.(next);
    }
  };

  const resolvedPromptValue =
    isPromptFocused || isComposing ? draftPrompt : prompt;

  if (!visible) return null;

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={visible}
      position={Position.Bottom}
      offset={16}
      align="center"
    >
      <div
        onPointerDownCapture={(e) => {
          onPointerDownWithin?.();
          e.stopPropagation();
        }}
        onFocusCapture={() => onFocusWithinChange?.(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;

          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          ) {
            return;
          }

          onFocusWithinChange?.(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onWheelCapture={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="text-node-prompt-bar relative flex w-[600px] max-w-[calc(100vw-48px)] flex-col gap-4 rounded-gl-lg border border-gl-stroke-soft bg-gl-panel/90 px-5 py-3 shadow-gl-toolbar backdrop-blur-md"
        style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="absolute right-5 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-secondary"
          title={expanded ? '收起' : '展开'}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        {connectedImages.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 nodrag nopan">
            {connectedImages.map((image, index) => (
              <div
                key={image.id}
                className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-[14px] border border-white/10 bg-white/5 shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                title={image.alt || `Connected image ${index + 1}`}
              >
                <NextImage
                  src={image.imageUrl}
                  alt={image.alt || `Connected image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="50px"
                  className="object-cover"
                />
                <span className="absolute bottom-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 text-[13px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                  {getThumbnailIndexLabel(index)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative">
        <div
          className="overflow-hidden"
          style={{
              height: expanded ? EXPANDED_PROMPT_HEIGHT : COLLAPSED_PROMPT_HEIGHT,
              transition: 'height 500ms ease-in-out',
            }}
          >
            <textarea
              value={resolvedPromptValue}
              onChange={(e) => handlePromptChange(e.target.value)}
              onFocus={() => {
                setDraftPrompt(prompt);
                setIsPromptFocused(true);
                onFocusWithinChange?.(true);
              }}
              onBlur={() => {
                setIsPromptFocused(false);

                if (!isComposing) {
                  onPromptChange?.(draftPrompt);
                }
              }}
              onCompositionStart={() => {
                setIsComposing(true);
              }}
              onCompositionEnd={(e) => {
                const nextValue = e.currentTarget.value;
                setIsComposing(false);
                setDraftPrompt(nextValue);
                onPromptChange?.(nextValue);
              }}
              onWheel={handleWheel}
              onWheelCapture={(e) => e.stopPropagation()}
              placeholder="告诉 AI 你想生成的文本内容..."
              rows={expanded ? 6 : 2}
              className="text-node-prompt-input nodrag nopan w-full resize-none overflow-y-auto border-0 bg-transparent pr-9 text-[15px] font-medium leading-6 text-gl-text-primary outline-none placeholder:text-gl-text-muted"
              style={{
                minHeight: expanded
                  ? EXPANDED_PROMPT_HEIGHT
                  : COLLAPSED_PROMPT_HEIGHT,
                height: expanded ? EXPANDED_PROMPT_HEIGHT : undefined,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="relative -ml-2.5" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setModelMenuOpen((open) => !open)}
              className={[
                'group flex h-[42px] items-center gap-[9px] rounded-gl-pill border px-4',
                'text-[15px] font-medium text-gl-text-secondary transition-all duration-150',
                modelMenuOpen
                  ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                  : 'border-transparent bg-transparent hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
              ].join(' ')}
              title="选择模型"
            >
              <Sparkles
                size={15}
                className="text-gl-text-tertiary group-hover:text-gl-text-secondary"
              />
              <span className="leading-none">{model}</span>
              <ChevronDown
                size={15}
                className={[
                  'text-gl-text-tertiary transition-transform duration-150',
                  modelMenuOpen ? 'rotate-180' : '',
                ].join(' ')}
              />
            </button>

            {modelMenuOpen ? (
              <div className="absolute left-0 top-full mt-2 w-[210px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417]/98 p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="mb-1 px-2 py-1 text-[15px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                  Models
                </div>
                <div className="flex flex-col gap-0.5">
                  {MODEL_OPTIONS.map((option) => {
                    const selected = option === model;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          onModelChange?.(option);
                          setModelMenuOpen(false);
                        }}
                        className={[
                          'flex h-12 w-full items-center justify-between rounded-[12px] px-4 text-left text-[17px] transition-colors duration-150',
                          selected
                            ? 'bg-white/[0.08] text-gl-text-primary'
                            : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                        ].join(' ')}
                      >
                        <span className="truncate">{option}</span>
                        {selected ? (
                          <Check size={18} className="text-gl-text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <PromptBarRunControls label="1" labelTitle="Credits" onRun={onRun} />
        </div>
      </div>
    </NodeToolbar>
  );
}
