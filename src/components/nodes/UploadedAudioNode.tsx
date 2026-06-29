'use client';

import React from 'react';
import { Position } from 'reactflow';
import { Copy, Download, Upload, Volume2 } from 'lucide-react';
import type { AudioNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { Tooltip } from '@/components/ui/Tooltip';

export interface UploadedAudioNodeProps {
  data: AudioNodeData;
  selected?: boolean;
  accessoriesVisible?: boolean;
  onReplace?: (file: File) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onLoadedMetadata?: (durationSeconds: number) => void;
  onDownload?: () => void;
  onCopyLink?: () => void;
}

export const UPLOADED_AUDIO_CARD_WIDTH = 420;
export const UPLOADED_AUDIO_CARD_HEIGHT = 172;

function getNodeDisplayTitle(data: AudioNodeData): string | undefined {
  return data.title || data.fileName;
}

function AudioIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-black/65 text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition hover:bg-white hover:text-[#17191d]"
      >
        {children}
      </button>
      <Tooltip label={label} side="top" />
    </div>
  );
}

export function UploadedAudioNode({
  data,
  selected = false,
  accessoriesVisible = selected,
  onReplace,
  onTitleChange,
  onSelectNode,
  onLoadedMetadata,
  onDownload,
  onCopyLink,
}: UploadedAudioNodeProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const displayTitle = getNodeDisplayTitle(data);
  const audioUrl = data.hostedAudioUrl?.trim() || data.audioUrl.trim();
  const showAccessories = accessoriesVisible;
  const isUploading = data.status === 'generating';
  const isError = data.status === 'error';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onReplace?.(file);
      event.target.value = '';
    }
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: UPLOADED_AUDIO_CARD_WIDTH }}>
      <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <Volume2 size={24} />
        <EditableNodeTitle
          value={displayTitle}
          fallbackValue="Audio"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border bg-[#181a1d] shadow-gl-card cursor-grab transition-all duration-150',
          isUploading
            ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
            : '',
          selected
            ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
            : 'border-gl-stroke-subtle shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ width: UPLOADED_AUDIO_CARD_WIDTH, height: UPLOADED_AUDIO_CARD_HEIGHT }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
        }}
      >
        {audioUrl ? (
          <AudioWaveformPlayer
            src={audioUrl}
            title={displayTitle}
            durationSeconds={data.durationSeconds}
            onLoadedMetadata={onLoadedMetadata}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
            <Volume2 size={34} />
          </div>
        )}

        <div
          className={[
            'nodrag nopan absolute right-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100',
            showAccessories ? '' : 'pointer-events-none group-hover:opacity-0',
          ].join(' ')}
        >
          <AudioIconButton
            label="Replace audio"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <Upload size={15} />
          </AudioIconButton>
          <AudioIconButton
            label="Download audio"
            onClick={(event) => {
              event.stopPropagation();
              onDownload?.();
            }}
          >
            <Download size={15} />
          </AudioIconButton>
          <AudioIconButton
            label="Copy audio link"
            onClick={(event) => {
              event.stopPropagation();
              onCopyLink?.();
            }}
          >
            <Copy size={15} />
          </AudioIconButton>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {isUploading ? (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-[8px] bg-black/70 px-2.5 py-1.5 text-center text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {data.statusMessage || 'Uploading...'}
          </div>
        ) : null}

        {isError ? (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-[8px] bg-red-600/85 px-2.5 py-1.5 text-center text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {data.errorMessage || 'Upload failed'}
          </div>
        ) : null}
      </div>

      <CardSideHandle
        type="target"
        position={Position.Left}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={UPLOADED_AUDIO_CARD_WIDTH}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={UPLOADED_AUDIO_CARD_WIDTH}
      />
    </div>
  );
}
