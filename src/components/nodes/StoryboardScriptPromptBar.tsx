'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { NodeToolbar, Position, useReactFlow } from 'reactflow';
import {
  Play,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from 'lucide-react';
import { PromptBarRunControls } from './PromptBarRunControls';
import { PromptMentionInput } from './PromptMentionInput';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  ReferenceImageHoverPreviewPortal,
  ReferenceVideoHoverPreviewPortal,
  ReferenceVideoThumbnail,
  useReferenceImageHoverPreview,
  useReferenceVideoHoverPreview,
} from './ReferenceImageHoverPreview';
import {
  getApiProviderLabel,
  persistSelectedModel,
  readStoredApiKey,
  type ApiProvider,
} from '@/store/canvas-store';

const COLLAPSED_PROMPT_HEIGHT = 70;
const EXPANDED_PROMPT_HEIGHT = 240;
const STORYBOARD_PROMPT_CTRL_WHEEL_ZOOM_STEP = 0.0015;
const STORYBOARD_PROMPT_CANVAS_MIN_ZOOM = 0.2;
const STORYBOARD_PROMPT_CANVAS_MAX_ZOOM = 2;
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
const VIDEO_API_PROVIDERS: ApiProvider[] = ['comfly', 'zhenzhen'];
const TEXT_MODEL_OPTIONS_BY_PROVIDER: Record<ApiProvider, readonly string[]> = {
  vibe: MODEL_OPTIONS,
  fucheers: MODEL_OPTIONS.filter((model) => !model.startsWith('gemini-')),
  comfly: MODEL_OPTIONS,
  zhenzhen: MODEL_OPTIONS,
  runninghub: [],
  grsai: [],
};

function clampStoryboardPromptCanvasZoom(value: number): number {
  return Math.min(
    STORYBOARD_PROMPT_CANVAS_MAX_ZOOM,
    Math.max(STORYBOARD_PROMPT_CANVAS_MIN_ZOOM, value),
  );
}

export interface StoryboardScriptPromptBarProps {
  nodeId?: string;
  visible: boolean;
  prompt: string;
  provider?: ApiProvider;
  model?: string;
  generating?: boolean;
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
    width?: number;
    height?: number;
    durationSeconds?: number;
  }>;
  onPromptChange?: (next: string) => void;
  onProviderModelChange?: (next: { provider: ApiProvider; model: string }) => void;
  onRun?: () => void;
  onRemoveReference?: (referenceImageId: string) => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

