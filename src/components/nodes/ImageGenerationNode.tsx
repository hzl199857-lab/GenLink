'use client';

import React from 'react';
import NextImage from 'next/image';
import { Position } from 'reactflow';
import { Image as ImageIcon } from 'lucide-react';
import type { ImageGenerationNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { ImageGenerationNodeToolbar } from './ImageGenerationNodeToolbar';
import { ImageGenerationPromptBar } from './ImageGenerationPromptBar';

const MAX_CARD_EDGE = 540;
const MIN_CARD_EDGE = 220;
const CARD_ACCESSORY_TOP_SPACE = 64;
const CARD_ACCESSORY_GAP = 12;

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
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: ImageGenerationNodeProps) {
  const handlePromptChange = (next: string) => {
    onChange?.({
      ...data,
      prompt: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleModelChange = (next: string) => {
    onChange?.({
      ...data,
      model: next,
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

  const showAccessories = selected;
  const isGenerating = data.status === 'generating';
  const cardDimensions = resolveCardDimensions(data.aspectRatio, connectedImages, {
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
  });
  const cardStageHeight = MAX_CARD_EDGE + CARD_ACCESSORY_TOP_SPACE + CARD_ACCESSORY_GAP;
  const cardTopOffset = cardStageHeight - cardDimensions.height;
  const cardLeftOffset = Math.round((MAX_CARD_EDGE - cardDimensions.width) / 2);
  const previewImageUrl =
    data.generatedImageUrl ||
    data.referenceImageUrl ||
    connectedImages[0]?.imageUrl;

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
            top: `${Math.max(8, cardTopOffset - CARD_ACCESSORY_GAP - 18)}px`,
          }}
        >
          <ImageIcon size={12} />
          <span className="text-[11px] font-medium leading-none">{data.title || 'Image'}</span>
        </div>

        <ImageGenerationNodeToolbar
          visible={selected}
          top={Math.max(0, cardTopOffset - CARD_ACCESSORY_TOP_SPACE)}
          onUpload={onUpload}
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
              isGenerating
                ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
                : selected
                  ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_8px_rgba(255,255,255,0.08)]'
                  : 'border-gl-stroke-subtle',
            ].join(' ')}
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
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={showAccessories}
          cardTopOffset={cardTopOffset}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={showAccessories}
          cardTopOffset={cardTopOffset}
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
        count={data.count}
        connectedImages={connectedImages}
        onPromptChange={handlePromptChange}
        onModelChange={handleModelChange}
        onAspectRatioChange={handleAspectRatioChange}
        onQualityChange={handleQualityChange}
        onDetailChange={handleDetailChange}
        onRun={onRun}
        onAddReference={onUpload}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
}
