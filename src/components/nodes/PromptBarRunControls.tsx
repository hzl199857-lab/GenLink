'use client';

import React from 'react';
import { ArrowUp } from 'lucide-react';

export interface PromptBarRunControlsProps {
  label: string;
  labelTitle?: string;
  runTitle?: string;
  onRun?: () => void;
}

export function PromptBarRunControls({
  label,
  labelTitle = 'Status',
  runTitle = 'Run',
  onRun,
}: PromptBarRunControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex h-[21px] min-w-[21px] items-center justify-center rounded-gl-pill border border-gl-stroke-soft px-1.5 text-[12px] text-gl-text-secondary"
        title={labelTitle}
      >
        {label}
      </div>
      <button
        type="button"
        onClick={onRun}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-sm transition-colors hover:bg-gray-200"
        title={runTitle}
      >
        <ArrowUp size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}
