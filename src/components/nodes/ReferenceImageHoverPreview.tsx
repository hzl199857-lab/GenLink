'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import NextImage from 'next/image';

const REFERENCE_PREVIEW_MAX_EDGE = 176;
const REFERENCE_PREVIEW_GAP = 10;

export type ReferenceImageHoverPreviewSource = {
  id: string;
  imageUrl: string;
  previewUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
};

type ReferenceImageHoverPreviewState = {
  id: string;
  imageUrl: string;
  alt: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function getReferencePreviewDimensions(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      width: REFERENCE_PREVIEW_MAX_EDGE,
      height: REFERENCE_PREVIEW_MAX_EDGE,
    };
  }

  const aspectRatio = width / height;

  if (aspectRatio >= 1) {
    return {
      width: REFERENCE_PREVIEW_MAX_EDGE,
      height: Math.round(REFERENCE_PREVIEW_MAX_EDGE / aspectRatio),
    };
  }

  return {
    width: Math.round(REFERENCE_PREVIEW_MAX_EDGE * aspectRatio),
    height: REFERENCE_PREVIEW_MAX_EDGE,
  };
}

export function useReferenceImageHoverPreview() {
  const [preview, setPreview] = useState<ReferenceImageHoverPreviewState | null>(null);

  const showPreview = (image: ReferenceImageHoverPreviewSource, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const previewDimensions = getReferencePreviewDimensions(image.width, image.height);
    const viewportWidth = window.innerWidth || previewDimensions.width;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - previewDimensions.width / 2),
      Math.max(8, viewportWidth - previewDimensions.width - 8),
    );
    const top = Math.max(
      8,
      rect.top - previewDimensions.height - REFERENCE_PREVIEW_GAP,
    );

    setPreview({
      id: image.id,
      imageUrl: image.previewUrl || image.imageUrl,
      alt: image.alt || 'Reference preview',
      left,
      top,
      width: previewDimensions.width,
      height: previewDimensions.height,
    });
  };

  const hidePreview = () => {
    setPreview(null);
  };

  return { preview, showPreview, hidePreview };
}

export function ReferenceImageHoverPreviewPortal({
  preview,
}: {
  preview: ReferenceImageHoverPreviewState | null;
}) {
  if (!preview) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-[100] overflow-hidden rounded-[14px] shadow-[0_18px_42px_rgba(0,0,0,0.48)] pointer-events-none"
      style={{
        left: preview.left,
        top: preview.top,
        width: preview.width,
        height: preview.height,
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[14px]">
        <NextImage
          src={preview.imageUrl}
          alt={preview.alt}
          fill
          unoptimized
          sizes={`${preview.width}px`}
          className="object-cover"
        />
      </div>
    </div>,
    document.body,
  );
}
