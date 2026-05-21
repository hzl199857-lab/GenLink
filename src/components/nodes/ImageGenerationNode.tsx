'use client';

import React, { memo, useEffect, useState } from 'react';
import NextImage from 'next/image';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { ChevronDown, Image as ImageIcon } from 'lucide-react';
import type {
  ImageGenerationNodeData,
  ImageGenerationResultItem,
} from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import {
  ImageGenerationNodeToolbar,
  type ImageGenerationToolbarAction,
} from './ImageGenerationNodeToolbar';
import { ImageGenerationPromptBar } from './ImageGenerationPromptBar';
import { Tooltip } from '@/components/ui/Tooltip';

const MAX_CARD_EDGE = 540;
const MIN_CARD_EDGE = 220;
const CARD_ACCESSORY_TOP_SPACE = 64;
const CARD_ACCESSORY_GAP = 12;
const CARD_TOOLBAR_LIFT = 30;
const NANO_BANANA_MODEL_PREFIX = 'nano-banana';

export interface ImageGenerationNodeProps {
  id?: string;
  data: ImageGenerationNodeData;
  selected?: boolean;
  dragging?: boolean;
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
  onTitleChange?: (nextTitle: string | undefined) => void;
  onToolbarAction?: (action: ImageGenerationToolbarAction) => void;
  onOpenLightbox?: (data: ImageGenerationNodeData) => void;
  onImageCardClick?: () => void;
  onSelectNode?: () => void;
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

function getResultImageUrl(result: ImageGenerationResultItem): string {
  return result.hostedImageUrl?.trim() || result.imageUrl?.trim() || '';
}

function getDisplayResults(data: ImageGenerationNodeData): ImageGenerationResultItem[] {
  if (data.generationResults?.length) {
    return data.generationResults;
  }

  if (data.generatedImageUrl?.trim() || data.generatedHostedImageUrl?.trim()) {
    return [
      {
        status: 'completed',
        imageUrl: data.generatedImageUrl,
        hostedImageUrl: data.generatedHostedImageUrl,
        model: data.generatedModel,
        width: data.generatedImageWidth,
        height: data.generatedImageHeight,
        format: data.generatedImageFormat,
        sizeBytes: data.generatedImageSizeBytes,
        generatedAt: data.generatedAt || new Date(0).toISOString(),
      },
    ];
  }

  return [];
}

function isCurrentResult(
  result: ImageGenerationResultItem,
  data: ImageGenerationNodeData,
): boolean {
  const resultUrl = getResultImageUrl(result);
  const currentUrl = data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim() || '';

  return Boolean(resultUrl && currentUrl && resultUrl === currentUrl);
}

function getGalleryColumnCount(resultCount: number): number {
  if (resultCount <= 1) {
    return 1;
  }

  return Math.min(4, Math.max(2, Math.ceil(Math.sqrt(resultCount))));
}

export const ImageGenerationNode = memo(function ImageGenerationNode({
  id,
  data,
  selected = false,
  dragging = false,
  connectedImages = [],
  onChange,
  onRun,
  onUpload,
  onTitleChange,
  onToolbarAction,
  onOpenLightbox,
  onImageCardClick,
  onSelectNode,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: ImageGenerationNodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [suppressTransientUi, setSuppressTransientUi] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

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
      next.startsWith(NANO_BANANA_MODEL_PREFIX) && (!data.aspectRatio || data.aspectRatio === 'auto' || data.aspectRatio === '9:21')
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

  const handleParallelCountChange = (next: 1 | 2 | 4) => {
    onChange?.({
      ...data,
      parallelCount: next,
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleSelectResult = (result: ImageGenerationResultItem) => {
    if (result.status !== 'completed' || !result.imageUrl?.trim()) {
      return;
    }

    setGalleryOpen(false);
    onChange?.({
      ...data,
      generatedImageUrl: result.imageUrl,
      generatedHostedImageUrl: result.hostedImageUrl,
      generatedImageWidth: result.width,
      generatedImageHeight: result.height,
      generatedImageFormat: result.format,
      generatedImageSizeBytes: result.sizeBytes,
      generatedModel: result.model,
      generatedAt: result.generatedAt,
      status: 'idle',
    });
  };

  const uiVisible = selected && !dragging && !suppressTransientUi && !galleryOpen;
  const showAccessories = uiVisible;
  const isGenerating = data.status === 'generating';
  const displayResults = getDisplayResults(data);
  const resultCount = displayResults.length;
  const canOpenGallery = resultCount > 1 && !isGenerating;
  const galleryColumnCount = getGalleryColumnCount(resultCount);
  const galleryRows = Math.ceil(resultCount / galleryColumnCount);
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

  useEffect(() => {
    if (!suppressTransientUi) {
      return;
    }

    const clearSuppression = () => setSuppressTransientUi(false);

    window.addEventListener('pointerup', clearSuppression);
    window.addEventListener('pointercancel', clearSuppression);

    return () => {
      window.removeEventListener('pointerup', clearSuppression);
      window.removeEventListener('pointercancel', clearSuppression);
    };
  }, [suppressTransientUi]);

  return (
    <div
      className="relative group node-connectable-root"
      style={{ width: `${MAX_CARD_EDGE}px` }}
      onPointerDownCapture={() => {
        if (!selected) {
          setSuppressTransientUi(true);
        }
      }}
    >
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
          <ImageIcon size={24} />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Image"
            className="text-[22px] font-medium leading-none"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
        </div>

        <ImageGenerationNodeToolbar
          visible={uiVisible}
          top={toolbarTop}
          hasGeneratedImage={hasGeneratedImage}
          onUpload={onUpload}
          onAction={onToolbarAction}
          onOpenLightbox={() => onOpenLightbox?.(data)}
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
              if (hasGeneratedImage) {
                onImageCardClick?.();
              }
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
              data.status === 'error' && data.errorMessage ? (
                <div className="max-w-[78%] whitespace-pre-line text-center text-[13px] leading-5 text-gl-error">
                  {data.errorMessage}
                </div>
              ) : (
                <ImageIcon size={44} className="text-gl-text-muted" />
              )
            )}

            {canOpenGallery ? (
              <div className="group/tooltip absolute right-3 top-3 z-20">
                <button
                  type="button"
                  className="image-card-floating-pill nodrag nopan"
                  aria-label="??????"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectNode?.();
                    setGalleryOpen((open) => !open);
                  }}
                >
                  <span>{resultCount}</span>
                  <ChevronDown size={15} />
                </button>
                <Tooltip label="??????" side="left" />
              </div>
            ) : null}
          </div>

          {data.status === 'error' && data.errorMessage && previewImageUrl ? (
            <div className="absolute left-0 right-0 -bottom-6 px-1 text-center text-[11px] text-gl-error">
              {data.errorMessage}
            </div>
          ) : null}

          {galleryOpen && resultCount > 1 ? (
            <div
              className="absolute left-0 top-0 z-40 grid gap-5 bg-transparent p-0 nodrag nopan"
              style={{
                gridTemplateColumns: `repeat(${galleryColumnCount}, minmax(0, 1fr))`,
                width: `calc(${cardDimensions.width}px * ${galleryColumnCount} + 20px * ${Math.max(0, galleryColumnCount - 1)})`,
                transform: galleryRows > 1
                  ? `translate(0, calc(-(${cardDimensions.height}px + 20px) * ${galleryRows - 1}))`
                  : 'translate(0, 0)',
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {displayResults.map((result, index) => {
                const imageUrl = getResultImageUrl(result);
                const selectedResult = isCurrentResult(result, data);
                const clickable = result.status === 'completed' && Boolean(result.imageUrl?.trim());

                return (
                  <button
                    key={`${result.status}-${index}-${imageUrl || result.errorMessage || 'empty'}`}
                    type="button"
                    disabled={!clickable}
                    onClick={() => handleSelectResult(result)}
                    className={[
                      'image-result-gallery-card relative overflow-hidden rounded-[22px] border bg-gl-panel text-left shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,transform] duration-150',
                      clickable ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-not-allowed',
                      selectedResult
                        ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_12px_30px_rgba(0,0,0,0.35)]'
                        : 'border-white/10',
                    ].join(' ')}
                    style={{
                      width: `${cardDimensions.width}px`,
                      height: `${cardDimensions.height}px`,
                    }}
                  >
                    {imageUrl ? (
                      <NextImage
                        src={imageUrl}
                        alt={`${data.prompt?.trim() || 'Generated image'} ${index + 1}`}
                        fill
                        unoptimized
                        sizes={`${cardDimensions.width}px`}
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-8 text-center text-[13px] leading-5 text-gl-error">
                        {result.errorMessage || 'Image generation failed'}
                      </div>
                    )}
                  </button>
                );
                })}
            </div>
          ) : null}

          {galleryOpen && resultCount > 1 ? (
            <div className="group/tooltip absolute right-3 top-3 z-50">
              <button
                type="button"
                className="image-card-floating-pill nodrag nopan"
                aria-label="????"
                onClick={(event) => {
                  event.stopPropagation();
                  setGalleryOpen(false);
                }}
              >
                <span>??</span>
                <ChevronDown size={15} className="rotate-180" />
              </button>
              <Tooltip label="????" side="left" />
            </div>
          ) : null}
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={showAccessories}
          disabled={galleryOpen}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={cardDimensions.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={showAccessories}
          disabled={galleryOpen}
          cardTopOffset={cardTopOffset}
          cardLeftOffset={cardLeftOffset}
          cardWidth={cardDimensions.width}
        />
      </div>

      <ImageGenerationPromptBar
        key={uiVisible ? 'visible' : 'hidden'}
        nodeId={id}
        visible={uiVisible}
        prompt={data.prompt || ''}
        model={data.model}
        aspectRatio={data.aspectRatio}
        quality={data.quality}
        detail={data.detail}
        outputFormat={data.outputFormat}
        moderation={data.moderation}
        parallelCount={data.parallelCount}
        generating={isGenerating}
        connectedImages={connectedImages}
        onPromptChange={handlePromptChange}
        onModelChange={handleModelChange}
        onAspectRatioChange={handleAspectRatioChange}
        onQualityChange={handleQualityChange}
        onDetailChange={handleDetailChange}
        onOutputFormatChange={handleOutputFormatChange}
        onModerationChange={handleModerationChange}
        onParallelCountChange={handleParallelCountChange}
        onRun={onRun}
        onAddReference={onUpload}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
});
