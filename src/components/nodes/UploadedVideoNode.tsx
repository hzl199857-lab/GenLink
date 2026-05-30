'use client';

import React from 'react';
import { Position } from 'reactflow';
import { Upload, Video } from 'lucide-react';
import type { VideoNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { VideoPlayer } from './VideoPlayer';

export interface UploadedVideoNodeProps {
  data: VideoNodeData;
  selected?: boolean;
  accessoriesVisible?: boolean;
  onReplace?: (file: File) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  controlsVisible?: boolean;
  onLoadedMetadata?: (durationSeconds: number) => void;
}

const MAX_CARD_WIDTH = 420;
const MAX_CARD_HEIGHT = 540;
const MIN_CARD_WIDTH = 300;

function getNodeDisplayTitle(data: VideoNodeData): string | undefined {
  return data.title || data.fileName;
}

export function resolveUploadedVideoCardDimensions(
  data: VideoNodeData,
): { width: number; height: number } {
  if (data.displayWidth && data.displayHeight && data.displayWidth > 0 && data.displayHeight > 0) {
    return {
      width: data.displayWidth,
      height: data.displayHeight,
    };
  }

  const videoWidth = Math.max(data.width || 320, 1);
  const videoHeight = Math.max(data.height || 180, 1);
  const videoAspectRatio = videoWidth / videoHeight;
  const fittedWidthByHeight = MAX_CARD_HEIGHT * videoAspectRatio;
  const width = Math.min(
    MAX_CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, Math.min(videoWidth, fittedWidthByHeight)),
  );

  return {
    width,
    height: width * (videoHeight / videoWidth),
  };
}

export function UploadedVideoNode({
  data,
  selected = false,
  accessoriesVisible = selected,
  onReplace,
  onTitleChange,
  onSelectNode,
  videoRef,
  controlsVisible = true,
  onLoadedMetadata,
}: UploadedVideoNodeProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cardDimensions = resolveUploadedVideoCardDimensions(data);
  const showAccessories = accessoriesVisible;
  const canReplace = Boolean(onReplace);
  const displayTitle = getNodeDisplayTitle(data);
  const videoUrl = data.hostedVideoUrl?.trim() || data.videoUrl.trim();
  const useTightReplaceButton = cardDimensions.width < 310 || cardDimensions.height < 140;
  const useCompactReplaceButton = cardDimensions.width < 340 || cardDimensions.height < 180;
  const replaceButtonClassName = useTightReplaceButton
    ? 'right-2 top-2 rounded-[8px] px-2 py-1 text-[11px]'
    : useCompactReplaceButton
      ? 'right-2.5 top-2.5 rounded-[9px] px-2.5 py-1.5 text-[12px]'
      : 'right-3 top-3 rounded-[10px] px-3 py-2 text-[14px]';
  const replaceButtonGapClassName = useTightReplaceButton ? 'gap-1' : useCompactReplaceButton ? 'gap-1.5' : 'gap-2';
  const replaceIconSize = useTightReplaceButton ? 13 : useCompactReplaceButton ? 15 : 16;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onReplace?.(file);
      event.target.value = '';
    }
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: cardDimensions.width }}>
      <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <Video size={24} />
        <EditableNodeTitle
          value={displayTitle}
          fallbackValue="video"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border border-transparent bg-black shadow-gl-card cursor-grab transition-all duration-150',
          selected
            ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
            : 'shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ aspectRatio: `${Math.max(data.width || 320, 1)} / ${Math.max(data.height || 180, 1)}` }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
        }}
      >
        {videoUrl ? (
          <VideoPlayer
            src={videoUrl}
            poster={data.previewUrl}
            videoRef={videoRef}
            controlsVisible={controlsVisible}
            durationSeconds={data.durationSeconds}
            onLoadedMetadata={onLoadedMetadata}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
            <Video size={28} />
          </div>
        )}

        {canReplace ? (
          <>
            <button
              type="button"
              aria-label="替换视频"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
              className={[
                'nodrag nopan absolute z-10 flex items-center justify-center bg-black/65 font-semibold text-white opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-opacity group-hover:opacity-100',
                showAccessories ? '' : 'pointer-events-none group-hover:opacity-0',
                replaceButtonClassName,
                replaceButtonGapClassName,
              ].join(' ')}
            >
              <Upload size={replaceIconSize} />
              <span>替换</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        ) : null}

      </div>

      <CardSideHandle
        type="target"
        position={Position.Left}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={cardDimensions.width}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={cardDimensions.width}
      />
    </div>
  );
}
