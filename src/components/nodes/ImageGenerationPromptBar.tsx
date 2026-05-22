'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { NodeToolbar, Position } from 'reactflow';
import { Sparkles, Maximize2, Minimize2, ChevronDown, Check, Layers } from 'lucide-react';
import { PromptBarRunControls } from './PromptBarRunControls';
import { Tooltip } from '@/components/ui/Tooltip';

const COLLAPSED_PROMPT_HEIGHT = 54;
const EXPANDED_PROMPT_HEIGHT = 225;
const IMAGE_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2' },
  { id: 'nano-banana-2', label: 'Nano banana pro' },
] as const;
const PARALLEL_COUNT_OPTIONS = [1, 2, 4] as const;
const IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
const IMAGE_OUTPUT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
] as const;
const IMAGE_MODERATION_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
] as const;
const IMAGE_DETAIL_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
] as const;
const IMAGE_ASPECT_RATIO_LAYOUT = [
  { value: 'auto', label: '自适应', className: 'col-start-1 row-start-1 row-span-2 h-[109px]' },
  { value: '1:1', className: 'col-start-2 row-start-1 h-[54px]' },
  { value: '4:3', className: 'col-start-3 row-start-1 h-[54px]' },
  { value: '3:4', className: 'col-start-4 row-start-1 h-[54px]' },
  { value: '5:4', className: 'col-start-5 row-start-1 h-[54px]' },
  { value: '4:5', className: 'col-start-2 row-start-2 h-[54px]' },
  { value: '3:2', className: 'col-start-3 row-start-2 h-[54px]' },
  { value: '2:3', className: 'col-start-4 row-start-2 h-[54px]' },
  { value: '16:9', className: 'col-start-5 row-start-2 h-[54px]' },
  { value: '9:16', className: 'col-start-2 row-start-3 h-[54px]' },
  { value: '21:9', className: 'col-start-3 row-start-3 h-[54px]' },
  { value: '9:21', className: 'col-start-4 row-start-3 h-[54px]' },
] as const;
const GEMINI_IMAGE_ASPECT_RATIO_LAYOUT = [
  { value: '1:1', className: 'col-start-1 row-start-1 h-[54px]' },
  { value: '1:4', className: 'col-start-2 row-start-1 h-[54px]' },
  { value: '1:8', className: 'col-start-3 row-start-1 h-[54px]' },
  { value: '2:3', className: 'col-start-4 row-start-1 h-[54px]' },
  { value: '3:2', className: 'col-start-5 row-start-1 h-[54px]' },
  { value: '3:4', className: 'col-start-1 row-start-2 h-[54px]' },
  { value: '4:1', className: 'col-start-2 row-start-2 h-[54px]' },
  { value: '4:3', className: 'col-start-3 row-start-2 h-[54px]' },
  { value: '4:5', className: 'col-start-4 row-start-2 h-[54px]' },
  { value: '5:4', className: 'col-start-5 row-start-2 h-[54px]' },
  { value: '8:1', className: 'col-start-1 row-start-3 h-[54px]' },
  { value: '9:16', className: 'col-start-2 row-start-3 h-[54px]' },
  { value: '16:9', className: 'col-start-3 row-start-3 h-[54px]' },
  { value: '21:9', className: 'col-start-4 row-start-3 h-[54px]' },
] as const;
const IMAGE_PROMPT_PRESETS = [
  {
    id: 'multi-camera-grid',
    title: '多机位九宫格',
    prompt: '占位提示词：多机位九宫格',
  },
  {
    id: 'multi-camera-grid-4k',
    title: '多机位九宫格4K',
    prompt: '占位提示词：多机位九宫格4K',
  },
  {
    id: 'storyboard-four-grid',
    title: '剧情推演四宫格',
    prompt: '占位提示词：剧情推演四宫格',
  },
  {
    id: 'character-face-three-view',
    title: '角色脸部三视图',
    prompt: '生成全身三视图以及一张脸部特写（最左边占满三分之一的位置是上半身特写），右边三分之二放正视图，45度的侧视图，后视图，{用户输入 || 白色背景}',
  },
  {
    id: 'product-three-view',
    title: '产品三视图',
    prompt: '占位提示词：产品三视图',
  },
  {
    id: 'twenty-five-panel-sequence',
    title: '25宫格连贯分镜',
    prompt: '占位提示词：25宫格连贯分镜',
  },
  {
    id: 'cinematic-lighting-correction',
    title: '电影级光影校正',
    prompt: '占位提示词：电影级光影校正',
  },
  {
    id: 'character-three-view-generation',
    title: '角色三视图生成',
    prompt: '占位提示词：角色三视图生成',
  },
  {
    id: 'frame-forward-three-seconds',
    title: '画面推演 - 3秒后',
    prompt: '占位提示词：画面推演 - 3秒后',
  },
  {
    id: 'frame-backward-five-seconds',
    title: '画面推演 - 5秒前',
    prompt: '占位提示词：画面推演 - 5秒前',
  },
] as const;

