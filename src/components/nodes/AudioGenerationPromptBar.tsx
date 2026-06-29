'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Check, ChevronDown, Music2, Settings2, SlidersHorizontal } from 'lucide-react';
import type {
  AudioGenerationMode,
  AudioGenerationModel,
  AudioGenerationProvider,
} from '@/types/canvas';
import { PromptBarRunControls } from './PromptBarRunControls';
import {
  ReferenceMediaStrip,
  type ReferenceMediaStripAudio,
} from './ReferenceMediaStrip';
import {
  useReferenceImageHoverPreview,
  useReferenceVideoHoverPreview,
} from './ReferenceImageHoverPreview';

const AUDIO_PROVIDER_OPTIONS: Array<{ id: AudioGenerationProvider; label: string }> = [
  { id: 'comfly', label: 'Comfly' },
  { id: 'zhenzhen', label: '贞贞AI工坊' },
];

const AUDIO_MODEL_OPTIONS: Array<{ id: AudioGenerationModel; label: string }> = [
  { id: 'suno-v5.5', label: 'Suno v5.5' },
  { id: 'suno-v5', label: 'Suno v5' },
  { id: 'suno-v4.5-plus', label: 'Suno v4.5+' },
];

const AUDIO_MODE_OPTIONS: Array<{ id: AudioGenerationMode; label: string }> = [
  { id: 'inspiration', label: '灵感模式' },
  { id: 'custom', label: '自定义' },
];

