'use client';

import React, { useEffect } from 'react';
import NextImage from 'next/image';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { Image as ImageIcon } from 'lucide-react';
import type { ImageGenerationNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import {
  ImageGenerationNodeToolbar,
  type ImageGenerationToolbarAction,
} from './ImageGenerationNodeToolbar';
import { ImageGenerationPromptBar } from './ImageGenerationPromptBar';

const MAX_CARD_EDGE = 540;
const MIN_CARD_EDGE = 220;
const CARD_ACCESSORY_TOP_SPACE = 64;
const CARD_ACCESSORY_GAP = 12;
const CARD_TOOLBAR_LIFT = 30;
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

export interface ImageGenerationNodeProps {
  id?: string;
  data: ImageGenerationNodeData;
  selected?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    alt: string;
    width?: number;
    height?: number;
  }>;
  onChange?: (next: ImageGenerationNodeData) => void;
  onRun?: () => void;
  onUpload?: () => void;
  onToolbarAction?: (action: ImageGenerationToolbarAction) => void;
  onImageCardClick?: (data: ImageGenerationNodeData) => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}

function parseAspectRatioValue(value?: string): number | null {
  if (!value || value === 'auto') {
    return null;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

function resolveCardDimensions(
  aspectRatio?: string,
  connectedImages?: Array<{
    width?: number;
    height?: number;
  }>,
  generatedImage?: {
    width?: number;
    height?: number;
  },
): { width: number; height: number } {
  const autoImage =
    generatedImage?.width && generatedImage?.height
      ? generatedImage
      : connectedImages?.[0];
  const autoAspectRatio =
    autoImage?.width && autoImage?.height && autoImage.width > 0 && autoImage.height > 0
      ? autoImage.width / autoImage.height
      : null;
  const resolvedAspectRatio =
    parseAspectRatioValue(aspectRatio) ?? autoAspectRatio ?? 16 / 9;

  if (resolvedAspectRatio >= 1) {
    const width = MAX_CARD_EDGE;
    const height = Math.max(
      MIN_CARD_EDGE,
      Math.round(width / resolvedAspectRatio),
    );

    return { width, height };
  }

  const height = MAX_CARD_EDGE;
  const width = Math.max(
    MIN_CARD_EDGE,
    Math.round(height * resolvedAspectRatio),
  );

  return { width, height };
}

export function ImageGenerationNode({
  id,
  data,
  selected = false,
  connectedImages = [],
  onChange,
  onRun,
  onUpload,
  onToolbarAction,
  onImageCardClick,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: ImageGenerationNodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();

  const handlePromptChange = (next: string) => {
    onChange?.({
      ...data,
      prompt: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleModelChange = (next: string) => {
    const nextAspectRatio =
      next === GEMINI_IMAGE_MODEL && (!data.aspectRatio || data.aspectRatio === 'auto' || data.aspectRatio === '9:21')
        ? '1:1'
        : data.aspectRatio;

    onChange?.({
      ...data,
      model: next,
      aspectRatio: nextAspectRatio,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleAspectRatioChange = (next: string) => {
    onChange?.({
      ...data,
      aspectRatio: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleQualityChange = (next: string) => {
    onChange?.({
      ...data,
      quality: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleDetailChange = (next: string) => {
    onChange?.({
      ...data,
      detail: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleOutputFormatChange = (next: string) => {
    onChange?.({
      ...data,
      outputFormat: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleModerationChange = (next: string) => {
    onChange?.({
      ...data,
      moderation: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const showAccessories = selected;
  const isGenerating = data.status === 'generating';
  const cardDimensions = resolveCardDimensions(data.aspectRatio, connectedImages, {
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
  });
  const cardStageHeight = MAX_CARD_EDGE + CARD_ACCESSORY_TOP_SPACE + CARD_ACCESSORY_GAP;
  const cardTopOffset = cardStageHeight - cardDimensions.height;
  const cardLeftOffset = Math.round((MAX_CARD_EDGE - cardDimensions.width) / 2);
  const toolbarTop = cardTopOffset - CARD_ACCESSORY_TOP_SPACE - CARD_TOOLBAR_LIFT;
  const previewImageUrl =
    data.generatedHostedImageUrl ||
    data.generatedImageUrl;
  const hasGeneratedImage = Boolean(
    data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim(),
  );

  useEffect(() => {
    if (!id) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    cardDimensions.height,
    cardDimensions.width,
    cardLeftOffset,
    cardTopOffset,
    id,
    updateNodeInternals,
  ]);

  return (
    <div
      className="relative group node-connectable-root"
      style={{ width: `${MAX_CARD_EDGE}px` }}
    >
      <div
        className="relative mx-auto"
        style={{
          width: `${MAX_CARD_EDGE}px`,
          height: `${cardStageHeight}px`,
        }}
      >
        <div
          className="absolute z-20 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan whitespace-nowrap transition-[top,left,transform] duration-300 ease-out"
          style={{
            left: `${cardLeftOffset}px`,
            top: `${Math.max(0, cardTopOffset - CARD_ACCESSORY_GAP - 26)}px`,
          }}
        >
          <ImageIcon size={24} />
          <span className="text-[22px] font-medium leading-none">{data.title || 'Image'}</span>
        </div>

        <ImageGenerationNodeToolbar
          visible={selected}
          top={toolbarTop}
          hasGeneratedImage={hasGeneratedImage}
          onUpload={onUpload}
          onAction={onToolbarAction}
        />

        <div
          className="absolute left-1/2 bottom-0 transition-[width,height,transform] duration-300 ease-out"
          style={{
            width: `${cardDimensions.width}px`,
            height: `${cardDimensions.height}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className={[
              'node-connectable-card relative h-full w-full rounded-gl-lg border bg-gl-panel shadow-gl-card',
              'flex items-center justify-center overflow-hidden transition-[border-color,box-shadow] duration-300 ease-out',
              hasGeneratedImage ? 'cursor-pointer' : '',
              isGenerating
                ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
                : selected
                  ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_8px_rgba(255,255,255,0.08)]'
                  : 'border-gl-stroke-subtle',
            ].join(' ')}
            onClick={() => {
              if (!hasGeneratedImage) {
                return;
              }

              onImageCardClick?.(data);
            }}
          >
            {previewImageUrl ? (
              <NextImage
                src={previewImageUrl}
                alt={data.prompt?.trim() || 'Generated image'}
                fill
                unoptimized
                sizes={`${cardDimensions.width}px`}
                className="object-cover"
              />
            ) : (
              <ImageIcon size={44} className="text-gl-text-muted" />
            )}
          </div>

          {data.status === 'error' && data.errorMessage ? (
            <div className="absolute left-0 right-0 -bottom-6 px-1 text-center text-[11px] text-gl-error">
              {data.errorMessage}
            </div>
          ) : null}
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={showAccessories}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={cardDimensions.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={showAccessories}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={cardDimensions.width}
        />
      </div>

      <ImageGenerationPromptBar
        nodeId={id}
        visible={selected}
      prompt={data.prompt || ''}
      model={data.model}
      aspectRatio={data.aspectRatio}
      quality={data.quality}
      detail={data.detail}
      outputFormat={data.outputFormat}
      moderation={data.moderation}
      count={data.count}
      connectedImages={connectedImages}
      onPromptChange={handlePromptChange}
      onModelChange={handleModelChange}
      onAspectRatioChange={handleAspectRatioChange}
      onQualityChange={handleQualityChange}
      onDetailChange={handleDetailChange}
      onOutputFormatChange={handleOutputFormatChange}
      onModerationChange={handleModerationChange}
      onRun={onRun}
        onAddReference={onUpload}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
}
