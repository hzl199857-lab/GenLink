'use client';

import React, { memo } from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Ban, Music2, Upload } from 'lucide-react';
import type {
  AudioGenerationNodeData,
  AudioGenerationTaskType,
} from '@/types/canvas';
import {
  ReferenceMediaStrip,
  type ReferenceMediaStripAudio,
} from './ReferenceMediaStrip';
import {
  useReferenceImageHoverPreview,
  useReferenceVideoHoverPreview,
} from './ReferenceImageHoverPreview';
import { Tooltip } from '@/components/ui/Tooltip';

const TASK_TYPE_OPTIONS: Array<{ id: AudioGenerationTaskType; label: string }> = [
  { id: 'general', label: '通用音频' },
  { id: 'voiceover', label: '旁白' },
  { id: 'music', label: '配乐' },
  { id: 'sound-effect', label: '音效' },
];

export interface AudioGenerationPromptBarProps {
  visible: boolean;
  prompt: string;
  runningHubWorkflowId?: string;
  taskType?: AudioGenerationTaskType;
  duration?: number;
  style?: string;
  voice?: string;
  referenceAudio?: ReferenceMediaStripAudio[];
  onPromptChange?: (next: string) => void;
  onPatch?: (next: Partial<AudioGenerationNodeData>) => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.02em] text-gl-text-muted">
      {children}
    </label>
  );
}

export const AudioGenerationPromptBar = memo(function AudioGenerationPromptBar({
  visible,
  prompt,
  runningHubWorkflowId = '',
  taskType = 'general',
  duration = 10,
  style = '',
  voice = '',
  referenceAudio = [],
  onPromptChange,
  onPatch,
  onUpload,
  onQuickReferenceConnect,
  onRemoveReference,
  onPointerDownWithin,
  onFocusWithinChange,
}: AudioGenerationPromptBarProps) {
  const imagePreview = useReferenceImageHoverPreview();
  const videoPreview = useReferenceVideoHoverPreview();

  return (
    <NodeToolbar isVisible={visible} position={Position.Bottom} offset={16} align="center">
      <div
        data-canvas-menu-ignore="true"
        className="text-node-prompt-bar relative w-[720px] max-w-[calc(100vw-48px)] rounded-[22px] border border-white/10 bg-gl-panel/95 px-4 py-3 shadow-gl-toolbar backdrop-blur-xl"
        onPointerDown={onPointerDownWithin}
        onFocusCapture={() => onFocusWithinChange?.(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }
          onFocusWithinChange?.(false);
        }}
      >
        <div className="flex items-start gap-3">
          <ReferenceMediaStrip
            connectedImages={[]}
            connectedVideos={[]}
            connectedAudio={referenceAudio}
            imagePreview={imagePreview}
            videoPreview={videoPreview}
            quickConnectTitle="快速连接参考音频"
            addTitle="上传参考音频"
            onQuickReferenceConnect={onQuickReferenceConnect}
            onAddReference={onUpload}
            onRemoveReference={onRemoveReference}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <textarea
              value={prompt}
              placeholder="描述你想生成或处理的音频"
              onChange={(event) => onPromptChange?.(event.target.value)}
              className="nodrag nopan min-h-[72px] resize-none rounded-[14px] border border-white/10 bg-black/20 px-3 py-2 text-[14px] leading-5 text-gl-text-primary outline-none transition focus:border-white/20"
            />

            <div className="grid grid-cols-[1.1fr_1fr_0.75fr_1fr_1fr] gap-2">
              <FieldLabel>
                <span>Workflow</span>
                <input
                  value={runningHubWorkflowId}
                  placeholder="RunningHub workflow ID"
                  onChange={(event) => onPatch?.({ runningHubWorkflowId: event.target.value })}
                  className="nodrag nopan h-9 min-w-0 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 text-[12px] normal-case tracking-normal text-gl-text-primary outline-none focus:border-white/20"
                />
              </FieldLabel>
              <FieldLabel>
                <span>类型</span>
                <select
                  value={taskType}
                  onChange={(event) =>
                    onPatch?.({ taskType: event.target.value as AudioGenerationTaskType })
                  }
                  className="nodrag nopan h-9 min-w-0 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 text-[12px] normal-case tracking-normal text-gl-text-primary outline-none focus:border-white/20"
                >
                  {TASK_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel>
                <span>时长</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={duration}
                  onChange={(event) => onPatch?.({ duration: Number(event.target.value) || 1 })}
                  className="nodrag nopan h-9 min-w-0 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 text-[12px] normal-case tracking-normal text-gl-text-primary outline-none focus:border-white/20"
                />
              </FieldLabel>
              <FieldLabel>
                <span>风格</span>
                <input
                  value={style}
                  placeholder="可选"
                  onChange={(event) => onPatch?.({ style: event.target.value })}
                  className="nodrag nopan h-9 min-w-0 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 text-[12px] normal-case tracking-normal text-gl-text-primary outline-none focus:border-white/20"
                />
              </FieldLabel>
              <FieldLabel>
                <span>声音</span>
                <input
                  value={voice}
                  placeholder="可选"
                  onChange={(event) => onPatch?.({ voice: event.target.value })}
                  className="nodrag nopan h-9 min-w-0 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 text-[12px] normal-case tracking-normal text-gl-text-primary outline-none focus:border-white/20"
                />
              </FieldLabel>
            </div>
          </div>

          <div className="flex w-[118px] shrink-0 flex-col gap-2">
            <div className="flex h-9 items-center justify-center gap-1.5 rounded-gl-pill border border-white/10 bg-white/[0.04] text-[13px] font-semibold text-gl-text-secondary">
              <Music2 size={14} />
              RunningHub
            </div>
            <div className="group/tooltip relative">
              <button
                type="button"
                disabled
                className="flex h-10 w-full items-center justify-center gap-2 rounded-gl-pill bg-white/10 px-4 text-[13px] font-semibold text-gl-text-muted opacity-60"
              >
                <Ban size={14} />
                待接入
              </button>
              <Tooltip label="RunningHub 音频工作流尚未接入" side="top" />
            </div>
            <button
              type="button"
              onClick={onUpload}
              className="nodrag nopan flex h-9 items-center justify-center gap-1.5 rounded-gl-pill border border-white/10 text-[13px] font-semibold text-gl-text-secondary transition hover:border-white/18 hover:bg-white/[0.06] hover:text-gl-text-primary"
            >
              <Upload size={14} />
              上传参考
            </button>
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
});
