import React, { useCallback, useMemo, useRef, useId, useState } from 'react';
import { Handle, Position, type HandleType } from 'reactflow';
import { Plus } from 'lucide-react';

const BADGE_SIZE = 22;
const BADGE_RADIUS = BADGE_SIZE / 2;
const SIDE_ZONE_WIDTH = 148;

const HANDLE_HITBOX_BASE =
  '!z-30 !pointer-events-auto !w-[10px] !-translate-y-1/2 !rounded-full !border-0 !bg-transparent cursor-crosshair nodrag nopan';

const HANDLE_BADGE_BASE =
  'pointer-events-none absolute z-40 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-gl-stroke-medium bg-gl-panel text-gl-text-tertiary transition-all duration-150 nodrag nopan';

const SIDE_ZONE_BASE =
  'absolute z-20 nodrag nopan';

type PointerPosition = {
  x: number;
  y: number;
};

export interface CardSideHandleProps {
  type: HandleType;
  position: Position.Left | Position.Right;
  visible?: boolean;
  cardTopOffset?: number;
}

export function CardSideHandle({
  type,
  position,
  visible = false,
  cardTopOffset = 0,
}: CardSideHandleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleDomId = useId();
  const [hoverPoint, setHoverPoint] = useState<PointerPosition | null>(null);
  const handleTop = useMemo(
    () => `calc(50% + ${cardTopOffset / 2}px)`,
    [cardTopOffset],
  );
  const sideClass = position === Position.Left
    ? '!-left-[5px]'
    : '!-right-[5px]';
  const defaultBadgeSideClass = position === Position.Left ? '-left-[52px]' : '-right-[52px]';
  const zoneSideClass = position === Position.Left ? '-left-[148px]' : '-right-[148px]';
  const isHoveringZone = hoverPoint !== null;

  const updateHoverPoint = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rootElement = rootRef.current;

    if (!rootElement) {
      return;
    }

    const rootRect = rootElement.getBoundingClientRect();
    const minY = cardTopOffset + BADGE_RADIUS;
    const maxY = rootRect.height - BADGE_RADIUS;
    const rawY = event.clientY - rootRect.top;
    const clampedY = Math.min(Math.max(rawY, minY), maxY);

    const rawX = event.clientX - rootRect.left;
    const minX = position === Position.Left ? -SIDE_ZONE_WIDTH + BADGE_RADIUS : rootRect.width + BADGE_RADIUS;
    const maxX = position === Position.Left ? -BADGE_RADIUS : rootRect.width + SIDE_ZONE_WIDTH - BADGE_RADIUS;
    const clampedX = Math.min(Math.max(rawX, minX), maxX);

    setHoverPoint({ x: clampedX, y: clampedY });
  }, [cardTopOffset, position]);

  const clearHoverPoint = useCallback(() => {
    setHoverPoint(null);
  }, []);

  const forwardConnectionStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const handleElement = rootRef.current?.querySelector<HTMLElement>(`[data-handle-dom-id="${handleDomId}"]`);

    if (!handleElement) {
      return;
    }

    const rect = handleElement.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const pointerInit: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    };

    handleElement.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
    handleElement.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    }));
  }, [handleDomId]);

  const badgeStyle = hoverPoint
    ? {
        top: hoverPoint.y,
        left: hoverPoint.x - BADGE_RADIUS,
      }
    : {
        top: handleTop,
      };

  return (
    <div ref={rootRef} className="contents">
      <Handle
        data-handle-dom-id={handleDomId}
        type={type}
        position={position}
        className={[
          'card-side-handle',
          HANDLE_HITBOX_BASE,
          sideClass,
          visible ? '!opacity-100' : '!opacity-0 group-hover:!opacity-100',
        ].join(' ')}
        style={{ top: handleTop }}
      />
      <div
        className={[
          'card-side-handle-zone',
          SIDE_ZONE_BASE,
          zoneSideClass,
        ].join(' ')}
        style={{
          top: cardTopOffset,
          width: SIDE_ZONE_WIDTH,
          height: `calc(100% - ${cardTopOffset}px)`,
        }}
        onPointerEnter={updateHoverPoint}
        onPointerMove={updateHoverPoint}
        onPointerLeave={clearHoverPoint}
        onPointerDown={forwardConnectionStart}
      >
        <span
          aria-hidden="true"
          className={[
            'card-side-handle-badge',
            HANDLE_BADGE_BASE,
            hoverPoint ? '' : defaultBadgeSideClass,
            isHoveringZone || visible ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
          ].join(' ')}
          style={badgeStyle}
        >
          <Plus size={12} className="pointer-events-none" />
        </span>
      </div>
    </div>
  );
}