function getPromptPresetUserInput(value: string): string {
  const trimmedEnd = value.trimEnd();

  return trimmedEnd.endsWith('/')
    ? trimmedEnd.slice(0, -1).trim()
    : value.trim();
}

function resolvePromptPresetTemplate(template: string, userInput: string): string {
  return template.replace(/\{用户输入\s*\|\|\s*([^{}]+?)\}/g, (_match, fallback: string) => {
    const resolvedFallback = fallback.trim();

    return userInput || resolvedFallback;
  });
}

export interface ImageGenerationPromptBarProps {
  nodeId?: string;
  visible: boolean;
  prompt: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  detail?: string;
  outputFormat?: string;
  moderation?: string;
  parallelCount?: 1 | 2 | 4;
  generating?: boolean;
  canUsePromptPresets?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    previewUrl?: string;
    alt: string;
    width?: number;
    height?: number;
  }>;
  onPromptChange?: (next: string) => void;
  onModelChange?: (next: string) => void;
  onAspectRatioChange?: (next: string) => void;
  onQualityChange?: (next: string) => void;
  onDetailChange?: (next: string) => void;
  onOutputFormatChange?: (next: string) => void;
  onModerationChange?: (next: string) => void;
  onParallelCountChange?: (next: 1 | 2 | 4) => void;
  onRun?: (promptOverride?: string) => void;
  onAddReference?: () => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

function ToolSquareButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        onClick={onClick}
        className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/[0.08] text-gl-text-secondary transition-colors hover:bg-white/[0.12] hover:text-gl-text-primary"
        aria-label={title}
      >
        {children}
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

function ReferenceImageIcon() {
  return (
    <span className="relative block h-[35px] w-[35px]">
      <svg
        viewBox="0 0 18 18"
        className="h-[35px] w-[35px]"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.25 3.25h7.5a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1h-2.4"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 14.7 8.9 9.9l4.15 2.4-3.85 2.4Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.25 6.15v4.6a1 1 0 0 0 1 1h1.55"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function BottomMenuButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      translate="no"
      onClick={onClick}
      className={[
        'flex h-9 items-center gap-1.5 rounded-gl-pill border px-3 text-[14px] font-medium transition-all',
        active
          ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
          : 'border-transparent text-gl-text-secondary hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
      ].join(' ')}
    >
      <span className="text-gl-text-tertiary" translate="no">
        {icon}
      </span>
      <span translate="no">{label}</span>
      <ChevronDown
        size={14}
        className={active ? 'rotate-180 transition-transform' : 'transition-transform'}
      />
    </button>
  );
}