export interface AudioGenerationPromptBarProps {
  visible: boolean;
  prompt: string;
  provider?: AudioGenerationProvider;
  model?: AudioGenerationModel;
  mode?: AudioGenerationMode;
  title?: string;
  style?: string;
  instrumental?: boolean;
  generating?: boolean;
  referenceAudio?: ReferenceMediaStripAudio[];
  onPromptChange?: (next: string) => void;
  onProviderModelChange?: (next: {
    provider: AudioGenerationProvider;
    model: AudioGenerationModel;
  }) => void;
  onProviderChange?: (next: AudioGenerationProvider) => void;
  onModelChange?: (next: AudioGenerationModel) => void;
  onModeChange?: (next: AudioGenerationMode) => void;
  onTitleChange?: (next: string) => void;
  onStyleChange?: (next: string) => void;
  onInstrumentalChange?: (next: boolean) => void;
  onRun?: () => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

function getAudioModelLabel(model: AudioGenerationModel): string {
  return AUDIO_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? 'Suno v5.5';
}

function getAudioModeLabel(mode: AudioGenerationMode): string {
  return AUDIO_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? '灵感模式';
}

function getPromptPlaceholder(mode: AudioGenerationMode, instrumental: boolean): string {
  if (mode === 'inspiration' && instrumental) {
    return '请输入纯音乐描述';
  }

  if (mode === 'inspiration') {
    return '请输入音乐描述';
  }

  if (instrumental) {
    return '可留空，纯音乐请在参数配置中填写风格标签';
  }

  return '请输入歌词';
}

function SelectMenuButton<T extends string>({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange?: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        translate="no"
        onClick={() => setOpen((current) => !current)}
        className={[
          'flex h-9 items-center gap-1.5 rounded-gl-pill border px-3 text-[14px] font-medium transition-all',
          open
            ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
            : 'border-transparent text-gl-text-secondary hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
        ].join(' ')}
      >
        <span className="text-gl-text-tertiary" translate="no">
          {icon}
        </span>
        <span translate="no">{label}</span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[168px] overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
          <div className="flex flex-col gap-0.5">
            {options.map((option) => {
              const selected = option.id === value;

              return (
                <button
                  key={option.id}
                  type="button"
                  translate="no"
                  onClick={() => {
                    onChange?.(option.id);
                    setOpen(false);
                  }}
                  className={[
                    'flex h-11 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] transition-colors duration-150',
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
        </div>
      ) : null}
    </div>
  );
}

function ProviderModelMenuButton({
  provider,
  model,
  onProviderModelChange,
  onProviderChange,
  onModelChange,
}: {
  provider: AudioGenerationProvider;
  model: AudioGenerationModel;
  onProviderModelChange?: (next: {
    provider: AudioGenerationProvider;
    model: AudioGenerationModel;
  }) => void;
  onProviderChange?: (next: AudioGenerationProvider) => void;
  onModelChange?: (next: AudioGenerationModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AudioGenerationProvider>(provider);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        translate="no"
        onClick={() => {
          setOpen((value) => {
            if (!value) {
              setActiveProvider(provider);
            }

            return !value;
          });
        }}
        className={[
          'flex h-9 items-center gap-1.5 rounded-gl-pill border px-3 text-[14px] font-medium transition-all',
          open
            ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
            : 'border-transparent text-gl-text-secondary hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
        ].join(' ')}
      >
        <span className="text-gl-text-tertiary" translate="no">
          <Music2 size={14} />
        </span>
        <span translate="no">{getAudioModelLabel(model)}</span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 flex w-fit overflow-hidden rounded-[16px] border border-white/10 bg-[#121417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate" translate="no">
          <div className="w-[170px] border-r border-white/[0.06] pr-1.5">
            <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
              Provider
            </div>
            <div className="flex flex-col gap-0.5">
              {AUDIO_PROVIDER_OPTIONS.map((option) => {
                const hovered = option.id === activeProvider;

                return (
                  <button
                    key={option.id}
                    type="button"
                    translate="no"
                    onPointerEnter={() => setActiveProvider(option.id)}
                    onClick={() => setActiveProvider(option.id)}
                    className={[
                      'flex h-11 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] transition-colors duration-150',
                      hovered
                        ? 'bg-white/[0.08] text-gl-text-primary'
                        : 'text-gl-text-secondary hover:bg-white/[0.05] hover:text-gl-text-primary',
                    ].join(' ')}
                  >
                    <span className="truncate">{option.label}</span>
                    <ChevronDown size={14} className="-rotate-90 text-gl-text-tertiary" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-[180px] min-w-0 pl-1.5">
            <div className="mb-1 px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gl-text-muted">
              Model
            </div>
            <div className="flex flex-col gap-0.5">
              {AUDIO_MODEL_OPTIONS.map((option) => {
                const selected = activeProvider === provider && option.id === model;

                return (
                  <button
                    key={`${activeProvider}-${option.id}`}
                    type="button"
                    translate="no"
                    onClick={() => {
                      if (onProviderModelChange) {
                        onProviderModelChange({
                          provider: activeProvider,
                          model: option.id,
                        });
                      } else {
                        onProviderChange?.(activeProvider);
                        onModelChange?.(option.id);
                      }
                      setOpen(false);
                    }}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AudioParametersMenuButton({
  mode,
  title,
  style,
  instrumental,
  onTitleChange,
  onStyleChange,
  onInstrumentalChange,
}: {
  mode: AudioGenerationMode;
  title: string;
  style: string;
  instrumental: boolean;
  onTitleChange?: (next: string) => void;
  onStyleChange?: (next: string) => void;
  onInstrumentalChange?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const styleDisabled = mode === 'inspiration';
  const [draftTitle, setDraftTitle] = useState(title);
  const [lastSyncedTitle, setLastSyncedTitle] = useState(title);
  const [titleComposing, setTitleComposing] = useState(false);
  const [draftStyle, setDraftStyle] = useState(style);
  const [lastSyncedStyle, setLastSyncedStyle] = useState(style);
  const [styleComposing, setStyleComposing] = useState(false);

  if (!titleComposing && title !== lastSyncedTitle) {
    setDraftTitle(title);
    setLastSyncedTitle(title);
  }

  if (!styleComposing && style !== lastSyncedStyle) {
    setDraftStyle(style);
    setLastSyncedStyle(style);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        translate="no"
        onClick={() => setOpen((current) => !current)}
        className={[
          'flex h-9 items-center gap-1.5 rounded-gl-pill border px-3 text-[14px] font-medium transition-all',
          open
            ? 'border-white/16 bg-white/[0.06] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
            : 'border-transparent text-gl-text-secondary hover:border-white/14 hover:bg-white/[0.05] hover:text-gl-text-primary',
        ].join(' ')}
      >
        <Settings2 size={14} className="text-gl-text-tertiary" />
        <span>参数配置</span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open ? (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-[320px] overflow-hidden rounded-[18px] border border-white/10 bg-[#121417] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate"
          translate="no"
          onKeyDownCapture={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-gl-text-secondary">演唱模式</span>
              <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                {[
                  { label: '人声', value: false },
                  { label: '纯音乐', value: true },
                ].map((option) => {
                  const selected = instrumental === option.value;

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => onInstrumentalChange?.(option.value)}
                      className={[
                        'h-9 rounded-[10px] text-[14px] font-semibold transition-colors',
                        selected
                          ? 'bg-white/[0.13] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                          : 'text-gl-text-muted hover:bg-white/[0.06] hover:text-gl-text-secondary',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex flex-col gap-2 text-[13px] font-medium text-gl-text-secondary">
              <span>歌曲名称</span>
              <textarea
                value={draftTitle}
                onKeyDownCapture={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const next = event.target.value;

                  setDraftTitle(next);

                  if (!titleComposing) {
                    onTitleChange?.(next);
                    setLastSyncedTitle(next);
                  }
                }}
                onCompositionStart={() => setTitleComposing(true)}
                onCompositionEnd={(event) => {
                  const next = event.currentTarget.value;

                  setTitleComposing(false);
                  setDraftTitle(next);
                  setLastSyncedTitle(next);
                  onTitleChange?.(next);
                }}
                className="nodrag nopan h-[72px] resize-none rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] leading-5 text-gl-text-primary outline-none placeholder:text-gl-text-muted focus:border-white/20"
              />
            </label>
            <label
              className={[
                'flex flex-col gap-2 text-[13px] font-medium transition-opacity',
                styleDisabled ? 'text-gl-text-muted opacity-45' : 'text-gl-text-secondary',
              ].join(' ')}
            >
              <span>风格标签</span>
              <textarea
                value={draftStyle}
                disabled={styleDisabled}
                onKeyDownCapture={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const next = event.target.value;

                  setDraftStyle(next);

                  if (!styleComposing) {
                    onStyleChange?.(next);
                    setLastSyncedStyle(next);
                  }
                }}
                onCompositionStart={() => setStyleComposing(true)}
                onCompositionEnd={(event) => {
                  const next = event.currentTarget.value;

                  setStyleComposing(false);
                  setDraftStyle(next);
                  setLastSyncedStyle(next);
                  onStyleChange?.(next);
                }}
                placeholder={styleDisabled ? '灵感模式下风格标签不会生效' : '用英文逗号分隔的风格标签，如：流行,民谣,旋律,电影感,女声'}
                className={[
                  'nodrag nopan h-[92px] resize-none rounded-[12px] border px-3 py-2 text-[14px] leading-6 outline-none placeholder:text-gl-text-muted',
                  styleDisabled
                    ? 'cursor-not-allowed border-white/[0.06] bg-white/[0.025] text-gl-text-muted'
                    : 'border-white/10 bg-white/[0.04] text-gl-text-primary focus:border-white/20',
                ].join(' ')}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const AudioGenerationPromptBar = memo(function AudioGenerationPromptBar({
  visible,
  prompt,
  provider = 'comfly',
  model = 'suno-v5.5',
  mode = 'inspiration',
  title = '',
  style = '',
  instrumental = false,
  generating = false,
  referenceAudio = [],
  onPromptChange,
  onProviderModelChange,
  onProviderChange,
  onModelChange,
  onModeChange,
  onTitleChange,
  onStyleChange,
  onInstrumentalChange,
  onRun,
  onUpload,
  onQuickReferenceConnect,
  onRemoveReference,
  onPointerDownWithin,
  onFocusWithinChange,
}: AudioGenerationPromptBarProps) {
  const imagePreview = useReferenceImageHoverPreview();
  const videoPreview = useReferenceVideoHoverPreview();
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [lastSyncedPrompt, setLastSyncedPrompt] = useState(prompt);
  const [isComposing, setIsComposing] = useState(false);

  if (!isComposing && prompt !== lastSyncedPrompt) {
    setDraftPrompt(prompt);
    setLastSyncedPrompt(prompt);
  }

  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Bottom}
      offset={16}
      align="center"
      style={{ zIndex: 30 }}
    >
      <div
        data-canvas-menu-ignore="true"
        onPointerDownCapture={(event) => {
          onPointerDownWithin?.();
          event.stopPropagation();
        }}
        onFocusCapture={() => onFocusWithinChange?.(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;

          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }

          onFocusWithinChange?.(false);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        className="text-node-prompt-bar relative w-[720px] max-w-[calc(100vw-48px)] rounded-[22px] border border-white/10 bg-gl-panel/95 px-4 py-3 shadow-gl-toolbar backdrop-blur-xl"
        style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}
      >
        <div className="flex min-h-[104px] flex-col">
          <div className="mb-4">
            <ReferenceMediaStrip
              connectedImages={[]}
              connectedVideos={[]}
              connectedAudio={referenceAudio}
              imagePreview={imagePreview}
              videoPreview={videoPreview}
              quickConnectTitle="快捷连接参考音频"
              addTitle="添加参考音频"
              onQuickReferenceConnect={onQuickReferenceConnect}
              onAddReference={onUpload}
              onRemoveReference={onRemoveReference}
            />
          </div>

          <div className="relative h-[54px] overflow-visible">
            {!draftPrompt.trim() ? (
              <div className="pointer-events-none absolute left-0 top-0 z-0 pr-10 text-[14px] leading-7 text-gl-text-muted">
                {getPromptPlaceholder(mode, instrumental)}
              </div>
            ) : null}
            <textarea
              value={draftPrompt}
              onChange={(event) => {
                const next = event.target.value;

                setDraftPrompt(next);

                if (!isComposing) {
                  onPromptChange?.(next);
                  setLastSyncedPrompt(next);
                }
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(event) => {
                setIsComposing(false);
                setDraftPrompt(event.currentTarget.value);
                setLastSyncedPrompt(event.currentTarget.value);
                onPromptChange?.(event.currentTarget.value);
              }}
              placeholder=""
              className="text-node-prompt-input nodrag nopan relative z-10 h-[54px] w-full resize-none overflow-y-auto border-0 bg-transparent pr-10 text-[14px] leading-7 text-gl-text-primary outline-none"
            />
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-6">
            <div className="notranslate flex flex-wrap items-center gap-1" translate="no">
              <ProviderModelMenuButton
                provider={provider}
                model={model}
                onProviderModelChange={onProviderModelChange}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
              />
              <SelectMenuButton
                icon={<SlidersHorizontal size={14} />}
                label={getAudioModeLabel(mode)}
                options={AUDIO_MODE_OPTIONS}
                value={mode}
                onChange={onModeChange}
              />
              <AudioParametersMenuButton
                mode={mode}
                title={title}
                style={style}
                instrumental={instrumental}
                onTitleChange={onTitleChange}
                onStyleChange={onStyleChange}
                onInstrumentalChange={onInstrumentalChange}
              />
            </div>

            <PromptBarRunControls
              label="x1"
              labelTitle="任务数"
              runTitle={generating ? '生成中' : '开始生成'}
              runDisabled={generating}
              onRun={onRun}
            />
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
});
