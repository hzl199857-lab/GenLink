'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import NextImage from 'next/image';
import {
  ChevronDown,
  Copy,
  Expand,
  FolderPlus,
  Group,
  Map as MapIcon,
  Plus,
  X,
  Check,
  CropIcon,
} from 'lucide-react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
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
  PanOnScrollMode,
  SelectionMode,
  type OnConnectStartParams,
  useStore,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY,
  CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_API_PROVIDER_STORAGE_KEY,
  CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY,
  readStoredApiSettings,
  type StoredApiSettings,
  useCanvasStore,
} from '@/store/canvas-store';
import {
  createProjectAtParentDirectory,
  pickProjectParentDirectory,
} from '@/lib/project-storage';
import type {
  CanvasEdge,
  CanvasNode,
  ImageHistoryItem,
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
import { CanvasHeader } from './CanvasHeader';
import { CanvasToolbar } from './CanvasToolbar';
import { GenerationHistoryPopover } from './GenerationHistoryPopover';
import { Tooltip } from '@/components/ui/Tooltip';
import { downloadImageGenerationResult } from '@/lib/image-download';
import { getImageHistoryDisplayPrompt } from '@/lib/image-prompt';
import {
  CreateProjectDialog,
  getProjectDirectoryLabel,
  type CreateProjectDraft,
} from '@/components/project/CreateProjectDialog';
import { DeleteProjectDialog } from '@/components/project/DeleteProjectDialog';

let notifyPromptBarInteraction: (() => void) | null = null;
let notifyImageToolbarAction:
  | ((action: string, data: ImageGenerationNodeData) => void)
  | null = null;
let notifyImageGenerationNodeSelect:
  | ((nodeId: string) => void)
  | null = null;
let notifyCanvasNodeSelect:
  | ((nodeId: string) => void)
  | null = null;
let notifyCanvasImageInfoRequest:
  | ((nodeId: string) => void)
  | null = null;
let notifyImageGenerationReferenceUpload:
  | ((nodeId: string) => void)
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

  return `${width} x ${height}`;
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
  const imageUrl =
    data.generatedHostedImageUrl?.trim() ||
    data.generatedImageUrl?.trim();
  const currentResult = imageUrl
    ? data.generationResults?.find((result) => {
        const resultUrl = result.hostedImageUrl?.trim() || result.imageUrl?.trim();
        return resultUrl === imageUrl;
      })
    : undefined;

  return {
    model: currentResult?.model?.trim() || data.generatedModel?.trim() || data.model?.trim() || '-',
    format: currentResult?.format?.trim() || data.generatedImageFormat?.trim() || 'PNG',
    size: formatImageSize(currentResult?.sizeBytes ?? data.generatedImageSizeBytes),
    resolution: formatImageResolution(
      currentResult?.width ?? data.generatedImageWidth,
      currentResult?.height ?? data.generatedImageHeight,
    ),
    createdTime: formatGeneratedAt(currentResult?.generatedAt ?? data.generatedAt) || undefined,
  };
}

type ImageLightboxData = {
  imageUrl: string;
  alt: string;
  width?: number;
  height?: number;
};

type ResolvedImageMetadata = {
  width: number;
  height: number;
};

function readImageDimensions(imageUrl: string): Promise<ResolvedImageMetadata> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) {
        reject(new Error('Image dimensions are unavailable'));
        return;
      }

      resolve({ width, height });
    };
    image.onerror = () => reject(new Error('Failed to read image dimensions'));
    image.src = imageUrl;
  });
}

function toImageGenerationLightboxData(
  data: ImageGenerationNodeData,
): ImageLightboxData | null {
  const imageUrl =
    data.generatedHostedImageUrl?.trim() ||
    data.generatedImageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    imageUrl,
    alt: data.prompt?.trim() || 'Generated image',
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
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

async function toResolvedImageGenerationInfoPopoverData(
  data: ImageGenerationNodeData,
): Promise<ImageGenerationInfoPopoverData> {
  const base = toImageInfoPopoverData(data);
  const imageUrl =
    data.generatedHostedImageUrl?.trim() ||
    data.generatedImageUrl?.trim();

  if (!imageUrl) {
    return base;
  }

  try {
    const { width, height } = await readImageDimensions(imageUrl);
    return {
      ...base,
      resolution: formatImageResolution(width, height),
    };
  } catch {
    return base;
  }
}

async function toResolvedImageNodeInfoPopoverData(
  data: ImageNodeData,
): Promise<ImageGenerationInfoPopoverData> {
  const base = toImageNodeInfoPopoverData(data);
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return base;
  }

  try {
    const { width, height } = await readImageDimensions(imageUrl);
    return {
      ...base,
      resolution: formatImageResolution(width, height),
    };
  } catch {
    return base;
  }
}

async function toResolvedUploadedImageInfoPopoverData(
  data: UploadedImageNodeData,
): Promise<ImageGenerationInfoPopoverData> {
  const base = toUploadedImageInfoPopoverData(data);
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return base;
  }

  try {
    const { width, height } = await readImageDimensions(imageUrl);
    return {
      ...base,
      resolution: formatImageResolution(width, height),
    };
  } catch {
    return base;
  }
}

async function toResolvedCanvasNodeInfoPopoverData(
  node: CanvasNode | ReactFlowNode,
): Promise<ImageGenerationInfoPopoverData | null> {
  if (node.type === 'image_generation') {
    const data = node.data as ImageGenerationNodeData;
    const imageUrl =
      data.generatedHostedImageUrl?.trim() ||
      data.generatedImageUrl?.trim();

    if (!imageUrl) {
      return null;
    }

    return toResolvedImageGenerationInfoPopoverData(data);
  }

  if (node.type === 'image') {
    return toResolvedImageNodeInfoPopoverData(node.data as ImageNodeData);
  }

  if (node.type === 'uploaded_image') {
    return toResolvedUploadedImageInfoPopoverData(node.data as UploadedImageNodeData);
  }

  return null;
}

function isCanvasImageNodeType(type: string): type is CanvasNode['type'] {
  return type === 'image_generation' || type === 'image' || type === 'uploaded_image';
}

function parseCanvasAspectRatio(value?: string): number | null {
  if (!value || value === 'auto') {
    return null;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

function resolveImageGenerationCardDimensions(
  data: ImageGenerationNodeData,
): { width: number; height: number } {
  const generatedAspectRatio =
    data.generatedImageWidth && data.generatedImageHeight && data.generatedImageWidth > 0 && data.generatedImageHeight > 0
      ? data.generatedImageWidth / data.generatedImageHeight
      : null;
  const referenceImage = data.referenceImages?.find(
    (image) => image.width && image.height && image.width > 0 && image.height > 0,
  );
  const referenceAspectRatio =
    referenceImage?.width && referenceImage?.height
      ? referenceImage.width / referenceImage.height
      : null;
  const resolvedAspectRatio =
    parseCanvasAspectRatio(data.aspectRatio) ?? generatedAspectRatio ?? referenceAspectRatio ?? 16 / 9;

  if (resolvedAspectRatio >= 1) {
    const width = IMAGE_GENERATION_MAX_CARD_EDGE;
    const height = Math.max(
      IMAGE_GENERATION_MIN_CARD_EDGE,
      Math.round(width / resolvedAspectRatio),
    );

    return { width, height };
  }

  const height = IMAGE_GENERATION_MAX_CARD_EDGE;
  const width = Math.max(
    IMAGE_GENERATION_MIN_CARD_EDGE,
    Math.round(height * resolvedAspectRatio),
  );

  return { width, height };
}

function resolveUploadedImageCardDimensions(
  data: UploadedImageNodeData,
): { width: number; height: number } {
  if (data.displayWidth && data.displayHeight && data.displayWidth > 0 && data.displayHeight > 0) {
    return {
      width: data.displayWidth,
      height: data.displayHeight,
    };
  }

  const imageWidth = Math.max(data.width || 320, 1);
  const imageHeight = Math.max(data.height || 320, 1);
  const imageAspectRatio = imageWidth / imageHeight;
  const fittedWidthByHeight = UPLOADED_IMAGE_MAX_CARD_HEIGHT * imageAspectRatio;
  const width = Math.min(
    UPLOADED_IMAGE_MAX_CARD_WIDTH,
    Math.max(
      UPLOADED_IMAGE_MIN_CARD_WIDTH,
      Math.min(imageWidth, fittedWidthByHeight),
    ),
  );

  return {
    width,
    height: width * (imageHeight / imageWidth),
  };
}

function resolveMiniMapVisibleNodeRect(
  node: CanvasNode | ReactFlowNode,
): { x: number; y: number; width: number; height: number; radius: number } {
  if (node.type === 'text') {
    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: TEXT_NODE_CARD_WIDTH,
      height: TEXT_NODE_CARD_HEIGHT,
      radius: 18,
    };
  }

  if (node.type === 'image_generation') {
    const dimensions = resolveImageGenerationCardDimensions(node.data as ImageGenerationNodeData);
    const stageHeight = IMAGE_GENERATION_MAX_CARD_EDGE + IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE + IMAGE_GENERATION_CARD_ACCESSORY_GAP;

    return {
      x: node.position.x + Math.round((IMAGE_GENERATION_MAX_CARD_EDGE - dimensions.width) / 2),
      y: node.position.y + stageHeight - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
      radius: 18,
    };
  }

  if (node.type === 'ai_text_result') {
    return {
      x: node.position.x,
      y: node.position.y,
      width: 420,
      height: 300,
      radius: 18,
    };
  }

  if (node.type === 'uploaded_image') {
    const dimensions = resolveUploadedImageCardDimensions(node.data as UploadedImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: dimensions.width,
      height: dimensions.height,
      radius: 22,
    };
  }

  if (node.type === 'image') {
    return {
      x: node.position.x,
      y: node.position.y,
      width: IMAGE_NODE_CARD_WIDTH,
      height: IMAGE_NODE_CARD_HEIGHT,
      radius: 18,
    };
  }

  return {
    x: node.position.x,
    y: node.position.y,
    width: 'width' in node ? node.width ?? 360 : 360,
    height: 'height' in node ? node.height ?? 260 : 260,
    radius: 18,
  };
}

type CanvasMiniMapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

type CanvasMiniMapBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type CanvasMiniMapLayout = {
  bounds: CanvasMiniMapBounds;
  scale: number;
  offsetX: number;
  offsetY: number;
  nodes: Array<CanvasMiniMapRect & { id: string }>;
  viewport: CanvasMiniMapRect;
};

type MultiNodeSelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getEstimatedNodeBounds(node: CanvasNode | ReactFlowNode): MultiNodeSelectionBounds {
  if (node.type === 'text') {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: TEXT_NODE_CARD_WIDTH,
      height: TEXT_NODE_CARD_HEIGHT + 36,
    };
  }

  if (node.type === 'image_generation') {
    const dimensions = resolveImageGenerationCardDimensions(node.data as ImageGenerationNodeData);
    const stageHeight =
      IMAGE_GENERATION_MAX_CARD_EDGE +
      IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE +
      IMAGE_GENERATION_CARD_ACCESSORY_GAP;

    return {
      x: node.position.x,
      y: node.position.y,
      width: Math.max(IMAGE_GENERATION_MAX_CARD_EDGE, dimensions.width),
      height: stageHeight,
    };
  }

  if (node.type === 'uploaded_image') {
    const dimensions = resolveUploadedImageCardDimensions(node.data as UploadedImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: dimensions.height + 36,
    };
  }

  if (node.type === 'image') {
    return {
      x: node.position.x,
      y: node.position.y,
      width: IMAGE_NODE_CARD_WIDTH,
      height: IMAGE_NODE_CARD_HEIGHT + 116,
    };
  }

  if (node.type === 'ai_text_result') {
    return {
      x: node.position.x,
      y: node.position.y,
      width: 420,
      height: 300,
    };
  }

  return {
    x: node.position.x,
    y: node.position.y,
    width: 'width' in node ? node.width ?? 360 : 360,
    height: 'height' in node ? node.height ?? 260 : 260,
  };
}

