'use client';

import React, { memo, useEffect, useState } from 'react';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { Download, Expand, FolderPlus, Link, Upload, Video } from 'lucide-react';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { Tooltip } from '@/components/ui/Tooltip';
import { VideoGenerationPromptBar } from './VideoGenerationPromptBar';
import { useCanvasStore } from '@/store/canvas-store';
import type { VideoGenerationMode, VideoGenerationNodeData } from '@/types/canvas';
import { VideoPlayer } from './VideoPlayer';

const MAX_CARD_EDGE = 540;
const MIN_CARD_EDGE = 220;
const CARD_ACCESSORY_TOP_SPACE = 64;
const CARD_ACCESSORY_GAP = 12;
const CARD_TOOLBAR_LIFT = 30;

export type VideoGenerationToolbarAction =
  | 'upload'
  | 'download'
  | 'copy-link'
  | 'organize'
  | 'expand';

export interface VideoGenerationNodeProps {
  id?: string;
  data: VideoGenerationNodeData;
  cardDimensions?: { width: number; height: number };
  selected?: boolean;
  dragging?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
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
  onChange?: (next: VideoGenerationNodeData) => void;
  onRun?: (promptOverride?: string) => void;
  onUpload?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onToolbarAction?: (action: VideoGenerationToolbarAction) => void;
  onSelectNode?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
  promptFocusRequestId?: number;
}

function ToolbarIconButton({
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
        className="nodrag nopan flex h-10 w-10 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
        aria-label={title}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick?.();
        }}
      >
        {children}
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

function UploadToolbarButton({
  title,
  onClick,
}: {
  title: string;
  onClick?: () => void;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        className="flex h-[40px] items-center gap-2 rounded-gl-pill border border-white/10 bg-gl-panel/95 px-4 text-[15px] font-medium text-gl-text-primary shadow-gl-toolbar backdrop-blur-md transition-colors hover:bg-gl-panel-hover"
        aria-label={title}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick?.();
        }}
      >
        <Upload size={15} />
        <span>上传</span>
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

function VideoToolbar({
  visible,
  top,
  hasVideo,
  onAction,
}: {
  visible: boolean;
  top: number;
  hasVideo: boolean;
  onAction?: (action: VideoGenerationToolbarAction) => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      data-canvas-menu-ignore="true"
      className="absolute left-1/2 z-20 -translate-x-1/2"
      style={{ top }}
    >
      {hasVideo ? (
        <div
          className="flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ToolbarIconButton title="下载" onClick={() => onAction?.('download')}>
            <Download size={16} strokeWidth={1.9} />
          </ToolbarIconButton>
          <ToolbarIconButton title="复制链接" onClick={() => onAction?.('copy-link')}>
            <Link size={16} strokeWidth={1.9} />
          </ToolbarIconButton>
          <ToolbarIconButton title="加入素材库" onClick={() => onAction?.('organize')}>
            <FolderPlus size={16} strokeWidth={1.9} />
          </ToolbarIconButton>
          <ToolbarIconButton title="放大查看" onClick={() => onAction?.('expand')}>
            <Expand size={16} strokeWidth={1.9} />
          </ToolbarIconButton>
        </div>
      ) : (
        <UploadToolbarButton title="上传参考素材" onClick={() => onAction?.('upload')} />
      )}
    </div>
  );
}

function GeneratedVideo({
  src,
  poster,
  durationSeconds,
}: {
  src: string;
  poster?: string;
  durationSeconds?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center px-8 text-center text-[13px] leading-5 text-gl-error">
        Video failed to load
      </div>
    );
  }

  return (
    <VideoPlayer
      src={src}
      poster={poster}
      durationSeconds={durationSeconds}
      className="absolute inset-0"
      onError={() => setFailed(true)}
    />
  );
}