export const StoryboardScriptPromptBar = memo(function StoryboardScriptPromptBar({
  nodeId,
  visible,
  prompt,
  provider = 'vibe',
  model = 'gpt-5.4',
  generating = false,
  connectedImages = [],
  connectedVideos = [],
  onPromptChange,
  onProviderModelChange,
  onRun,
  onRemoveReference,
  onPointerDownWithin,
  onFocusWithinChange,
}: StoryboardScriptPromptBarProps) {
  const reactFlow = useReactFlow();
  const [expanded, setExpanded] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ApiProvider>(provider);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const referenceImagePreview = useReferenceImageHoverPreview();
  const referenceVideoPreview = useReferenceVideoHoverPreview();
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

  const resolvedPromptValue =
    isPromptFocused || isComposing ? draftPrompt : prompt;
  const hasVideoReferences = connectedVideos.length > 0;
  const visibleProviders = hasVideoReferences ? VIDEO_API_PROVIDERS : API_PROVIDERS;
  const activeModels = hasVideoReferences
    ? TEXT_MODEL_OPTIONS_BY_PROVIDER[activeProvider].filter((option) =>
        option.startsWith('gemini-'),
      )
    : TEXT_MODEL_OPTIONS_BY_PROVIDER[activeProvider];

  const handlePromptBarWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const viewport = reactFlow.getViewport();
    const nextZoom = clampStoryboardPromptCanvasZoom(
      viewport.zoom * (1 - event.deltaY * STORYBOARD_PROMPT_CTRL_WHEEL_ZOOM_STEP),
    );

    if (nextZoom === viewport.zoom) {
      return;
    }

    const rect = document.documentElement.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const canvasX = (pointerX - viewport.x) / viewport.zoom;
    const canvasY = (pointerY - viewport.y) / viewport.zoom;

    void reactFlow.setViewport({
      x: pointerX - canvasX * nextZoom,
      y: pointerY - canvasY * nextZoom,
      zoom: nextZoom,
    }, { duration: 0 });
  };

  const handlePromptChange = (next: string) => {
    setDraftPrompt(next);

    if (!isComposing) {
      onPromptChange?.(next);
    }
  };

  const handleModelSelect = (nextProvider: ApiProvider, nextModel: string) => {
    if (!readStoredApiKey('text', nextProvider)) {
      setProviderWarning(`请先在 API 设置中填写 ${getApiProviderLabel(nextProvider)} API Key`);
      return;
    }

    onProviderModelChange?.({ provider: nextProvider, model: nextModel });
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
      offset={18}
      align="center"
      style={{ zIndex: 30 }}
    >
      <div
        data-canvas-menu-ignore="true"
        onPointerDownCapture={(event) => {
          const target = event.target;

          if (
            target instanceof HTMLElement &&
            target.closest('[data-ref-mention-menu="true"]')
          ) {
            return;
          }

          onPointerDownWithin?.();
          event.stopPropagation();
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
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={handlePromptBarWheel}
        onWheel={handlePromptBarWheel}
        className="storyboard-script-prompt-bar relative flex w-[700px] max-w-[calc(100vw-48px)] flex-col gap-4 rounded-gl-lg border border-gl-stroke-soft bg-gl-panel/90 px-5 py-3 shadow-gl-toolbar backdrop-blur-md"
        style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}
      >
        <div className="group/tooltip absolute right-5 top-4 z-10">
          <button
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? '收起' : '展开'}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-secondary"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <Tooltip label={expanded ? '收起' : '展开'} side="top" />
        </div>

        {connectedImages.length > 0 || connectedVideos.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 nodrag nopan">
            {connectedImages.map((image, index) => (
              <div
                key={`${image.id}-${image.imageUrl}-${index}`}
                className="group/reference-thumb relative h-[50px] w-[50px] shrink-0"
              >
                <div
                  className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/10 bg-white/5 shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                  onPointerEnter={(event) =>
                    referenceImagePreview.showPreview(image, event.currentTarget)
                  }
                  onPointerLeave={referenceImagePreview.hidePreview}
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
                {onRemoveReference ? (
                  <button
                    type="button"
                    aria-label="移除参考图"
                    className="absolute right-0 top-0 z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white/35 bg-[#1b1d21] text-white opacity-0 shadow-[0_6px_14px_rgba(0,0,0,0.35)] transition hover:bg-white hover:text-[#1b1d21] focus-visible:opacity-100 group-hover/reference-thumb:opacity-100"
                    onPointerEnter={referenceImagePreview.hidePreview}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      referenceImagePreview.hidePreview();
                      onRemoveReference(image.id);
                    }}
                  >
                    <X size={11} strokeWidth={2.4} />
                  </button>
                ) : null}
              </div>
            ))}
            {connectedVideos.map((video, index) => (
              <div
                key={`${video.id}-${video.videoUrl}-${index}`}
                className="group/reference-thumb relative h-[50px] w-[68px] shrink-0"
              >
                <div
                  className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/10 bg-black/35 shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                  onPointerEnter={(event) =>
                    referenceVideoPreview.showPreview(video, event.currentTarget)
                  }
                  onPointerLeave={referenceVideoPreview.hidePreview}
                >
                  <ReferenceVideoThumbnail
                    videoUrl={video.videoUrl}
                    previewUrl={video.previewUrl}
                    alt={video.alt || `Connected video ${index + 1}`}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
                    <Play size={14} fill="currentColor" strokeWidth={0} />
                  </span>
                  <span className="absolute bottom-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 text-[12px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                    {index + 1}
                  </span>
                </div>
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
              connectedVideos={connectedVideos}
              onChange={handlePromptChange}
              onFocus={() => {
                setDraftPrompt(prompt);
                setIsPromptFocused(true);
                onFocusWithinChange?.(true);
              }}
              onBlur={() => setIsPromptFocused(false)}
              onCompositionStateChange={(composing) => setIsComposing(composing)}
              placeholder="输入剧本、镜头数量、风格、时长，输入 @ 插入参考图"
              className="storyboard-script-prompt-input prompt-mention-input text-node-scrollable nodrag nopan w-full overflow-y-auto border-0 bg-transparent pr-9 text-[15px] font-medium leading-6 text-gl-text-primary outline-none"
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
                      setActiveProvider(
                        hasVideoReferences && !VIDEO_API_PROVIDERS.includes(provider)
                          ? 'comfly'
                          : provider,
                      );
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
                    {visibleProviders.map((option) => {
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

          <PromptBarRunControls
            label={generating ? '...' : '分镜'}
            labelTitle="生成类型"
            runTitle="生成分镜"
            runDisabled={generating}
            onRun={onRun}
          />
        </div>
        <ReferenceVideoHoverPreviewPortal preview={referenceVideoPreview.preview} />
        <ReferenceImageHoverPreviewPortal preview={referenceImagePreview.preview} />
      </div>
    </NodeToolbar>
  );
});