function getBoundsForRects(rects: MultiNodeSelectionBounds[]): MultiNodeSelectionBounds | null {
  if (rects.length === 0) {
    return null;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function getCanvasMiniMapBounds(rects: CanvasMiniMapRect[]): CanvasMiniMapBounds | null {
  if (!rects.length) {
    return null;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  return { left, top, right, bottom, width, height };
}

function clampMiniMapRectToFrame(rect: CanvasMiniMapRect): CanvasMiniMapRect {
  const left = Math.max(0, Math.min(CANVAS_MINIMAP_WIDTH, rect.x));
  const top = Math.max(0, Math.min(CANVAS_MINIMAP_HEIGHT, rect.y));
  const right = Math.max(0, Math.min(CANVAS_MINIMAP_WIDTH, rect.x + rect.width));
  const bottom = Math.max(0, Math.min(CANVAS_MINIMAP_HEIGHT, rect.y + rect.height));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    radius: rect.radius,
  };
}

function getCanvasMiniMapLayout(
  nodes: CanvasNode[],
  viewport: { x: number; y: number; zoom: number },
  flowSize: { width: number; height: number },
): CanvasMiniMapLayout | null {
  const nodeRects = nodes.map((node) => ({
    id: node.id,
    ...resolveMiniMapVisibleNodeRect(node),
  }));
  const contentBounds = getCanvasMiniMapBounds(nodeRects);

  if (!contentBounds) {
    return null;
  }

  const zoom = viewport.zoom || 1;
  const viewportWorldRect = {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width: flowSize.width / zoom,
    height: flowSize.height / zoom,
    radius: 0,
  };
  const viewportBounds = getCanvasMiniMapBounds([viewportWorldRect]);
  const bounds = getCanvasMiniMapBounds([
    {
      x: contentBounds.left,
      y: contentBounds.top,
      width: contentBounds.width,
      height: contentBounds.height,
      radius: 0,
    },
    ...(viewportBounds ? [viewportWorldRect] : []),
  ]);

  if (!bounds) {
    return null;
  }

  const drawableWidth = CANVAS_MINIMAP_WIDTH - CANVAS_MINIMAP_PADDING * 2;
  const drawableHeight = CANVAS_MINIMAP_HEIGHT - CANVAS_MINIMAP_PADDING * 2;
  const scale = Math.min(drawableWidth / bounds.width, drawableHeight / bounds.height);
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = (CANVAS_MINIMAP_WIDTH - contentWidth) / 2;
  const offsetY = (CANVAS_MINIMAP_HEIGHT - contentHeight) / 2;
  const toMiniMapRect = (rect: CanvasMiniMapRect): CanvasMiniMapRect => ({
    x: offsetX + (rect.x - bounds.left) * scale,
    y: offsetY + (rect.y - bounds.top) * scale,
    width: Math.max(1, rect.width * scale),
    height: Math.max(1, rect.height * scale),
    radius: Math.min(3, Math.max(1, rect.radius * scale)),
  });

  return {
    bounds,
    scale,
    offsetX,
    offsetY,
    nodes: nodeRects.map((rect) => ({
      id: rect.id,
      ...toMiniMapRect(rect),
    })),
    viewport: clampMiniMapRectToFrame(toMiniMapRect(viewportWorldRect)),
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

function isBrowserObjectUrl(value?: string): boolean {
  return typeof value === 'string' && value.startsWith('blob:');
}

function isImageGenerationRequestUrl(value?: string): boolean {
  const trimmed = value?.trim() || '';

  return Boolean(
    trimmed.startsWith('data:') ||
      trimmed.startsWith('/api/image-hosting/file/') ||
      /^https?:\/\//i.test(trimmed),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.trim()) {
        resolve(reader.result);
        return;
      }

      reject(new Error('Invalid image data'));
    };
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

async function uploadImageDataUrl(dataUrl: string, fileName?: string): Promise<string> {
  const response = await fetch('/api/image-hosting/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dataUrl, fileName }),
  });
  const json = (await response.json()) as
    | { ok: true; result: { imageUrl: string } }
    | { ok: false; error: string };

  if (!response.ok || !json.ok) {
    throw new Error('error' in json ? json.error : 'Failed to host history image');
  }

  return json.result.imageUrl;
}

async function resolveHistoryImageUrls(item: ImageHistoryItem): Promise<{
  requestUrl: string;
  previewUrl: string;
  hostedImageUrl?: string;
}> {
  const hostedImageUrl = item.hostedImageUrl?.trim();
  const imageUrl = item.imageUrl.trim();

  if (isImageGenerationRequestUrl(hostedImageUrl)) {
    return {
      requestUrl: hostedImageUrl || imageUrl,
      previewUrl: imageUrl || hostedImageUrl || '',
      hostedImageUrl: imageUrl || hostedImageUrl || '',
    };
  }

  if (isImageGenerationRequestUrl(imageUrl) && !isBrowserObjectUrl(imageUrl)) {
    const resolved = {
      requestUrl: imageUrl,
      previewUrl: imageUrl,
    };

    return hostedImageUrl
      ? { ...resolved, hostedImageUrl }
      : resolved;
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error('Failed to read history image');
  }

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  const requestUrl = await uploadImageDataUrl(dataUrl, item.fileName || `history-${item.id}.png`);

  return {
    requestUrl,
    previewUrl: imageUrl,
    hostedImageUrl: imageUrl,
  };
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

const TextNodeAdapter = memo(function TextNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateText = useCanvasStore((s) => s.generateTextFromTextNode);
  const connectedImages = useCanvasStore((s) => s.getConnectedImagesForTextNode(id));
  const renderData = data as CanvasNodeRenderData;
  const [editing, setEditing] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const isActive = ((selected && renderData.canvasNodeActive) || promptFocused) && !dragging;
  const handleSelectNode = () => notifyCanvasNodeSelect?.(id);

  useEffect(() => {
    const handleClearNodeUi = () => {
      setPromptFocused(false);
      setEditing(false);
    };

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

  return (
    <TextNode
      id={id}
      data={data as TextNodeData}
      selected={isActive}
      dragging={!!dragging}
      editing={editing}
      connectedImages={connectedImages}
      onChange={(next) => updateNodeData<'text'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'text'>(id, { title: nextTitle })}
      onStartEdit={() => {
        handleSelectNode();
        setEditing(true);
      }}
      onEndEdit={() => setEditing(false)}
      onRun={() => generateText(id)}
      onPromptPointerDown={() => {
        handleSelectNode();
        notifyPromptBarInteraction?.();
      }}
      onPromptFocusWithinChange={(focused) => {
        if (focused) {
          handleSelectNode();
        }
        setPromptFocused(focused);
      }}
    />
  );
});

const ImageGenerationNodeAdapter = memo(function ImageGenerationNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateImage = useCanvasStore((s) => s.generateImageFromImageGenerationNode);
  const connectedImages = useCanvasStore((s) =>
    s.getConnectedImagesForImageGenerationNode(id),
  );
  const renderData = data as CanvasNodeRenderData;
  const [promptFocused, setPromptFocused] = useState(false);
  const isActive = ((selected && renderData.canvasNodeActive) || promptFocused) && !dragging;
  const handleSelectNode = () => notifyCanvasNodeSelect?.(id);

  useEffect(() => {
    const handleClearNodeUi = () => setPromptFocused(false);

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

  return (
    <ImageGenerationNode
      id={id}
      data={data as ImageGenerationNodeData}
      selected={isActive}
      dragging={!!dragging}
      connectedImages={connectedImages}
      onChange={(next) => updateNodeData<'image_generation'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'image_generation'>(id, { title: nextTitle })}
      onRun={() => generateImage(id)}
      onUpload={() => notifyImageGenerationReferenceUpload?.(id)}
      onToolbarAction={(action) => notifyImageToolbarAction?.(action, data as ImageGenerationNodeData)}
      onOpenLightbox={(next) => notifyImageToolbarAction?.('expand', next)}
      onImageCardClick={() => notifyCanvasImageInfoRequest?.(id)}
      onSelectNode={handleSelectNode}
      onPromptPointerDown={() => {
        handleSelectNode();
        notifyPromptBarInteraction?.();
      }}
      onPromptFocusWithinChange={(focused) => {
        if (focused) {
          handleSelectNode();
        }
        setPromptFocused(focused);
      }}
    />
  );
});

const AITextResultNodeAdapter = memo(function AITextResultNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;

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
        visible={isActive}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={isActive} />
      <AITextResultNode
        id={id}
        data={data as AITextResultNodeData}
        selected={selected}
        onTitleChange={(nextTitle) => updateNodeData<'ai_text_result'>(id, { title: nextTitle })}
      />
      <CardSideHandle type="source" position={Position.Right} visible={isActive} />
    </div>
  );
});

const ImageNodeAdapter = memo(function ImageNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;

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
        visible={isActive}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={isActive} />
      <ImageNode
        id={id}
        data={data as ImageNodeData}
        selected={selected}
        loading={false}
        onTitleChange={(nextTitle) => updateNodeData<'image'>(id, { title: nextTitle })}
        onSelectNode={() => notifyImageGenerationNodeSelect?.(id)}
        onShowInfo={() => notifyCanvasImageInfoRequest?.(id)}
      />
      <CardSideHandle type="source" position={Position.Right} visible={isActive} />
    </div>
  );
});

const UploadedImageNodeAdapter = memo(function UploadedImageNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;

  const handleReplace = async (file: File) => {
    const next = await readImageFile(file);
    updateNodeData<'uploaded_image'>(id, next);
  };

  return (
    <UploadedImageNode
      data={data as UploadedImageNodeData}
      selected={selected}
      accessoriesVisible={isActive}
      onReplace={handleReplace}
      onTitleChange={(nextTitle) => updateNodeData<'uploaded_image'>(id, { title: nextTitle })}
      onSelectNode={() => notifyImageGenerationNodeSelect?.(id)}
      onShowInfo={() => notifyCanvasImageInfoRequest?.(id)}
    />
  );
});

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
const CANVAS_EDGE_STYLE_STORAGE_KEY = 'genlink.canvasEdgeStyle';
const CANVAS_EDGE_STYLE_CHANGE_EVENT = 'genlink:canvas-edge-style-change';
const TEXT_NODE_CARD_WIDTH = 511;
const TEXT_NODE_CARD_HEIGHT = 289;
const IMAGE_NODE_CARD_WIDTH = 420;
const IMAGE_NODE_CARD_HEIGHT = 420 * 3 / 4;
const IMAGE_GENERATION_MAX_CARD_EDGE = 540;
const IMAGE_GENERATION_MIN_CARD_EDGE = 220;
const IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE = 64;
const IMAGE_GENERATION_CARD_ACCESSORY_GAP = 12;
const UPLOADED_IMAGE_MAX_CARD_WIDTH = 420;
const UPLOADED_IMAGE_MAX_CARD_HEIGHT = 540;
const UPLOADED_IMAGE_MIN_CARD_WIDTH = 300;
const CANVAS_MINIMAP_WIDTH = 200;
const CANVAS_MINIMAP_HEIGHT = 150;
const CANVAS_MINIMAP_PADDING = 14;
const MULTI_NODE_SELECTION_PADDING = 14;
const MULTI_NODE_SELECTION_TOOLBAR_GAP = 10;
const HISTORY_NODE_WIDTH = 540;
const HISTORY_NODE_HEIGHT = 740;
const HISTORY_NODE_GAP = 72;
const LIGHTBOX_MIN_ZOOM = 0.5;
const LIGHTBOX_MAX_ZOOM = 5;
const LIGHTBOX_WHEEL_ZOOM_STEP = 0.0018;
const LIGHTBOX_RESET_ZOOM_EPSILON = 0.03;
const CONNECTION_MENU_ANCHOR_NODE_ID = '__connection-menu-anchor__';
const BLANK_CONNECTION_DROP_EVENT = 'genlink:connection-blank-drop';
const CANVAS_NODE_UI_CLEAR_EVENT = 'genlink:canvas-node-ui-clear';

type CanvasEdgeStyle = 'straight' | 'curve';

type LightboxImageSize = {
  width: number;
  height: number;
};

type LightboxViewState = {
  imageUrl: string;
  zoom: number;
  pan: { x: number; y: number };
  imageSize: LightboxImageSize | null;
};

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

type ConnectedCopyBuffer = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
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

function getIncomingAndInternalEdgesForCopy(
  edges: CanvasEdge[],
  selectedNodeIds: Set<string>,
): CanvasEdge[] {
  return edges.filter((edge) => selectedNodeIds.has(edge.target));
}

function createConnectedCopyBuffer(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  selectedNodeIds: Set<string>,
): ConnectedCopyBuffer {
  const copiedNodes = nodes.map((node) => cloneCanvasNode(node, 0));
  const copiedNodeIdsByOriginalId = new Map<string, string>(
    nodes.map((node, index) => [node.id, copiedNodes[index].id]),
  );
  const copiedEdges = getIncomingAndInternalEdgesForCopy(edges, selectedNodeIds)
    .map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      source: copiedNodeIdsByOriginalId.get(edge.source) ?? edge.source,
      target: copiedNodeIdsByOriginalId.get(edge.target) ?? edge.target,
    }));

  return {
    nodes: copiedNodes,
    edges: copiedEdges,
  };
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a === b) {
    return true;
  }

  if (a.size !== b.size) {
    return false;
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
}

