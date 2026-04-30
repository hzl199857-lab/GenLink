'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface ImageGenerationInfoPopoverData {
  title: string;
  model: string;
  format: string;
  size: string;
  resolution: string;
  createdTime: string;
}

export interface ImageGenerationInfoPopoverProps {
  open: boolean;
  data: ImageGenerationInfoPopoverData | null;
  onClose?: () => void;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-[14px] text-white/42">{label}</span>
      <span className="text-right text-[16px] font-semibold text-white/90">
        {value}
      </span>
    </div>
  );
}

export function ImageGenerationInfoPopover({
  open,
  data,
  onClose,
}: ImageGenerationInfoPopoverProps) {
  if (!open || !data) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[70]">
      <div className="pointer-events-auto w-[320px] rounded-[20px] border border-white/10 bg-[#111214]/96 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-medium text-white/95">
              {data.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/6 hover:text-white/90"
            aria-label="Close image information"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <InfoRow label="模型" value={data.model} />
          <InfoRow label="格式" value={data.format} />
          <InfoRow label="大小" value={data.size} />
          <InfoRow label="分辨率" value={data.resolution} />
          <InfoRow label="创建时间" value={data.createdTime} />
        </div>
      </div>
    </div>
  );
}
