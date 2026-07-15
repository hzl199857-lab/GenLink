'use client';

import React, { memo, useEffect, useState } from 'react';
import { Position, useUpdateNodeInternals } from 'reactflow';
import { ChevronDown, Image as ImageIcon, RotateCcw } from 'lucide-react';
import type {
  ImageGenerationNodeData,
  ImageGenerationRunOptions,
  ImageGenerationResultItem,
  MidjourneyGenerationSettings,
  MidjourneyQuadrant,
} from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import {
  ImageGenerationNodeToolbar,
  type ImageGenerationToolbarAction,
} from './ImageGenerationNodeToolbar';
import { ImageGenerationPromptBar } from './ImageGenerationPromptBar';
import { SilkRunningPreview } from './SilkRunningPreview';
import { MidjourneyGridSelector } from './MidjourneyGridSelector';
import {
  readStoredSelectedApiProvider,
  type ApiProvider,
} from '@/store/canvas-store';
import { normalizeMidjourneySettings } from '@/lib/image-generation-options';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';

const MAX_CARD_EDGE = 540;
const MIN_CARD_EDGE = 220;
const CARD_ACCESSORY_TOP_SPACE = 64;
const CARD_ACCESSORY_GAP = 12;
const CARD_TOOLBAR_LIFT = 30;
const NANO_BANANA_MODEL_PREFIX = 'nano-banana';
const RUNNING_HUB_NANO_MODELS = new Set(['nano-banana-pro', 'nano-banana-2']);
const GRSAI_NANO_MODELS = new Set(['nano-banana-pro']);
const GRSAI_NANO_ASPECT_RATIOS = new Set([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
]);

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
  onRun?: (promptOverride?: string, options?: ImageGenerationRunOptions) => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceImageId: string) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onToolbarAction?: (action: ImageGenerationToolbarAction) => void;
  onOpenLightbox?: (data: ImageGenerationNodeData) => void;
  onImageCardClick?: () => void;
  onMidjourneyUpscale?: (quadrant: MidjourneyQuadrant) => void;
  onSelectNode?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
  hidePromptBar?: boolean;
  panActive?: boolean;
  promptFocusRequestId?: number;
  titleEditRequestId?: number;
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

function resolveModelAspectRatio(
  provider: ApiProvider | undefined,
  model: string,
  aspectRatio?: string,
): string | undefined {
  if (
    provider === 'comfly' &&
    model.trim().toLowerCase() === 'midjourney'
  ) {
    return 'auto';
  }

  const isNanoSizeModel =
    provider === 'runninghub'
      ? RUNNING_HUB_NANO_MODELS.has(model)
      : provider === 'grsai'
        ? GRSAI_NANO_MODELS.has(model)
        : model.startsWith(NANO_BANANA_MODEL_PREFIX);

  if (!isNanoSizeModel) {
    return aspectRatio;
  }

  if (provider === 'grsai') {
    return aspectRatio && GRSAI_NANO_ASPECT_RATIOS.has(aspectRatio)
      ? aspectRatio
      : '1:1';
  }

  return !aspectRatio || aspectRatio === 'auto' || aspectRatio === '9:21'
    ? '1:1'
    : aspectRatio;
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
  const explicitAspectRatio = parseAspectRatioValue(aspectRatio);
  const autoImage = aspectRatio === 'auto'
    ? connectedImages?.find((image) => image.width && image.height && image.width > 0 && image.height > 0) ??
      generatedImage
    : generatedImage;
  const autoAspectRatio =
    autoImage?.width && autoImage?.height && autoImage.width > 0 && autoImage.height > 0
      ? autoImage.width / autoImage.height
      : null;
  const resolvedAspectRatio = explicitAspectRatio ?? autoAspectRatio ?? 16 / 9;

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

function GeneratedPreviewImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return <GeneratedPreviewImageContent key={src} src={src} alt={alt} />;
}

