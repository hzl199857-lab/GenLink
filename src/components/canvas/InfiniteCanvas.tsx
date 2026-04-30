'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, CircleHelp, Expand, Grip, Image as ImageIcon, Map, Video, X } from 'lucide-react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  useViewport,
  NodeChange,
  EdgeChange,
  Connection,
  Node as ReactFlowNode,
  Edge as ReactFlowEdge,
  NodeProps,
  BackgroundVariant,
  Position,
  type OnConnectStartParams,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  CANVAS_IMAGE_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_API_KEY_STORAGE_KEY,
  useCanvasStore,
} from '@/store/canvas-store';
import type {
  CanvasNode,
  NodeType,
  TextNodeData,
  ImageGenerationNodeData,
  AITextResultNodeData,
  ImageNodeData,
  UploadedImageNodeData,
} from '@/types/canvas';

import { TextNode } from '../nodes/TextNode';
import { ImageGenerationNode } from '../nodes/ImageGenerationNode';
import { AITextResultNode } from '../nodes/AITextResultNode';
import { ImageNode } from '../nodes/ImageNode';
import { UploadedImageNode } from '../nodes/UploadedImageNode';
import { CardSideHandle } from '../nodes/CardSideHandle';
import {
  ImageGenerationInfoPopover,
  type ImageGenerationInfoPopoverData,
} from '../nodes/ImageGenerationInfoPopover';
import { NodeFloatingToolbar } from '../nodes/NodeFloatingToolbar';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { AddNodeMenu, type AddNodeMenuAction } from './AddNodeMenu';
import { CanvasToolbar } from './CanvasToolbar';

let notifyPromptBarInteraction: (() => void) | null = null;
let notifyImageToolbarAction: ((action: string) => void) | null = null;
let notifyImageGenerationCardClick:
  | ((data: ImageGenerationNodeData) => void)
  | null = null;
let notifyImageNodeCardClick:
  | ((data: ImageNodeData) => void)
  | null = null;
let notifyUploadedImageNodeCardClick:
  | ((data: UploadedImageNodeData) => void)
  | null = null;

function formatImageSize(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatImageResolution(width?: number, height?: number): string {
  if (!width || !height) {
    return '-';
  }

  return `${width}×${height}`;
}

function inferImageSizeBytesFromUrl(url?: string): number | undefined {
  if (!url?.startsWith('data:')) {
    return undefined;
  }

  const match = url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);

  if (!match?.[1]) {
    return undefined;
  }

  const base64Payload = match[1];
  const paddingLength = base64Payload.endsWith('==')
    ? 2
    : base64Payload.endsWith('=')
      ? 1
      : 0;

  return Math.max(
    0,
    Math.floor((base64Payload.length * 3) / 4) - paddingLength,
  );
}

function formatGeneratedAt(value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toImageInfoPopoverData(
  data: ImageGenerationNodeData,
): ImageGenerationInfoPopoverData {
  return {
    model: data.generatedModel?.trim() || data.model?.trim() || '-',
    format: data.generatedImageFormat?.trim() || 'PNG',
    size: formatImageSize(data.generatedImageSizeBytes),
    resolution: formatImageResolution(
      data.generatedImageWidth,
      data.generatedImageHeight,
    ),
    createdTime: formatGeneratedAt(data.generatedAt) || undefined,
  };
}

function inferImageFormatFromUrl(url?: string): string {
  if (!url?.trim()) {
    return '-';
  }

  const dataUrlMatch = url.match(/^data:image\/([a-zA-Z0-9.+-]+)[;,]/i);

  if (dataUrlMatch?.[1]) {
    return dataUrlMatch[1].toUpperCase();
  }

  const pathname = url.split('?')[0] ?? '';
  const extensionMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);

  if (extensionMatch?.[1]) {
    return extensionMatch[1].toUpperCase();
  }

  return '-';
}

function toImageNodeInfoPopoverData(
  data: ImageNodeData,
): ImageGenerationInfoPopoverData {
  return {
    model: data.model?.trim() || '-',
    format: inferImageFormatFromUrl(data.hostedImageUrl || data.imageUrl),
    size: formatImageSize(
      data.sizeBytes ?? inferImageSizeBytesFromUrl(data.imageUrl),
    ),
    resolution: formatImageResolution(data.width, data.height),
    createdTime: formatGeneratedAt(data.generatedAt) || undefined,
  };
}