function getRatioShapeClass(ratio: string) {
  switch (ratio) {
    case 'auto':
      return 'h-[14px] w-[14px]';
    case '1:1':
      return 'h-[12px] w-[12px]';
    case '4:3':
      return 'h-[11px] w-[15px]';
    case '3:4':
      return 'h-[15px] w-[11px]';
    case '5:4':
      return 'h-[12px] w-[15px]';
    case '4:5':
      return 'h-[15px] w-[12px]';
    case '3:2':
      return 'h-[10px] w-[15px]';
    case '2:3':
      return 'h-[15px] w-[10px]';
    case '16:9':
      return 'h-[9px] w-[16px]';
    case '9:16':
      return 'h-[16px] w-[9px]';
    case '21:9':
      return 'h-[8px] w-[18px]';
    case '9:21':
      return 'h-[18px] w-[8px]';
    case '1:4':
      return 'h-[18px] w-[5px]';
    case '1:8':
      return 'h-[18px] w-[3px]';
    case '4:1':
      return 'h-[5px] w-[18px]';
    case '8:1':
      return 'h-[3px] w-[18px]';
    default:
      return 'h-[12px] w-[12px]';
  }
}

function getImageModelLabel(model: string): string {
  return IMAGE_MODELS.find((option) => option.id === model)?.label ?? model;
}

function RatioIcon({
  ratio,
  active = false,
}: {
  ratio: string;
  active?: boolean;
}) {
  if (ratio === 'auto') {
    return (
      <span className="flex h-4 items-center justify-center">
        <span
          className={[
            'relative block h-[14px] w-[14px] rounded-[4px] border border-current',
            active ? 'text-gl-text-primary' : 'text-gl-text-tertiary',
          ].join(' ')}
        >
          <span className="absolute -left-[3px] top-1/2 h-[7px] w-[2px] -translate-y-1/2 rounded-full bg-current" />
          <span className="absolute -right-[3px] top-1/2 h-[7px] w-[2px] -translate-y-1/2 rounded-full bg-current" />
          <span className="absolute left-1/2 -top-[3px] h-[2px] w-[7px] -translate-x-1/2 rounded-full bg-current" />
          <span className="absolute bottom-[-3px] left-1/2 h-[2px] w-[7px] -translate-x-1/2 rounded-full bg-current" />
        </span>
      </span>
    );
  }

  return (
    <span className="flex h-4 items-center justify-center">
      <span
        className={[
          'block rounded-[3px] border border-current',
          getRatioShapeClass(ratio),
          active ? 'text-gl-text-primary' : 'text-gl-text-tertiary',
        ].join(' ')}
      />
    </span>
  );
}

