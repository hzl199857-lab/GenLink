'use client';

import React, { useRef } from 'react';
import NextImage from 'next/image';
import { Position } from 'reactflow';
import { Image as ImageIcon, Upload } from 'lucide-react';
import type { UploadedImageNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';

export interface UploadedImageNodeProps {
  data: UploadedImageNodeData;
  selected?: boolean;
  onReplace?: (file: File) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onShowInfo?: () => void;
}

const MAX_CARD_WIDTH = 420;
const MAX_CARD_HEIGHT = 540;
const MIN_CARD_WIDTH = 300;

export function UploadedImageNode({
  data,
  selected = false,
  onReplace,
  onTitleChange,
  onSelectNode,
  onShowInfo,
}: UploadedImageNodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageWidth = Math.max(data.width || 320, 1);
  const imageHeight = Math.max(data.height || 320, 1);
  const explicitDisplayWidth = data.displayWidth;
  const explicitDisplayHeight = data.displayHeight;
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
  const showAccessories = selected;
  const useTightReplaceButton = cardWidth < 310 || estimatedCardHeight < 140;
  const useCompactReplaceButton = cardWidth < 340 || estimatedCardHeight < 180;
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
    <div className="relative group node-connectable-root" style={{ width: cardWidth }}>
      <div className="-mt-2 mb-1.5 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <ImageIcon size={24} />
        <EditableNodeTitle
          value={data.title}
          fallbackValue="image"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border border-transparent bg-transparent shadow-gl-card cursor-grab transition-all duration-150',
          selected
            ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_8px_rgba(255,255,255,0.08)]'
            : 'shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
          onShowInfo?.();
        }}
      >
        {data.imageUrl ? (
          <NextImage
            src={data.imageUrl}
            alt={data.fileName || 'Uploaded image'}
            fill
            unoptimized
            sizes={`${cardWidth}px`}
            className="object-cover scale-[1.01]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
            <ImageIcon size={28} />
          </div>
        )}

        <button
          type="button"
          aria-label="替换图片"
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
          className={[
            'nodrag nopan absolute z-10 flex items-center justify-center bg-black/65 font-semibold text-white opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-opacity group-hover:opacity-100',
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