function toUploadedImageInfoPopoverData(
  data: UploadedImageNodeData,
): ImageGenerationInfoPopoverData {
  return {
    model: '-',
    format: inferImageFormatFromUrl(data.hostedImageUrl || data.imageUrl),
    size: formatImageSize(
      data.sizeBytes ?? inferImageSizeBytesFromUrl(data.imageUrl),
    ),
    resolution: formatImageResolution(data.width, data.height),
  };
}

// --- Adapters ---
function readImageFile(file: File): Promise<UploadedImageNodeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';

      if (!imageUrl) {
        reject(new Error('Invalid image file'));
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        resolve({
          imageUrl,
          fileName: file.name,
          width: image.naturalWidth || 320,
          height: image.naturalHeight || 320,
          sizeBytes: file.size,
        });
      };
      image.onerror = () => reject(new Error('Invalid image file'));
      image.src = imageUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function createUploadedImageNode(
  data: UploadedImageNodeData,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: 'uploaded_image',
    position,
    data,
  };
}

function TextNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateText = useCanvasStore((s) => s.generateTextFromTextNode);
  const connectedImages = useCanvasStore((s) => s.getConnectedImagesForTextNode(id));
  const [editing, setEditing] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);

  return (
    <TextNode
      id={id}
      data={data as TextNodeData}
      selected={selected || promptFocused}
      editing={editing}
      connectedImages={connectedImages}
      onChange={(next) => updateNodeData<'text'>(id, next)}
      onStartEdit={() => setEditing(true)}
      onEndEdit={() => setEditing(false)}
      onRun={() => generateText(id)}
      onPromptPointerDown={() => notifyPromptBarInteraction?.()}
      onPromptFocusWithinChange={setPromptFocused}
    />
  );
}

function ImageGenerationNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateImage = useCanvasStore((s) => s.generateImageFromImageGenerationNode);
  const connectedImages = useCanvasStore((s) =>
    s.getConnectedImagesForImageGenerationNode(id),
  );
  const [promptFocused, setPromptFocused] = useState(false);

  return (
    <ImageGenerationNode
      id={id}
      data={data as ImageGenerationNodeData}
      selected={selected || promptFocused}
      connectedImages={connectedImages}
      onChange={(next) => updateNodeData<'image_generation'>(id, next)}
      onRun={() => generateImage(id)}
      onUpload={() => console.log('reference image upload pending')}
      onToolbarAction={(action) => notifyImageToolbarAction?.(action)}
      onImageCardClick={(next) => notifyImageGenerationCardClick?.(next)}
      onPromptPointerDown={() => notifyPromptBarInteraction?.()}
      onPromptFocusWithinChange={setPromptFocused}
    />
  );
}

function AITextResultNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'ai_text_result',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative group node-connectable-root">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={!!selected} />
      <AITextResultNode
        id={id}
        data={data as AITextResultNodeData}
        selected={selected}
      />
      <CardSideHandle type="source" position={Position.Right} visible={!!selected} />
    </div>
  );
}

function ImageNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative group node-connectable-root">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={!!selected} />
      <ImageNode
        id={id}
        data={data as ImageNodeData}
        selected={selected}
        loading={false}
        onShowInfo={() => notifyImageNodeCardClick?.(data as ImageNodeData)}
      />
      <CardSideHandle type="source" position={Position.Right} visible={!!selected} />
    </div>
  );
}

function UploadedImageNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const handleReplace = async (file: File) => {
    const next = await readImageFile(file);
    updateNodeData<'uploaded_image'>(id, next);
  };

  return (
    <UploadedImageNode
      data={data as UploadedImageNodeData}
      selected={selected}
      onReplace={handleReplace}
      onShowInfo={() => notifyUploadedImageNodeCardClick?.(data as UploadedImageNodeData)}
    />
  );
}

const nodeTypes = {
  text: TextNodeAdapter,
  image_generation: ImageGenerationNodeAdapter,
  ai_text_result: AITextResultNodeAdapter,
  image: ImageNodeAdapter,
  uploaded_image: UploadedImageNodeAdapter,
};

