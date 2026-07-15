'use client';

import React from 'react';
import { Music2, Play, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';
import {
  ReferenceVideoThumbnail,
  useReferenceImageHoverPreview,
  useReferenceVideoHoverPreview,
} from './ReferenceImageHoverPreview';

export type ReferenceMediaStripImage = {
  id: string;
  imageUrl: string;
  previewUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
  uploadStatus?: 'uploading' | 'uploaded' | 'error';
  uploadError?: string;
};

export type ReferenceMediaStripVideo = {
  id: string;
  videoUrl: string;
  previewUrl?: string;
  alt?: string;
  fileName?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  uploadStatus?: 'uploading' | 'uploaded' | 'error';
  uploadError?: string;
};

export type ReferenceMediaStripAudio = {
  id: string;
  audioUrl: string;
  alt?: string;
  fileName?: string;
  durationSeconds?: number;
  uploadStatus?: 'uploading' | 'uploaded' | 'error';
  uploadError?: string;
};

export function ReferenceMediaIcon() {
  return (
    <span className="relative block h-[35px] w-[35px]">
      <svg
        viewBox="0 0 18 18"
        className="h-[35px] w-[35px]"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.25 3.25h7.5a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1h-2.4"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 14.7 8.9 9.9l4.15 2.4-3.85 2.4Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.25 6.15v4.6a1 1 0 0 0 1 1h1.55"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ReferenceMediaSquareButton({
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
        onClick={onClick}
        className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/[0.08] text-gl-text-secondary transition-colors hover:bg-white/[0.12] hover:text-gl-text-primary"
        aria-label={title}
      >
        {children}
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
}

export function ReferenceMediaStrip({
  connectedImages,
  connectedVideos,
  connectedAudio = [],
  imagePreview,
  videoPreview,
  quickConnectTitle = '快捷连接参考素材',
  addTitle = '添加参考素材',
  onQuickReferenceConnect,
  onAddReference,
  onRemoveReference,
}: {
  connectedImages: ReferenceMediaStripImage[];
  connectedVideos: ReferenceMediaStripVideo[];
  connectedAudio?: ReferenceMediaStripAudio[];
  imagePreview: ReturnType<typeof useReferenceImageHoverPreview>;
  videoPreview: ReturnType<typeof useReferenceVideoHoverPreview>;
  quickConnectTitle?: string;
  addTitle?: string;
  onQuickReferenceConnect?: () => void;
  onAddReference?: () => void;
  onRemoveReference?: (referenceId: string) => void;
}) {
  const referenceMedia = [
    ...connectedImages.map((image) => ({ type: 'image' as const, item: image })),
    ...connectedVideos.map((video) => ({ type: 'video' as const, item: video })),
    ...connectedAudio.map((audio) => ({ type: 'audio' as const, item: audio })),
  ];

  return (
    <div className="flex items-center gap-2 transition-transform duration-500 ease-in-out">
      <ReferenceMediaSquareButton
        title={quickConnectTitle}
        onClick={onQuickReferenceConnect ?? onAddReference}
      >
        <ReferenceMediaIcon />
      </ReferenceMediaSquareButton>

      {referenceMedia.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pr-1 nodrag nopan">
          {referenceMedia.map((reference, index) => (
            <div
              key={`${reference.type}-${reference.item.id}-${index}`}
              className="group/reference-thumb relative h-11 w-11 shrink-0"
            >
              {(() => {
                const uploadStatus = reference.item.uploadStatus;
                const isUploading = uploadStatus === 'uploading';
                const isError = uploadStatus === 'error';

                return (
              <div
                className={[
                  'relative h-full w-full overflow-hidden rounded-[12px] border bg-white/5 shadow-[0_8px_18px_rgba(0,0,0,0.18)]',
                  isError ? 'border-red-400/70' : 'border-white/10',
                ].join(' ')}
                onPointerEnter={(event) => {
                  if (reference.type === 'video') {
                    videoPreview.showPreview(reference.item, event.currentTarget);
                    return;
                  }
                  if (reference.type === 'image') {
                    imagePreview.showPreview(reference.item, event.currentTarget);
                  }
                }}
                onPointerLeave={() => {
                  videoPreview.hidePreview();
                  imagePreview.hidePreview();
                }}
              >
                {reference.type === 'image' ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getBrowserImageDisplayUrl(reference.item.previewUrl || reference.item.imageUrl)}
                      alt={reference.item.alt || `Connected image ${index + 1}`}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </>
                ) : reference.type === 'video' ? (
                  <>
                    <ReferenceVideoThumbnail
                      videoUrl={reference.item.videoUrl}
                      previewUrl={reference.item.previewUrl}
                      alt={reference.item.alt || `Connected video ${index + 1}`}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
                      <Play size={15} fill="currentColor" strokeWidth={0} />
                    </span>
                  </>
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-[#202328] text-gl-text-secondary">
                    <Music2 size={18} />
                  </span>
                )}
                <span className="absolute bottom-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 text-[12px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                  {index + 1}
                </span>
                {isUploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 px-1 text-center text-[10px] font-semibold leading-tight text-white">
                    Uploading
                  </span>
                ) : null}
                {isError ? (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-red-600/75 px-1 text-center text-[10px] font-semibold leading-tight text-white"
                    title={reference.item.uploadError || 'Upload failed'}
                  >
                    Failed
                  </span>
                ) : null}
              </div>
                );
              })()}
              {onRemoveReference ? (
                <button
                  type="button"
                  aria-label="移除参考素材"
                  className="absolute right-0 top-0 z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white/35 bg-[#1b1d21] text-white opacity-0 shadow-[0_6px_14px_rgba(0,0,0,0.35)] transition hover:bg-white hover:text-[#1b1d21] focus-visible:opacity-100 group-hover/reference-thumb:opacity-100"
                  onPointerEnter={() => {
                    videoPreview.hidePreview();
                    imagePreview.hidePreview();
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    videoPreview.hidePreview();
                    imagePreview.hidePreview();
                    onRemoveReference(reference.item.id);
                  }}
                >
                  <X size={11} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <ReferenceMediaSquareButton title={addTitle} onClick={onAddReference}>
        <span className="text-[24px] leading-none">+</span>
      </ReferenceMediaSquareButton>
    </div>
  );
}
