'use client';

import React from 'react';

type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  label: string;
  side?: TooltipSide;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const SIDE_CLASS_MAP: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-[4px] group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0',
  right:
    'left-full top-1/2 ml-2.5 -translate-y-1/2 translate-x-[-4px] group-hover/tooltip:translate-x-0 group-focus-within/tooltip:translate-x-0',
  bottom:
    'left-1/2 top-full mt-2 -translate-x-1/2 translate-y-[-4px] group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0',
  left:
    'right-full top-1/2 mr-2.5 -translate-y-1/2 translate-x-[4px] group-hover/tooltip:translate-x-0 group-focus-within/tooltip:translate-x-0',
};

export function Tooltip({
  label,
  side = 'top',
  className = '',
  onClick,
}: TooltipProps) {
  const tooltipClassName = [
    'absolute z-[90] whitespace-nowrap rounded-gl-pill bg-[#222326] px-3 py-1.5 text-[12px] font-medium leading-none text-white opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.3)] transition-all duration-150 ease-out group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
    onClick
      ? 'pointer-events-auto cursor-pointer border-0'
      : 'pointer-events-none',
    SIDE_CLASS_MAP[side],
    className,
  ].join(' ');

  if (onClick) {
    return (
      <button
        type="button"
        className={tooltipClassName}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={tooltipClassName}
    >
      {label}
    </span>
  );
}