const EDGE_DELETE_BUTTON_SIZE = 20;
const EDGE_DELETE_BUTTON_OFFSET = 18;
const NODE_PASTE_OFFSET = 40;
const IMAGE_IMPORT_COLUMNS = 4;
const IMAGE_IMPORT_SPACING_X = 48;
const IMAGE_IMPORT_SPACING_Y = 48;
const CANVAS_MIN_ZOOM = 0.2;
const CANVAS_MAX_ZOOM = 2;
const CONNECTION_MENU_ANCHOR_NODE_ID = '__connection-menu-anchor__';
const BLANK_CONNECTION_DROP_EVENT = 'genlink:connection-blank-drop';

type ConnectionMenuAction = 'text' | 'image_generation' | 'video';

type PendingConnectionMenu = {
  screen: { x: number; y: number };
  canvas: { x: number; y: number };
  connection: OnConnectStartParams;
};

type BlankConnectionDropEventDetail = {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target';
  screen: { x: number; y: number };
};

function cloneNodeData<T>(data: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data)) as T;
}

function cloneCanvasNode(
  node: CanvasNode,
  offsetMultiplier = 1,
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: node.type,
    position: {
      x: node.position.x + NODE_PASTE_OFFSET * offsetMultiplier,
      y: node.position.y + NODE_PASTE_OFFSET * offsetMultiplier,
    },
    data: cloneNodeData(node.data),
  } as CanvasNode;
}

function getImageImportPosition(
  basePosition: { x: number; y: number },
  index: number,
): { x: number; y: number } {
  const column = index % IMAGE_IMPORT_COLUMNS;
  const row = Math.floor(index / IMAGE_IMPORT_COLUMNS);

  return {
    x: basePosition.x + column * IMAGE_IMPORT_SPACING_X,
    y: basePosition.y + row * IMAGE_IMPORT_SPACING_Y,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function getClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }

  const filesFromItems = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);

  if (filesFromItems.length > 0) {
    return filesFromItems;
  }

  return Array.from(data.files).filter((file) => file.type.startsWith('image/'));
}

function getEdgeDeleteButtonPosition(point: { x: number; y: number }): { x: number; y: number } {
  const maxX = Math.max(8, window.innerWidth - EDGE_DELETE_BUTTON_SIZE - 8);
  const maxY = Math.max(8, window.innerHeight - EDGE_DELETE_BUTTON_SIZE - 8);

  return {
    x: Math.min(Math.max(point.x + EDGE_DELETE_BUTTON_OFFSET, 8), maxX),
    y: Math.min(Math.max(point.y + EDGE_DELETE_BUTTON_OFFSET, 8), maxY),
  };
}

function getConnectDropTargetElement(event: MouseEvent | TouchEvent): Element | null {
  if (event.target instanceof Element) {
    return event.target;
  }

  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];

    if (touch) {
      return document.elementFromPoint(touch.clientX, touch.clientY);
    }
  }

  return null;
}

function getConnectEndScreenPosition(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];

    if (!touch) {
      return null;
    }

    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function clampZoomLevel(zoom: number): number {
  return Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, zoom));
}

