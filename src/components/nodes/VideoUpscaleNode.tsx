'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { Position } from 'reactflow';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { VideoUpscaleNodeData } from '@/types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { Tooltip } from '@/components/ui/Tooltip';
import { VideoPlayer } from './VideoPlayer';

const CARD_WIDTH = 540;
const CARD_HEIGHT = 304;
const PANEL_WIDTH = 448;

const RESOLUTION_OPTIONS = ['720p', '1080p', '4k'] as const;
const FPS_OPTIONS = ['30', '60'] as const;
const INSTANCE_TYPE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'plus', label: 'Plus' },
] as const;

function normalizeVideoUpscaleTitle(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed || /瑙嗛|瓒呮|鐞|璧/.test(trimmed)) {
    return undefined;
  }

  return value;
}

export interface VideoUpscaleNodeProps {
  id?: string;
  data: VideoUpscaleNodeData;
  cardDimensions?: { width: number; height: number };
  selected?: boolean;
  dragging?: boolean;
  sourceVideoAvailable?: boolean;
  onChange?: (next: VideoUpscaleNodeData) => void;
  onRun?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
}

function SegmentedField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[138px_minmax(0,1fr)] items-center gap-3 text-[14px] font-semibold text-gl-text-primary">
      <span>{label}</span>
      <div className="grid gap-1 rounded-[14px] bg-white/[0.06] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const selected = option === value;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange?.(option)}
              className={[
                'nodrag nopan flex h-9 items-center justify-center rounded-[11px] text-[14px] font-semibold transition-colors',
                selected
                  ? 'bg-white/[0.12] text-gl-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                  : 'text-gl-text-muted hover:bg-white/[0.06] hover:text-gl-text-primary',
              ].join(' ')}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const VideoUpscaleNode = memo(function VideoUpscaleNode({
  data,
  cardDimensions,
  selected = false,
  dragging = false,
  sourceVideoAvailable = false,
  onChange,
  onRun,
  onTitleChange,
  onSelectNode,
}: VideoUpscaleNodeProps) {
  const isGenerating = data.status === 'generating';
  const videoUrl = data.hostedVideoUrl?.trim() || data.videoUrl?.trim() || '';
  const hasVideo = Boolean(videoUrl);
  const resolvedCardDimensions = cardDimensions ?? { width: CARD_WIDTH, height: CARD_HEIGHT };
  const targetResolution = data.targetResolution || '1080p';
  const targetFps = data.targetFps || '30';
  const instanceType = data.instanceType || 'default';
  const canRun = sourceVideoAvailable && !isGenerating;
  const displayTitle = normalizeVideoUpscaleTitle(data.title);
  const nodeWidth = resolvedCardDimensions.width;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!advancedRef.current?.contains(target)) {
        setAdvancedOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [advancedOpen]);

  const handlePatch = (partial: Partial<VideoUpscaleNodeData>) => {
    onChange?.({
      ...data,
      ...partial,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  return (
    <div
      className="relative group node-connectable-root"
      style={{
        width: nodeWidth,
      }}
    >
      <div className="node-visible-title mb-2 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <Sparkles size={21} />
        <EditableNodeTitle
          value={displayTitle}
          fallbackValue="视频超清"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className="relative mx-auto"
        style={{
          width: resolvedCardDimensions.width,
          height: resolvedCardDimensions.height,
        }}
      >
        <div
          className={[
            'node-connectable-card image-generation-node-drag-handle relative flex h-full w-full overflow-hidden rounded-gl-xl border bg-gl-panel shadow-gl-card',
            'items-center justify-center transition-[border-color,box-shadow] duration-300 ease-out cursor-grab',
            isGenerating
              ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
              : selected
                ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
                : 'border-gl-stroke-subtle',
          ].join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            onSelectNode?.();
          }}
        >
          {hasVideo ? (
            <VideoPlayer src={videoUrl} className="absolute inset-0" />
          ) : data.status === 'error' && data.errorMessage ? (
            <div className="max-w-[84%] whitespace-pre-line break-words text-center text-[13px] leading-5 text-gl-error">
              {data.errorMessage}
            </div>
          ) : isGenerating ? (
            <div className="text-center text-[14px] font-medium text-gl-text-secondary">
              视频超清处理中{data.progress ? ` · ${data.progress}` : ''}
            </div>
          ) : (
            <div className="text-center text-[15px] font-medium text-[#9eb8e8]">
              配置参数生成高清视频
            </div>
          )}
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={selected && !dragging}
          cardWidth={resolvedCardDimensions.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={selected && !dragging}
          cardWidth={resolvedCardDimensions.width}
        />
      </div>

      <div
        data-canvas-menu-ignore="true"
        className="nodrag nopan mx-auto mt-6 rounded-[16px] border border-white/10 bg-gl-panel/95 p-4 shadow-gl-toolbar backdrop-blur-xl"
        style={{ width: PANEL_WIDTH }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="text-[16px] font-semibold text-gl-text-primary">视频超清</div>
          <div className="rounded-gl-pill bg-white/[0.08] px-2.5 py-1 text-[12px] font-medium text-gl-text-muted">
            5-10 min
          </div>
        </div>

        <div className="space-y-4">
          <SegmentedField
            label="视频高清分辨率"
            value={targetResolution}
            options={RESOLUTION_OPTIONS}
            onChange={(value) =>
              handlePatch({ targetResolution: value as VideoUpscaleNodeData['targetResolution'] })
            }
          />
          <SegmentedField
            label="视频帧数"
            value={targetFps}
            options={FPS_OPTIONS}
            onChange={(value) =>
              handlePatch({ targetFps: value as VideoUpscaleNodeData['targetFps'] })
            }
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="min-w-0 text-[12px] text-gl-text-muted">
            {sourceVideoAvailable ? '已连接上游视频' : '未检测到上游视频'}
          </div>
          <div className="flex items-center gap-2">
            <div ref={advancedRef} className="group/tooltip relative">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-label="高级设置"
                className={[
                  'flex h-7 items-center justify-center rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors',
                  advancedOpen
                    ? 'bg-white/[0.12] text-gl-text-primary'
                    : 'text-gl-text-secondary hover:bg-white/[0.08] hover:text-gl-text-primary',
                ].join(' ')}
              >
                高级设置
              </button>
              <Tooltip label="高级设置" side="top" />

              {advancedOpen ? (
                <div
                  className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-[260px] rounded-[16px] border border-white/10 bg-[#17181b]/98 p-3 shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="mb-2 text-[13px] font-semibold text-gl-text-muted">实例类型</div>
                  <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-white/[0.06] p-1">
                    {INSTANCE_TYPE_OPTIONS.map((option) => {
                      const selected = option.value === instanceType;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            handlePatch({
                              instanceType: option.value as VideoUpscaleNodeData['instanceType'],
                            })
                          }
                          className={[
                            'h-9 rounded-[11px] text-[14px] font-semibold transition-colors',
                            selected
                              ? 'bg-white/[0.12] text-gl-text-primary'
                              : 'text-gl-text-muted hover:bg-white/[0.06] hover:text-gl-text-primary',
                          ].join(' ')}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="group/tooltip relative">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onRun?.()}
                disabled={!canRun}
                aria-label={isGenerating ? '处理中' : '开始超清'}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
              >
                <ArrowUp size={15} strokeWidth={2.4} />
              </button>
              <Tooltip label={isGenerating ? '处理中' : '开始超清'} side="top" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
});
