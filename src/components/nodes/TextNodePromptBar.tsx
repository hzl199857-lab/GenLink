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
import {
  getApiProviderLabel,
  persistSelectedModel,
  readStoredApiKey,
  type ApiProvider,
} from '@/store/canvas-store';

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
const API_PROVIDERS: ApiProvider[] = ['vibe', 'fucheers', 'comfly', 'zhenzhen'];
const TEXT_MODEL_OPTIONS_BY_PROVIDER: Record<ApiProvider, readonly string[]> = {
  vibe: MODEL_OPTIONS,
  fucheers: MODEL_OPTIONS.filter((model) => !model.startsWith('gemini-')),
  comfly: MODEL_OPTIONS.filter((model) => model !== 'gemini-3.5-flash'),
  zhenzhen: MODEL_OPTIONS.filter((model) => model !== 'gemini-3.5-flash'),
  runninghub: [],
  grsai: [],
};

export interface TextNodePromptBarProps {
  nodeId?: string;
  visible: boolean;
  prompt: string;
  provider?: ApiProvider;
  model?: string;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    previewUrl?: string;
    alt: string;
  }>;
  onPromptChange?: (next: string) => void;
  onProviderModelChange?: (next: { provider: ApiProvider; model: string }) => void;
  onModelChange?: (next: string) => void;
  onRun?: () => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

export const TextNodePromptBar = memo(function TextNodePromptBar({
  nodeId,
  visible,
  prompt,
  provider = 'vibe',
  model = 'gpt-5.4',
  connectedImages = [],
  onPromptChange,
  onProviderModelChange,
  onModelChange,
  onRun,
  onPointerDownWithin,
  onFocusWithinChange,
}: TextNodePromptBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ApiProvider>(provider);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
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

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [modelMenuOpen]);

  const handlePromptChange = (next: string) => {
    setDraftPrompt(next);

    if (!isComposing) {
      onPromptChange?.(next);
    }
  };

  const resolvedPromptValue =
    isPromptFocused || isComposing ? draftPrompt : prompt;
  const activeModels = TEXT_MODEL_OPTIONS_BY_PROVIDER[activeProvider];

  const handleModelSelect = (nextProvider: ApiProvider, nextModel: string) => {
    if (!readStoredApiKey('text', nextProvider)) {
      setProviderWarning(`请先在 API 设置中填写 ${getApiProviderLabel(nextProvider)} API Key`);
      return;
    }

    if (onProviderModelChange) {
      onProviderModelChange({ provider: nextProvider, model: nextModel });
    } else {
      onModelChange?.(nextModel);
    }
    persistSelectedModel({
      kind: 'text',
      provider: nextProvider,
      model: nextModel,
    });
    setModelMenuOpen(false);
  };

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
                onClick={() => {
                  setModelMenuOpen((open) => {
                    if (!open) {
                      setActiveProvider(provider);
                      setProviderWarning(null);
                    }

                    return !open;
                  });
                }}
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
                <span className="max-w-[210px] truncate leading-none">{model}</span>
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
              <div className="absolute left-0 top-full mt-2 flex w-[470px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                <div className="w-[190px] border-r border-white/[0.06] pr-1.5">
                  <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                    Provider
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {API_PROVIDERS.map((option) => {
                      const selected = option === activeProvider;

                      return (
                        <button
                          key={option}
                          type="button"
                          onPointerEnter={() => {
                            setActiveProvider(option);
                            setProviderWarning(null);
                          }}
                          onClick={() => {
                            setActiveProvider(option);
                            setProviderWarning(null);
                          }}
                          className={[
                            'flex h-11 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] transition-colors duration-150',
                            selected
                              ? 'bg-white/[0.08] text-gl-text-primary'
                              : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                          ].join(' ')}
                        >
                          <span className="truncate">{getApiProviderLabel(option)}</span>
                          <ChevronDown size={14} className="-rotate-90 text-gl-text-tertiary" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="min-w-0 flex-1 pl-1.5">
                  <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                    Models
                  </div>
                  <div className="flex max-h-[340px] flex-col gap-0.5 overflow-y-auto">
                    {activeModels.map((option) => {
                      const selected = activeProvider === provider && option === model;

                      return (
                        <button
                          key={`${activeProvider}-${option}`}
                          type="button"
                          onClick={() => handleModelSelect(activeProvider, option)}
                          className={[
                            'flex h-11 w-full items-center justify-between rounded-[12px] px-4 text-left text-[15px] transition-colors duration-150',
                            selected
                              ? 'bg-white/[0.08] text-gl-text-primary'
                              : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                          ].join(' ')}
                        >
                          <span className="truncate">{option}</span>
                          {selected ? (
                            <Check size={16} className="text-gl-text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {providerWarning ? (
                    <div className="mt-1.5 rounded-[10px] border border-gl-error/30 bg-gl-error/10 px-3 py-2 text-[12px] leading-5 text-gl-error">
                      {providerWarning}
                    </div>
                  ) : null}
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