export const VideoGenerationNode = memo(function VideoGenerationNode({
  id,
  data,
  cardDimensions,
  selected = false,
  dragging = false,
  connectedImages = [],
  connectedVideos = [],
  onChange,
  onRun,
  onUpload,
  onTitleChange,
  onToolbarAction,
  onSelectNode,
  onPromptPointerDown,
  onPromptFocusWithinChange,
  promptFocusRequestId,
}: VideoGenerationNodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const deleteIncomingEdges = useCanvasStore((state) => state.deleteIncomingEdges);
  const deleteIncomingVideoEdges = useCanvasStore((state) => state.deleteIncomingVideoEdges);
  const toolbarVisible = selected && !dragging;
  const isGenerating = data.status === 'generating';
  const videoUrl = data.hostedVideoUrl?.trim() || data.videoUrl?.trim() || '';
  const hasVideo = Boolean(videoUrl);
  const resolvedCardDimensions = cardDimensions ?? { width: MAX_CARD_EDGE, height: MIN_CARD_EDGE };
  const cardStageHeight = MAX_CARD_EDGE + CARD_ACCESSORY_TOP_SPACE + CARD_ACCESSORY_GAP;
  const cardTopOffset = cardStageHeight - resolvedCardDimensions.height;
  const cardLeftOffset = Math.round((MAX_CARD_EDGE - resolvedCardDimensions.width) / 2);
  const toolbarTop = cardTopOffset - CARD_ACCESSORY_TOP_SPACE - CARD_TOOLBAR_LIFT;

  useEffect(() => {
    if (!id) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    cardLeftOffset,
    cardStageHeight,
    cardTopOffset,
    id,
    resolvedCardDimensions.height,
    resolvedCardDimensions.width,
    updateNodeInternals,
  ]);

  const handlePatch = (partial: Partial<VideoGenerationNodeData>) => {
    onChange?.({
      ...data,
      ...partial,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleProviderModelChange = (next: { provider: 'comfly'; model: string }) => {
    handlePatch({
      provider: next.provider,
      model: next.model,
    });
  };

  const handleModeChange = (nextMode: VideoGenerationMode) => {
    if (nextMode === 'text-to-video') {
      deleteIncomingEdges(id || '');
    } else if (nextMode !== 'all-reference' && connectedVideos.length > 0) {
      deleteIncomingVideoEdges(id || '');
    }

    handlePatch({
      mode: nextMode,
    });
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: `${MAX_CARD_EDGE}px` }}>
      <div
        className="relative mx-auto"
        style={{
          width: `${MAX_CARD_EDGE}px`,
          height: `${cardStageHeight}px`,
        }}
      >
        <div
          className="node-visible-title absolute z-20 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan whitespace-nowrap transition-[top,left,transform] duration-300 ease-out"
          style={{
            left: `${cardLeftOffset}px`,
            top: `${Math.max(0, cardTopOffset - CARD_ACCESSORY_GAP - 26)}px`,
          }}
        >
          <Video size={22} />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Video"
            className="text-[22px] font-medium leading-none"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
        </div>

        <VideoToolbar
          visible={toolbarVisible}
          top={toolbarTop}
          hasVideo={hasVideo}
          onAction={(action) => {
            if (action === 'upload') {
              onUpload?.();
              return;
            }
            onToolbarAction?.(action);
          }}
        />

        <div
          className="absolute left-1/2 bottom-0 transition-[width,height,transform] duration-300 ease-out"
          style={{
            width: `${resolvedCardDimensions.width}px`,
            height: `${resolvedCardDimensions.height}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className={[
              'node-connectable-card image-generation-node-drag-handle relative h-full w-full rounded-gl-lg border bg-gl-panel shadow-gl-card',
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
            {videoUrl ? (
              <GeneratedVideo src={videoUrl} poster={data.lastFrameUrl} durationSeconds={data.duration} />
            ) : data.status === 'error' && data.errorMessage ? (
              <div className="max-w-[78%] whitespace-pre-line text-center text-[13px] leading-5 text-gl-error">
                {data.errorMessage}
              </div>
            ) : (
              <Video size={48} className="text-gl-text-muted" />
            )}
          </div>
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={toolbarVisible}
          disabled={data.mode === 'text-to-video'}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={resolvedCardDimensions.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={toolbarVisible}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={resolvedCardDimensions.width}
        />
      </div>

      <VideoGenerationPromptBar
        visible={toolbarVisible}
        prompt={data.prompt || ''}
        provider={data.provider || 'comfly'}
        model={data.model}
        mode={data.mode}
        ratio={data.ratio}
        resolution={data.resolution}
        duration={data.duration}
        generateAudio={data.generateAudio}
        generating={isGenerating}
        connectedImages={connectedImages}
        connectedVideos={connectedVideos}
        focusRequestId={promptFocusRequestId}
        onUpload={onUpload}
        onPromptChange={(next) => handlePatch({ prompt: next })}
        onProviderModelChange={handleProviderModelChange}
        onModeChange={handleModeChange}
        onRatioChange={(next) => handlePatch({ ratio: next })}
        onResolutionChange={(next) => handlePatch({ resolution: next })}
        onDurationChange={(next) => handlePatch({ duration: next })}
        onGenerateAudioChange={(next) => handlePatch({ generateAudio: next })}
        onRun={onRun}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={(focused) => {
          onPromptFocusWithinChange?.(focused);
        }}
      />
    </div>
  );
});
