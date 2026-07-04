import React, { useCallback, useEffect, useMemo, useRef, useId, useState } from 'react';
import {
  Handle,
  Position,
  type Connection,
  type HandleType,
  useNodeId,
  useStoreApi,
  useUpdateNodeInternals,
} from 'reactflow';
import { Plus } from 'lucide-react';

const HANDLE_SIZE = 10;
const HANDLE_BADGE_SIZE = 32;
const HANDLE_BADGE_HALF = HANDLE_BADGE_SIZE / 2;
const SIDE_PLUS_GAP = 36;
const SIDE_PLUS_THRESHOLD = 70;
const SIDE_PLUS_MAGNET_MAX = 45;
const SIDE_ZONE_WIDTH = SIDE_PLUS_THRESHOLD + SIDE_PLUS_GAP + HANDLE_BADGE_HALF;
const SIDE_PLUS_POINTER_BLOCKER_SELECTOR = [
  '[data-ui-stop="1"]',
  '[data-canvas-menu-ignore="true"]',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '.node-floating-toolbar',
  '.image-generation-node-toolbar',
  '.text-node-floating-toolbar',
  '.react-flow__controls',
  '.react-flow__minimap',
].join(',');

const HANDLE_HITBOX_BASE =
  '!z-30 !pointer-events-auto !w-[10px] !-translate-y-1/2 !rounded-full !border-0 !bg-transparent transition-[top,left] duration-300 ease-out cursor-crosshair nodrag nopan';

const HANDLE_BADGE_BASE =
  'card-side-plus-btn pointer-events-auto absolute z-40 flex h-8 w-8 items-center justify-center rounded-full border text-gl-text-tertiary nodrag nopan';

const SIDE_ZONE_BASE =
  'absolute z-20 cursor-crosshair transition-[top,left,height] duration-300 ease-out nodrag nopan';

let activeConnectionCleanup: (() => void) | null = null;
const BLANK_CONNECTION_DROP_EVENT = 'genlink:connection-blank-drop';

type SidePlusState = {
  visible: boolean;
  magnet: boolean;
  left: number;
  top: number;
};

function isSidePlusPointerBlocked(target: EventTarget | null, root: HTMLElement | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (root?.contains(target)) {
    return false;
  }

  return Boolean(target.closest(SIDE_PLUS_POINTER_BLOCKER_SELECTOR));
}

function getSidePlusWrapperLocalX(edge: 'left' | 'right', overlayElement: HTMLElement) {
  return edge === 'left' ? 0 : overlayElement.offsetLeft;
}

export interface CardSideHandleProps {
  type: HandleType;
  position: Position.Left | Position.Right;
  visible?: boolean;
  disabled?: boolean;
  cardTopOffset?: number;
  cardLeftOffset?: number;
  cardWidth?: number;
}

export interface MagneticSidePlusProps {
  edge: 'left' | 'right';
  active?: boolean;
  connecting?: boolean;
  disabled?: boolean;
  coordinateSpace?: 'canvas' | 'screen';
  containerRef: React.RefObject<HTMLElement | null>;
  anchorElementRef: React.RefObject<HTMLElement | null>;
  topOffset?: number;
  height?: number | string;
  className?: string;
  onMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
}

