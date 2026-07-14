'use client';

import React from 'react';
import { ArrowUp } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface PromptBarRunControlsProps {
  label: string;
  showLabel?: boolean;
  labelTitle?: string;
  labelActive?: boolean;
  onLabelClick?: () => void;
  runTitle?: string;
  runDisabled?: boolean;
  onRun?: () => void;
}

export function PromptBarRunControls({
  label,
  showLabel = true,
  labelTitle = 'Status',
  labelActive = false,
  onLabelClick,
  runTitle = 'Run',
  runDisabled = false,
  onRun,
}: PromptBarRunControlsProps) {
  const labelClassName = [
    'flex h-[21px] min-w-[21px] items-center justify-center rounded-gl-pill border px-1.5 text-[12px] transition-colors',
    labelActive
      ? 'border-white/20 bg-white/[0.1] text-gl-text-primary'
      : 'border-gl-stroke-soft text-gl-text-secondary',
    onLabelClick ? 'hover:border-white/20 hover:bg-white/[0.08] hover:text-gl-text-primary' : '',
  ].join(' ');

  return (
    <div className="flex items-center gap-1.5">
      {showLabel ? (
        onLabelClick ? (
        <div className="group/tooltip relative">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onLabelClick}
            className={labelClassName}
            aria-label={labelTitle}
          >
            {label}
          </button>
          <Tooltip label={labelTitle} side="top" />
        </div>
        ) : (
        <div className="group/tooltip relative">
          <div className={labelClassName} aria-label={labelTitle}>
            {label}
          </div>
          <Tooltip label={labelTitle} side="top" />
        </div>
        )
      ) : null}
      <div className="group/tooltip relative">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRun?.()}
          disabled={runDisabled}
          aria-label={runTitle}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
        >
          <ArrowUp size={14} strokeWidth={2.4} />
        </button>
        <Tooltip label={runTitle} side="top" />
      </div>
    </div>
  );
}
