'use client';

import React, { memo, useEffect } from 'react';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { Volume2 } from 'lucide-react';
import type { AudioGenerationNodeData } from '@/types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import {
  AudioGenerationPromptBar,
} from './AudioGenerationPromptBar';
import type { ReferenceMediaStripAudio } from './ReferenceMediaStrip';
import {
  UPLOADED_AUDIO_CARD_HEIGHT,
  UPLOADED_AUDIO_CARD_WIDTH,
} from './UploadedAudioNode';

const RESULT_CARD_WIDTH = UPLOADED_AUDIO_CARD_WIDTH;
const RESULT_CARD_HEIGHT = UPLOADED_AUDIO_CARD_HEIGHT;
const CARD_ACCESSORY_GAP = 12;

export const AUDIO_GENERATION_NODE_WIDTH = RESULT_CARD_WIDTH;
export const AUDIO_GENERATION_RESULT_CARD_WIDTH = RESULT_CARD_WIDTH;
export const AUDIO_GENERATION_RESULT_CARD_HEIGHT = RESULT_CARD_HEIGHT;

export interface AudioGenerationNodeProps {
  id?: string;
  data: AudioGenerationNodeData;
  selected?: boolean;
  dragging?: boolean;
  referenceAudio?: ReferenceMediaStripAudio[];
  onChange?: (next: AudioGenerationNodeData) => void;
  onRun?: () => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}

export const AudioGenerationNode = memo(function AudioGenerationNode({
  id,
  data,
  selected = false,
  dragging = false,
  referenceAudio = [],
  onChange,
  onRun,
  onUpload,
  onQuickReferenceConnect,
  onRemoveReference,
  onTitleChange,
  onSelectNode,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: AudioGenerationNodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const toolbarVisible = selected && !dragging;
  const isGenerating = data.status === 'generating';
  const audioUrl = data.hostedAudioUrl?.trim() || data.audioUrl?.trim() || '';
  const hasAudio = Boolean(audioUrl);
  const titleTop = -(CARD_ACCESSORY_GAP + 26);

  useEffect(() => {
    if (!id) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [id, updateNodeInternals]);

  const handlePatch = (partial: Partial<AudioGenerationNodeData>) => {
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
        width: `${RESULT_CARD_WIDTH}px`,
        height: `${RESULT_CARD_HEIGHT}px`,
      }}
    >
        <div
          className="node-visible-title pointer-events-none absolute z-20 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan whitespace-nowrap transition-[top,left,transform] duration-300 ease-out"
          style={{
            left: 0,
            top: `${titleTop}px`,
          }}
        >
          <Volume2 size={22} className="pointer-events-auto" />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Audio"
            className="pointer-events-auto text-[22px] font-medium leading-none"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
        </div>

        <div
          className="absolute inset-0 transition-[width,height] duration-300 ease-out"
          style={{
            width: `${RESULT_CARD_WIDTH}px`,
            height: `${RESULT_CARD_HEIGHT}px`,
          }}
        >
          <div
            className={[
              'node-connectable-card image-generation-node-drag-handle pointer-events-auto relative h-full w-full rounded-gl-lg border bg-gl-panel shadow-gl-card',
              'flex items-center justify-center overflow-hidden transition-[border-color,box-shadow] duration-300 ease-out',
              'cursor-grab',
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
            {hasAudio ? (
              <AudioWaveformPlayer
                src={audioUrl}
                title={(data.songTitleEdited ? data.songTitle : '') || data.generatedAudioTitle}
                durationSeconds={data.durationSeconds}
              />
            ) : data.status === 'error' && data.errorMessage ? (
              <div className="max-w-[78%] whitespace-pre-line text-center text-[13px] leading-5 text-gl-error">
                {data.errorMessage}
              </div>
            ) : (
              <Volume2 size={48} className="text-gl-text-muted" />
            )}
          </div>
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={toolbarVisible}
          cardWidth={RESULT_CARD_WIDTH}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={toolbarVisible}
          cardWidth={RESULT_CARD_WIDTH}
        />

      <AudioGenerationPromptBar
        visible={toolbarVisible}
        prompt={data.prompt || ''}
        provider={data.provider || 'comfly'}
        model={data.model || 'suno-v5.5'}
        mode={data.mode || 'inspiration'}
        title={data.songTitleEdited ? data.songTitle || '' : ''}
        style={data.style || ''}
        instrumental={data.instrumental === true}
        generating={isGenerating}
        referenceAudio={referenceAudio}
        onUpload={onUpload}
        onQuickReferenceConnect={onQuickReferenceConnect}
        onRemoveReference={onRemoveReference}
        onPromptChange={(next) => handlePatch({ prompt: next })}
        onProviderModelChange={(next) => handlePatch(next)}
        onProviderChange={(next) => handlePatch({ provider: next })}
        onModelChange={(next) => handlePatch({ model: next })}
        onModeChange={(next) => handlePatch({ mode: next })}
        onTitleChange={(next) => handlePatch({ songTitle: next, songTitleEdited: true })}
        onStyleChange={(next) => handlePatch({ style: next })}
        onInstrumentalChange={(next) => handlePatch({ instrumental: next })}
        onRun={onRun}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
});