type CanvasNodeRenderData = CanvasNode['data'] & {
  canvasNodeActive?: boolean;
};

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

function getNodeBoundsForHistoryPlacement(node: CanvasNode): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const width =
    node.type === 'image_generation'
      ? HISTORY_NODE_WIDTH
      : node.type === 'text'
        ? 360
        : node.type === 'ai_text_result'
          ? 420
          : 360;
  const height =
    node.type === 'image_generation'
      ? HISTORY_NODE_HEIGHT
      : node.type === 'text'
        ? 260
        : node.type === 'ai_text_result'
          ? 300
          : 360;

  return {
    left: node.position.x - HISTORY_NODE_GAP,
    top: node.position.y - HISTORY_NODE_GAP,
    right: node.position.x + width + HISTORY_NODE_GAP,
    bottom: node.position.y + height + HISTORY_NODE_GAP,
  };
}

function rectanglesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function findOpenHistoryNodePosition(
  preferredPosition: { x: number; y: number },
  nodes: CanvasNode[],
): { x: number; y: number } {
  const occupiedBounds = nodes.map(getNodeBoundsForHistoryPlacement);
  const stepX = HISTORY_NODE_WIDTH + HISTORY_NODE_GAP;
  const stepY = HISTORY_NODE_HEIGHT + HISTORY_NODE_GAP;
  const candidates: Array<{ x: number; y: number }> = [preferredPosition];

  for (let ring = 1; ring <= 8; ring += 1) {
    for (let xOffset = -ring; xOffset <= ring; xOffset += 1) {
      for (let yOffset = -ring; yOffset <= ring; yOffset += 1) {
        if (Math.max(Math.abs(xOffset), Math.abs(yOffset)) !== ring) {
          continue;
        }

        candidates.push({
          x: preferredPosition.x + xOffset * stepX,
          y: preferredPosition.y + yOffset * stepY,
        });
      }
    }
  }

  return candidates.find((candidate) => {
    const candidateBounds = {
      left: candidate.x,
      top: candidate.y,
      right: candidate.x + HISTORY_NODE_WIDTH,
      bottom: candidate.y + HISTORY_NODE_HEIGHT,
    };

    return !occupiedBounds.some((bounds) => rectanglesOverlap(candidateBounds, bounds));
  }) ?? candidates[candidates.length - 1];
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

function clearCanvasNodeUi() {
  window.dispatchEvent(new Event(CANVAS_NODE_UI_CLEAR_EVENT));
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

function clampLightboxZoomLevel(zoom: number): number {
  return Math.min(LIGHTBOX_MAX_ZOOM, Math.max(LIGHTBOX_MIN_ZOOM, zoom));
}

function getInitialLightboxImageSize(data: ImageLightboxData | null): LightboxImageSize | null {
  if (!data?.width || !data.height) {
    return null;
  }

  return {
    width: data.width,
    height: data.height,
  };
}

function createLightboxViewState(data: ImageLightboxData | null): LightboxViewState {
  return {
    imageUrl: data?.imageUrl ?? '',
    zoom: 1,
    pan: { x: 0, y: 0 },
    imageSize: getInitialLightboxImageSize(data),
  };
}

function getContainedImageSize(
  containerWidth: number,
  containerHeight: number,
  imageSize: LightboxImageSize | null,
): LightboxImageSize {
  if (!imageSize?.width || !imageSize.height) {
    return {
      width: containerWidth,
      height: containerHeight,
    };
  }

  const ratio = Math.min(
    containerWidth / imageSize.width,
    containerHeight / imageSize.height,
  );

  return {
    width: imageSize.width * ratio,
    height: imageSize.height * ratio,
  };
}

function clampLightboxPan(
  pan: { x: number; y: number },
  zoom: number,
  containerRect: Pick<DOMRect, 'width' | 'height'>,
  imageSize: LightboxImageSize | null,
): { x: number; y: number } {
  if (zoom <= 1) {
    return { x: 0, y: 0 };
  }

  const containedSize = getContainedImageSize(
    containerRect.width,
    containerRect.height,
    imageSize,
  );
  const maxX = Math.max(0, (containedSize.width * zoom - containerRect.width) / 2);
  const maxY = Math.max(0, (containedSize.height * zoom - containerRect.height) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

function readStoredCanvasEdgeStyle(): CanvasEdgeStyle {
  if (typeof window === 'undefined') {
    return 'straight';
  }

  return window.localStorage.getItem(CANVAS_EDGE_STYLE_STORAGE_KEY) === 'curve'
    ? 'curve'
    : 'straight';
}

function subscribeToCanvasEdgeStyleChange(onStoreChange: () => void): () => void {
  window.addEventListener(CANVAS_EDGE_STYLE_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CANVAS_EDGE_STYLE_CHANGE_EVENT, onStoreChange);
}

function getServerCanvasEdgeStyleSnapshot(): CanvasEdgeStyle {
  return 'straight';
}

function useStoredCanvasEdgeStyle(): CanvasEdgeStyle {
  return useSyncExternalStore(
    subscribeToCanvasEdgeStyleChange,
    readStoredCanvasEdgeStyle,
    getServerCanvasEdgeStyleSnapshot,
  );
}

function setStoredCanvasEdgeStyle(edgeStyle: CanvasEdgeStyle) {
  window.localStorage.setItem(CANVAS_EDGE_STYLE_STORAGE_KEY, edgeStyle);
  window.dispatchEvent(new Event(CANVAS_EDGE_STYLE_CHANGE_EVENT));
}

function getReactFlowEdgeType(edgeStyle: CanvasEdgeStyle): ReactFlowEdge['type'] {
  return edgeStyle === 'curve' ? 'default' : 'smoothstep';
}

function openFileInput(input: HTMLInputElement) {
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // Fallback for browsers that reject showPicker on visually hidden inputs.
    }
  }

  input.click();
}

type MultiNodeSelectionOverlayProps = {
  nodes: CanvasNode[];
  selectedNodeIds: Set<string>;
  visible: boolean;
};

function getNodeElementBoundsInFlowPane(nodeId: string): MultiNodeSelectionBounds | null {
  const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  const wrapper = document.querySelector<HTMLElement>('.react-flow');

  if (!element || !wrapper) {
    return null;
  }

  const visibleElements = Array.from(
    element.querySelectorAll<HTMLElement>(
      '.node-visible-title, .node-connectable-card',
    ),
  ).filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const visibleRects = visibleElements.length > 0
    ? visibleElements.map((item) => item.getBoundingClientRect())
    : [element.getBoundingClientRect()];
  const wrapperRect = wrapper.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const rect of visibleRects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  return {
    x: left - wrapperRect.left,
    y: top - wrapperRect.top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function MultiNodeSelectionToolbarButton({
  children,
  icon: Icon,
  compact = false,
}: {
  children?: React.ReactNode;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'nodrag nopan flex h-10 items-center justify-center gap-2 rounded-gl-pill text-[14px] font-semibold text-gl-text-primary transition-colors hover:bg-gl-panel-hover',
        compact ? 'w-10 px-0' : 'px-3',
      ].join(' ')}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Icon size={16} strokeWidth={1.9} />
      {children ? <span className="whitespace-nowrap">{children}</span> : null}
    </button>
  );
}

function MultiNodeSelectionOverlay({
  nodes,
  selectedNodeIds,
  visible,
}: MultiNodeSelectionOverlayProps) {
  const viewport = useViewport();
  const [bounds, setBounds] = useState<MultiNodeSelectionBounds | null>(null);
  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.has(node.id)),
    [nodes, selectedNodeIds],
  );
  const selectedNodeIdsKey = useMemo(
    () => selectedNodes.map((node) => node.id).sort().join('|'),
    [selectedNodes],
  );

  useEffect(() => {
    if (selectedNodes.length <= 1) {
      return;
    }

    let animationFrame = 0;
    const updateBounds = () => {
      const rects = selectedNodes.map((node) => {
        const elementBounds = getNodeElementBoundsInFlowPane(node.id);

        if (elementBounds) {
          return elementBounds;
        }

        const estimatedBounds = getEstimatedNodeBounds(node);

        return {
          x: viewport.x + estimatedBounds.x * viewport.zoom,
          y: viewport.y + estimatedBounds.y * viewport.zoom,
          width: estimatedBounds.width * viewport.zoom,
          height: estimatedBounds.height * viewport.zoom,
        };
      });

      const nextBounds = getBoundsForRects(rects);
      setBounds((current) => {
        if (
          current &&
          nextBounds &&
          Math.abs(current.x - nextBounds.x) < 0.5 &&
          Math.abs(current.y - nextBounds.y) < 0.5 &&
          Math.abs(current.width - nextBounds.width) < 0.5 &&
          Math.abs(current.height - nextBounds.height) < 0.5
        ) {
          return current;
        }

        return nextBounds;
      });
    };

    updateBounds();

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateBounds);
    };
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleUpdate)
      : null;

    for (const node of selectedNodes) {
      const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`);
      if (element) {
        resizeObserver?.observe(element);
      }
    }

    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [selectedNodeIdsKey, selectedNodes, viewport.x, viewport.y, viewport.zoom]);

  if (!visible || !bounds || selectedNodes.length <= 1) {
    return null;
  }

  const padding = MULTI_NODE_SELECTION_PADDING;
  const paddedBounds = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };

  return (
    <div
      className="pointer-events-none absolute z-[18]"
      style={{
        left: `${paddedBounds.x}px`,
        top: `${paddedBounds.y}px`,
        width: `${paddedBounds.width}px`,
        height: `${paddedBounds.height}px`,
      }}
    >
      <div className="gl-multi-node-selection-frame absolute inset-0" />
      <div
        data-canvas-menu-ignore="true"
        className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
        style={{
          top: `${-MULTI_NODE_SELECTION_TOOLBAR_GAP}px`,
          transform: 'translate(-50%, -100%)',
          transformOrigin: 'bottom center',
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MultiNodeSelectionToolbarButton icon={Group} compact />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={FolderPlus}>
          保存到素材
        </MultiNodeSelectionToolbarButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={Copy}>
          创建副本
        </MultiNodeSelectionToolbarButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={Plus} compact />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={Group}>
          打组
        </MultiNodeSelectionToolbarButton>
        <ChevronDown size={14} strokeWidth={2} className="-ml-1 mr-2 text-gl-text-secondary" />
      </div>
    </div>
  );
}

const CanvasMiniMap = memo(function CanvasMiniMap({ nodes }: { nodes: CanvasNode[] }) {
  const viewport = useViewport();
  const { setViewport } = useReactFlow();
  const flowSize = useStore(
    useCallback((state) => ({
      width: state.width,
      height: state.height,
    }), []),
  );
  const panelRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(
    () => getCanvasMiniMapLayout(nodes, viewport, flowSize),
    [flowSize, nodes, viewport],
  );

  const focusMiniMapPoint = useCallback((clientX: number, clientY: number) => {
    if (!layout || !panelRef.current) {
      return;
    }

    const bounds = panelRef.current.getBoundingClientRect();
    const miniMapX = Math.max(0, Math.min(CANVAS_MINIMAP_WIDTH, clientX - bounds.left));
    const miniMapY = Math.max(0, Math.min(CANVAS_MINIMAP_HEIGHT, clientY - bounds.top));
    const canvasX = layout.bounds.left + (miniMapX - layout.offsetX) / layout.scale;
    const canvasY = layout.bounds.top + (miniMapY - layout.offsetY) / layout.scale;

    void setViewport({
      x: flowSize.width / 2 - canvasX * viewport.zoom,
      y: flowSize.height / 2 - canvasY * viewport.zoom,
      zoom: viewport.zoom,
    }, { duration: 120 });
  }, [flowSize.height, flowSize.width, layout, setViewport, viewport.zoom]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    focusMiniMapPoint(event.clientX, event.clientY);
  }, [focusMiniMapPoint]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    focusMiniMapPoint(event.clientX, event.clientY);
  }, [focusMiniMapPoint]);

  if (!layout) {
    return null;
  }

  return (
    <Panel position="bottom-left" className="canvas-minimap-panel">
      <div
        ref={panelRef}
        className="canvas-minimap-frame"
        style={{
          width: CANVAS_MINIMAP_WIDTH,
          height: CANVAS_MINIMAP_HEIGHT,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <svg
          className="canvas-minimap-svg"
          width={CANVAS_MINIMAP_WIDTH}
          height={CANVAS_MINIMAP_HEIGHT}
          viewBox={`0 0 ${CANVAS_MINIMAP_WIDTH} ${CANVAS_MINIMAP_HEIGHT}`}
          aria-hidden="true"
        >
          {layout.nodes.map((node) => (
            <rect
              key={node.id}
              className="canvas-minimap-node"
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={node.radius}
              ry={node.radius}
            />
          ))}
          <rect
            className="canvas-minimap-viewport"
            x={layout.viewport.x}
            y={layout.viewport.y}
            width={layout.viewport.width}
            height={layout.viewport.height}
            rx={2}
            ry={2}
          />
        </svg>
      </div>
    </Panel>
  );
});

function CanvasViewportControls({
  edgeStyle,
  onToggleEdgeStyle,
  nodes,
}: {
  edgeStyle: CanvasEdgeStyle;
  onToggleEdgeStyle: () => void;
  nodes: CanvasNode[];
}) {
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true);
  const clampedZoom = clampZoomLevel(zoom);
  const edgeStyleLabel = edgeStyle === 'straight'
    ? '\u76f4\u7ebf'
    : '\u66f2\u7ebf';
  const nextEdgeStyleLabel = edgeStyle === 'straight'
    ? '\u5207\u6362\u4e3a\u66f2\u7ebf'
    : '\u5207\u6362\u4e3a\u76f4\u7ebf';
  const minimapLabel = isMiniMapVisible ? '关闭小地图' : '开启小地图';

  return (
    <>
      {isMiniMapVisible ? <CanvasMiniMap nodes={nodes} /> : null}

      <Panel position="bottom-left" className="canvas-zoom-panel">
        <div className="group/tooltip relative">
          <button
            type="button"
            className="canvas-zoom-round-button"
            aria-label={minimapLabel}
            aria-pressed={isMiniMapVisible}
            onClick={() => setIsMiniMapVisible((visible) => !visible)}
          >
            <MapIcon size={14} />
          </button>
          <Tooltip label={minimapLabel} side="top" className="!px-1.5 !py-0.5 !text-[9px]" />
        </div>

        <div className="canvas-zoom-shell flex items-center gap-2 rounded-full bg-[#202124] px-2 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="group/tooltip relative">
            <button
              type="button"
              className="canvas-zoom-icon-button"
              aria-label={nextEdgeStyleLabel}
              aria-pressed={edgeStyle === 'curve'}
              onClick={onToggleEdgeStyle}
            >
              {edgeStyle === 'straight' ? (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 4.5H6.5V10.5H12.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="2.5" cy="4.5" r="1.2" fill="currentColor" />
                  <circle cx="12.5" cy="10.5" r="1.2" fill="currentColor" />
                </svg>
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 10.5C5.1 3.6 9.9 11.4 12.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <circle cx="2.5" cy="10.5" r="1.2" fill="currentColor" />
                  <circle cx="12.5" cy="4.5" r="1.2" fill="currentColor" />
                </svg>
              )}
            </button>
            <Tooltip label={edgeStyleLabel} side="top" />
          </div>

          <div className="group/tooltip relative">
            <button
              type="button"
              className="canvas-zoom-icon-button"
              onClick={() => void fitView({ duration: 220, padding: 0.18 })}
              aria-label="重置"
            >
              <Expand size={15} />
            </button>
            <Tooltip label="重置" side="top" />
          </div>

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
            aria-label="????"
          />
        </div>

      </Panel>
    </>
  );
}

function CanvasCornerActionButton() {
  const stopCanvasInteraction = (event: React.SyntheticEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <Panel position="bottom-right" className="canvas-corner-action-panel">
      <div className="group/tooltip relative">
        <button
          type="button"
          aria-label="Canvas action"
          className="canvas-corner-action-button"
          onPointerDown={stopCanvasInteraction}
          onClick={stopCanvasInteraction}
        />
        <Tooltip label="Canvas action" side="top" />
      </div>
    </Panel>
  );
}

type CropRect = { x: number; y: number; width: number; height: number };
type CropAspectRatio = null | number;

const CROP_ASPECT_RATIOS: Array<{ label: string; value: CropAspectRatio }> = [
  { label: '原图比例', value: null },
  { label: '1 : 1', value: 1 },
  { label: '4 : 3', value: 4 / 3 },
  { label: '3 : 4', value: 3 / 4 },
  { label: '16 : 9', value: 16 / 9 },
  { label: '9 : 16', value: 9 / 16 },
  { label: '21 : 9', value: 21 / 9 },
];

type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move';

function clampCropRect(rect: CropRect): CropRect {
  const x = Math.max(0, Math.min(1 - rect.width, rect.x));
  const y = Math.max(0, Math.min(1 - rect.height, rect.y));
  const width = Math.max(0.05, Math.min(1 - x, rect.width));
  const height = Math.max(0.05, Math.min(1 - y, rect.height));
  return { x, y, width, height };
}

type CropOverlayData = {
  nodeId: string;
  imageUrl: string;
  nodeData: ImageGenerationNodeData;
  nodePosition: { x: number; y: number };
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  cardHeight: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
};

function CropOverlay({
  data,
  onClose,
  onConfirm,
}: {
  data: CropOverlayData | null;
  onClose: () => void;
  onConfirm: (nodeId: string, cropRect: CropRect) => void;
}) {
  const viewport = useViewport();
  const [cropRect, setCropRect] = useState<CropRect>(() => { const s = 0.75; const off = (1 - s) / 2; return { x: off, y: off, width: s, height: s }; });
  const [aspectRatio, setAspectRatio] = useState<CropAspectRatio>(null);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const prevImageUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    startX: number;
    startY: number;
    startRect: CropRect;
    imgScreenW: number;
    imgScreenH: number;
  } | null>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const isNew = prevImageUrlRef.current !== data.imageUrl;
      prevImageUrlRef.current = data.imageUrl;
      if (isNew) {
        const s = 0.75;
        const off = (1 - s) / 2;
        setCropRect({ x: off, y: off, width: s, height: s });
        setAspectRatio(null);
        setAspectMenuOpen(false);
      }
    };
    img.src = data.imageUrl;
    return () => { cancelled = true; };
  }, [data?.imageUrl]);

  useEffect(() => {
    if (!data) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [data, onClose]);

  if (!data) return null;

  const { x: vpX, y: vpY, zoom } = viewport;
  const screenX = vpX + (data.nodePosition.x + data.cardLeft) * zoom;
  const screenY = vpY + (data.nodePosition.y + data.cardTop) * zoom;
  const screenW = data.cardWidth * zoom;
  const screenH = data.cardHeight * zoom;

  const handlePointerDown = (e: React.PointerEvent, handle: CropHandle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...cropRect },
      imgScreenW: screenW,
      imgScreenH: screenH,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const dx = (e.clientX - drag.startX) / drag.imgScreenW;
    const dy = (e.clientY - drag.startY) / drag.imgScreenH;
    const r = drag.startRect;
    let next: CropRect = { ...r };

    if (drag.handle === 'move') {
      next = { ...r, x: r.x + dx, y: r.y + dy };
    } else {
      if (drag.handle.includes('e')) next.width = Math.max(0.05, r.width + dx);
      if (drag.handle.includes('w')) { next.x = r.x + dx; next.width = Math.max(0.05, r.width - dx); }
      if (drag.handle.includes('s')) next.height = Math.max(0.05, r.height + dy);
      if (drag.handle.includes('n')) { next.y = r.y + dy; next.height = Math.max(0.05, r.height - dy); }
    }

    if (aspectRatio !== null && drag.handle !== 'move') {
      // normAspect = targetPixelRatio * (imgH / imgW)，使归一化坐标下宽高比正确
      const normAspect = aspectRatio * (data.imageNaturalHeight / data.imageNaturalWidth);
      if (drag.handle === 'n' || drag.handle === 's') {
        next.width = next.height * normAspect;
      } else {
        next.height = next.width / normAspect;
      }
    }

    setCropRect(clampCropRect(next));
  };

  const handlePointerUp = () => { dragRef.current = null; };

  const handleSelectAspectRatio = (value: CropAspectRatio) => {
    setAspectRatio(value);
    setAspectMenuOpen(false);
    if (value === null) {
      setCropRect({ x: 0, y: 0, width: 1, height: 1 });
      return;
    }
    // 始终以整张图为基准，取能放下该比例的最大尺寸，居中
    // normAspect = targetPixelRatio * (imgH / imgW)，使归一化坐标下宽高比正确
    const normAspect = value * (data.imageNaturalHeight / data.imageNaturalWidth);
    let w = 1;
    let h = w / normAspect;
    if (h > 1) { h = 1; w = h * normAspect; }
    setCropRect({ x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h });
  };

  const cropScreenX = screenX + cropRect.x * screenW;
  const cropScreenY = screenY + cropRect.y * screenH;
  const cropScreenW = cropRect.width * screenW;
  const cropScreenH = cropRect.height * screenH;

  const handlePositions: Array<{ handle: CropHandle; style: React.CSSProperties }> = [
    { handle: 'nw', style: { top: -5, left: -5, cursor: 'nw-resize' } },
    { handle: 'ne', style: { top: -5, right: -5, cursor: 'ne-resize' } },
    { handle: 'sw', style: { bottom: -5, left: -5, cursor: 'sw-resize' } },
    { handle: 'se', style: { bottom: -5, right: -5, cursor: 'se-resize' } },
    { handle: 'n', style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
    { handle: 's', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
    { handle: 'e', style: { right: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' } },
    { handle: 'w', style: { left: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' } },
  ];

  return (
    <>
      {/* 遮罩：用8块矩形精确覆盖裁剪框以外的区域，裁剪框内部完全不遮挡 */}
      <div className="fixed inset-0 z-[80] pointer-events-none">
        {/* 图片上方（屏幕顶部到图片顶部） */}
        <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: screenY }} />
        {/* 图片下方（图片底部到屏幕底部） */}
        <div className="absolute bg-black/55" style={{ left: 0, top: screenY + screenH, right: 0, bottom: 0 }} />
        {/* 图片左侧（屏幕左边到图片左边，仅图片高度范围） */}
        <div className="absolute bg-black/55" style={{ left: 0, top: screenY, width: screenX, height: screenH }} />
        {/* 图片右侧（图片右边到屏幕右边，仅图片高度范围） */}
        <div className="absolute bg-black/55" style={{ left: screenX + screenW, top: screenY, right: 0, height: screenH }} />
        {/* 图片内：裁剪框上方 */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: screenY, width: screenW, height: cropRect.y * screenH }} />
        {/* 图片内：裁剪框下方 */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: screenY + (cropRect.y + cropRect.height) * screenH, width: screenW, height: (1 - cropRect.y - cropRect.height) * screenH }} />
        {/* 图片内：裁剪框左侧 */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: cropScreenY, width: cropRect.x * screenW, height: cropScreenH }} />
        {/* 图片内：裁剪框右侧 */}
        <div className="absolute bg-black/55" style={{ left: cropScreenX + cropScreenW, top: cropScreenY, width: (1 - cropRect.x - cropRect.width) * screenW, height: cropScreenH }} />
      </div>

      {/* 裁剪框 */}
      <div
        className="fixed z-[81]"
        style={{ left: screenX, top: screenY, width: screenW, height: screenH }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="absolute border border-white/80 cursor-move"
          style={{
            left: cropRect.x * screenW,
            top: cropRect.y * screenH,
            width: cropScreenW,
            height: cropScreenH,
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          {/* 三等分网格线 */}
          <div className="absolute inset-0 pointer-events-none" style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderLeft: '1px solid rgba(255,255,255,0.25)', backgroundImage: 'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)', backgroundSize: `100% ${cropScreenH / 3}px`, backgroundPosition: `0 ${cropScreenH / 3}px` }} />

          {/* 四角 L 形角标 */}
          <div className="absolute -top-px -left-px h-5 w-5 border-t-2 border-l-2 border-white rounded-tl pointer-events-none" />
          <div className="absolute -top-px -right-px h-5 w-5 border-t-2 border-r-2 border-white rounded-tr pointer-events-none" />
          <div className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-white rounded-bl pointer-events-none" />
          <div className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-white rounded-br pointer-events-none" />
        </div>

        {/* 拖拽手柄 */}
        {handlePositions.map(({ handle, style }) => (
          <div
            key={handle}
            className="absolute h-2.5 w-2.5 rounded-sm bg-white shadow-[0_0_4px_rgba(0,0,0,0.7)]"
            style={{
              left: handle.includes('w') ? cropRect.x * screenW - 5
                : handle.includes('e') ? (cropRect.x + cropRect.width) * screenW - 5
                : cropRect.x * screenW + cropScreenW / 2 - 5,
              top: handle.includes('n') ? cropRect.y * screenH - 5
                : handle.includes('s') ? (cropRect.y + cropRect.height) * screenH - 5
                : cropRect.y * screenH + cropScreenH / 2 - 5,
              cursor: style.cursor,
            }}
            onPointerDown={(e) => handlePointerDown(e, handle)}
          />
        ))}
      </div>

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-[82] flex items-center justify-center gap-3 py-5 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/16 hover:text-white"
            aria-label="取消"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.2} />
          </button>

          <div className="relative">
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[13px] font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/16 hover:text-white"
              onClick={() => {
                setAspectMenuOpen((open) => {
                  if (open) {
                    setCustomMode(false);
                    setCustomW('');
                    setCustomH('');
                  }
                  return !open;
                });
              }}
            >
              <CropIcon size={14} strokeWidth={2} />
              <span>宽高比</span>
            </button>
            {aspectMenuOpen ? (
              <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-10 w-[148px] rounded-[14px] border border-white/10 bg-[#17181B]/95 p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                {CROP_ASPECT_RATIOS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={[
                      'flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/[0.07]',
                      aspectRatio === option.value && !customMode ? 'text-white' : 'text-gl-text-primary',
                    ].join(' ')}
                    onClick={() => { setCustomMode(false); setCustomW(''); setCustomH(''); handleSelectAspectRatio(option.value); }}
                  >
                    {option.label}
                  </button>
                ))}
                {/* 自定义选项 */}
                {!customMode ? (
                  <button
                    type="button"
                    className={[
                      'flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/[0.07]',
                      customMode ? 'text-white' : 'text-gl-text-primary',
                    ].join(' ')}
                    onClick={() => { setCustomMode(true); setAspectRatio(null); }}
                  >
                    自定义...
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="宽"
                      value={customW}
                      className="w-0 flex-1 rounded-[8px] bg-white/10 px-2 py-1.5 text-center text-[13px] text-white outline-none placeholder:text-white/30 focus:bg-white/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      onChange={(e) => {
                        const w = e.target.value;
                        setCustomW(w);
                        const wn = parseFloat(w);
                        const hn = parseFloat(customH);
                        if (wn > 0 && hn > 0) {
                          const normAspect = (wn / hn) * (data.imageNaturalHeight / data.imageNaturalWidth);
                          let nw = 1; let nh = nw / normAspect;
                          if (nh > 1) { nh = 1; nw = nh * normAspect; }
                          setCropRect({ x: (1 - nw) / 2, y: (1 - nh) / 2, width: nw, height: nh });
                        }
                      }}
                    />
                    <span className="text-[13px] text-white/40">:</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="高"
                      value={customH}
                      className="w-0 flex-1 rounded-[8px] bg-white/10 px-2 py-1.5 text-center text-[13px] text-white outline-none placeholder:text-white/30 focus:bg-white/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      onChange={(e) => {
                        const h = e.target.value;
                        setCustomH(h);
                        const wn = parseFloat(customW);
                        const hn = parseFloat(h);
                        if (wn > 0 && hn > 0) {
                          const normAspect = (wn / hn) * (data.imageNaturalHeight / data.imageNaturalWidth);
                          let nw = 1; let nh = nw / normAspect;
                          if (nh > 1) { nh = 1; nw = nh * normAspect; }
                          setCropRect({ x: (1 - nw) / 2, y: (1 - nh) / 2, width: nw, height: nh });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
            onClick={() => onConfirm(data.nodeId, cropRect)}
          >
            <Check size={14} strokeWidth={2.5} />
            <span>确认裁剪</span>
          </button>
        </div>
      </div>
    </>
  );
}

function ImageLightbox({
  data,
  onClose,
}: {
  data: ImageLightboxData | null;
  onClose: () => void;
}) {
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
  } | null>(null);
  const [viewState, setViewState] = useState<LightboxViewState>(() =>
    createLightboxViewState(data),
  );
  const activeViewState = data?.imageUrl === viewState.imageUrl
    ? viewState
    : createLightboxViewState(data);
  const canPan = activeViewState.zoom > 1;
  const imageUrl = data?.imageUrl;

  useEffect(() => {
    if (!data) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, onClose]);

  useEffect(() => {
    dragStateRef.current = null;

    if (!data || data.width && data.height) {
      return;
    }

    let cancelled = false;

    void readImageDimensions(data.imageUrl).then(({ width, height }) => {
      if (cancelled) {
        return;
      }

      setViewState((currentState) => {
        if (currentState.imageUrl !== data.imageUrl) {
          return {
            ...createLightboxViewState(data),
            imageSize: { width, height },
          };
        }

        return {
          ...currentState,
          imageSize: { width, height },
        };
      });
    }).catch(() => {
      // Lightbox panning can still work with the viewport bounds as a fallback.
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerFromCenter = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };

    setViewState((currentState) => {
      const currentViewState = currentState.imageUrl === imageUrl
        ? currentState
        : createLightboxViewState(data ?? null);
      const currentZoom = currentViewState.zoom;
      const nextZoom = clampLightboxZoomLevel(
        currentZoom * (1 - event.deltaY * LIGHTBOX_WHEEL_ZOOM_STEP),
      );

      if (Math.abs(nextZoom - 1) < LIGHTBOX_RESET_ZOOM_EPSILON) {
        return createLightboxViewState(data ?? null);
      }

      const zoomRatio = nextZoom / currentZoom;
      const nextPan = {
        x: pointerFromCenter.x - (pointerFromCenter.x - currentViewState.pan.x) * zoomRatio,
        y: pointerFromCenter.y - (pointerFromCenter.y - currentViewState.pan.y) * zoomRatio,
      };

      return {
        ...currentViewState,
        zoom: nextZoom,
        pan: clampLightboxPan(nextPan, nextZoom, rect, currentViewState.imageSize),
      };
    });
  }, [data, imageUrl]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: activeViewState.pan,
    };
  }, [activeViewState.pan, canPan]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const nextPan = {
      x: dragState.startPan.x + event.clientX - dragState.startX,
      y: dragState.startPan.y + event.clientY - dragState.startY,
    };

    setViewState((currentState) => {
      if (currentState.imageUrl !== imageUrl) {
        return currentState;
      }

      return {
        ...currentState,
        pan: clampLightboxPan(nextPan, currentState.zoom, rect, currentState.imageSize),
      };
    });
  }, [imageUrl]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!data) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/82 p-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={onClose}
    >
      <div className="group/tooltip absolute right-5 top-5">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/16 hover:text-white"
          aria-label="关闭"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <X size={18} strokeWidth={2.2} />
        </button>
        <Tooltip label="关闭" side="left" />
      </div>
      <div
        className={[
          'relative h-[88vh] w-[88vw] touch-none select-none overflow-hidden',
          canPan ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        ].join(' ')}
        onMouseDown={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <NextImage
          src={data.imageUrl}
          alt={data.alt}
          fill
          unoptimized
          sizes="88vw"
          draggable={false}
          className="pointer-events-none object-contain transition-transform duration-100 ease-out"
          style={{
            transform: `translate3d(${activeViewState.pan.x}px, ${activeViewState.pan.y}px, 0) scale(${activeViewState.zoom})`,
          }}
        />
      </div>
    </div>
  );
}

interface InnerCanvasProps {
  onBackToLibrary?: () => void;
}

// --- Inner Canvas ---
function InnerCanvas({ onBackToLibrary }: InnerCanvasProps) {
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);
  const projectName = useCanvasStore((s) => s.projectName);
  const currentProject = useCanvasStore((s) => s.currentProject);
  const loading = useCanvasStore((s) => s.loading);
  const dirty = useCanvasStore((s) => s.dirty);
  const saveMessage = useCanvasStore((s) => s.saveMessage);
  const saveProject = useCanvasStore((s) => s.saveProject);
  const setSaveMessage = useCanvasStore((s) => s.setSaveMessage);
  const attachProject = useCanvasStore((s) => s.attachProject);
  const renameProject = useCanvasStore((s) => s.renameProject);
  const deleteProject = useCanvasStore((s) => s.deleteProject);

  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const addNodes = useCanvasStore((s) => s.addNodes);
  const splitImageGenerationNodeToGrid = useCanvasStore((s) => s.splitImageGenerationNodeToGrid);
  const cropImageGenerationNode = useCanvasStore((s) => s.cropImageGenerationNode);
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const addEdgeStore = useCanvasStore((s) => s.addEdge);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeDeleteButtonPosition, setEdgeDeleteButtonPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [addMenu, setAddMenu] = useState<{
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
  } | null>(null);
  const closeAddMenuTimeoutRef = useRef<number | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<PendingConnectionMenu | null>(null);
  const [imageInfoPopover, setImageInfoPopover] = useState<ImageGenerationInfoPopoverData | null>(null);
  const [imageLightbox, setImageLightbox] = useState<ImageLightboxData | null>(null);
  const [cropMode, setCropMode] = useState<CropOverlayData | null>(null);
  const [historyAnchor, setHistoryAnchor] = useState<{ x: number; y: number } | null>(null);
  const [historyOpenKey, setHistoryOpenKey] = useState(0);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogBusy, setProjectDialogBusy] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateProjectDraft>({
    projectName: '',
    parentHandle: null,
    parentDirectoryLabel: '',
  });
  const edgeStyle = useStoredCanvasEdgeStyle();
  const activeSelectedEdgeId = selectedEdgeId && storeEdges.some((edge) => edge.id === selectedEdgeId)
    ? selectedEdgeId
    : null;

  useEffect(() => {
    return () => {
      if (closeAddMenuTimeoutRef.current) {
        window.clearTimeout(closeAddMenuTimeoutRef.current);
      }
    };
  }, []);

  const handleToggleEdgeStyle = useCallback(() => {
    setStoredCanvasEdgeStyle(edgeStyle === 'straight' ? 'curve' : 'straight');
  }, [edgeStyle]);

  const rfNodes = useMemo<ReactFlowNode[]>(() => {
    const nodes: ReactFlowNode[] = storeNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        ...n.data,
        canvasNodeActive: activeNodeId === n.id,
      },
      selected: selectedNodeIds.has(n.id),
      dragHandle:
        n.type === 'text'
          ? '.text-node-drag-handle'
          : n.type === 'image_generation'
            ? '.image-generation-node-drag-handle'
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
  }, [activeNodeId, connectionMenu, storeNodes, selectedNodeIds]);

  const rfEdges = useMemo<ReactFlowEdge[]>(() => {
    const edgeType = getReactFlowEdgeType(edgeStyle);
    const edges: ReactFlowEdge[] = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      selected: activeSelectedEdgeId === e.id,
      type: edgeType,
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
        type: edgeType,
        interactionWidth: 0,
        style: {
          stroke: 'rgba(190,205,225,0.42)',
          strokeWidth: 3,
        },
      });
    }

    return edges;
  }, [activeSelectedEdgeId, connectionMenu, edgeStyle, storeEdges]);

  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [apiSettings, setApiSettings] = useState<StoredApiSettings>(() => readStoredApiSettings());
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const referenceUploadNodeIdRef = React.useRef<string | null>(null);
  const copiedNodesRef = useRef<CanvasNode[]>([]);
  const connectedCopyBufferRef = useRef<ConnectedCopyBuffer | null>(null);
  const pasteCountRef = useRef(0);
  const connectedPasteCountRef = useRef(0);
  const promptBarInteractionRef = useRef(false);
  const pendingConnectionRef = useRef<OnConnectStartParams | null>(null);
  const suppressNextPaneClearRef = useRef(false);
  const cropPrevViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const selectionDragActiveRef = useRef(false);
  const panePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [paneSelectionDragging, setPaneSelectionDragging] = useState(false);
  const [selectionInProgress, setSelectionInProgress] = useState(false);

  const { getViewport, project, setViewport } = useReactFlow();

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
    notifyImageToolbarAction = (action, data) => {
      if (action === 'crop') {
        const targetNode = storeNodes.find(
          (node): node is Extract<CanvasNode, { type: 'image_generation' }> =>
            node.type === 'image_generation' &&
            node.data.generatedImageUrl === data.generatedImageUrl &&
            node.data.generatedHostedImageUrl === data.generatedHostedImageUrl &&
            node.data.generatedAt === data.generatedAt,
        );
        const imageUrl =
          data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim();

        if (!targetNode || !imageUrl) {
          return;
        }

        const aspectRatioValue = (() => {
          const ar = data.aspectRatio;
          if (!ar || ar === 'auto') return null;
          const m = ar.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
          if (!m) return null;
          const w = Number(m[1]); const h = Number(m[2]);
          return (w > 0 && h > 0) ? w / h : null;
        })();
        const resolvedAspect = aspectRatioValue ??
          (data.generatedImageWidth && data.generatedImageHeight
            ? data.generatedImageWidth / data.generatedImageHeight
            : 16 / 9);
        let cardW: number, cardH: number;
        if (resolvedAspect >= 1) {
          cardW = IMAGE_GENERATION_MAX_CARD_EDGE;
          cardH = Math.max(IMAGE_GENERATION_MIN_CARD_EDGE, Math.round(cardW / resolvedAspect));
        } else {
          cardH = IMAGE_GENERATION_MAX_CARD_EDGE;
          cardW = Math.max(IMAGE_GENERATION_MIN_CARD_EDGE, Math.round(cardH * resolvedAspect));
        }
        const cardStageH = IMAGE_GENERATION_MAX_CARD_EDGE + IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE + IMAGE_GENERATION_CARD_ACCESSORY_GAP;
        const cardTopOffset = cardStageH - cardH;
        const cardLeftOffset = Math.round((IMAGE_GENERATION_MAX_CARD_EDGE - cardW) / 2);

        cropPrevViewportRef.current = getViewport();

        const targetZoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM,
          Math.min(
            (window.innerWidth * 0.72) / cardW,
            (window.innerHeight * 0.72) / cardH,
          ),
        ));
        const cardCenterX = targetNode.position.x + cardLeftOffset + cardW / 2;
        const cardCenterY = targetNode.position.y + cardTopOffset + cardH / 2;
        void setViewport({
          x: window.innerWidth / 2 - cardCenterX * targetZoom,
          y: window.innerHeight / 2 - cardCenterY * targetZoom,
          zoom: targetZoom,
        }, { duration: 520 });

        setImageInfoPopover(null);
        setImageLightbox(null);
        setCropMode({
          nodeId: targetNode.id,
          imageUrl,
          nodeData: data,
          nodePosition: targetNode.position,
          cardLeft: cardLeftOffset,
          cardTop: cardTopOffset,
          cardWidth: cardW,
          cardHeight: cardH,
          imageNaturalWidth: data.generatedImageWidth || cardW,
          imageNaturalHeight: data.generatedImageHeight || cardH,
        });
        return;
      }

      if (action === 'expand') {
        setImageInfoPopover(null);
        setImageLightbox(toImageGenerationLightboxData(data));
        return;
      }

      if (action === 'download') {
        void downloadImageGenerationResult(data)
          .then((status) => {
            if (status === 'saved') {
              setSaveMessage('图片已下载');
              window.setTimeout(() => {
                setSaveMessage(null);
              }, 2200);
            }
          })
          .catch((error) => {
            setSaveMessage(error instanceof Error ? error.message : '图片下载失败');
            window.setTimeout(() => {
              setSaveMessage(null);
            }, 2200);
          });
        return;
      }

      if (action === 'split-2x2-crop' || action === 'split-3x3-crop' || action === 'split-5x5-crop') {
        const dimension = action === 'split-2x2-crop' ? 2 : action === 'split-3x3-crop' ? 3 : 5;
        const targetNode = storeNodes.find(
          (node): node is Extract<CanvasNode, { type: 'image_generation' }> =>
            node.type === 'image_generation' &&
            node.data.generatedImageUrl === data.generatedImageUrl &&
            node.data.generatedHostedImageUrl === data.generatedHostedImageUrl &&
            node.data.generatedAt === data.generatedAt,
        );

        if (!targetNode) {
          return;
        }

        void splitImageGenerationNodeToGrid(targetNode.id, dimension).catch((error) => {
          console.error('split image generation node failed', error);
        });
        return;
      }

      console.log(`image toolbar action pending: ${action}`);
    };

    return () => {
      if (notifyImageToolbarAction) {
        notifyImageToolbarAction = null;
      }
    };
  }, [cropImageGenerationNode, getViewport, setCropMode, setSaveMessage, setViewport, splitImageGenerationNodeToGrid, storeNodes]);

  useEffect(() => {
    notifyImageGenerationReferenceUpload = (nodeId) => {
      referenceUploadNodeIdRef.current = nodeId;
      const input = uploadInputRef.current;

      if (!input) {
        return;
      }
      openFileInput(input);
    };

    return () => {
      if (notifyImageGenerationReferenceUpload) {
        notifyImageGenerationReferenceUpload = null;
      }
    };
  }, []);

  const clearEdgeSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeDeleteButtonPosition(null);
  }, []);

  const selectSingleNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) =>
      current.size === 1 && current.has(nodeId) ? current : new Set([nodeId]),
    );
    setActiveNodeId(nodeId);
    clearEdgeSelection();
  }, [clearEdgeSelection]);

  useEffect(() => {
    notifyImageGenerationNodeSelect = (nodeId) => {
      selectSingleNode(nodeId);
    };

    return () => {
      if (notifyImageGenerationNodeSelect) {
        notifyImageGenerationNodeSelect = null;
      }
    };
  }, [selectSingleNode]);

  useEffect(() => {
    notifyCanvasNodeSelect = (nodeId) => {
      selectSingleNode(nodeId);
    };

    return () => {
      if (notifyCanvasNodeSelect) {
        notifyCanvasNodeSelect = null;
      }
    };
  }, [selectSingleNode]);

  useEffect(() => {
    notifyCanvasImageInfoRequest = (nodeId) => {
      const node = storeNodes.find((item) => item.id === nodeId);

      if (!node || !isCanvasImageNodeType(node.type)) {
        return;
      }

      suppressNextPaneClearRef.current = true;
      window.setTimeout(() => {
        suppressNextPaneClearRef.current = false;
      }, 0);

      selectSingleNode(nodeId);
      void toResolvedCanvasNodeInfoPopoverData(node).then((next) => {
        setImageInfoPopover(next);
      });
    };

    return () => {
      if (notifyCanvasImageInfoRequest) {
        notifyCanvasImageInfoRequest = null;
      }
    };
  }, [selectSingleNode, storeNodes]);

  const clearConnectionMenu = useCallback(() => {
    setConnectionMenu(null);
  }, [setConnectionMenu]);

  useEffect(() => {
    const handleBlankConnectionDrop = (event: Event) => {
      const detail = (event as CustomEvent<BlankConnectionDropEventDetail>).detail;

      if (!detail?.nodeId || !detail.handleType) {
        return;
      }

      clearCanvasNodeUi();
      setActiveNodeId(null);
      setSelectedNodeIds((current) => (current.size === 0 ? current : new Set()));
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

    deleteNodes(Array.from(selectedNodeIds));
    clearCanvasNodeUi();
    setActiveNodeId(null);
    setSelectedNodeIds((current) => (current.size === 0 ? current : new Set()));
  }, [deleteNodes, selectedNodeIds]);

  const handleNodeClick = useCallback((
    event: React.MouseEvent,
    node: ReactFlowNode,
  ) => {
    clearEdgeSelection();

    if (event.shiftKey) {
      setSelectedNodeIds((current) => {
        const next = new Set(current);

        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }

        return next;
      });
      return;
    }

    selectSingleNode(node.id);
  }, [clearEdgeSelection, selectSingleNode]);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: ReactFlowNode[] }) => {
    setSelectedNodeIds((current) => {
      const next = new Set(nodes.map((node) => node.id));

      return areSetsEqual(current, next) ? current : next;
    });

    if (selectionDragActiveRef.current) {
      setActiveNodeId(null);
      clearCanvasNodeUi();
    }

    if (nodes.length > 0) {
      clearEdgeSelection();
    }
  }, [clearEdgeSelection]);

  const handleSelectionStart = useCallback(() => {
    selectionDragActiveRef.current = true;
    setSelectionInProgress(true);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    selectionDragActiveRef.current = false;
    panePointerStartRef.current = null;
    setPaneSelectionDragging(false);
    setSelectionInProgress(false);
  }, []);

  const handlePaneMouseDown = useCallback((event: React.MouseEvent) => {
    const target = event.target;
    const internalTarget = target instanceof Element && Boolean(
      target.closest(
        '[data-canvas-menu-ignore="true"], .node-connectable-root, .node-connectable-card, .react-flow__node',
      ),
    );

    if (event.button !== 0 || internalTarget) {
      panePointerStartRef.current = null;
      setPaneSelectionDragging(false);
      setSelectionInProgress(false);
      return;
    }

    panePointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setPaneSelectionDragging(false);
  }, []);

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    const start = panePointerStartRef.current;

    if (!start) {
      return;
    }

    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);

    if (dx > 3 || dy > 3) {
      setPaneSelectionDragging(true);
    }
  }, []);

  const handlePaneMouseUp = useCallback(() => {
    panePointerStartRef.current = null;
    setPaneSelectionDragging(false);
    setSelectionInProgress(false);
  }, []);

  const handleCopySelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return false;
    }

    const selectedNodes = storeNodes.filter((node) => selectedNodeIds.has(node.id));

    if (selectedNodes.length === 0) {
      return false;
    }

    copiedNodesRef.current = selectedNodes.map((node) => cloneCanvasNode(node, 0));
    connectedCopyBufferRef.current = null;
    pasteCountRef.current = 0;
    return true;
  }, [selectedNodeIds, storeNodes]);

  const handleCopySelectedNodesWithUpstream = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return false;
    }

    const selectedNodes = storeNodes.filter((node) => selectedNodeIds.has(node.id));

    if (selectedNodes.length === 0) {
      return false;
    }

    connectedCopyBufferRef.current = createConnectedCopyBuffer(
      selectedNodes,
      storeEdges,
      selectedNodeIds,
    );
    copiedNodesRef.current = [];
    connectedPasteCountRef.current = 0;
    return true;
  }, [selectedNodeIds, storeEdges, storeNodes]);

  const handlePasteNodes = useCallback(() => {
    if (copiedNodesRef.current.length === 0) {
      return false;
    }

    pasteCountRef.current += 1;

    const pastedNodes = copiedNodesRef.current.map((node) =>
      cloneCanvasNode(node, pasteCountRef.current),
    );

    addNodes(pastedNodes);
    setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
    setActiveNodeId(pastedNodes.length === 1 ? pastedNodes[0].id : null);
    clearEdgeSelection();
    return true;
  }, [addNodes, clearEdgeSelection]);

  const handlePasteNodesWithUpstream = useCallback(() => {
    const copyBuffer = connectedCopyBufferRef.current;

    if (!copyBuffer || copyBuffer.nodes.length === 0) {
      return false;
    }

    connectedPasteCountRef.current += 1;

    const pastedNodes = copyBuffer.nodes.map((node) =>
      cloneCanvasNode(node, connectedPasteCountRef.current),
    );
    const pastedNodeIdsByCopiedId = new Map<string, string>(
      copyBuffer.nodes.map((node, index) => [node.id, pastedNodes[index].id]),
    );
    const validNodeIds = new Set([
      ...storeNodes.map((node) => node.id),
      ...pastedNodes.map((node) => node.id),
    ]);
    const pastedEdges = copyBuffer.edges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      source: pastedNodeIdsByCopiedId.get(edge.source) ?? edge.source,
      target: pastedNodeIdsByCopiedId.get(edge.target) ?? edge.target,
    })).filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));

    addNodes(pastedNodes);
    pastedEdges.forEach(addEdgeStore);
    setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
    setActiveNodeId(pastedNodes.length === 1 ? pastedNodes[0].id : null);
    clearEdgeSelection();
    return true;
  }, [addEdgeStore, addNodes, clearEdgeSelection, storeNodes]);

  const addUploadedImages = useCallback(async (
    files: File[],
    basePosition: { x: number; y: number },
  ) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    const imageDataList = await Promise.all(imageFiles.map((file) => readImageFile(file)));
    const nextNodes = imageDataList.map((data, index) =>
      createUploadedImageNode(
        data,
        getImageImportPosition(basePosition, index),
      ),
    );
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    setSelectedNodeIds(nextNodeIds);
    setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
    clearEdgeSelection();
  }, [addNodes, clearEdgeSelection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (isModifierPressed && event.shiftKey && key === 'c') {
        event.preventDefault();
        if (handleCopySelectedNodesWithUpstream()) {
          return;
        }
        return;
      }

      if (isModifierPressed && key === 'c') {
        if (handleCopySelectedNodes()) {
          event.preventDefault();
        }
        return;
      }

      if (isModifierPressed && event.shiftKey && key === 'v') {
        event.preventDefault();
        handlePasteNodesWithUpstream();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (!selectedEdgeId && selectedNodeIds.size === 0) {
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
    handleCopySelectedNodesWithUpstream,
    handleCopySelectedNodes,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    handlePasteNodesWithUpstream,
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
    changes.forEach((change) => {
      if (change.type === 'position' && change.position) {
        updateNodePosition(change.id, change.position);
      } else if (change.type === 'select') {
        setSelectedNodeIds((current) => {
          const next = new Set(current);

          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }

          return areSetsEqual(current, next) ? current : next;
        });

        if (change.selected) {
          clearEdgeSelection();
        }
      } else if (change.type === 'remove') {
        setActiveNodeId((current) => (current === change.id ? null : current));
        setSelectedNodeIds((current) => {
          if (!current.has(change.id)) return current;

          const next = new Set(current);
          next.delete(change.id);
          return areSetsEqual(current, next) ? current : next;
        });
        deleteNode(change.id);
      }
    });
  }, [clearEdgeSelection, updateNodePosition, deleteNode]);

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

    setSelectedNodeIds((current) => (current.size === 0 ? current : new Set()));
    setActiveNodeId(null);
    setAddMenu(null);
    clearConnectionMenu();
    setSelectedEdgeId(edge.id);
    setEdgeDeleteButtonPosition(getEdgeDeleteButtonPosition({
      x: event.clientX,
      y: event.clientY,
    }));
  }, [clearConnectionMenu]);

  const isInteractiveCanvasTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest('[data-canvas-menu-ignore="true"]'));
  }, []);

  const isNodeInternalTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        '[data-canvas-menu-ignore="true"], .node-connectable-root, .node-connectable-card, .react-flow__node',
      ),
    );
  }, []);

  const handlePaneClick = useCallback((event?: { target?: EventTarget | null }) => {
    if (suppressNextPaneClearRef.current || isInteractiveCanvasTarget(event?.target ?? null)) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setAddMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
    setImageLightbox(null);
    clearCanvasNodeUi();
    setActiveNodeId(null);
    setSelectedNodeIds((current) => (current.size === 0 ? current : new Set()));
    clearEdgeSelection();
  }, [clearConnectionMenu, clearEdgeSelection, isInteractiveCanvasTarget]);

  const handleViewportMove = useCallback((event?: { target?: EventTarget | null }) => {
    if (isInteractiveCanvasTarget(event?.target ?? null)) {
      return;
    }

    setAddMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
    setImageLightbox(null);
  }, [clearConnectionMenu, isInteractiveCanvasTarget]);

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

      clearCanvasNodeUi();
      setActiveNodeId(null);
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

  const openUploadPicker = useCallback((position?: { x: number; y: number }) => {
    referenceUploadNodeIdRef.current = null;
    uploadPositionRef.current = position ?? project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const input = uploadInputRef.current;

    if (!input) {
      return;
    }
    openFileInput(input);
  }, [project]);

  const handleUploadInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const position = uploadPositionRef.current;
    const referenceUploadNodeId = referenceUploadNodeIdRef.current;

    if (files.length > 0 && referenceUploadNodeId) {
      void (async () => {
        const imageFiles = files.filter((file) => file.type.startsWith('image/'));

        if (imageFiles.length === 0) {
          return;
        }

        const imageDataList = await Promise.all(imageFiles.map((file) => readImageFile(file)));
        const currentNode = storeNodes.find(
          (node): node is Extract<CanvasNode, { type: 'image_generation' }> =>
            node.id === referenceUploadNodeId && node.type === 'image_generation',
        );

        if (!currentNode) {
          return;
        }

        updateNodeData<'image_generation'>(referenceUploadNodeId, {
          referenceImages: [
            ...(currentNode.data.referenceImages ?? []),
            ...imageDataList.map((image) => ({
              id: crypto.randomUUID(),
              ...image,
            })),
          ],
          status: currentNode.data.status === 'error' ? 'idle' : currentNode.data.status,
          errorMessage: undefined,
        });
      })();
    } else if (files.length > 0 && position) {
      void addUploadedImages(files, position);
    }

    event.target.value = '';
    uploadPositionRef.current = null;
    referenceUploadNodeIdRef.current = null;
  }, [addUploadedImages, storeNodes, updateNodeData]);

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

  const openAddMenuAtScreen = useCallback((screen: { x: number; y: number }) => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }

    setAddMenu({
      screen,
      canvas: project({
        x: screen.x,
        y: screen.y,
      }),
    });
    clearConnectionMenu();
  }, [clearConnectionMenu, project]);

  const keepAddMenuOpen = useCallback(() => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }
  }, []);

  const scheduleCloseAddMenu = useCallback(() => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
    }

    closeAddMenuTimeoutRef.current = window.setTimeout(() => {
      setAddMenu(null);
      closeAddMenuTimeoutRef.current = null;
    }, 120);
  }, []);

  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    if (isNodeInternalTarget(event.target)) {
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
  }, [clearConnectionMenu, isNodeInternalTarget, project]);

  const handleAddMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }

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

  const showProjectMessage = useCallback((message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => {
      setSaveMessage(null);
    }, 2200);
  }, [setSaveMessage]);

  const toggleHistoryPopover = useCallback((anchor: DOMRect) => {
    setHistoryAnchor((current) => {
      if (current) {
        return null;
      }

      return {
        x: anchor.right + 16,
        y: anchor.top - 72,
      };
    });
    setHistoryOpenKey((key) => key + 1);
    setAddMenu(null);
    clearConnectionMenu();
  }, [clearConnectionMenu]);

  const handleSelectHistoryImage = useCallback(async (item: ImageHistoryItem) => {
    const viewportBeforeInsert = getViewport();
    const displayPrompt = getImageHistoryDisplayPrompt(item.nodeData);
    let resolvedImage: Awaited<ReturnType<typeof resolveHistoryImageUrls>>;

    try {
      resolvedImage = await resolveHistoryImageUrls(item);
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '历史图片加载失败');
      return;
    }

    const center = project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const position = findOpenHistoryNodePosition(
      {
        x: center.x - HISTORY_NODE_WIDTH / 2,
        y: center.y - 260,
      },
      storeNodes,
    );
    const node: Extract<CanvasNode, { type: 'image_generation' }> = {
      id: crypto.randomUUID(),
      type: 'image_generation',
      position,
      data: {
        ...item.nodeData,
        title: item.nodeData.title?.trim() || 'Image',
        prompt: displayPrompt,
        effectivePromptOverride: undefined,
        generatedImageUrl: resolvedImage.requestUrl,
        generatedHostedImageUrl: resolvedImage.previewUrl,
        generatedOutputFileName: item.fileName,
        generatedImageWidth: item.width,
        generatedImageHeight: item.height,
        generatedImageFormat: item.format,
        generatedImageSizeBytes: item.sizeBytes,
        generatedModel: item.model,
        generatedAt: item.generatedAt,
        generationResults: [{
          status: 'completed',
          imageUrl: resolvedImage.requestUrl,
          hostedImageUrl: resolvedImage.previewUrl,
          model: item.model,
          width: item.width,
          height: item.height,
          format: item.format,
          sizeBytes: item.sizeBytes,
          generatedAt: item.generatedAt,
        }],
        status: 'idle',
        errorMessage: undefined,
      },
    };

    addNodes([node]);
    setSelectedNodeIds(new Set([node.id]));
    setActiveNodeId(node.id);
    clearEdgeSelection();
    setHistoryAnchor(null);
    window.requestAnimationFrame(() => {
      void setViewport(viewportBeforeInsert, { duration: 0 });
    });
  }, [addNodes, clearEdgeSelection, getViewport, project, setViewport, showProjectMessage, storeNodes]);

  const handleConnectionMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (!connectionMenu) {
      return;
    }

    if (action !== 'text' && action !== 'image_generation' && action !== 'video') {
      clearConnectionMenu();
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

    setSelectedNodeIds((current) =>
      current.size === 1 && current.has(nextNode.id) ? current : new Set([nextNode.id]),
    );
    setActiveNodeId(nextNode.id);
    clearEdgeSelection();
    clearConnectionMenu();
  }, [
    addEdgeStore,
    addNodeAtCenter,
    clearConnectionMenu,
    clearEdgeSelection,
    connectionMenu,
  ]);

  const persistApiSettings = useCallback((values: StoredApiSettings) => {
    window.localStorage.setItem(CANVAS_TEXT_API_PROVIDER_STORAGE_KEY, values.textProvider);
    window.localStorage.setItem(CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY, values.imageProvider);
    window.localStorage.setItem(CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY, values.textApiKeys.vibe);
    window.localStorage.setItem(CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY, values.textApiKeys.fucheers);
    window.localStorage.setItem(CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY, values.textApiKeys.comfly);
    window.localStorage.setItem(CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY, values.textApiKeys.zhenzhen);
    window.localStorage.setItem(CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY, values.imageApiKeys.vibe);
    window.localStorage.setItem(CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY, values.imageApiKeys.fucheers);
    window.localStorage.setItem(CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY, values.imageApiKeys.comfly);
    window.localStorage.setItem(CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY, values.imageApiKeys.zhenzhen);
    setApiSettings(values);
  }, []);

  const handleSaveApiSettings = useCallback((values: StoredApiSettings) => {
    persistApiSettings(values);
    setApiSettingsOpen(false);
  }, [persistApiSettings]);

  const handleCloseCrop = useCallback(() => {
    setCropMode(null);
    const prev = cropPrevViewportRef.current;
    if (prev) {
      cropPrevViewportRef.current = null;
      void setViewport(prev, { duration: 320 });
    }
  }, [setViewport]);

  const handleConfirmCrop = useCallback(async (nodeId: string, cropRect: CropRect) => {
    setCropMode(null);
    cropPrevViewportRef.current = null;
    try {
      await cropImageGenerationNode(nodeId, cropRect);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '裁剪失败');
      window.setTimeout(() => setSaveMessage(null), 2200);
    }
  }, [cropImageGenerationNode, setSaveMessage]);

  const handleSaveProject = useCallback(async () => {
    await saveProject();
    setSaveMessage('保存成功');
    window.setTimeout(() => {
      setSaveMessage(null);
    }, 2200);
  }, [saveProject, setSaveMessage]);

  const handleRenameCurrentProject = useCallback(async (nextName: string) => {
    const project = useCanvasStore.getState().currentProject;

    if (!project) {
      showProjectMessage('当前没有打开的项目');
      return;
    }

    try {
      await renameProject(project, nextName);
      showProjectMessage('重命名成功');
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '重命名失败');
    }
  }, [renameProject, showProjectMessage]);

  const handleOpenCreateProjectDialog = useCallback(() => {
    setCreateDraft({
      projectName: '',
      parentHandle: null,
      parentDirectoryLabel: '',
    });
    setProjectDialogOpen(true);
  }, []);

  const handlePickProjectDirectory = useCallback(async () => {
    try {
      const parentHandle = await pickProjectParentDirectory();
      setCreateDraft((current) => ({
        ...current,
        parentHandle,
        parentDirectoryLabel: getProjectDirectoryLabel(parentHandle),
      }));
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '选择目录失败');
    }
  }, [showProjectMessage]);

  const handleConfirmCreateProject = useCallback(async () => {
    if (!createDraft.parentHandle || !createDraft.projectName.trim()) {
      return;
    }

    setProjectDialogBusy(true);

    try {
      const created = await createProjectAtParentDirectory({
        parentHandle: createDraft.parentHandle,
        projectName: createDraft.projectName.trim(),
      });

      attachProject(created.project, created.snapshot);
      setProjectDialogOpen(false);
      setCreateDraft({
        projectName: '',
        parentHandle: null,
        parentDirectoryLabel: '',
      });
      showProjectMessage('创建成功');
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setProjectDialogBusy(false);
    }
  }, [attachProject, createDraft.parentHandle, createDraft.projectName, showProjectMessage]);

  const handleRequestDeleteCurrentProject = useCallback(() => {
    const project = useCanvasStore.getState().currentProject;

    if (!project) {
      showProjectMessage('当前没有打开的项目');
      return;
    }

    setDeleteProjectDialogOpen(true);
  }, [showProjectMessage]);

  const handleConfirmDeleteCurrentProject = useCallback(async () => {
    const project = useCanvasStore.getState().currentProject;

    if (!project) {
      showProjectMessage('当前没有打开的项目');
      setDeleteProjectDialogOpen(false);
      return;
    }

    try {
      await deleteProject(project);
      setDeleteProjectDialogOpen(false);
      showProjectMessage('删除成功');
      onBackToLibrary?.();
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '删除项目失败');
    }
  }, [deleteProject, onBackToLibrary, showProjectMessage]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const timer = window.setInterval(() => {
      const latestState = useCanvasStore.getState();

      if (!latestState.dirty || latestState.loading) {
        return;
      }

      void latestState.saveProject().catch(() => {});
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [dirty]);

  return (
    <>
      {saveMessage ? (
        <div className="fixed right-6 top-16 z-[95] rounded-[12px] border border-white/12 bg-[#1d1f23] px-4 py-2 text-[13px] text-white shadow-[0_18px_36px_rgba(0,0,0,0.4)]">
          {saveMessage}
        </div>
      ) : null}
      <CanvasHeader
        projectName={projectName}
        busy={loading}
        onProjectNameCommit={handleRenameCurrentProject}
        onBackToLibrary={onBackToLibrary}
        onCreateProject={handleOpenCreateProjectDialog}
        onDeleteProject={currentProject ? handleRequestDeleteCurrentProject : undefined}
      />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onSelectionChange={handleSelectionChange}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={handlePaneClick}
        onPaneScroll={handleViewportMove}
        onMoveStart={handleViewportMove}
        onPaneMouseMove={handlePaneMouseMove}
        onPaneMouseLeave={handlePaneMouseUp}
        onMouseDown={handlePaneMouseDown}
        onMouseMove={handlePaneMouseMove}
        onMouseUp={handlePaneMouseUp}
        onDoubleClick={handlePaneDoubleClick}
        connectOnClick={false}
        zoomOnDoubleClick={false}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        className={paneSelectionDragging ? 'gl-pane-selection-dragging' : undefined}
        nodeDragThreshold={1}
        deleteKeyCode={null}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomActivationKeyCode="Control"
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: 'rgba(190,205,225,0.3)', strokeWidth: 2.8 },
          type: getReactFlowEdgeType(edgeStyle),
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
        <CanvasViewportControls
          edgeStyle={edgeStyle}
          onToggleEdgeStyle={handleToggleEdgeStyle}
          nodes={storeNodes}
        />
        <MultiNodeSelectionOverlay
          nodes={storeNodes}
          selectedNodeIds={selectedNodeIds}
          visible={!selectionInProgress && !paneSelectionDragging}
        />
        <CanvasCornerActionButton />
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
          onMouseEnter={keepAddMenuOpen}
          onMouseLeave={scheduleCloseAddMenu}
        />
      ) : null}

      {connectionMenu ? (
        <AddNodeMenu
          x={connectionMenu.screen.x}
          y={connectionMenu.screen.y}
          onSelect={handleConnectionMenuSelect}
        />
      ) : null}

      <CanvasToolbar
        onOpenAddMenu={openAddMenuAtScreen}
        onScheduleCloseAddMenu={scheduleCloseAddMenu}
        onOpenApiSettings={() => setApiSettingsOpen(true)}
        onToggleHistory={toggleHistoryPopover}
        onSaveProject={() => void handleSaveProject()}
        historyOpen={historyAnchor !== null}
      />
      <GenerationHistoryPopover
        key={historyOpenKey}
        open={historyAnchor !== null}
        anchor={historyAnchor}
        onClose={() => setHistoryAnchor(null)}
        onSelectImage={handleSelectHistoryImage}
      />
      <ImageGenerationInfoPopover
        open={imageInfoPopover !== null}
        data={imageInfoPopover}
        onClose={() => setImageInfoPopover(null)}
      />
      <ImageLightbox
        key={imageLightbox?.imageUrl ?? 'image-lightbox-closed'}
        data={imageLightbox}
        onClose={() => setImageLightbox(null)}
      />
      <CropOverlay
        data={cropMode}
        onClose={handleCloseCrop}
        onConfirm={(nodeId, cropRect) => void handleConfirmCrop(nodeId, cropRect)}
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
        key={apiSettingsOpen ? 'api-settings-open' : 'api-settings-closed'}
        open={apiSettingsOpen}
        initialSettings={apiSettings}
        onClose={() => setApiSettingsOpen(false)}
        onApply={persistApiSettings}
        onSave={handleSaveApiSettings}
      />
      <CreateProjectDialog
        open={projectDialogOpen}
        draft={createDraft}
        loading={projectDialogBusy}
        onChangeProjectName={(value) =>
          setCreateDraft((current) => ({
            ...current,
            projectName: value,
          }))
        }
        onPickDirectory={() => void handlePickProjectDirectory()}
        onConfirm={() => void handleConfirmCreateProject()}
        onClose={() => {
          if (projectDialogBusy) {
            return;
          }

          setProjectDialogOpen(false);
        }}
      />
      <DeleteProjectDialog
        open={deleteProjectDialogOpen && currentProject !== null}
        projectName={currentProject?.name ?? projectName}
        loading={loading}
        onConfirm={() => void handleConfirmDeleteCurrentProject()}
        onClose={() => {
          if (loading) {
            return;
          }

          setDeleteProjectDialogOpen(false);
        }}
      />
    </>
  );
}

// --- Wrapper ---
export function InfiniteCanvas({ onBackToLibrary }: InnerCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas onBackToLibrary={onBackToLibrary} />
    </ReactFlowProvider>
  );
}