function CanvasViewportControls() {
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true);
  const clampedZoom = clampZoomLevel(zoom);

  return (
    <>
      {isMiniMapVisible ? (
        <MiniMap
          position="bottom-left"
          className="canvas-minimap-panel"
          style={{
            width: 200,
            height: 150,
            background: '#19191b',
          }}
          maskColor="#19191b"
          maskStrokeColor="transparent"
          maskStrokeWidth={0}
          nodeColor={() => 'rgba(118,126,145,0.46)'}
          nodeStrokeColor={() => 'rgba(255,255,255,0.08)'}
          nodeBorderRadius={3}
          pannable
          zoomable
        />
      ) : null}

      <Panel position="bottom-left" className="canvas-zoom-panel">
        <button
          type="button"
          className="canvas-zoom-round-button"
          aria-label={isMiniMapVisible ? 'Hide minimap' : 'Show minimap'}
          aria-pressed={isMiniMapVisible}
          title={isMiniMapVisible ? '关闭地图' : '打开地图'}
          onClick={() => setIsMiniMapVisible((visible) => !visible)}
        >
          <Map size={14} />
        </button>

        <div className="canvas-zoom-shell flex items-center gap-2 rounded-full bg-[#202124] px-2 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <button
            type="button"
            className="canvas-zoom-icon-button"
            aria-label="Drag handle"
            title="移动"
          >
            <Grip size={15} />
          </button>

          <button
            type="button"
            className="canvas-zoom-icon-button"
            onClick={() => void fitView({ duration: 220, padding: 0.18 })}
            aria-label="Fit view"
            title="适应画布"
          >
            <Expand size={15} />
          </button>

          <input
            type="range"
            min={CANVAS_MIN_ZOOM}
            max={CANVAS_MAX_ZOOM}
            step={0.01}
            value={clampedZoom}
            onChange={(event) => {
              void zoomTo(Number(event.target.value), { duration: 120 });
            }}
            className="canvas-zoom-slider"
            aria-label="Canvas zoom"
          />
        </div>

        <button
          type="button"
          className="canvas-zoom-round-button"
          aria-label="Help"
          title="帮助"
        >
          <CircleHelp size={14} />
        </button>
      </Panel>
    </>
  );
}