export function MagneticSidePlus({
  edge,
  active = false,
  connecting = false,
  disabled = false,
  coordinateSpace = 'canvas',
  containerRef,
  anchorElementRef,
  topOffset = 0,
  height = `calc(100% - ${topOffset}px)`,
  className,
  onMouseDown,
}: MagneticSidePlusProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const store = useStoreApi();
  const [sidePlusState, setSidePlusState] = useState<SidePlusState>({
    visible: false,
    magnet: false,
    left: edge === 'left'
      ? -SIDE_PLUS_GAP - HANDLE_BADGE_HALF
      : SIDE_PLUS_GAP - HANDLE_BADGE_HALF,
    top: 0,
  });
  const isLeft = edge === 'left';
  const shouldShowSidePlus = active || sidePlusState.visible || connecting;

  useEffect(() => {
    if (disabled || (!active && !connecting)) {
      return;
    }

    const overlayElement = rootRef.current;
    const anchorElement = anchorElementRef.current;

    if (!overlayElement || !anchorElement) {
      return;
    }

    const edgeLocalX = isLeft
      ? anchorElement.offsetLeft
      : anchorElement.offsetLeft + anchorElement.offsetWidth;
    const anchorLocalX = edgeLocalX + (isLeft ? -SIDE_PLUS_GAP : SIDE_PLUS_GAP);
    const anchorLocalY = anchorElement.offsetTop + anchorElement.offsetHeight / 2;
    const wrapperLocalX = getSidePlusWrapperLocalX(edge, overlayElement);

    setSidePlusState((current) => ({
      ...current,
      visible: true,
      magnet: false,
      left: anchorLocalX - wrapperLocalX - HANDLE_BADGE_HALF,
      top: anchorLocalY - HANDLE_BADGE_HALF,
    }));
  }, [active, anchorElementRef, connecting, disabled, edge, isLeft]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const updateSidePlusPosition = (event: MouseEvent) => {
      const overlayElement = rootRef.current;
      const containerElement = containerRef.current;
      const anchorElement = anchorElementRef.current;

      if (!overlayElement || !containerElement || !anchorElement) {
        return;
      }

      if (isSidePlusPointerBlocked(event.target, overlayElement)) {
        setSidePlusState((current) => (
          current.visible || current.magnet
            ? { ...current, visible: false, magnet: false }
            : current
        ));
        return;
      }

      const zoom = store.getState().transform?.[2] || 1;
      const localScale = coordinateSpace === 'canvas' ? zoom : 1;
      const containerRect = containerElement.getBoundingClientRect();
      const anchorRect = anchorElement.getBoundingClientRect();
      const edgeScreenX = isLeft ? anchorRect.left : anchorRect.right;
      const anchorScreenX = edgeScreenX + (isLeft ? -SIDE_PLUS_GAP : SIDE_PLUS_GAP) * localScale;
      const anchorScreenY = anchorRect.top + anchorRect.height / 2;
      const dx = event.clientX - anchorScreenX;
      const dy = event.clientY - anchorScreenY;
      const distance = Math.hypot(dx, dy);
      const threshold = SIDE_PLUS_THRESHOLD * localScale;
      const magnetMax = SIDE_PLUS_MAGNET_MAX * localScale;
      const shouldMagnet = distance < threshold;
      const shouldReveal = shouldMagnet || active || connecting;

      let offsetX = 0;
      let offsetY = 0;

      if (shouldMagnet && !connecting) {
        const offset = Math.min(distance, magnetMax) / localScale;
        const angle = Math.atan2(dy, dx);

        offsetX = Math.cos(angle) * offset;
        offsetY = Math.sin(angle) * offset;

        if (isLeft) {
          offsetX = Math.min(offsetX, SIDE_PLUS_GAP);
        } else {
          offsetX = Math.max(offsetX, -SIDE_PLUS_GAP);
        }
      }

      const anchorLocalX = (anchorScreenX - containerRect.left) / localScale;
      const anchorLocalY = (anchorScreenY - containerRect.top) / localScale;
      const wrapperLocalX = getSidePlusWrapperLocalX(edge, overlayElement);
      const nextState: SidePlusState = {
        visible: shouldReveal,
        magnet: shouldMagnet && !connecting,
        left: anchorLocalX - wrapperLocalX + offsetX - HANDLE_BADGE_HALF,
        top: anchorLocalY + offsetY - HANDLE_BADGE_HALF,
      };

      setSidePlusState((current) => {
        if (
          current.visible === nextState.visible &&
          current.magnet === nextState.magnet &&
          Math.abs(current.left - nextState.left) < 0.5 &&
          Math.abs(current.top - nextState.top) < 0.5
        ) {
          return current;
        }

        return nextState;
      });
    };

    document.addEventListener('mousemove', updateSidePlusPosition);

    return () => {
      document.removeEventListener('mousemove', updateSidePlusPosition);
    };
  }, [active, anchorElementRef, connecting, containerRef, coordinateSpace, disabled, edge, isLeft, store]);

  if (disabled) {
    return null;
  }

  const zoneLeft = isLeft ? -SIDE_ZONE_WIDTH : 0;

  return (
    <div
      ref={rootRef}
      data-canvas-menu-ignore="true"
      className={[
        'pointer-events-none absolute z-20 overflow-visible',
        className ?? '',
      ].join(' ')}
      style={{
        left: isLeft ? 0 : '100%',
        top: 0,
        width: 0,
        height: '100%',
      }}
    >
      <div
        className={[
          'card-side-handle-zone',
          SIDE_ZONE_BASE,
        ].join(' ')}
        style={{
          left: `${zoneLeft}px`,
          top: topOffset,
          width: SIDE_ZONE_WIDTH,
          height,
          pointerEvents: shouldShowSidePlus ? 'auto' : 'none',
        }}
        onMouseDown={onMouseDown}
      />
      <span
        aria-hidden="true"
        className={[
          'card-side-handle-badge',
          HANDLE_BADGE_BASE,
          shouldShowSidePlus ? 'opacity-100' : 'opacity-0',
          sidePlusState.magnet ? 'card-side-plus-btn--magnet' : '',
          connecting ? 'card-side-plus-btn--active' : '',
        ].join(' ')}
        style={{
          top: `${sidePlusState.top}px`,
          left: `${sidePlusState.left}px`,
        }}
        onMouseDown={onMouseDown}
      >
        <Plus size={12} className="pointer-events-none" />
      </span>
    </div>
  );
}

