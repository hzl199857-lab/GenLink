'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
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
import { PromptMentionInput } from './PromptMentionInput';
import { Tooltip } from '@/components/ui/Tooltip';

const COLLAPSED_PROMPT_HEIGHT = 54;
const EXPANDED_PROMPT_HEIGHT = 225;

const MODEL_OPTIONS = [
  'gemini-3-flash',
  'gemini-3.5-flash',
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
    previewUrl?: string;
    alt: string;
  }>;
  onPromptChange?: (next: string) => void;
  onModelChange?: (next: string) => void;
  onRun?: () => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

export const TextNodePromptBar = memo(function TextNodePromptBar({
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
      style={{ zIndex: 30 }}
    >
      <div
        data-canvas-menu-ignore="true"
        onPointerDownCapture={(e) => {
          const target = e.target;

          if (
            target instanceof HTMLElement &&
            target.closest('[data-ref-mention-menu="true"]')
          ) {
            return;
          }

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
        <div className="group/tooltip absolute right-5 top-4 z-10">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? '收起' : '展开'}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-secondary"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <Tooltip label={expanded ? '收起' : '展开'} side="top" />
        </div>

        {connectedImages.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 nodrag nopan">
            {connectedImages.map((image, index) => (
              <div
                key={image.id}
                className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-[14px] border border-white/10 bg-white/5 shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
              >
                <NextImage
                  src={image.previewUrl || image.imageUrl}
                  alt={image.alt || `Connected image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="50px"
                  className="object-cover"
                />
                <span className="absolute bottom-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 text-[12px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                  {index + 1}
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
            <PromptMentionInput
              value={resolvedPromptValue}
              connectedImages={connectedImages}
              onChange={handlePromptChange}
              onFocus={() => {
                setDraftPrompt(prompt);
                setIsPromptFocused(true);
                onFocusWithinChange?.(true);
              }}
              onBlur={() => {
                setIsPromptFocused(false);
              }}
              onCompositionStateChange={(composing) => setIsComposing(composing)}
              placeholder="告诉 AI 你想生成的文本内容，输入 @ 插入参考图"
              className="text-node-prompt-input prompt-mention-input nodrag nopan w-full overflow-y-auto border-0 bg-transparent pr-9 text-[15px] font-medium leading-6 text-gl-text-primary outline-none"
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
            <div className="group/tooltip relative inline-flex">
              <button
                type="button"
                onClick={() => setModelMenuOpen((open) => !open)}
                aria-label="选择模型"
                className={[
                  'group flex h-[42px] items-center gap-[9px] rounded-gl-pill border px-4',
                  'text-[15px] font-medium text-gl-text-secondary transition-all duration-150',
                  modelMenuOpen
                    ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                    : 'border-transparent bg-transparent hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
                ].join(' ')}
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
              <Tooltip label="选择模型" side="top" />
            </div>

            {modelMenuOpen ? (
              <div className="absolute left-0 top-full mt-2 w-[210px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
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

          <PromptBarRunControls label="1" labelTitle="额度" runTitle="运行" onRun={onRun} />
        </div>
      </div>
    </NodeToolbar>
  );
});
