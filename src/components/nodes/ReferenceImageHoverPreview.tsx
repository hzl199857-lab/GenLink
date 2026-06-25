'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import NextImage from 'next/image';
import { VideoPlayer } from './VideoPlayer';

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

export type ReferenceVideoHoverPreviewSource = {
  id: string;
  videoUrl: string;
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

type ReferenceVideoHoverPreviewState = {
  id: string;
  videoUrl: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function getReferencePreviewDimensions(
  width?: number,
  height?: number,
  fallbackAspectRatio = 1,
) {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      width: REFERENCE_PREVIEW_MAX_EDGE,
      height: Math.round(REFERENCE_PREVIEW_MAX_EDGE / fallbackAspectRatio),
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

function getReferencePreviewPosition(
  target: HTMLElement,
  previewDimensions: { width: number; height: number },
) {
  const rect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth || previewDimensions.width;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - previewDimensions.width / 2),
    Math.max(8, viewportWidth - previewDimensions.width - 8),
  );
  const top = Math.max(
    8,
    rect.top - previewDimensions.height - REFERENCE_PREVIEW_GAP,
  );

  return { left, top };
}

export function useReferenceImageHoverPreview() {
  const [preview, setPreview] = useState<ReferenceImageHoverPreviewState | null>(null);

  const showPreview = (image: ReferenceImageHoverPreviewSource, target: HTMLElement) => {
    const previewDimensions = getReferencePreviewDimensions(image.width, image.height);
    const position = getReferencePreviewPosition(target, previewDimensions);

    setPreview({
      id: image.id,
      imageUrl: image.previewUrl || image.imageUrl,
      alt: image.alt || 'Reference preview',
      left: position.left,
      top: position.top,
      width: previewDimensions.width,
      height: previewDimensions.height,
    });
  };

  const hidePreview = () => {
    setPreview(null);
  };

  return { preview, showPreview, hidePreview };
}

export function useReferenceVideoHoverPreview() {
  const [preview, setPreview] = useState<ReferenceVideoHoverPreviewState | null>(null);

  const showPreview = (video: ReferenceVideoHoverPreviewSource, target: HTMLElement) => {
    const previewDimensions = getReferencePreviewDimensions(video.width, video.height, 16 / 9);
    const position = getReferencePreviewPosition(target, previewDimensions);

    setPreview({
      id: video.id,
      videoUrl: video.videoUrl,
      left: position.left,
      top: position.top,
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

export function ReferenceVideoHoverPreviewPortal({
  preview,
}: {
  preview: ReferenceVideoHoverPreviewState | null;
}) {
  if (!preview) {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] overflow-hidden rounded-[14px] bg-black shadow-[0_18px_42px_rgba(0,0,0,0.48)]"
      style={{
        left: preview.left,
        top: preview.top,
        width: preview.width,
        height: preview.height,
      }}
    >
      <VideoPlayer
        key={preview.id}
        src={preview.videoUrl}
        autoPlay
        muted
        loop
        controlsVisible={false}
      />
    </div>,
    document.body,
  );
}

export function ReferenceVideoThumbnail({
  videoUrl,
  previewUrl,
  alt,
}: {
  videoUrl: string;
  previewUrl?: string;
  alt: string;
}) {
  const fallbackVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const [capturedFrame, setCapturedFrame] = React.useState<{
    videoUrl: string;
    imageUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const thumbnailUrl =
    previewUrl || (capturedFrame?.videoUrl === videoUrl ? capturedFrame.imageUrl : null);

  React.useEffect(() => {
    if (previewUrl || !videoUrl) {
      return;
    }

    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const captureFrame = () => {
      if (cancelled || video.videoWidth <= 0 || video.videoHeight <= 0) {
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setCapturedFrame({
          videoUrl,
          imageUrl: canvas.toDataURL('image/jpeg', 0.82),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        // Cross-origin videos may not allow canvas extraction; keep the player fallback.
      }
    };

    const seekToFirstVisualFrame = () => {
      try {
        video.currentTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration : 0.1);
      } catch {
        captureFrame();
      }
    };

    const handleLoadedData = () => {
      if (video.readyState >= 2 && video.currentTime > 0) {
        captureFrame();
        return;
      }
      seekToFirstVisualFrame();
    };

    video.addEventListener('loadedmetadata', seekToFirstVisualFrame, { once: true });
    video.addEventListener('loadeddata', handleLoadedData, { once: true });
    video.addEventListener('seeked', captureFrame, { once: true });
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', seekToFirstVisualFrame);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', captureFrame);
      cleanup();
    };
  }, [previewUrl, videoUrl]);

  React.useEffect(() => {
    if (thumbnailUrl || !videoUrl) {
      return;
    }

    const video = fallbackVideoRef.current;
    if (!video) {
      return;
    }

    const seekToFirstVisualFrame = () => {
      try {
        video.currentTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration : 0.1);
      } catch {
        // Some remote videos reject seeking before enough metadata is available.
      }
    };

    const pauseAtFirstFrame = () => {
      video.pause();
    };

    video.addEventListener('loadedmetadata', seekToFirstVisualFrame, { once: true });
    video.addEventListener('loadeddata', pauseAtFirstFrame, { once: true });
    video.load();

    return () => {
      video.removeEventListener('loadedmetadata', seekToFirstVisualFrame);
      video.removeEventListener('loadeddata', pauseAtFirstFrame);
    };
  }, [thumbnailUrl, videoUrl]);

  if (thumbnailUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={alt}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </>
    );
  }

  return (
    <VideoPlayer
      videoRef={fallbackVideoRef}
      src={videoUrl}
      muted
      controlsVisible={false}
      preload="auto"
      className="h-full w-full"
      ariaLabel={alt}
    />
  );
}