export function CardSideHandle({
  type,
  position,
  visible = false,
  disabled = false,
  cardTopOffset = 0,
  cardLeftOffset = 0,
  cardWidth = 0,
}: CardSideHandleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleDomId = useId();
  const nodeId = useNodeId();
  const store = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const cleanupRef = useRef<(() => void) | null>(null);
  const cardAnchorRef = useRef<HTMLDivElement | null>(null);
  const [isConnectingFromPlus, setIsConnectingFromPlus] = useState(false);
  const shouldMeasureCardBounds = cardWidth <= 0;
  const [measuredCardBounds, setMeasuredCardBounds] = useState({
    left: cardLeftOffset,
    width: cardWidth,
  });
  const handleTop = useMemo(
    () => `calc(50% + ${cardTopOffset / 2}px)`,
    [cardTopOffset],
  );
  const resolvedCardLeft = shouldMeasureCardBounds ? measuredCardBounds.left : cardLeftOffset;
  const resolvedCardWidth = shouldMeasureCardBounds ? measuredCardBounds.width : cardWidth;
  const cardRightEdge = resolvedCardLeft + resolvedCardWidth;
  const handleLeft = position === Position.Left
    ? resolvedCardLeft - HANDLE_SIZE / 2
    : cardRightEdge - HANDLE_SIZE / 2;
  const shouldShowSidePlus = visible || isConnectingFromPlus;

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!nodeId || disabled) {
      return;
    }

    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      updateNodeInternals(nodeId);
      secondFrameId = window.requestAnimationFrame(() => {
        updateNodeInternals(nodeId);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [disabled, handleLeft, handleTop, nodeId, updateNodeInternals]);

  useEffect(() => {
    if (!shouldMeasureCardBounds) {
      return;
    }

    const overlayElement = rootRef.current;
    const containerElement = overlayElement?.parentElement;
    const cardElement = containerElement?.querySelector<HTMLElement>('.node-connectable-card');

    if (!overlayElement || !containerElement || !cardElement) {
      return;
    }

    const updateMeasuredCardBounds = () => {
      setMeasuredCardBounds({
        left: cardElement.offsetLeft,
        width: cardElement.offsetWidth,
      });
    };

    updateMeasuredCardBounds();

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => updateMeasuredCardBounds())
      : null;

    resizeObserver?.observe(containerElement);
    resizeObserver?.observe(cardElement);
    window.addEventListener('resize', updateMeasuredCardBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateMeasuredCardBounds);
    };
  }, [shouldMeasureCardBounds]);

  const startZoneConnection = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !nodeId) {
      return;
    }

    if (isSidePlusPointerBlocked(event.target, rootRef.current)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const handleElement = rootRef.current?.querySelector<HTMLElement>(`[data-handle-dom-id="${handleDomId}"]`);
    const {
      domNode,
      cancelConnection,
      connectionRadius,
      onConnect,
    } = store.getState();

    if (!handleElement || !domNode) {
      return;
    }

    setIsConnectingFromPlus(true);

    const doc = handleElement.ownerDocument;
    const containerBounds = domNode.getBoundingClientRect();
    const handleId = handleElement.getAttribute('data-handleid');
    const getDropTarget = (mouseEvent: MouseEvent) =>
      doc.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
    const getConnectionPosition = (mouseEvent: MouseEvent) => ({
      x: mouseEvent.clientX - containerBounds.left,
      y: mouseEvent.clientY - containerBounds.top,
    });
    const getHandleCenter = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();

      return {
        x: rect.left + rect.width / 2 - containerBounds.left,
        y: rect.top + rect.height / 2 - containerBounds.top,
      };
    };
    const buildConnectionFromTarget = (
      targetNodeId: string,
      targetHandleType: HandleType,
      targetHandleId: string | null,
    ): Connection | null => {
      if (targetNodeId === nodeId || targetHandleType === type) {
        return null;
      }

      if (type === 'source') {
        return {
          source: nodeId,
          sourceHandle: handleId,
          target: targetNodeId,
          targetHandle: targetHandleId,
        };
      }

      return {
        source: targetNodeId,
        sourceHandle: targetHandleId,
        target: nodeId,
        targetHandle: handleId,
      };
    };

    const expectedTargetClass = type === 'source' ? 'target' : 'source';
    const findClosestHandle = (
      mouseEvent: MouseEvent,
      handles: HTMLElement[],
      maxDistance = Number.POSITIVE_INFINITY,
    ): HTMLElement | null => {
      let closestHandle: HTMLElement | null = null;
      let closestDistance = maxDistance;

      handles.forEach((candidate) => {
        const candidateNodeId = candidate.getAttribute('data-nodeid');

        if (!candidateNodeId || candidateNodeId === nodeId) {
          return;
        }

        const rect = candidate.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(mouseEvent.clientX - centerX, mouseEvent.clientY - centerY);

        if (distance <= closestDistance) {
          closestDistance = distance;
          closestHandle = candidate;
        }
      });

      return closestHandle;
    };

    const findHandleFromNodeBody = (mouseEvent: MouseEvent): HTMLElement | null => {
      const candidateNodes = Array.from(
        doc.querySelectorAll<HTMLElement>('.react-flow__node'),
      );

      let matchedHandle: HTMLElement | null = null;
      let matchedDistance = Number.POSITIVE_INFINITY;

      candidateNodes.forEach((candidateNode) => {
        const candidateNodeId = candidateNode.getAttribute('data-id');

        if (!candidateNodeId || candidateNodeId === nodeId) {
          return;
        }

        const cardElement = candidateNode.querySelector<HTMLElement>('.node-connectable-card');
        const bounds = (cardElement ?? candidateNode).getBoundingClientRect();
        const isInsideCard = (
          mouseEvent.clientX >= bounds.left &&
          mouseEvent.clientX <= bounds.right &&
          mouseEvent.clientY >= bounds.top &&
          mouseEvent.clientY <= bounds.bottom
        );

        if (!isInsideCard) {
          return;
        }

        const nodeHandles = Array.from(
          candidateNode.querySelectorAll<HTMLElement>(`.react-flow__handle.${expectedTargetClass}`),
        );
        const nodeHandle = findClosestHandle(mouseEvent, nodeHandles);

        if (!nodeHandle) {
          return;
        }

        const rect = nodeHandle.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(mouseEvent.clientX - centerX, mouseEvent.clientY - centerY);

        if (distance < matchedDistance) {
          matchedDistance = distance;
          matchedHandle = nodeHandle;
        }
      });

      return matchedHandle;
    };

    const resolveTargetHandle = (mouseEvent: MouseEvent): HTMLElement | null => {
      const directTarget = getDropTarget(mouseEvent) as Element | null;
      const directHandle = directTarget?.closest('.react-flow__handle') as HTMLElement | null;

      if (directHandle?.classList.contains(expectedTargetClass)) {
        return directHandle;
      }

      const directNode = directTarget?.closest('.react-flow__node') as HTMLElement | null;
      const directNodeId = directNode?.getAttribute('data-id');

      if (directNode && directNodeId && directNodeId !== nodeId) {
        const nodeHandles = Array.from(
          directNode.querySelectorAll<HTMLElement>(`.react-flow__handle.${expectedTargetClass}`),
        );
        const directNodeHandle = findClosestHandle(mouseEvent, nodeHandles);

        if (directNodeHandle) {
          return directNodeHandle;
        }
      }

      const nodeBodyHandle = findHandleFromNodeBody(mouseEvent);

      if (nodeBodyHandle) {
        return nodeBodyHandle;
      }

      const candidateHandles = Array.from(
        doc.querySelectorAll<HTMLElement>(`.react-flow__handle.${expectedTargetClass}`),
      );

      return findClosestHandle(mouseEvent, candidateHandles, connectionRadius);
    };

    store.setState({
      connectionNodeId: nodeId,
      connectionHandleId: handleId,
      connectionHandleType: type,
      connectionStatus: null,
      connectionPosition: getHandleCenter(handleElement),
      connectionStartHandle: {
        nodeId,
        handleId,
        type,
      },
      connectionEndHandle: null,
    });

    activeConnectionCleanup?.();

    let activeTargetHandleElement: HTMLElement | null = null;

    const resetTargetHandleHighlight = () => {
      if (!activeTargetHandleElement) {
        return;
      }

      activeTargetHandleElement.classList.remove(
        'connecting',
        'valid',
        'react-flow__handle-connecting',
        'react-flow__handle-valid',
      );
      activeTargetHandleElement = null;
    };

    const setTargetHandleHighlight = (element: HTMLElement) => {
      if (activeTargetHandleElement === element) {
        return;
      }

      resetTargetHandleHighlight();
      activeTargetHandleElement = element;
      activeTargetHandleElement.classList.add(
        'connecting',
        'valid',
        'react-flow__handle-connecting',
        'react-flow__handle-valid',
      );
    };

    const cleanup = () => {
      doc.removeEventListener('mousemove', handleMouseMove);
      doc.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      resetTargetHandleHighlight();
      cancelConnection();
      setIsConnectingFromPlus(false);
      cleanupRef.current = null;
      if (activeConnectionCleanup === cleanup) {
        activeConnectionCleanup = null;
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const targetHandleElement = resolveTargetHandle(moveEvent);

      if (targetHandleElement) {
        const targetNodeId = targetHandleElement.getAttribute('data-nodeid');
        const targetHandleType = targetHandleElement.classList.contains('source')
          ? 'source'
          : targetHandleElement.classList.contains('target')
            ? 'target'
            : null;

        if (targetNodeId && targetHandleType) {
          const connection = buildConnectionFromTarget(
            targetNodeId,
            targetHandleType,
            targetHandleElement.getAttribute('data-handleid'),
          );

          if (connection) {
            setTargetHandleHighlight(targetHandleElement);
            store.setState({
              connectionPosition: getHandleCenter(targetHandleElement),
              connectionStatus: 'valid',
              connectionEndHandle: {
                nodeId: targetNodeId,
                handleId: targetHandleElement.getAttribute('data-handleid'),
                type: targetHandleType,
              },
            });
            return;
          }
        }
      }

      resetTargetHandleHighlight();
      store.setState({
        connectionPosition: getConnectionPosition(moveEvent),
        connectionStatus: null,
        connectionEndHandle: null,
      });
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const dropTarget = getDropTarget(upEvent) as Element | null;
      const targetHandleElement = resolveTargetHandle(upEvent);
      let connection: Connection | null = null;

      if (targetHandleElement) {
        const targetNodeId = targetHandleElement.getAttribute('data-nodeid');
        const targetHandleType = targetHandleElement.classList.contains('source')
          ? 'source'
          : targetHandleElement.classList.contains('target')
            ? 'target'
            : null;

        if (targetNodeId && targetHandleType) {
          connection = buildConnectionFromTarget(
            targetNodeId,
            targetHandleType,
            targetHandleElement.getAttribute('data-handleid'),
          );
        }
      } else {
        const targetNodeElement = dropTarget?.closest('.react-flow__node');
        const targetNodeId = targetNodeElement?.getAttribute('data-id');

        if (targetNodeId && targetNodeId !== nodeId) {
          connection = type === 'source'
            ? {
                source: nodeId,
                sourceHandle: handleId,
                target: targetNodeId,
                targetHandle: null,
              }
            : {
                source: targetNodeId,
                sourceHandle: null,
                target: nodeId,
                targetHandle: handleId,
              };
        }
      }

      if (connection) {
        onConnect?.(connection);
      } else {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        window.dispatchEvent(new CustomEvent(BLANK_CONNECTION_DROP_EVENT, {
          detail: {
            nodeId,
            handleId,
            handleType: type,
            screen: {
              x: upEvent.clientX,
              y: upEvent.clientY,
            },
          },
        }));
      }

      cleanup();
    };

    const handleWindowBlur = () => {
      cleanup();
    };

    doc.addEventListener('mousemove', handleMouseMove);
    doc.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    cleanupRef.current = cleanup;
    activeConnectionCleanup = cleanup;
  }, [handleDomId, nodeId, store, type]);

  if (disabled) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
    >
      <div
        ref={cardAnchorRef}
        className="pointer-events-none absolute"
        style={{
          left: `${resolvedCardLeft}px`,
          top: 0,
          width: `${resolvedCardWidth}px`,
          height: '100%',
        }}
      />
      <Handle
        data-handle-dom-id={handleDomId}
        type={type}
        position={position}
        className={[
          'card-side-handle',
          HANDLE_HITBOX_BASE,
          shouldShowSidePlus ? '!opacity-100' : '!opacity-0',
        ].join(' ')}
        style={{
          top: handleTop,
          left: `${handleLeft}px`,
        }}
      />
      <MagneticSidePlus
        edge={position === Position.Left ? 'left' : 'right'}
        active={visible || isConnectingFromPlus}
        connecting={isConnectingFromPlus}
        disabled={disabled}
        containerRef={rootRef}
        anchorElementRef={cardAnchorRef}
        topOffset={cardTopOffset}
        height={`calc(100% - ${cardTopOffset}px)`}
        onMouseDown={startZoneConnection}
      />
    </div>
  );
}