export const ImageGenerationPromptBar = memo(function ImageGenerationPromptBar({
  nodeId,
  visible,
  prompt,
  model = IMAGE_MODELS[0].id,
  aspectRatio = 'auto',
  quality = IMAGE_SIZE_OPTIONS[0],
  detail = 'medium',
  outputFormat = IMAGE_OUTPUT_FORMAT_OPTIONS[0].value,
  moderation = IMAGE_MODERATION_OPTIONS[0].value,
  parallelCount = 1,
  generating = false,
  canUsePromptPresets = false,
  connectedImages = [],
  onPromptChange,
  onModelChange,
  onAspectRatioChange,
  onQualityChange,
  onDetailChange,
  onOutputFormatChange,
  onModerationChange,
  onParallelCountChange,
  onRun,
  onAddReference,
  onPointerDownWithin,
  onFocusWithinChange,
}: ImageGenerationPromptBarProps) {
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [parallelMenuOpen, setParallelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const parallelMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modelMenuOpen && !settingsMenuOpen && !formatMenuOpen && !parallelMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        modelMenuRef.current?.contains(target) ||
        settingsMenuRef.current?.contains(target) ||
        formatMenuRef.current?.contains(target) ||
        parallelMenuRef.current?.contains(target)
      ) {
        return;
      }

      setModelMenuOpen(false);
      setSettingsMenuOpen(false);
      setFormatMenuOpen(false);
      setParallelMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [modelMenuOpen, settingsMenuOpen, formatMenuOpen, parallelMenuOpen]);

  if (!visible) return null;

  const resolvedValue = isPromptFocused || isComposing ? draftPrompt : prompt;
  const isNanoBananaModel = model?.startsWith('nano-banana') ?? false;
  const modelLabel = getImageModelLabel(model);
  const modelAspectRatio = isNanoBananaModel && aspectRatio === 'auto' ? '1:1' : aspectRatio;
  const aspectRatioLayout = isNanoBananaModel
    ? GEMINI_IMAGE_ASPECT_RATIO_LAYOUT
    : IMAGE_ASPECT_RATIO_LAYOUT;
  const settingsLabel = `${modelAspectRatio} / ${quality}`;
  const formatLabel = `${outputFormat.toUpperCase()} / ${moderation}`;
  const promptHeight = expanded ? EXPANDED_PROMPT_HEIGHT : COLLAPSED_PROMPT_HEIGHT;
  const promptPresetMenuOpen = isPromptFocused && !isComposing && resolvedValue.trimEnd().endsWith('/');

  const handlePromptPresetClick = (presetPrompt: string) => {
    if (!canUsePromptPresets || generating) {
      return;
    }

    const resolvedPrompt = resolvePromptPresetTemplate(
      presetPrompt,
      getPromptPresetUserInput(resolvedValue),
    );

    setDraftPrompt('');
    onPromptChange?.('');
    onRun?.(resolvedPrompt);
  };

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
            target.closest('[data-prompt-preset-menu="true"]')
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
        className="text-node-prompt-bar relative w-[720px] max-w-[calc(100vw-48px)] rounded-[22px] border border-white/10 bg-gl-panel/95 px-4 py-3 shadow-gl-toolbar backdrop-blur-xl"
        style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}
      >
        <div className="group absolute right-4 top-4">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gl-text-tertiary transition-colors hover:bg-white/[0.06] hover:text-gl-text-secondary"
            aria-label={expanded ? '收起' : '展开'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <Tooltip label={expanded ? '收起' : '展开'} side="top" />
        </div>

        <div className="flex min-h-[104px] flex-col">
          <div className="mb-4 flex items-start gap-2">
            <ToolSquareButton title="参考图" onClick={onAddReference}>
              <ReferenceImageIcon />
            </ToolSquareButton>

            {connectedImages.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto nodrag nopan">
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

            <ToolSquareButton title="添加参考图" onClick={onAddReference}>
              <span className="text-[24px] leading-none">+</span>
            </ToolSquareButton>
          </div>

          <div
            className="relative overflow-visible"
            style={{
              height: promptHeight,
              transition: 'height 500ms ease-in-out',
            }}
          >
            {promptPresetMenuOpen ? (
              <div
                data-prompt-preset-menu="true"
                className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)] nodrag nopan"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="text-node-prompt-input max-h-[470px] overflow-y-auto">
                  {IMAGE_PROMPT_PRESETS.map((preset) => {
                    const disabled = !canUsePromptPresets || generating;

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={disabled}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handlePromptPresetClick(preset.prompt);
                        }}
                        className={[
                          'flex min-h-[52px] w-full items-center gap-3 rounded-[12px] px-3 py-1.5 text-left transition-colors duration-150',
                          disabled
                            ? 'cursor-not-allowed text-gl-text-muted'
                            : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05]',
                            disabled ? 'text-gl-text-muted' : 'text-gl-text-tertiary',
                          ].join(' ')}
                          aria-hidden="true"
                        >
                          <Layers size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium leading-5">
                            {preset.title}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!canUsePromptPresets ? (
                  <div className="mt-2 flex items-center gap-2 border-t border-white/[0.06] px-3 pb-1 pt-3 text-[12px] leading-5 text-gl-error">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gl-error/45 text-[12px]">
                      i
                    </span>
                    <span>使用此功能需要至少注入一张图片，可连入文本节点加强控制</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <textarea
              value={resolvedValue}
              onChange={(e) => {
                const next = e.target.value;
                setDraftPrompt(next);

                if (!isComposing) {
                  onPromptChange?.(next);
                }
              }}
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
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                const nextValue = e.currentTarget.value;
                setIsComposing(false);
                setDraftPrompt(nextValue);
                onPromptChange?.(nextValue);
              }}
              placeholder="描述你想生成的图像内容，按“/”呼出指令"
              className="text-node-prompt-input nodrag nopan w-full resize-none overflow-y-auto border-0 bg-transparent pr-10 text-[14px] leading-7 text-gl-text-primary outline-none placeholder:text-gl-text-muted"
              rows={expanded ? 6 : 2}
              style={{
                minHeight: promptHeight,
                height: expanded ? promptHeight : undefined,
              }}
            />
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-6">
            <div className="notranslate flex flex-wrap items-center gap-1" translate="no">
              <div className="relative" ref={modelMenuRef}>
                <BottomMenuButton
                  icon={<Sparkles size={14} />}
                  label={modelLabel}
                  active={modelMenuOpen}
                  onClick={() => {
                    setModelMenuOpen((open) => !open);
                    setSettingsMenuOpen(false);
                    setFormatMenuOpen(false);
                    setParallelMenuOpen(false);
                  }}
                />

                {modelMenuOpen ? (
                  <div className="absolute bottom-full left-0 mb-2 w-[210px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                    <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                      Model
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {IMAGE_MODELS.map((option) => {
                        const selected = option.id === model;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            translate="no"
                            onClick={() => {
                              onModelChange?.(option.id);
                              setModelMenuOpen(false);
                            }}
                            className={[
                              'flex h-11 w-full items-center justify-between rounded-[12px] px-4 text-left text-[15px] transition-colors duration-150',
                              selected
                                ? 'bg-white/[0.08] text-gl-text-primary'
                                : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                            ].join(' ')}
                          >
                            <span className="truncate">{option.label}</span>
                            {selected ? (
                              <Check size={16} className="text-gl-text-primary" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <BottomMenuButton
                  icon={<RatioIcon ratio={modelAspectRatio} active={settingsMenuOpen} />}
                  label={settingsLabel}
                  active={settingsMenuOpen}
                  onClick={() => {
                    setSettingsMenuOpen((open) => !open);
                    setModelMenuOpen(false);
                    setFormatMenuOpen(false);
                    setParallelMenuOpen(false);
                  }}
                />

                {settingsMenuOpen ? (
                  <div className="absolute bottom-full left-0 mb-2 w-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                    <div className="flex flex-col gap-3">
                      <div className="notranslate" translate="no">
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                          画质
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {IMAGE_SIZE_OPTIONS.map((option) => {
                            const selected = option === quality;

                            return (
                              <button
                                key={option}
                                type="button"
                                translate="no"
                                onClick={() => onQualityChange?.(option)}
                                className={[
                                  'flex h-10 items-center justify-center rounded-[11px] text-[15px] font-medium transition-colors duration-150',
                                  selected
                                    ? 'bg-white/[0.1] text-gl-text-primary'
                                    : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                ].join(' ')}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                          比例
                        </div>
                        <div className="rounded-[14px] bg-white/[0.06] p-2">
                          <div className="grid grid-cols-5 gap-1">
                            {aspectRatioLayout.map((item) => {
                              const selected = item.value === modelAspectRatio;

                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  translate="no"
                                  onClick={() => onAspectRatioChange?.(item.value)}
                                  className={[
                                    'flex w-[57px] flex-col items-center rounded-[12px] px-1 pb-1.5 pt-2.5 text-[12px] font-medium transition-colors duration-150',
                                    item.className,
                                    selected
                                      ? 'bg-white/[0.1] text-gl-text-primary'
                                      : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                  ].join(' ')}
                                >
                                  <div className={item.value === 'auto' ? 'mt-[18px]' : ''}>
                                    <RatioIcon ratio={item.value} active={selected} />
                                  </div>
                                  <span
                                    className={[
                                      'mt-2 block leading-4',
                                      item.value === 'auto' ? 'h-8' : 'h-4',
                                    ].join(' ')}
                                  >
                                    {'label' in item ? item.label : item.value}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {isNanoBananaModel ? null : (
                        <div>
                          <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                            细节
                          </div>
                          <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                            {IMAGE_DETAIL_OPTIONS.map((option) => {
                              const selected = option.value === detail;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  translate="no"
                                  onClick={() => onDetailChange?.(option.value)}
                                  className={[
                                    'flex h-10 items-center justify-center rounded-[11px] text-[15px] font-medium transition-colors duration-150',
                                    selected
                                      ? 'bg-white/[0.1] text-gl-text-primary'
                                      : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                  ].join(' ')}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {isNanoBananaModel ? null : (
                <div className="relative" ref={formatMenuRef}>
                  <BottomMenuButton
                    icon={<Sparkles size={14} />}
                    label={formatLabel}
                    active={formatMenuOpen}
                    onClick={() => {
                      setFormatMenuOpen((open) => !open);
                      setModelMenuOpen(false);
                      setSettingsMenuOpen(false);
                      setParallelMenuOpen(false);
                    }}
                  />

                  {formatMenuOpen ? (
                    <div className="absolute bottom-full left-0 mb-2 w-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                      <div className="flex flex-col gap-3">
                        <div>
                          <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                            图片格式
                          </div>
                          <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                            {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => {
                              const selected = option.value === outputFormat;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  translate="no"
                                  onClick={() => onOutputFormatChange?.(option.value)}
                                  className={[
                                    'flex h-10 items-center justify-center rounded-[11px] text-[15px] font-medium transition-colors duration-150',
                                    selected
                                      ? 'bg-white/[0.1] text-gl-text-primary'
                                      : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                  ].join(' ')}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                            内容审核
                          </div>
                          <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                            {IMAGE_MODERATION_OPTIONS.map((option) => {
                              const selected = option.value === moderation;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  translate="no"
                                  onClick={() => onModerationChange?.(option.value)}
                                  className={[
                                    'flex h-10 items-center justify-center rounded-[11px] text-[15px] font-medium transition-colors duration-150',
                                    selected
                                      ? 'bg-white/[0.1] text-gl-text-primary'
                                      : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                  ].join(' ')}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="relative" ref={parallelMenuRef}>
              <PromptBarRunControls
                label={`x${parallelCount}`}
                labelTitle="并行任务数"
                labelActive={parallelMenuOpen}
                onLabelClick={() => {
                  if (generating) {
                    return;
                  }

                  setParallelMenuOpen((open) => !open);
                  setModelMenuOpen(false);
                  setSettingsMenuOpen(false);
                  setFormatMenuOpen(false);
                }}
                runTitle={generating ? '生成中' : '开始生成'}
                runDisabled={generating}
                onRun={onRun}
              />

              {parallelMenuOpen ? (
                <div className="absolute bottom-full right-8 mb-2 w-[92px] overflow-hidden rounded-[14px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                  <div className="flex flex-col gap-0.5">
                    {PARALLEL_COUNT_OPTIONS.map((option) => {
                      const selected = option === parallelCount;

                      return (
                        <button
                          key={option}
                          type="button"
                          translate="no"
                          onClick={() => {
                            onParallelCountChange?.(option);
                            setParallelMenuOpen(false);
                          }}
                          className={[
                            'flex h-9 w-full items-center justify-between rounded-[10px] px-3 text-left text-[14px] transition-colors duration-150',
                            selected
                              ? 'bg-white/[0.08] text-gl-text-primary'
                              : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                          ].join(' ')}
                        >
                          <span>{`x${option}`}</span>
                          {selected ? <Check size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
});
