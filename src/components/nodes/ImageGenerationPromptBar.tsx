'use client';

import React, { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { NodeToolbar, Position } from 'reactflow';
import { Sparkles, Expand, ChevronDown, Check } from 'lucide-react';
import { PromptBarRunControls } from './PromptBarRunControls';

const IMAGE_MODELS = ['gpt-image-2'] as const;
const IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
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

export interface ImageGenerationPromptBarProps {
  nodeId?: string;
  visible: boolean;
  prompt: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  detail?: string;
  count?: number;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    alt: string;
    width?: number;
    height?: number;
  }>;
  onPromptChange?: (next: string) => void;
  onModelChange?: (next: string) => void;
  onAspectRatioChange?: (next: string) => void;
  onQualityChange?: (next: string) => void;
  onDetailChange?: (next: string) => void;
  onRun?: () => void;
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
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/[0.08] text-gl-text-secondary transition-colors hover:bg-white/[0.12] hover:text-gl-text-primary"
      title={title}
    >
      {children}
    </button>
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
      onClick={onClick}
      className={[
        'flex h-9 items-center gap-1.5 rounded-gl-pill border px-3 text-[14px] font-medium transition-all',
        active
          ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
          : 'border-transparent text-gl-text-secondary hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
      ].join(' ')}
    >
      <span className="text-gl-text-tertiary">{icon}</span>
      <span>{label}</span>
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
    default:
      return 'h-[12px] w-[12px]';
  }
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

export function ImageGenerationPromptBar({
  nodeId,
  visible,
  prompt,
  model = IMAGE_MODELS[0],
  aspectRatio = 'auto',
  quality = IMAGE_SIZE_OPTIONS[0],
  detail = 'medium',
  count = 5,
  connectedImages = [],
  onPromptChange,
  onModelChange,
  onAspectRatioChange,
  onQualityChange,
  onDetailChange,
  onRun,
  onAddReference,
  onPointerDownWithin,
  onFocusWithinChange,
}: ImageGenerationPromptBarProps) {
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modelMenuOpen && !settingsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        modelMenuRef.current?.contains(target) ||
        settingsMenuRef.current?.contains(target)
      ) {
        return;
      }

      setModelMenuOpen(false);
      setSettingsMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [modelMenuOpen, settingsMenuOpen]);

  if (!visible) return null;

  const resolvedValue = isPromptFocused || isComposing ? draftPrompt : prompt;
  const settingsLabel = `${aspectRatio} · ${quality}`;

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
        className="text-node-prompt-bar relative w-[720px] max-w-[calc(100vw-48px)] rounded-[22px] border border-white/10 bg-gl-panel/95 px-4 py-3 shadow-gl-toolbar backdrop-blur-xl"
      >
        <button
          type="button"
          className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-gl-text-tertiary transition-colors hover:bg-white/[0.06] hover:text-gl-text-secondary"
          title="Expand"
        >
          <Expand size={14} />
        </button>

        <div className="flex min-h-[138px] flex-col">
          <div className="mb-4 flex items-start gap-2">
            <ToolSquareButton title="Reference image" onClick={onAddReference}>
              <ReferenceImageIcon />
            </ToolSquareButton>

            {connectedImages.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto nodrag nopan">
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
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-black/70 px-1.5 py-0.5 text-[14px] font-medium leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
                      {`图片${index + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <ToolSquareButton title="Add" onClick={onAddReference}>
              <span className="text-[24px] leading-none">+</span>
            </ToolSquareButton>
          </div>

          <textarea
            ref={textareaRef}
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
            placeholder="Describe the image you want to generate"
            className="text-node-prompt-input nodrag nopan min-h-[72px] w-full resize-none overflow-y-auto border-0 bg-transparent pr-10 text-[14px] leading-7 text-gl-text-primary outline-none placeholder:text-gl-text-muted"
            rows={3}
          />

          <div className="mt-auto flex items-end justify-between gap-3 pt-6">
            <div className="flex flex-wrap items-center gap-1">
              <div className="relative" ref={modelMenuRef}>
                <BottomMenuButton
                  icon={<Sparkles size={14} />}
                  label={model}
                  active={modelMenuOpen}
                  onClick={() => {
                    setModelMenuOpen((open) => !open);
                    setSettingsMenuOpen(false);
                  }}
                />

                {modelMenuOpen ? (
                  <div className="absolute bottom-full left-0 mb-2 w-[210px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)]">
                    <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                      Model
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {IMAGE_MODELS.map((option) => {
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
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <BottomMenuButton
                  icon={<RatioIcon ratio={aspectRatio} active={settingsMenuOpen} />}
                  label={settingsLabel}
                  active={settingsMenuOpen}
                  onClick={() => {
                    setSettingsMenuOpen((open) => !open);
                    setModelMenuOpen(false);
                  }}
                />

                {settingsMenuOpen ? (
                  <div className="absolute bottom-full left-0 mb-2 w-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)]">
                    <div className="flex flex-col gap-3">
                      <div>
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
                            {IMAGE_ASPECT_RATIO_LAYOUT.map((item) => {
                              const selected = item.value === aspectRatio;

                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => onAspectRatioChange?.(item.value)}
                                  className={[
                                    'flex w-[57px] flex-col items-center rounded-[12px] px-1 pt-2.5 pb-1.5 text-[12px] font-medium transition-colors duration-150',
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
                                    {item.label ?? item.value}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">
                          精细度
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {IMAGE_DETAIL_OPTIONS.map((option) => {
                            const selected = option.value === detail;

                            return (
                              <button
                                key={option.value}
                                type="button"
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
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <PromptBarRunControls
              label={String(count)}
              labelTitle="Image count"
              runTitle="Run"
              onRun={onRun}
            />
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
}
