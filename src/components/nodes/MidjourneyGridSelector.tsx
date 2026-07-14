'use client';

import type { MidjourneyQuadrant } from '../../types/canvas';

const QUADRANTS = [1, 2, 3, 4] as const;
const QUADRANT_LABELS: Record<MidjourneyQuadrant, string> = {
  1: '左上',
  2: '右上',
  3: '左下',
  4: '右下',
};

export interface MidjourneyGridSelectorProps {
  disabled?: boolean;
  pendingQuadrant?: MidjourneyQuadrant;
  onSelect: (quadrant: MidjourneyQuadrant) => void;
}

export function MidjourneyGridSelector({
  disabled = false,
  pendingQuadrant,
  onSelect,
}: MidjourneyGridSelectorProps) {
  const hasPending = pendingQuadrant !== undefined;

  return (
    <div className="nodrag nopan absolute inset-0 z-20 grid grid-cols-2 grid-rows-2">
      {QUADRANTS.map((quadrant) => {
        const label = QUADRANT_LABELS[quadrant];
        const pending = pendingQuadrant === quadrant;

        return (
          <button
            key={quadrant}
            type="button"
            disabled={disabled || hasPending}
            aria-label={`选择${label}图片并生成高清图`}
            aria-busy={pending}
            className={[
              'group/quadrant relative border bg-transparent outline-none transition-colors disabled:cursor-wait',
              pending
                ? 'border-white/85 bg-black/25'
                : hasPending
                  ? 'border-transparent bg-black/40 opacity-60'
                  : 'border-transparent hover:border-white/75 hover:bg-black/20 focus-visible:border-white focus-visible:bg-black/25',
            ].join(' ')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(quadrant);
            }}
          >
            <span
              className={[
                'absolute left-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded bg-black/65 px-2 text-xs font-semibold text-white shadow-sm transition-opacity',
                pending
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/quadrant:opacity-100 group-focus-visible/quadrant:opacity-100',
              ].join(' ')}
            >
              {pending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : (
                quadrant
              )}
            </span>
            {pending ? (
              <span
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/15 text-white"
                aria-live="polite"
              >
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                <span className="rounded-[6px] bg-black/70 px-2.5 py-1.5 text-[12px] font-medium shadow-sm">
                  正在高清放大
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
