import React, { useCallback, useEffect, useMemo, useRef, useId } from 'react';
import {
  Handle,
  Position,
  type Connection,
  type HandleType,
  useNodeId,
  useStoreApi,
} from 'reactflow';
import { Plus } from 'lucide-react';

const SIDE_ZONE_WIDTH = 96;

const HANDLE_HITBOX_BASE =
  '!z-30 !pointer-events-auto !w-[10px] !-translate-y-1/2 !rounded-full !border-0 !bg-transparent cursor-crosshair nodrag nopan';

const HANDLE_BADGE_BASE =
  'pointer-events-none absolute z-40 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-gl-stroke-medium bg-gl-panel text-gl-text-tertiary transition-[opacity,color,box-shadow,border-color] duration-150 nodrag nopan';

const SIDE_ZONE_BASE =
  'pointer-events-auto absolute z-20 cursor-crosshair nodrag nopan';

let activeConnectionCleanup: (() => void) | null = null;

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
  const nodeId = useNodeId();
  const store = useStoreApi();
  const cleanupRef = useRef<(() => void) | null>(null);
  const handleTop = useMemo(
    () => `calc(50% + ${cardTopOffset / 2}px)`,
    [cardTopOffset],
  );
  const sideClass = position === Position.Left
    ? '!-left-[5px]'
    : '!-right-[5px]';
  const defaultBadgeSideClass = position === Position.Left ? '-left-[44px]' : '-right-[44px]';
  const zoneSideClass = position === Position.Left ? '-left-[96px]' : '-right-[96px]';

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const startZoneConnection = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !nodeId) {
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
      connectionPosition: getConnectionPosition(event.nativeEvent),
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

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
    >
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
        onMouseDown={startZoneConnection}
      />
      <span
        aria-hidden="true"
        className={[
          'card-side-handle-badge',
          HANDLE_BADGE_BASE,
          defaultBadgeSideClass,
          visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ].join(' ')}
        style={{ top: handleTop }}
      >
        <Plus size={12} className="pointer-events-none" />
      </span>
    </div>
  );
}
