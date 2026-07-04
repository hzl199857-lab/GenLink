'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface ImageGenerationInfoPopoverData {
  title?: string;
  model: string;
  format: string;
  size: string;
  resolution: string;
  frameRate?: string;
  createdTime?: string;
}

export interface ImageGenerationInfoPopoverProps {
  open: boolean;
  data: ImageGenerationInfoPopoverData | null;
  onClose?: () => void;
  rightOffset?: number;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 whitespace-nowrap text-[11px] text-white/42">{label}</span>
      <span className="whitespace-nowrap text-right text-[12px] font-semibold text-white/90">
        {value}
      </span>
    </div>
  );
}

export function ImageGenerationInfoPopover({
  open,
  data,
  onClose,
  rightOffset,
}: ImageGenerationInfoPopoverProps) {
  if (!open || !data) {
    return null;
  }

  const resolvedRightOffset = rightOffset ?? 24;

  return (
    <div
      className="pointer-events-none fixed top-[72px] z-[70]"
      style={{
        right: `max(12px, min(${resolvedRightOffset}px, calc(100vw - 244px)))`,
      }}
    >
      <div className="pointer-events-auto w-[220px] rounded-[12px] border border-white/10 bg-[#111214]/96 p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-white/95">{data.title || '图片信息'}</div>
          </div>
          <div className="group/tooltip relative">
            <button
              type="button"
              onClick={onClose}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/6 hover:text-white/90"
              aria-label="关闭图片信息"
            >
              <X size={12} />
            </button>
            <Tooltip label="关闭" side="left" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <InfoRow label="模型" value={data.model} />
          <InfoRow label="格式" value={data.format} />
          <InfoRow label="大小" value={data.size} />
          <InfoRow label="分辨率" value={data.resolution} />
          {data.frameRate ? <InfoRow label="帧率" value={data.frameRate} /> : null}
          {data.createdTime ? <InfoRow label="创建时间" value={data.createdTime} /> : null}
        </div>
      </div>
    </div>
  );
}
