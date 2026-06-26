'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Check, ChevronDown, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { PromptBarRunControls } from './PromptBarRunControls';
import { PromptMentionInput } from './PromptMentionInput';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  ReferenceImageHoverPreviewPortal,
  ReferenceVideoHoverPreviewPortal,
  useReferenceImageHoverPreview,
  useReferenceVideoHoverPreview,
} from './ReferenceImageHoverPreview';
import { ReferenceMediaStrip } from './ReferenceMediaStrip';
import {
  getApiProviderLabel,
  persistSelectedModel,
  readStoredApiKey,
  type ApiProvider,
} from '@/store/canvas-store';
import type { VideoGenerationMode } from '@/types/canvas';

const VIDEO_MODEL_OPTIONS = [
  { id: 'doubao-seedance-2-0-260128', label: 'seedance 2.0' },
  { id: 'doubao-seedance-2-0-fast-260128', label: 'seedance 2.0 fast' },
] as const;
const API_PROVIDERS: ApiProvider[] = ['comfly'];
const VIDEO_RATIO_OPTIONS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const;
const VIDEO_KEEP_RATIO_VALUE = 'keep_ratio';
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const;
const VIDEO_DURATION_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
const COLLAPSED_PROMPT_HEIGHT = 54;
const EXPANDED_PROMPT_HEIGHT = 225;
const VIDEO_MODE_OPTIONS: Array<{ id: VideoGenerationMode; label: string }> = [
  { id: 'text-to-video', label: '文生视频' },
  { id: 'image-to-video', label: '图生视频' },
  { id: 'all-reference', label: '全能参考' },
  { id: 'first-last-frame', label: '首尾帧' },
];

export interface VideoGenerationPromptBarProps {
  visible: boolean;
  prompt: string;
  provider?: 'comfly';
  model?: string;
  mode?: VideoGenerationMode;
  ratio?: string;
  resolution?: '480p' | '720p' | '1080p';
  duration?: number;
  generateAudio?: boolean;
  generating?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    previewUrl?: string;
    alt: string;
    width?: number;
    height?: number;
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
  onProviderModelChange?: (next: { provider: 'comfly'; model: string }) => void;
  onModeChange?: (next: VideoGenerationMode) => void;
  onRatioChange?: (next: string) => void;
  onResolutionChange?: (next: '480p' | '720p' | '1080p') => void;
  onDurationChange?: (next: number) => void;
  onGenerateAudioChange?: (next: boolean) => void;
  onRun?: (promptOverride?: string) => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
  focusRequestId?: number;
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
      <ChevronDown size={14} className={active ? 'rotate-180 transition-transform' : 'transition-transform'} />
    </button>
  );
}

function getModeLabel(mode: VideoGenerationMode): string {
  return VIDEO_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? '全能参考';
}

export function getVideoModelLabel(model: string): string {
  return VIDEO_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model;
}

function getRatioIconClass(ratio: string) {
  switch (ratio) {
    case VIDEO_KEEP_RATIO_VALUE:
      return 'h-[30px] w-[30px]';
    case '16:9':
      return 'h-[8px] w-[15px]';
    case '4:3':
      return 'h-[10px] w-[14px]';
    case '1:1':
      return 'h-[12px] w-[12px]';
    case '3:4':
      return 'h-[14px] w-[10px]';
    case '9:16':
      return 'h-[15px] w-[8px]';
    case '21:9':
      return 'h-[7px] w-[17px]';
    default:
      return 'h-[9px] w-[16px]';
  }
}

function getRatioLabel(ratio: string) {
  return ratio === VIDEO_KEEP_RATIO_VALUE ? '自适应' : ratio;
}

function KeepRatioIcon({ active = false }: { active?: boolean }) {
  return (
    <span
      className={[
        'relative block h-[30px] w-[30px]',
        active ? 'text-gl-text-primary' : 'text-gl-text-secondary',
      ].join(' ')}
      aria-hidden="true"
    >
      <span className="absolute left-[5px] top-[5px] h-[20px] w-[20px] rounded-[3px] border border-current" />
      <span className="absolute left-[8px] top-[12px] h-[10px] w-[14px] rounded-[2px] border border-current" />
      <span className="absolute left-[12px] top-[15px] h-[7px] w-[7px] border-l border-current" />
    </span>
  );
}