function GeneratedPreviewImageContent({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const displaySrc = getBrowserImageDisplayUrl(src);

  return (
    <div className="relative h-full w-full bg-gl-panel">
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {failed ? (
            <div className="max-w-[78%] text-center text-[13px] leading-5 text-gl-error">
              Image failed to load
            </div>
          ) : (
            <ImageIcon size={44} className="text-gl-text-muted" />
          )}
        </div>
      ) : null}
      {/* Generated URLs can be remote provider URLs, so use a plain img here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displaySrc}
        alt={alt}
        className={[
          'h-full w-full object-cover transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
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
  onQuickReferenceConnect,
  onRemoveReference,
  onTitleChange,
  onToolbarAction,
  onOpenLightbox,
  onImageCardClick,
  onMidjourneyUpscale,
  onSelectNode,
  onPromptPointerDown,
  onPromptFocusWithinChange,
  hidePromptBar,
  panActive,
  promptFocusRequestId,
  titleEditRequestId,
}: ImageGenerationNodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [suppressTransientUi, setSuppressTransientUi] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const normalizedMidjourneySettings = normalizeMidjourneySettings(data.midjourneySettings);

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
      aspectRatio: resolveModelAspectRatio(data.provider, next, data.aspectRatio),
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleProviderModelChange = (next: {
    provider: ApiProvider;
    model: string;
    runningHubChannel?: 'official' | 'low-cost';
  }) => {
    onChange?.({
      ...data,
      provider: next.provider,
      model: next.model,
      runningHubChannel:
        next.provider === 'runninghub'
          ? next.runningHubChannel ?? data.runningHubChannel ?? 'official'
          : data.runningHubChannel,
      aspectRatio: resolveModelAspectRatio(next.provider, next.model, data.aspectRatio),
      status: data.status === 'error' ? 'idle' : data.status,
      errorMessage: undefined,
    });
  };

  const handleRunningHubChannelChange = (next: 'official' | 'low-cost') => {
    onChange?.({
      ...data,
      runningHubChannel: next,
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

  const handleRunOptionsChange = (next: ImageGenerationRunOptions) => {
    onChange?.({
      ...data,
      ...next,
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

  const handleMidjourneySettingsChange = (
    next: Required<MidjourneyGenerationSettings>,
  ) => {
    onChange?.({
      ...data,
      midjourneySettings: next,
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

  const toolbarVisible = selected && !dragging && !suppressTransientUi && !galleryOpen;
  const promptBarVisible = toolbarVisible && !hidePromptBar;
  const showAccessories = toolbarVisible;
  const isGenerating = data.status === 'generating';
  const isFailed = data.status === 'error';
  const displayResults = getDisplayResults(data);
  const resultCount = displayResults.length;
  const canOpenGallery = resultCount > 1 && !isGenerating;
  const galleryColumnCount = getGalleryColumnCount(resultCount);
  const galleryRows = Math.ceil(resultCount / galleryColumnCount);
  const cardDimensions = resolveCardDimensions(data.aspectRatio, connectedImages, {
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
  });
  const titleTop = -(CARD_ACCESSORY_GAP + 26);
  const toolbarTop = -(CARD_ACCESSORY_TOP_SPACE + CARD_TOOLBAR_LIFT);
  const previewImageUrl =
    data.generatedHostedImageUrl ||
    data.generatedImageUrl;
  const hasGeneratedImage = Boolean(
    data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim(),
  );
  const canUsePromptPresets = connectedImages.length > 0 || hasGeneratedImage;
  const midjourneyActions = data.midjourney?.kind === 'grid'
    ? data.midjourney.actions
    : undefined;
  const canSelectMidjourneyGrid = Boolean(
    onMidjourneyUpscale &&
    midjourneyActions?.[1] &&
    midjourneyActions?.[2] &&
    midjourneyActions?.[3] &&
    midjourneyActions?.[4],
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
      style={{
        width: `${cardDimensions.width}px`,
        height: `${cardDimensions.height}px`,
      }}
      onPointerDownCapture={() => {
        if (!selected) {
          setSuppressTransientUi(true);
        }
      }}
    >
        <div
          className="node-visible-title pointer-events-none absolute z-20 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan whitespace-nowrap transition-[top,left,transform] duration-300 ease-out"
          style={{
            left: 0,
            top: `${titleTop}px`,
          }}
        >
          <ImageIcon size={24} className="pointer-events-auto" />
          <EditableNodeTitle
            value={data.title}
            fallbackValue="Image"
            editRequestId={titleEditRequestId}
            className="pointer-events-auto text-[22px] font-medium leading-none"
            inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
            onCommit={onTitleChange}
          />
        </div>

        <ImageGenerationNodeToolbar
          visible={toolbarVisible}
          top={toolbarTop}
          hasGeneratedImage={hasGeneratedImage}
          panActive={panActive}
          onUpload={onUpload}
          onAction={onToolbarAction}
          onOpenLightbox={() => onOpenLightbox?.(data)}
        />

        <div
          className="absolute inset-0 transition-[width,height] duration-300 ease-out"
          style={{
            width: `${cardDimensions.width}px`,
            height: `${cardDimensions.height}px`,
          }}
        >
          <div
            className={[
              'node-connectable-card image-generation-node-drag-handle pointer-events-auto relative h-full w-full rounded-gl-lg border bg-gl-panel shadow-gl-card',
              'flex items-center justify-center overflow-hidden transition-[border-color,box-shadow] duration-300 ease-out',
              'cursor-grab',
              isGenerating
                ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
                : isFailed
                  ? 'border-gl-error/70 shadow-[0_0_0_1px_rgba(239,68,68,0.45),0_0_24px_rgba(239,68,68,0.16)]'
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
            {isGenerating ? (
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black">
                <div className="absolute inset-[-4.5%] blur-[5.2px]">
                  <SilkRunningPreview />
                </div>
                <div className="absolute inset-0 backdrop-blur-[3.6px] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.024),rgba(0,0,0,0.22)_100%)]" />
              </div>
            ) : null}

            {previewImageUrl ? (
              <div className="relative z-10 h-full w-full">
                <GeneratedPreviewImage
                  src={previewImageUrl}
                  alt={data.prompt?.trim() || 'Generated image'}
                />
              </div>
            ) : (
              isFailed && data.errorMessage ? (
                <div className="relative z-10 flex max-w-[78%] flex-col items-center gap-3 text-center">
                  <div className="whitespace-pre-line text-[13px] leading-5 text-gl-error">
                    {data.errorMessage}
                  </div>
                  <button
                    type="button"
                    className="nodrag nopan inline-flex h-8 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-white/82 transition hover:border-white/24 hover:bg-white/[0.1]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectNode?.();
                      onRun?.();
                    }}
                  >
                    <RotateCcw size={13} />
                    重新生成
                  </button>
                </div>
              ) : !isGenerating ? (
                <ImageIcon size={44} className="relative z-10 text-gl-text-muted" />
              ) : (
                null
              )
            )}

            {previewImageUrl && canSelectMidjourneyGrid ? (
              <MidjourneyGridSelector
                disabled={isGenerating}
                pendingQuadrant={data.midjourney?.pendingQuadrant}
                onSelect={(quadrant) => onMidjourneyUpscale?.(quadrant)}
              />
            ) : null}

            {canOpenGallery ? (
              <div className="absolute right-3 top-3 z-20">
                <button
                  type="button"
                  className="image-card-floating-pill nodrag nopan"
                  aria-label="展开生成结果"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectNode?.();
                    setGalleryOpen((open) => !open);
                  }}
                >
                  <span>{resultCount}</span>
                  <ChevronDown size={15} />
                </button>
              </div>
            ) : null}
          </div>

          {isFailed && data.errorMessage && previewImageUrl ? (
            <div className="absolute left-0 right-0 -bottom-8 flex items-center justify-center gap-2 px-1 text-center text-[11px] text-gl-error">
              <span className="max-w-[75%] truncate">{data.errorMessage}</span>
              <button
                type="button"
                className="nodrag nopan inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-gl-error/35 bg-gl-error/10 px-2 text-[11px] font-semibold text-gl-error transition hover:bg-gl-error/16"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode?.();
                  onRun?.();
                }}
              >
                <RotateCcw size={11} />
                重新生成
              </button>
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
                      <GeneratedPreviewImage
                        src={imageUrl}
                        alt={`${data.prompt?.trim() || 'Generated image'} ${index + 1}`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-8 text-center text-[13px] leading-5 text-gl-error">
                        {result.errorMessage || '图片生成失败'}
                      </div>
                    )}
                  </button>
                );
                })}
            </div>
          ) : null}

          {galleryOpen && resultCount > 1 ? (
            <div className="absolute right-3 top-3 z-50">
              <button
                type="button"
                className="image-card-floating-pill nodrag nopan"
                aria-label="收起生成结果"
                onClick={(event) => {
                  event.stopPropagation();
                  setGalleryOpen(false);
                }}
              >
                <span>{resultCount}</span>
                <ChevronDown size={15} className="rotate-180" />
              </button>
            </div>
          ) : null}
        </div>

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={showAccessories}
          disabled={galleryOpen}
          cardWidth={cardDimensions.width}
        />
        <CardSideHandle
          type="source"
          position={Position.Right}
          visible={showAccessories}
          disabled={galleryOpen}
          cardWidth={cardDimensions.width}
        />

      <ImageGenerationPromptBar
        key={`prompt-bar-${id}-${promptBarVisible ? 'visible' : 'hidden'}`}
        nodeId={id}
        visible={promptBarVisible}
        prompt={data.prompt || ''}
        provider={data.provider || readStoredSelectedApiProvider('image')}
        model={data.model}
        runningHubChannel={data.runningHubChannel}
        aspectRatio={data.aspectRatio}
        quality={data.quality}
        detail={data.detail}
        outputFormat={data.outputFormat}
        moderation={data.moderation}
        midjourneySettings={normalizedMidjourneySettings}
        parallelCount={data.parallelCount}
        generating={isGenerating}
        canUsePromptPresets={canUsePromptPresets}
        connectedImages={connectedImages}
        focusRequestId={promptFocusRequestId}
        onPromptChange={handlePromptChange}
        onProviderModelChange={handleProviderModelChange}
        onModelChange={handleModelChange}
        onRunningHubChannelChange={handleRunningHubChannelChange}
        onAspectRatioChange={handleAspectRatioChange}
        onQualityChange={handleQualityChange}
        onRunOptionsChange={handleRunOptionsChange}
        onDetailChange={handleDetailChange}
        onOutputFormatChange={handleOutputFormatChange}
        onModerationChange={handleModerationChange}
        onMidjourneySettingsChange={handleMidjourneySettingsChange}
        onParallelCountChange={handleParallelCountChange}
        onRun={onRun}
        onAddReference={onUpload}
        onQuickReferenceConnect={onQuickReferenceConnect}
        onRemoveReference={onRemoveReference}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={onPromptFocusWithinChange}
      />
    </div>
  );
});
