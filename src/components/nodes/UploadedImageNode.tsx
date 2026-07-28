'use client';

import React, { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { Position } from 'reactflow';
import { Image as ImageIcon, LoaderCircle, Upload } from 'lucide-react';
import type { ImageNodeData, UploadedImageNodeData } from '../../types/canvas';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';
import { getCanvasImageDisplayUrls } from '@/lib/canvas-image-assets';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';

export interface UploadedImageCardLayout {
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface UploadedImageNodeProps {
  data: UploadedImageNodeData | ImageNodeData;
  selected?: boolean;
  accessoriesVisible?: boolean;
  onReplace?: (file: File) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  titleEditRequestId?: number;
  onSelectNode?: () => void;
  onShowInfo?: () => void;
  onCardLayout?: (layout: UploadedImageCardLayout) => void;
}

const MAX_CARD_WIDTH = 420;
const MAX_CARD_HEIGHT = 540;
const MIN_CARD_WIDTH = 300;

function getNodeFileName(data: UploadedImageNodeData | ImageNodeData): string | undefined {
  return 'fileName' in data ? data.fileName : undefined;
}

function getNodeDisplayTitle(data: UploadedImageNodeData | ImageNodeData): string | undefined {
  return data.title || getNodeFileName(data);
}

export function UploadedImageNode({
  data,
  selected = false,
  accessoriesVisible = selected,
  onReplace,
  onTitleChange,
  titleEditRequestId,
  onSelectNode,
  onShowInfo,
  onCardLayout,
}: UploadedImageNodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageWidth = Math.max(data.width || 320, 1);
  const imageHeight = Math.max(data.height || 320, 1);
  const explicitDisplayWidth = 'displayWidth' in data ? data.displayWidth : undefined;
  const explicitDisplayHeight = 'displayHeight' in data ? data.displayHeight : undefined;
  const hasExplicitDisplaySize =
    typeof explicitDisplayWidth === 'number' &&
    explicitDisplayWidth > 0 &&
    typeof explicitDisplayHeight === 'number' &&
    explicitDisplayHeight > 0;
  const imageAspectRatio = imageWidth / imageHeight;
  const fittedWidthByHeight = MAX_CARD_HEIGHT * imageAspectRatio;
  const cardWidth = hasExplicitDisplaySize
    ? explicitDisplayWidth
    : Math.min(
        MAX_CARD_WIDTH,
        Math.max(MIN_CARD_WIDTH, Math.min(imageWidth, fittedWidthByHeight)),
      );
  const estimatedCardHeight = hasExplicitDisplaySize
    ? explicitDisplayHeight
    : cardWidth * (imageHeight / imageWidth);
  // title row: icon 24px, -mt-2(-8px), mb-1.5(6px) = 22px
  const TITLE_ROW_HEIGHT = 22;

  useEffect(() => {
    onCardLayout?.({
      width: cardWidth,
      height: estimatedCardHeight,
      top: TITLE_ROW_HEIGHT,
      left: 0,
    });
  }, [cardWidth, estimatedCardHeight, onCardLayout]);
  const showAccessories = accessoriesVisible;
  const useTightReplaceButton = cardWidth < 310 || estimatedCardHeight < 140;
  const useCompactReplaceButton = cardWidth < 340 || estimatedCardHeight < 180;
  const replaceButtonClassName = useTightReplaceButton
    ? 'right-2 top-2 rounded-[8px] px-2 py-1 text-[11px]'
    : useCompactReplaceButton
      ? 'right-2.5 top-2.5 rounded-[9px] px-2.5 py-1.5 text-[12px]'
      : 'right-3 top-3 rounded-[10px] px-3 py-2 text-[14px]';
  const replaceButtonGapClassName = useTightReplaceButton ? 'gap-1' : useCompactReplaceButton ? 'gap-1.5' : 'gap-2';
  const replaceIconSize = useTightReplaceButton ? 13 : useCompactReplaceButton ? 15 : 16;
  const displayTitle = getNodeDisplayTitle(data);
  const displayAlt = displayTitle || ('prompt' in data ? data.prompt : undefined) || 'Image';
  const isGenerating = 'status' in data && data.status === 'generating';
  const isError = 'status' in data && data.status === 'error';
  const statusMessage = 'statusMessage' in data && typeof data.statusMessage === 'string'
    ? data.statusMessage
    : undefined;
  const errorMessage = 'errorMessage' in data && typeof data.errorMessage === 'string'
    ? data.errorMessage
    : undefined;
  const uploadMessage = !statusMessage || statusMessage === 'Uploading...'
    ? '上传中...'
    : statusMessage;
  const canReplace = Boolean(onReplace) && !isGenerating;
  const displayImageUrls = getCanvasImageDisplayUrls(data);
  const displayImageUrlsKey = displayImageUrls.join('\u0000');
  const [imageFailureState, setImageFailureState] = useState<{
    key: string;
    urls: string[];
  }>({ key: '', urls: [] });
  const failedImageUrls = imageFailureState.key === displayImageUrlsKey
    ? imageFailureState.urls
    : [];
  const displayImageUrl = displayImageUrls.find((url) => !failedImageUrls.includes(url)) || '';
  const hasConfiguredImageUrl = Boolean(
    data.imageUrl.trim() ||
    ('hostedImageUrl' in data && data.hostedImageUrl?.trim()) ||
    ('previewUrl' in data && data.previewUrl?.trim()),
  );
  const browserImageUrl = getBrowserImageDisplayUrl(displayImageUrl);
  const isLocalPreviewUrl = displayImageUrl.startsWith('blob:') || displayImageUrl.startsWith('data:');
  const imageLoadFailed = hasConfiguredImageUrl && !displayImageUrl;

  const handleImageLoadError = () => {
    if (!displayImageUrl) {
      return;
    }

    setImageFailureState((current) => {
      const failedUrls = current.key === displayImageUrlsKey ? current.urls : [];

      return failedUrls.includes(displayImageUrl)
        ? current
        : {
            key: displayImageUrlsKey,
            urls: [...failedUrls, displayImageUrl],
          };
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onReplace?.(file);
      event.target.value = '';
    }
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: cardWidth }}>
      <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <ImageIcon size={24} />
        <EditableNodeTitle
          value={displayTitle}
          fallbackValue="image"
          editRequestId={titleEditRequestId}
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border border-transparent bg-transparent shadow-gl-card cursor-grab transition-all duration-150',
          isGenerating
            ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
            : '',
          selected
            ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
            : 'shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
          onShowInfo?.();
        }}
      >
        {displayImageUrl && isLocalPreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/data previews cannot be optimized by next/image.
          <img
            key={browserImageUrl}
            src={browserImageUrl}
            alt={displayAlt}
            className="absolute inset-0 h-full w-full object-cover scale-[1.01]"
            onError={handleImageLoadError}
          />
        ) : displayImageUrl ? (
          <NextImage
            key={browserImageUrl}
            src={browserImageUrl}
            alt={displayAlt}
            fill
            unoptimized
            sizes={`${cardWidth}px`}
            className="object-cover scale-[1.01]"
            onError={handleImageLoadError}
          />
        ) : imageLoadFailed ? (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 px-4 text-center text-gl-text-secondary"
          >
            <ImageIcon size={28} />
            <span className="text-[13px] font-medium">图片加载失败</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
            <ImageIcon size={28} />
          </div>
        )}

        {isGenerating ? (
          <div
            role="status"
            aria-live="polite"
            data-upload-state="uploading"
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/55 text-white backdrop-blur-[2px] transition-opacity duration-200"
          >
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={22}
              strokeWidth={2.2}
            />
            <span className="text-[14px] font-semibold tracking-wide">
              {uploadMessage}
            </span>
          </div>
        ) : null}

        {isError ? (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-[8px] bg-red-600/85 px-2.5 py-1.5 text-center text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {errorMessage || '上传失败'}
          </div>
        ) : null}

        {canReplace ? (
          <>
        <button
          type="button"
          aria-label="替换图片"
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
          accept="image/*"
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
        cardWidth={cardWidth}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={cardWidth}
      />
    </div>
  );
}