export const VideoGenerationPromptBar = memo(function VideoGenerationPromptBar({
  visible,
  prompt,
  provider = 'comfly',
  model = VIDEO_MODEL_OPTIONS[0].id,
  mode = 'all-reference',
  ratio = '16:9',
  resolution = '720p',
  duration = 5,
  generateAudio = false,
  generating = false,
  connectedImages = [],
  connectedVideos = [],
  onPromptChange,
  onProviderModelChange,
  onModeChange,
  onRatioChange,
  onResolutionChange,
  onDurationChange,
  onGenerateAudioChange,
  onRun,
  onUpload,
  onQuickReferenceConnect,
  onRemoveReference,
  onPointerDownWithin,
  onFocusWithinChange,
  focusRequestId,
}: VideoGenerationPromptBarProps) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modeRatioMenuOpen, setModeRatioMenuOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const referenceImagePreview = useReferenceImageHoverPreview();
  const referenceVideoPreview = useReferenceVideoHoverPreview();
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modeRatioMenuRef = useRef<HTMLDivElement | null>(null);
  const outputMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modelMenuOpen && !modeRatioMenuOpen && !outputMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        modelMenuRef.current?.contains(target) ||
        modeRatioMenuRef.current?.contains(target) ||
        outputMenuRef.current?.contains(target)
      ) {
        return;
      }
      setModelMenuOpen(false);
      setModeRatioMenuOpen(false);
      setOutputMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [modelMenuOpen, modeRatioMenuOpen, outputMenuOpen]);

  const handleModelSelect = (nextModel: string) => {
    persistSelectedModel({ kind: 'video', provider: 'comfly', model: nextModel });
    onProviderModelChange?.({ provider: 'comfly', model: nextModel });
    setModelMenuOpen(false);
  };

  const handleRun = () => {
    const trimmed = prompt.trim();
    if (trimmed !== prompt) {
      onPromptChange?.(trimmed);
    }
    onRun?.(trimmed);
  };

  const modeRatioLabel = `${getModeLabel(mode)} / ${getRatioLabel(ratio)}`;
  const outputLabel = `${resolution} / ${duration}s / ${generateAudio ? '音频' : '静音'}`;
  const modelLabel = getVideoModelLabel(model);
  const promptHeight = expanded ? EXPANDED_PROMPT_HEIGHT : COLLAPSED_PROMPT_HEIGHT;
  const acceptsReferenceImages = mode !== 'text-to-video';
  const inputHint = mode === 'text-to-video'
    ? '描述你想生成的视频内容'
    : '描述你想生成的视频内容，输入@插入参考图';
  return (
    <NodeToolbar isVisible={visible} position={Position.Bottom} offset={16} align="center">
      <div
        data-canvas-menu-ignore="true"
        className="text-node-prompt-bar relative w-[720px] max-w-[calc(100vw-48px)] rounded-[22px] border border-white/10 bg-gl-panel/95 px-4 py-3 shadow-gl-toolbar backdrop-blur-xl"
        onFocusCapture={() => onFocusWithinChange?.(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }
          onFocusWithinChange?.(false);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDownWithin?.();
        }}
        onWheelCapture={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
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
          <div
            className={[
              'overflow-hidden transition-[max-height,opacity,margin] duration-500 ease-in-out',
              acceptsReferenceImages ? 'mb-4 opacity-100' : 'mb-0 opacity-0',
            ].join(' ')}
            style={{ maxHeight: acceptsReferenceImages ? 44 : 0 }}
            aria-hidden={!acceptsReferenceImages}
          >
            <div
              className={[
                'flex items-center gap-2 transition-transform duration-500 ease-in-out',
                acceptsReferenceImages ? 'translate-y-0' : '-translate-y-1',
              ].join(' ')}
            >
              <ReferenceMediaStrip
                connectedImages={connectedImages}
                connectedVideos={connectedVideos}
                imagePreview={referenceImagePreview}
                videoPreview={referenceVideoPreview}
                onQuickReferenceConnect={onQuickReferenceConnect}
                onAddReference={onUpload}
                onRemoveReference={onRemoveReference}
              />
            </div>
          </div>

          <div
            className="relative overflow-visible"
            style={{
              height: promptHeight,
              transition: 'height 500ms ease-in-out',
            }}
          >
            {!prompt.trim() && !modelMenuOpen && !modeRatioMenuOpen && !outputMenuOpen ? (
              <div className="pointer-events-none absolute left-0 top-0 z-0 pr-10 text-[14px] leading-7 text-gl-text-muted">
                {inputHint}
              </div>
            ) : null}
            <PromptMentionInput
              value={prompt}
              connectedImages={acceptsReferenceImages ? connectedImages : []}
              connectedVideos={acceptsReferenceImages ? connectedVideos : []}
              focusRequestId={focusRequestId}
              onChange={onPromptChange}
              onFocus={() => onFocusWithinChange?.(true)}
              onBlur={() => onFocusWithinChange?.(false)}
              placeholder=""
              className="text-node-prompt-input prompt-mention-input nodrag nopan w-full overflow-y-auto border-0 bg-transparent pr-10 text-[14px] leading-7 text-gl-text-primary outline-none"
              style={{ minHeight: promptHeight, height: promptHeight }}
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
                    setModeRatioMenuOpen(false);
                    setOutputMenuOpen(false);
                  }}
                />

                {modelMenuOpen ? (
                  <div className="absolute bottom-full left-0 z-50 mb-2 flex w-fit overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                    <div className="w-[170px] border-r border-white/[0.06] pr-1.5">
                      <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                        Provider
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {API_PROVIDERS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            translate="no"
                            className={[
                              'flex h-11 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] transition-colors duration-150',
                              provider === option
                                ? 'bg-white/[0.08] text-gl-text-primary'
                                : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                            ].join(' ')}
                          >
                            <span className="truncate">{getApiProviderLabel(option)}</span>
                            <ChevronDown size={14} className="-rotate-90 text-gl-text-tertiary" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="w-[180px] min-w-0 pl-1.5">
                      <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
                        Model
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {VIDEO_MODEL_OPTIONS.map((option) => {
                          const selected = provider === 'comfly' && model === option.id;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              translate="no"
                              onClick={() => handleModelSelect(option.id)}
                              className={[
                                'flex h-11 w-full items-center justify-between rounded-[12px] px-4 text-left text-[15px] transition-colors duration-150',
                                selected
                                  ? 'bg-white/[0.08] text-gl-text-primary'
                                  : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                              ].join(' ')}
                            >
                              <span className="truncate">{option.label}</span>
                              {selected ? <Check size={16} className="text-gl-text-primary" /> : null}
                            </button>
                          );
                        })}
                      </div>
                      {!readStoredApiKey('video', 'comfly') ? (
                        <div className="mt-1.5 rounded-[10px] border border-gl-error/30 bg-gl-error/10 px-3 py-2 text-[12px] leading-5 text-gl-error">
                          请先在 API 设置里配置 Comfly Key
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={modeRatioMenuRef}>
                <BottomMenuButton
                  icon={<span className="text-[12px]">⚙</span>}
                  label={modeRatioLabel}
                  active={modeRatioMenuOpen}
                  onClick={() => {
                    setModeRatioMenuOpen((open) => !open);
                    setModelMenuOpen(false);
                    setOutputMenuOpen(false);
                  }}
                />

                {modeRatioMenuOpen ? (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">生成方式</div>
                        <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {VIDEO_MODE_OPTIONS.map((option) => {
                            const selected = option.id === mode;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                translate="no"
                                onClick={() => onModeChange?.(option.id)}
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
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">比例</div>
                        <div className="flex gap-3 rounded-[14px] bg-white/[0.06] p-1.5">
                          <button
                            type="button"
                            translate="no"
                            onClick={() => onRatioChange?.(VIDEO_KEEP_RATIO_VALUE)}
                            className={[
                              'flex h-[106px] w-[78px] shrink-0 flex-col items-center justify-center rounded-[12px] border text-[14px] font-semibold transition-colors duration-150',
                              ratio === VIDEO_KEEP_RATIO_VALUE
                                ? 'border-white/18 bg-white/[0.1] text-gl-text-primary'
                                : 'border-transparent text-gl-text-secondary hover:border-white/10 hover:bg-white/[0.05] hover:text-gl-text-primary',
                            ].join(' ')}
                          >
                            <KeepRatioIcon active={ratio === VIDEO_KEEP_RATIO_VALUE} />
                            <span className="mt-3">自适应</span>
                          </button>

                          <div className="grid grid-cols-5 content-start gap-x-3 gap-y-4 py-2">
                            {VIDEO_RATIO_OPTIONS.map((option) => {
                              const selected = option === ratio;

                              return (
                                <button
                                  key={option}
                                  type="button"
                                  translate="no"
                                  onClick={() => onRatioChange?.(option)}
                                  className={[
                                    'flex h-10 w-8 flex-col items-center justify-start text-[11px] font-medium transition-colors duration-150',
                                    selected
                                      ? 'text-gl-text-primary'
                                      : 'text-gl-text-muted hover:text-gl-text-primary',
                                  ].join(' ')}
                                >
                                  <span className="flex h-[18px] items-center justify-center">
                                    <span
                                      className={[
                                        'block rounded-[2px] border transition-colors duration-150',
                                        getRatioIconClass(option),
                                        selected ? 'border-gl-text-primary' : 'border-current',
                                      ].join(' ')}
                                    />
                                  </span>
                                  <span className="mt-1 block h-4 leading-4">{option}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={outputMenuRef}>
                <BottomMenuButton
                  icon={<Sparkles size={14} />}
                  label={outputLabel}
                  active={outputMenuOpen}
                  onClick={() => {
                    setOutputMenuOpen((open) => !open);
                    setModelMenuOpen(false);
                    setModeRatioMenuOpen(false);
                  }}
                />

                {outputMenuOpen ? (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">清晰度</div>
                        <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {VIDEO_RESOLUTION_OPTIONS.map((option) => {
                            const selected = option === resolution;

                            return (
                              <button
                                key={option}
                                type="button"
                                translate="no"
                                onClick={() => onResolutionChange?.(option)}
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
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">生成时长</div>
                        <div className="flex flex-wrap gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {VIDEO_DURATION_OPTIONS.map((option) => {
                            const selected = option === duration;

                            return (
                              <button
                                key={option}
                                type="button"
                                translate="no"
                                onClick={() => onDurationChange?.(option)}
                                className={[
                                  'flex h-8 min-w-8 items-center justify-center rounded-[10px] px-1 text-[14px] font-medium transition-colors duration-150',
                                  selected
                                    ? 'bg-white/[0.1] text-gl-text-primary'
                                    : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                ].join(' ')}
                              >
                                {option}s
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 px-1 text-[13px] font-medium text-gl-text-muted">生成音频</div>
                        <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                          {[true, false].map((option) => {
                            const selected = generateAudio === option;

                            return (
                              <button
                                key={String(option)}
                                type="button"
                                translate="no"
                                onClick={() => onGenerateAudioChange?.(option)}
                                className={[
                                  'flex h-10 items-center justify-center rounded-[11px] text-[15px] font-medium transition-colors duration-150',
                                  selected
                                    ? 'bg-white/[0.1] text-gl-text-primary'
                                    : 'text-gl-text-muted hover:bg-white/[0.05] hover:text-gl-text-primary',
                                ].join(' ')}
                              >
                                {option ? '开启' : '关闭'}
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
              label="1x"
              labelTitle="任务数"
              runTitle={generating ? '生成中' : '开始生成'}
              runDisabled={generating}
              onRun={handleRun}
            />
          </div>
        </div>

        <ReferenceVideoHoverPreviewPortal preview={referenceVideoPreview.preview} />
        <ReferenceImageHoverPreviewPortal preview={referenceImagePreview.preview} />
      </div>
    </NodeToolbar>
  );
});