function ConnectionCreateMenu({
  x,
  y,
  onSelect,
}: {
  x: number;
  y: number;
  onSelect?: (action: ConnectionMenuAction) => void;
}) {
  const items: Array<{
    action: ConnectionMenuAction;
    title: string;
    subtitle?: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  }> = [
    {
      action: 'text',
      title: '文本生成',
      subtitle: '脚本、广告词、品牌文案',
      icon: AlignLeft,
    },
    {
      action: 'image_generation',
      title: '图片生成',
      icon: ImageIcon,
    },
    {
      action: 'video',
      title: '视频生成',
      icon: Video,
    },
  ];

  return (
    <div
      className="fixed z-[65] w-[288px] rounded-[16px] border border-white/10 bg-[#191A1C]/95 p-3 shadow-[0_18px_42px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="px-1 pb-2 text-[13px] font-medium text-gl-text-muted">引用该节点生成</div>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.action}
              type="button"
              onClick={() => onSelect?.(item.action)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-gl-text-secondary">
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-5 text-gl-text-secondary">
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span className="mt-0.5 block truncate text-[12px] leading-4 text-gl-text-muted">
                    {item.subtitle}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Inner Canvas ---
function InnerCanvas() {
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);

  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdgeStore = useCanvasStore((s) => s.addEdge);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeDeleteButtonPosition, setEdgeDeleteButtonPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [addMenu, setAddMenu] = useState<{
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
  } | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<PendingConnectionMenu | null>(null);
  const [imageInfoPopover, setImageInfoPopover] = useState<ImageGenerationInfoPopoverData | null>(null);
  const activeSelectedEdgeId = selectedEdgeId && storeEdges.some((edge) => edge.id === selectedEdgeId)
    ? selectedEdgeId
    : null;

  const rfNodes = useMemo<ReactFlowNode[]>(() => {
    const nodes: ReactFlowNode[] = storeNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
      selected: selectedNodeIds.has(n.id),
      dragHandle:
        n.type === 'text'
          ? '.text-node-drag-handle'
          : undefined,
    }));

    if (connectionMenu) {
      nodes.push({
        id: CONNECTION_MENU_ANCHOR_NODE_ID,
        type: 'default',
        position: connectionMenu.canvas,
        data: {},
        selectable: false,
        draggable: false,
        focusable: false,
        style: {
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        },
      });
    }

    return nodes;
  }, [connectionMenu, storeNodes, selectedNodeIds]);

  const rfEdges = useMemo<ReactFlowEdge[]>(() => {
    const edges: ReactFlowEdge[] = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      selected: activeSelectedEdgeId === e.id,
      interactionWidth: 28,
      style: activeSelectedEdgeId === e.id
        ? {
            stroke: 'rgba(255,255,255,0.95)',
            strokeWidth: 4.4,
          }
        : {
            stroke: 'rgba(190,205,225,0.3)',
            strokeWidth: 2.8,
          },
    }));

    if (connectionMenu?.connection.nodeId && connectionMenu.connection.handleType) {
      const connection = connectionMenu.connection;
      const connectionNodeId = connection.nodeId;

      if (!connectionNodeId) {
        return edges;
      }
      const source = connection.handleType === 'source'
        ? connectionNodeId
        : CONNECTION_MENU_ANCHOR_NODE_ID;
      const target = connection.handleType === 'source'
        ? CONNECTION_MENU_ANCHOR_NODE_ID
        : connectionNodeId;

      edges.push({
        id: '__connection-menu-preview-edge__',
        source,
        target,
        sourceHandle: connection.handleType === 'source'
          ? connection.handleId || undefined
          : undefined,
        targetHandle: connection.handleType === 'target'
          ? connection.handleId || undefined
          : undefined,
        interactionWidth: 0,
        style: {
          stroke: 'rgba(190,205,225,0.42)',
          strokeWidth: 3,
        },
      });
    }

    return edges;
  }, [activeSelectedEdgeId, connectionMenu, storeEdges]);

  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [textApiKey, setTextApiKey] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(CANVAS_TEXT_API_KEY_STORAGE_KEY) ?? '',
  );
  const [imageApiKey, setImageApiKey] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(CANVAS_IMAGE_API_KEY_STORAGE_KEY) ?? '',
  );
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const copiedNodesRef = useRef<CanvasNode[]>([]);
  const pasteCountRef = useRef(0);
  const promptBarInteractionRef = useRef(false);
  const pendingConnectionRef = useRef<OnConnectStartParams | null>(null);
  const suppressNextPaneClearRef = useRef(false);

  const { project } = useReactFlow();

  useEffect(() => {
    notifyPromptBarInteraction = () => {
      promptBarInteractionRef.current = true;
      window.setTimeout(() => {
        promptBarInteractionRef.current = false;
      }, 0);
    };

    return () => {
      if (notifyPromptBarInteraction) {
        notifyPromptBarInteraction = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyImageToolbarAction = (action) => {
      console.log(`image toolbar action pending: ${action}`);
    };

    return () => {
      if (notifyImageToolbarAction) {
        notifyImageToolbarAction = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyImageGenerationCardClick = (data) => {
      setImageInfoPopover(toImageInfoPopoverData(data));
    };

    return () => {
      if (notifyImageGenerationCardClick) {
        notifyImageGenerationCardClick = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyImageNodeCardClick = (data) => {
      setImageInfoPopover(toImageNodeInfoPopoverData(data));
    };

    return () => {
      if (notifyImageNodeCardClick) {
        notifyImageNodeCardClick = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyUploadedImageNodeCardClick = (data) => {
      setImageInfoPopover(toUploadedImageInfoPopoverData(data));
    };

    return () => {
      if (notifyUploadedImageNodeCardClick) {
        notifyUploadedImageNodeCardClick = null;
      }
    };
  }, []);

  const clearEdgeSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeDeleteButtonPosition(null);
  }, []);

  const clearConnectionMenu = useCallback(() => {
    setConnectionMenu(null);
  }, [setConnectionMenu]);

  useEffect(() => {
    const handleBlankConnectionDrop = (event: Event) => {
      const detail = (event as CustomEvent<BlankConnectionDropEventDetail>).detail;

      if (!detail?.nodeId || !detail.handleType) {
        return;
      }

      setSelectedNodeIds(new Set());
      clearEdgeSelection();
      setAddMenu(null);
      setImageInfoPopover(null);
      suppressNextPaneClearRef.current = true;
      window.setTimeout(() => {
        suppressNextPaneClearRef.current = false;
      }, 250);
      setConnectionMenu({
        screen: detail.screen,
        canvas: project(detail.screen),
        connection: {
          nodeId: detail.nodeId,
          handleId: detail.handleId,
          handleType: detail.handleType,
        },
      });
    };

    window.addEventListener(BLANK_CONNECTION_DROP_EVENT, handleBlankConnectionDrop);
    return () => window.removeEventListener(BLANK_CONNECTION_DROP_EVENT, handleBlankConnectionDrop);
  }, [clearEdgeSelection, project]);

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) {
      return;
    }

    deleteEdge(selectedEdgeId);
    clearEdgeSelection();
  }, [clearEdgeSelection, deleteEdge, selectedEdgeId]);

  const handleDeleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return;
    }

    selectedNodeIds.forEach((nodeId) => {
      deleteNode(nodeId);
    });

    setSelectedNodeIds(new Set());
  }, [deleteNode, selectedNodeIds]);

  const handleCopySelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return false;
    }

    const selectedNodes = storeNodes.filter((node) => selectedNodeIds.has(node.id));

    if (selectedNodes.length === 0) {
      return false;
    }

    copiedNodesRef.current = selectedNodes.map((node) => cloneCanvasNode(node, 0));
    pasteCountRef.current = 0;
    return true;
  }, [selectedNodeIds, storeNodes]);

  const handlePasteNodes = useCallback(() => {
    if (copiedNodesRef.current.length === 0) {
      return false;
    }

    pasteCountRef.current += 1;

    const pastedNodes = copiedNodesRef.current.map((node) =>
      cloneCanvasNode(node, pasteCountRef.current),
    );

    pastedNodes.forEach((node) => addNode(node));
    setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
    clearEdgeSelection();
    return true;
  }, [addNode, clearEdgeSelection]);

  const addUploadedImages = useCallback(async (
    files: File[],
    basePosition: { x: number; y: number },
  ) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    const imageDataList = await Promise.all(imageFiles.map((file) => readImageFile(file)));
    const nextNodeIds = new Set<string>();

    imageDataList.forEach((data, index) => {
      const node = createUploadedImageNode(
        data,
        getImageImportPosition(basePosition, index),
      );
      nextNodeIds.add(node.id);
      addNode(node);
    });

    setSelectedNodeIds(nextNodeIds);
    clearEdgeSelection();
  }, [addNode, clearEdgeSelection]);

  useEffect(() => {
    if (!selectedEdgeId && selectedNodeIds.size === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (isModifierPressed && key === 'c') {
        if (handleCopySelectedNodes()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      event.preventDefault();
      if (selectedNodeIds.size > 0) {
        handleDeleteSelectedNodes();
        clearEdgeSelection();
        return;
      }

      handleDeleteSelectedEdge();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearEdgeSelection,
    handleCopySelectedNodes,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    selectedEdgeId,
    selectedNodeIds,
  ]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageFiles = getClipboardImageFiles(event.clipboardData);

      if (imageFiles.length > 0) {
        event.preventDefault();
        clearEdgeSelection();
        setAddMenu(null);
        clearConnectionMenu();
        setImageInfoPopover(null);
        const center = project({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        void addUploadedImages(imageFiles, center);
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (handlePasteNodes()) {
        event.preventDefault();
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addUploadedImages, clearConnectionMenu, clearEdgeSelection, handlePasteNodes, project]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const selectionChanges = changes.filter((change) => change.type === 'select');

    if (selectionChanges.length > 0) {
      if (promptBarInteractionRef.current) {
        return;
      }

      const activeElement = document.activeElement;

      if (!(activeElement instanceof Element) || !activeElement.closest('.text-node-prompt-bar')) {
        setSelectedNodeIds((current) => {
          const next = new Set(current);

          selectionChanges.forEach((change) => {
            if (change.selected) {
              next.add(change.id);
            } else {
              next.delete(change.id);
            }
          });

          return next;
        });
      }
    }

    changes.forEach((change) => {
      if (change.type === 'position' && change.position) {
        updateNodePosition(change.id, change.position);
      } else if (change.type === 'remove') {
        setSelectedNodeIds((current) => {
          if (!current.has(change.id)) return current;

          const next = new Set(current);
          next.delete(change.id);
          return next;
        });
        deleteNode(change.id);
      }
    });
  }, [updateNodePosition, deleteNode]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    changes.forEach((change) => {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      }
    });
  }, [deleteEdge]);

  const handleEdgeClick = useCallback((
    event: React.MouseEvent,
    edge: ReactFlowEdge,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedNodeIds(new Set());
    setAddMenu(null);
    clearConnectionMenu();
    setSelectedEdgeId(edge.id);
    setEdgeDeleteButtonPosition(getEdgeDeleteButtonPosition({
      x: event.clientX,
      y: event.clientY,
    }));
  }, [clearConnectionMenu]);

  const handlePaneClick = useCallback(() => {
    if (suppressNextPaneClearRef.current) {
      return;
    }

    setAddMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
    clearEdgeSelection();
  }, [clearConnectionMenu, clearEdgeSelection]);

  const onConnect = useCallback((connection: Connection) => {
    clearConnectionMenu();
    addEdgeStore({
      id: crypto.randomUUID(),
      source: connection.source || '',
      target: connection.target || '',
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
    });
  }, [addEdgeStore, clearConnectionMenu]);

  const onConnectStart = useCallback((_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
    pendingConnectionRef.current = params;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const pendingConnection = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pendingConnection?.nodeId || !pendingConnection.handleType) {
      return;
    }

    const dropTarget = getConnectDropTargetElement(event);

    if (!dropTarget || dropTarget.closest('.react-flow__handle')) {
      return;
    }

    const targetNodeElement = dropTarget.closest('.react-flow__node');
    const targetNodeId = targetNodeElement?.getAttribute('data-id');

    if (!targetNodeId || targetNodeId === pendingConnection.nodeId) {
      const screenPosition = getConnectEndScreenPosition(event);

      if (!screenPosition) {
        return;
      }

      setSelectedNodeIds(new Set());
      clearEdgeSelection();
      setAddMenu(null);
      setImageInfoPopover(null);
      suppressNextPaneClearRef.current = true;
      window.setTimeout(() => {
        suppressNextPaneClearRef.current = false;
      }, 250);
      setConnectionMenu({
        screen: screenPosition,
        canvas: project(screenPosition),
        connection: pendingConnection,
      });
      return;
    }

    if (pendingConnection.handleType === 'source') {
      addEdgeStore({
        id: crypto.randomUUID(),
        source: pendingConnection.nodeId,
        target: targetNodeId,
        sourceHandle: pendingConnection.handleId || undefined,
      });
      return;
    }

    addEdgeStore({
      id: crypto.randomUUID(),
      source: targetNodeId,
      target: pendingConnection.nodeId,
      targetHandle: pendingConnection.handleId || undefined,
    });
  }, [addEdgeStore, clearEdgeSelection, project]);

  const handleAddNode = useCallback((type: NodeType) => {
    const center = project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNodeAtCenter(type, center);
  }, [addNodeAtCenter, project]);

  const openUploadPicker = useCallback((position?: { x: number; y: number }) => {
    uploadPositionRef.current = position ?? project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const input = uploadInputRef.current;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
  }, [project]);

  const handleUploadInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const position = uploadPositionRef.current;

    if (files.length > 0 && position) {
      void addUploadedImages(files, position);
    }

    event.target.value = '';
    uploadPositionRef.current = null;
  }, [addUploadedImages]);

  const handleImageDrop = useCallback((event: React.DragEvent) => {
    const files = Array.from(event.dataTransfer.files).filter((item) => item.type.startsWith('image/'));

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    setAddMenu(null);
    setImageInfoPopover(null);
    void addUploadedImages(
      files,
      project({ x: event.clientX, y: event.clientY }),
    );
  }, [addUploadedImages, project]);

  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    const target = event.target;

    if (!(target instanceof Element) || target.closest('.react-flow__node')) {
      return;
    }

    const canvasPosition = project({
      x: event.clientX,
      y: event.clientY,
    });

    setAddMenu({
      screen: { x: event.clientX, y: event.clientY },
      canvas: canvasPosition,
    });
    clearConnectionMenu();
  }, [clearConnectionMenu, project]);

  const handleAddMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (action === 'text' && addMenu) {
      addNodeAtCenter('text', addMenu.canvas);
    }

    if (action === 'image_generation' && addMenu) {
      addNodeAtCenter('image_generation', addMenu.canvas);
    }

    if (action === 'upload' && addMenu) {
      openUploadPicker(addMenu.canvas);
    }

    setAddMenu(null);
  }, [addMenu, addNodeAtCenter, openUploadPicker]);

  const handleConnectionMenuSelect = useCallback((action: ConnectionMenuAction) => {
    if (!connectionMenu) {
      return;
    }

    if (action === 'video') {
      clearConnectionMenu();
      return;
    }

    const nodeType: NodeType = action === 'text' ? 'text' : 'image_generation';
    const nextNode = addNodeAtCenter(nodeType, connectionMenu.canvas);
    const connection = connectionMenu.connection;

    if (connection.nodeId && connection.handleType) {
      addEdgeStore({
        id: crypto.randomUUID(),
        source: connection.handleType === 'source'
          ? connection.nodeId
          : nextNode.id,
        target: connection.handleType === 'source'
          ? nextNode.id
          : connection.nodeId,
        sourceHandle: connection.handleType === 'source'
          ? connection.handleId || undefined
          : undefined,
        targetHandle: connection.handleType === 'target'
          ? connection.handleId || undefined
          : undefined,
      });
    }

    setSelectedNodeIds(new Set([nextNode.id]));
    clearEdgeSelection();
    clearConnectionMenu();
  }, [
    addEdgeStore,
    addNodeAtCenter,
    clearConnectionMenu,
    clearEdgeSelection,
    connectionMenu,
  ]);

  const handleSaveApiKeys = useCallback((values: { textApiKey: string; imageApiKey: string }) => {
    window.localStorage.setItem(CANVAS_TEXT_API_KEY_STORAGE_KEY, values.textApiKey);
    window.localStorage.setItem(CANVAS_IMAGE_API_KEY_STORAGE_KEY, values.imageApiKey);
    setTextApiKey(values.textApiKey);
    setImageApiKey(values.imageApiKey);
    setApiSettingsOpen(false);
  }, []);

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeClick={clearEdgeSelection}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={handlePaneClick}
        onPaneScroll={handlePaneClick}
        onMoveStart={handlePaneClick}
        onDoubleClick={handlePaneDoubleClick}
        connectOnClick={false}
        zoomOnDoubleClick={false}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        nodeDragThreshold={1}
        deleteKeyCode={null}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: 'rgba(190,205,225,0.3)', strokeWidth: 2.8 },
          type: 'smoothstep',
        }}
        fitView
        onDrop={handleImageDrop}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
      >
        <Background
          gap={24}
          size={0.8}
          color="rgba(255,255,255,0.06)"
          variant={BackgroundVariant.Dots}
          className="gl-canvas-bg"
        />
        <CanvasViewportControls />
      </ReactFlow>

      {activeSelectedEdgeId && edgeDeleteButtonPosition ? (
        <button
          type="button"
          aria-label="Delete selected connection"
          className="edge-delete-button fixed z-20 flex h-5 w-5 items-center justify-center rounded-full border border-white/35 bg-white text-[#1b1f27] shadow-[0_8px_18px_rgba(255,255,255,0.22)] transition hover:scale-110 hover:bg-white/90"
          style={{
            left: edgeDeleteButtonPosition.x,
            top: edgeDeleteButtonPosition.y,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDeleteSelectedEdge();
          }}
        >
          <X size={10} strokeWidth={3} />
        </button>
      ) : null}

      {addMenu ? (
        <AddNodeMenu
          x={addMenu.screen.x}
          y={addMenu.screen.y}
          onSelect={handleAddMenuSelect}
        />
      ) : null}

      {connectionMenu ? (
        <ConnectionCreateMenu
          x={connectionMenu.screen.x}
          y={connectionMenu.screen.y}
          onSelect={handleConnectionMenuSelect}
        />
      ) : null}

      <CanvasToolbar
        onAddTextNode={() => handleAddNode('text')}
        onAddImageGenerationNode={() => handleAddNode('image_generation')}
        onUploadImage={() => openUploadPicker()}
        onOpenApiSettings={() => setApiSettingsOpen(true)}
      />
      <ImageGenerationInfoPopover
        open={imageInfoPopover !== null}
        data={imageInfoPopover}
        onClose={() => setImageInfoPopover(null)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleUploadInputChange}
      />
      <ApiSettingsPanel
        open={apiSettingsOpen}
        initialTextApiKey={textApiKey}
        initialImageApiKey={imageApiKey}
        onClose={() => setApiSettingsOpen(false)}
        onSave={handleSaveApiKeys}
      />
    </>
  );
}

// --- Wrapper ---
export function InfiniteCanvas() {
  return (
    <ReactFlowProvider>
      <InnerCanvas />
    </ReactFlowProvider>
  );
}
