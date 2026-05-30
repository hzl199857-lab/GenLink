'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import NextImage from 'next/image';
import {
  ChevronDown,
  Columns3,
  Copy,
  Expand,
  FolderPlus,
  Group,
  Image as ImageIcon,
  Grid2x2,
  Map as MapIcon,
  MousePointer2,
  Plus,
  Type,
  Rows3,
  X,
  Check,
  Camera,
  Box,
  CropIcon,
  Play,
  Download,
  ListOrdered,
  Ungroup,
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
  getViewportForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY,
  CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_GRSAI_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_RUNNINGHUB_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY,
  CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY,
  CANVAS_RUNNINGHUB_WORKFLOW_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_API_PROVIDER_STORAGE_KEY,
  CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_GRSAI_API_KEY_STORAGE_KEY,
  CANVAS_TEXT_RUNNINGHUB_API_KEY_STORAGE_KEY,
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
import { THREE_VIEW_DEFAULT_ANGLE } from '@/lib/three-view-defaults';
import type {
  CanvasEdge,
  CanvasNode,
  ImageHistoryItem,
  MaterialLibraryItem,
  NodeGroup,
  NodeType,
  TextNodeData,
  ImageGenerationNodeData,
  AITextResultNodeData,
  ImageNodeData,
  Panorama360NodeData,
  Panorama360ViewState,
  UploadedImageNodeData,
  VideoNodeData,
  VideoGenerationNodeData,
} from '@/types/canvas';
import type { ZipImageDownloadItem } from '@/lib/image-zip-download';

import { TextNode } from '../nodes/TextNode';
import { ImageGenerationNode } from '../nodes/ImageGenerationNode';
import {
  VideoGenerationNode,
  type VideoGenerationToolbarAction,
} from '../nodes/VideoGenerationNode';
import { getVideoModelLabel } from '../nodes/VideoGenerationPromptBar';
import { AITextResultNode } from '../nodes/AITextResultNode';
import { Panorama360Node } from '../nodes/Panorama360Node';
import { UploadedImageNode } from '../nodes/UploadedImageNode';
import {
  UploadedVideoNode,
  resolveUploadedVideoCardDimensions,
} from '../nodes/UploadedVideoNode';
import { CardSideHandle } from '../nodes/CardSideHandle';
import {
  ImageGenerationInfoPopover,
  type ImageGenerationInfoPopoverData,
} from '../nodes/ImageGenerationInfoPopover';
import { NodeFloatingToolbar } from '../nodes/NodeFloatingToolbar';
import {
  ImageGenerationNodeToolbar,
  type ImageGenerationToolbarAction,
} from '../nodes/ImageGenerationNodeToolbar';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { AddNodeMenu, type AddNodeMenuAction } from './AddNodeMenu';
import { CanvasHeader } from './CanvasHeader';
import { CanvasToolbar } from './CanvasToolbar';
import { GenerationHistoryPopover } from './GenerationHistoryPopover';
import { MaterialLibraryDialog, type PendingMaterialSource } from './MaterialLibraryDialog';
import { MaterialLibraryPanel } from './MaterialLibraryPanel';
import { Tooltip } from '@/components/ui/Tooltip';
import { downloadImageGenerationResult } from '@/lib/image-download';
import { createVideoClipJob, pollVideoClipJob } from '@/lib/video/clip-client';
import { ensureVideoProcessingSourceUrl } from '@/lib/video/source-upload';
import { getImageHistoryDisplayPrompt } from '@/lib/image-prompt';
import {
  CreateProjectDialog,
  getProjectDirectoryLabel,
  type CreateProjectDraft,
} from '@/components/project/CreateProjectDialog';
import { DeleteProjectDialog } from '@/components/project/DeleteProjectDialog';
import { ThreeViewController } from '../nodes/ThreeViewController';
import type { ThreeViewControllerValue } from '../nodes/ThreeViewController';

let notifyPromptBarInteraction: (() => void) | null = null;
let notifyImageToolbarAction:
  | ((action: string, data: ImageGenerationNodeData) => void)
  | null = null;
let notifyUploadedImageToolbarAction:
  | ((action: ImageGenerationToolbarAction, nodeId: string, data: UploadedImageNodeData, cardLayout: { left: number; top: number; width: number; height: number } | null) => void)
  | null = null;
let notifyImageNodeCropRequest:
  | ((nodeId: string, data: ImageNodeData, cardDimensions: { width: number; height: number }, imageUrl: string) => void)
  | null = null;
let notifyMaterialLibraryRequest:
  | ((source: PendingMaterialSource) => void)
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
let notifyVideoGenerationReferenceUpload:
  | ((nodeId: string) => void)
  | null = null;
let notifyPanorama360NavigationActiveChange:
  | ((nodeId: string, active: boolean) => void)
  | null = null;
let notifyPanorama360UploadRequest:
  | ((nodeId: string, file: File) => void)
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

function inferVideoFormatFromData(data: VideoNodeData): string {
  const mimeType = data.mimeType?.trim();

  if (mimeType) {
    const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();

    if (subtype) {
      return subtype.toUpperCase();
    }
  }

  const url = data.hostedVideoUrl?.trim() || data.videoUrl?.trim() || data.fileName?.trim();

  if (!url) {
    return '-';
  }

  const pathname = url.split('?')[0] ?? '';
  const extensionMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);

  return extensionMatch?.[1] ? extensionMatch[1].toUpperCase() : '-';
}

function toVideoInfoPopoverData(data: VideoNodeData): ImageGenerationInfoPopoverData {
  return {
    title: '视频信息',
    model: '-',
    format: inferVideoFormatFromData(data),
    size: formatImageSize(data.sizeBytes),
    resolution: formatImageResolution(data.width, data.height),
    createdTime: undefined,
  };
}

function toVideoGenerationInfoPopoverData(data: VideoGenerationNodeData): ImageGenerationInfoPopoverData | null {
  const videoUrl = data.hostedVideoUrl?.trim() || data.videoUrl?.trim();

  if (!videoUrl) {
    return null;
  }

  return {
    title: '视频信息',
    model: getVideoModelLabel(data.generatedModel?.trim() || data.model?.trim() || '-'),
    format: inferVideoFormatFromData({
      videoUrl,
      width: 0,
      height: 0,
      fileName: data.generatedOutputFileName,
      mimeType: 'video/mp4',
    }),
    size: '-',
    resolution: data.resolution?.trim() || '-',
    createdTime: formatGeneratedAt(data.generatedAt) || undefined,
  };
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

  if (node.type === 'video') {
    return toVideoInfoPopoverData(node.data as VideoNodeData);
  }

  if (node.type === 'video_generation') {
    return toVideoGenerationInfoPopoverData(node.data as VideoGenerationNodeData);
  }

  return null;
}

function isCanvasMediaInfoNodeType(type: string): type is CanvasNode['type'] {
  return type === 'image_generation' || type === 'image' || type === 'uploaded_image' || type === 'video' || type === 'video_generation';
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

function resolveAspectDrivenCardDimensions(
  aspectRatio?: string,
): { width: number; height: number } {
  const resolvedAspectRatio = parseCanvasAspectRatio(aspectRatio) ?? 16 / 9;

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

function resolveImageGenerationCardDimensions(
  data: ImageGenerationNodeData,
  referenceImages?: ImageGenerationReferenceDimensions[],
): { width: number; height: number } {
  const generatedAspectRatio =
    data.generatedImageWidth && data.generatedImageHeight && data.generatedImageWidth > 0 && data.generatedImageHeight > 0
      ? data.generatedImageWidth / data.generatedImageHeight
      : null;
  const referenceImage = getFirstValidImageDimensions(referenceImages ?? data.referenceImages);
  const referenceAspectRatio =
    referenceImage?.width && referenceImage?.height
      ? referenceImage.width / referenceImage.height
      : null;
  const explicitAspectRatio = parseCanvasAspectRatio(data.aspectRatio);
  const autoAspectRatio =
    data.aspectRatio === 'auto'
      ? referenceAspectRatio ?? generatedAspectRatio
      : generatedAspectRatio;
  const resolvedAspectRatio = explicitAspectRatio ?? autoAspectRatio ?? 16 / 9;

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

function resolveImageNodeCardDimensions(
  data: ImageNodeData,
): { width: number; height: number } {
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

function getImageNodeFocusBounds(node: CanvasNode): MultiNodeSelectionBounds {
  const baseBounds = getEstimatedNodeBounds(node);

  if (node.type === 'image_generation') {
    const width = Math.max(baseBounds.width, THREE_VIEW_CONTROLLER_WIDTH);
    return {
      x: baseBounds.x - Math.max(0, (width - baseBounds.width) / 2),
      y: baseBounds.y,
      width,
      height: baseBounds.height + THREE_VIEW_CONTROLLER_HEIGHT + THREE_VIEW_FOCUS_BOTTOM_PADDING,
    };
  }

  if (node.type === 'uploaded_image') {
    const width = Math.max(baseBounds.width, THREE_VIEW_CONTROLLER_WIDTH);

    return {
      x: baseBounds.x - Math.max(0, (width - baseBounds.width) / 2),
      y: baseBounds.y - IMAGE_NODE_TOOLBAR_LIFT,
      width,
      height: baseBounds.height + IMAGE_NODE_TOOLBAR_LIFT + THREE_VIEW_CONTROLLER_HEIGHT + THREE_VIEW_FOCUS_BOTTOM_PADDING,
    };
  }

  if (node.type === 'video') {
    return {
      x: baseBounds.x,
      y: baseBounds.y - IMAGE_NODE_TOOLBAR_LIFT,
      width: baseBounds.width,
      height: baseBounds.height + IMAGE_NODE_TOOLBAR_LIFT,
    };
  }

  if (node.type === 'image') {
    const width = Math.max(baseBounds.width, THREE_VIEW_CONTROLLER_WIDTH);

    return {
      x: baseBounds.x - Math.max(0, (width - baseBounds.width) / 2),
      y: baseBounds.y - IMAGE_NODE_TOOLBAR_LIFT,
      width,
      height: baseBounds.height + IMAGE_NODE_TOOLBAR_LIFT + THREE_VIEW_CONTROLLER_HEIGHT + THREE_VIEW_FOCUS_BOTTOM_PADDING,
    };
  }

  return {
    x: baseBounds.x,
    y: baseBounds.y,
    width: Math.max(baseBounds.width, THREE_VIEW_CONTROLLER_WIDTH),
    height: baseBounds.height + THREE_VIEW_CONTROLLER_HEIGHT + THREE_VIEW_FOCUS_BOTTOM_PADDING,
  };
}

function getVideoClipFocusBounds(node: CanvasNode): MultiNodeSelectionBounds {
  const baseBounds = getEstimatedNodeBounds(node);

  if (node.type !== 'video') {
    return getImageNodeFocusBounds(node);
  }

  const data = node.data as VideoNodeData;
  const dimensions = resolveUploadedVideoCardDimensions(data);
  const clipControlsBottom =
    IMAGE_NODE_ADAPTER_TOP_PADDING +
    dimensions.height +
    VIDEO_CLIP_CONTROLS_TOP_OFFSET +
    VIDEO_CLIP_CONTROLS_FOCUS_HEIGHT;

  return {
    x: baseBounds.x,
    y: baseBounds.y - IMAGE_NODE_TOOLBAR_LIFT,
    width: Math.max(baseBounds.width, VIDEO_CLIP_CONTROLS_MIN_FOCUS_WIDTH),
    height: IMAGE_NODE_TOOLBAR_LIFT + Math.max(baseBounds.height, clipControlsBottom),
  };
}

function useThreeViewFocusAnimator() {
  const { setViewport, getViewport } = useReactFlow();
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return useCallback(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      const flowWidth = window.innerWidth;
      const flowHeight = window.innerHeight;

      if (!flowWidth || !flowHeight) {
        return;
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      const target = getViewportForBounds(
        bounds,
        flowWidth,
        flowHeight,
        CANVAS_MIN_ZOOM,
        CANVAS_MAX_ZOOM,
        THREE_VIEW_FOCUS_PADDING,
      );
      const startViewport = getViewport();
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / THREE_VIEW_FOCUS_ANIMATION_DURATION_MS);
        const eased = THREE_VIEW_FOCUS_EASE(progress);
        const nextViewport = {
          x: startViewport.x + (target.x - startViewport.x) * eased,
          y: startViewport.y + (target.y - startViewport.y) * eased,
          zoom: startViewport.zoom + (target.zoom - startViewport.zoom) * eased,
        };

        void setViewport(nextViewport, { duration: 0 });

        if (progress < 1) {
          animationFrameRef.current = window.requestAnimationFrame(step);
        } else {
          animationFrameRef.current = null;
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(step);
    },
    [getViewport, setViewport],
  );
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
    const data = node.data as ImageGenerationNodeData;
    const referenceImages = data.aspectRatio === 'auto'
      ? useCanvasStore.getState().getConnectedImagesForImageGenerationNode(node.id)
      : undefined;
    const dimensions = resolveImageGenerationCardDimensions(data, referenceImages);
    const stageHeight = IMAGE_GENERATION_MAX_CARD_EDGE + IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE + IMAGE_GENERATION_CARD_ACCESSORY_GAP;

    return {
      x: node.position.x + Math.round((IMAGE_GENERATION_MAX_CARD_EDGE - dimensions.width) / 2),
      y: node.position.y + stageHeight - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
      radius: 18,
    };
  }

  if (node.type === 'video_generation') {
    return {
      x: node.position.x,
      y: node.position.y + 76,
      width: 540,
      height: 304,
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

  if (node.type === 'video') {
    const dimensions = resolveUploadedVideoCardDimensions(node.data as VideoNodeData);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: dimensions.width,
      height: dimensions.height,
      radius: 22,
    };
  }

  if (node.type === 'panorama-360') {
    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: 720,
      height: 405,
      radius: 22,
    };
  }

  if (node.type === 'image') {
    const dimensions = resolveImageNodeCardDimensions(node.data as ImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: dimensions.width,
      height: dimensions.height,
      radius: 22,
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

type ImageGenerationReferenceDimensions = {
  width?: number;
  height?: number;
};

function getFirstValidImageDimensions(
  images: ImageGenerationReferenceDimensions[] | undefined,
): ImageGenerationReferenceDimensions | null {
  return images?.find(
    (image) => image.width && image.height && image.width > 0 && image.height > 0,
  ) ?? null;
}

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
    const data = node.data as ImageGenerationNodeData;
    const referenceImages = data.aspectRatio === 'auto'
      ? useCanvasStore.getState().getConnectedImagesForImageGenerationNode(node.id)
      : undefined;
    const dimensions = resolveImageGenerationCardDimensions(data, referenceImages);
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
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === 'video') {
    const dimensions = resolveUploadedVideoCardDimensions(node.data as VideoNodeData);

    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === 'image') {
    const dimensions = resolveImageNodeCardDimensions(node.data as ImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: IMAGE_NODE_ADAPTER_TOP_PADDING + dimensions.height + 36,
    };
  }

  if (node.type === 'panorama-360') {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: 720,
      height: 445,
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
type ImportedImageData = ImageNodeData & {
  fileName?: string;
};

type ImportedVideoData = VideoNodeData;

function readImageFile(file: File): Promise<ImportedImageData> {
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
          title: file.name,
          imageUrl,
          fileName: file.name,
          prompt: file.name,
          generatedAt: new Date().toISOString(),
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

function captureVideoFirstFrame(file: File): Promise<{
  previewUrl: string;
  width: number;
  height: number;
  durationSeconds?: number;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (value: {
      previewUrl: string;
      width: number;
      height: number;
      durationSeconds?: number;
    }) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error('Failed to capture video thumbnail'));
    };

    const capture = () => {
      const width = video.videoWidth || 320;
      const height = video.videoHeight || 180;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          fail();
          return;
        }

        context.drawImage(video, 0, 0, width, height);
        finish({
          previewUrl: canvas.toDataURL('image/jpeg', 0.82),
          width,
          height,
          durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
        });
      } catch {
        fail();
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;
    video.addEventListener('loadeddata', capture, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.load();
  });
}

async function readVideoFile(file: File): Promise<ImportedVideoData> {
  const videoFrame = await captureVideoFirstFrame(file).catch(() => null);
  const uploaded = await uploadMediaFileToOss(file);

  return {
    title: file.name,
    videoUrl: uploaded.url,
    hostedVideoUrl: uploaded.url,
    previewUrl: videoFrame?.previewUrl,
    fileName: uploaded.fileName,
    width: videoFrame?.width ?? 320,
    height: videoFrame?.height ?? 180,
    sizeBytes: uploaded.sizeBytes,
    durationSeconds: videoFrame?.durationSeconds,
    mimeType: uploaded.mimeType,
  };
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

async function uploadMediaFileToOss(file: File): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const folder = file.type.startsWith('video/')
    ? 'references/videos'
    : file.type.startsWith('audio/')
      ? 'references/audio'
      : 'references/images';
  const response = await fetch('/api/media-hosting/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: file.type || 'application/octet-stream',
      fileName: file.name,
      folder,
    }),
  });
  const json = (await response.json()) as
    | {
        ok: true;
        result: {
          uploadUrl: string;
          mediaUrl: string;
          headers: Record<string, string>;
        };
      }
    | { ok: false; error: string };

  if (!response.ok || !json.ok) {
    throw new Error('error' in json ? json.error : 'Media upload URL creation failed');
  }

  const uploadResponse = await fetch(json.result.uploadUrl, {
    method: 'PUT',
    headers: json.result.headers,
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Media upload failed (${uploadResponse.status})`);
  }

  return {
    url: json.result.mediaUrl,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
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

function createImportedImageNode(
  data: ImageNodeData,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    position,
    data,
  };
}

function createImportedVideoNode(
  data: VideoNodeData,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: 'video',
    position,
    data,
  };
}

function toUploadedImageNodeData(data: ImportedImageData): UploadedImageNodeData {
  return {
    title: data.title,
    imageUrl: data.imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    fileName: data.fileName,
    width: data.width || 320,
    height: data.height || 320,
    sizeBytes: data.sizeBytes,
  };
}

function createImageNodeFromMaterial(
  item: MaterialLibraryItem,
  position: { x: number; y: number },
): CanvasNode {
  const imageUrl = item.hostedImageUrl?.trim() || item.imageUrl.trim();
  const width = item.width || 320;
  const height = item.height || 320;

  return createImportedImageNode(
    {
      title: item.name,
      imageUrl,
      hostedImageUrl: imageUrl,
      prompt: item.name || item.fileName || item.outputFileName || 'Image',
      generatedAt: item.createdAt || new Date().toISOString(),
      width,
      height,
      sizeBytes: item.sizeBytes,
    },
    position,
  );
}

function createMaterialSourceFromImageGenerationData(
  data: ImageGenerationNodeData,
): PendingMaterialSource | null {
  const imageUrl = data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    defaultName: data.title?.trim() || '未命名素材',
    imageUrl: data.generatedOutputFileName ? `output:${data.generatedOutputFileName}` : imageUrl,
    hostedImageUrl: imageUrl,
    outputFileName: data.generatedOutputFileName,
    fileName: data.generatedOutputFileName,
    sourceNodeType: 'image_generation',
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
    sizeBytes: data.generatedImageSizeBytes,
    format: data.generatedImageFormat,
  };
}

function createMaterialSourceFromImageNodeData(data: ImageNodeData): PendingMaterialSource | null {
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    defaultName: data.title?.trim() || '未命名素材',
    imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    sourceNodeType: 'image',
    width: data.width,
    height: data.height,
    sizeBytes: data.sizeBytes,
  };
}

function createMaterialSourceFromUploadedImageData(
  data: UploadedImageNodeData,
): PendingMaterialSource | null {
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    defaultName: data.title?.trim() || data.fileName?.trim() || '未命名素材',
    imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    fileName: data.fileName,
    sourceNodeType: 'uploaded_image',
    width: data.width,
    height: data.height,
    sizeBytes: data.sizeBytes,
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
  const lastFocusRequestIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const focusRequestId = renderData.canvasFocusRequestId;

    if (!focusRequestId || lastFocusRequestIdRef.current === focusRequestId) {
      return;
    }

    lastFocusRequestIdRef.current = focusRequestId;
    setEditing(true);
  }, [renderData.canvasFocusRequestId]);

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
  const generateThreeViewImage = useCanvasStore((s) => s.generateThreeViewImageFromNode);
  const removeReferenceImage = useCanvasStore(
    (s) => s.removeReferenceImageFromImageGenerationNode,
  );
  const threeViewControllerNodeId = useCanvasStore((s) => s.threeViewControllerNodeId);
  const setThreeViewControllerNodeId = useCanvasStore((s) => s.setThreeViewControllerNodeId);
  const connectedImages = useCanvasStore((s) =>
    s.getConnectedImagesForImageGenerationNode(id),
  );
  const animateFocusViewport = useThreeViewFocusAnimator();
  const renderData = data as CanvasNodeRenderData;
  const [promptFocused, setPromptFocused] = useState(false);
  const isActive = ((selected && renderData.canvasNodeActive) || promptFocused) && !dragging;
  const handleSelectNode = () => notifyCanvasNodeSelect?.(id);
  const focusNodeViewport = () => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find((candidate) => candidate.id === id);

    if (!node) {
      return;
    }

    const bounds = getImageNodeFocusBounds(node);
    animateFocusViewport(bounds);
  };
  const imageData = data as ImageGenerationNodeData;
  const cameraAngle = imageData.cameraAngle ?? THREE_VIEW_DEFAULT_ANGLE;
  const threeViewOpen = threeViewControllerNodeId === id;
  const controllerLeft = IMAGE_GENERATION_MAX_CARD_EDGE / 2 - THREE_VIEW_CONTROLLER_WIDTH / 2;
  const controllerTop =
    IMAGE_GENERATION_MAX_CARD_EDGE +
    IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE +
    IMAGE_GENERATION_CARD_ACCESSORY_GAP +
    THREE_VIEW_CONTROLLER_GAP;

  useEffect(() => {
    const handleClearNodeUi = () => setPromptFocused(false);

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

  return (
    <div className="relative">
      <ImageGenerationNode
        id={id}
        data={data as ImageGenerationNodeData}
        selected={isActive}
        dragging={!!dragging}
        connectedImages={connectedImages}
        onChange={(next) => updateNodeData<'image_generation'>(id, next)}
        onTitleChange={(nextTitle) => updateNodeData<'image_generation'>(id, { title: nextTitle })}
        onRun={(promptOverride, options) => generateImage(id, promptOverride, options)}
        onUpload={() => notifyImageGenerationReferenceUpload?.(id)}
        onRemoveReference={(referenceImageId) => removeReferenceImage(id, referenceImageId)}
        onToolbarAction={(action) => {
          if (action === 'pan') {
            focusNodeViewport();
            setThreeViewControllerNodeId(threeViewOpen ? null : id);
            handleSelectNode();
            return;
          }

          notifyImageToolbarAction?.(action, data as ImageGenerationNodeData);
        }}
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
        hidePromptBar={threeViewOpen}
        panActive={threeViewOpen}
        promptFocusRequestId={renderData.canvasFocusRequestId}
      />
      {threeViewOpen ? (
        <div
          className="absolute flex justify-center"
          data-canvas-menu-ignore="true"
          style={{
            left: `${controllerLeft}px`,
            top: `${controllerTop}px`,
            width: `${THREE_VIEW_CONTROLLER_WIDTH}px`,
          }}
        >
          <ThreeViewController
            visible
            value={cameraAngle}
            imageUrl={imageData.generatedHostedImageUrl || imageData.generatedImageUrl}
            onChange={(next) => updateNodeData<'image_generation'>(id, { cameraAngle: next })}
            onGenerate={() => {
              void generateThreeViewImage(id, cameraAngle)
                .then((nextNodeId) => {
                  setThreeViewControllerNodeId(null);
                  notifyCanvasNodeSelect?.(nextNodeId);
                })
                .catch((error) => {
                  console.error('three view generation failed', error);
                  const message = error instanceof Error ? error.message : '3D view generation failed';
                  useCanvasStore.getState().setSaveMessage(message);
                  window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
                });
            }}
            onClose={() => {
              focusNodeViewport();
              setThreeViewControllerNodeId(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
});

const VideoGenerationNodeAdapter = memo(function VideoGenerationNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateVideo = useCanvasStore((s) => s.generateVideoFromVideoGenerationNode);
  const connectedImages = useCanvasStore((s) =>
    s.getConnectedImagesForVideoGenerationNode(id),
  );
  const connectedVideos = useCanvasStore((s) =>
    s.getConnectedVideosForVideoGenerationNode(id),
  );
  const renderData = data as CanvasNodeRenderData;
  const [promptFocused, setPromptFocused] = useState(false);
  const isActive = ((selected && renderData.canvasNodeActive) || promptFocused) && !dragging;
  const handleSelectNode = () => notifyCanvasNodeSelect?.(id);
  const videoData = data as VideoGenerationNodeData;
  const handleVideoCardClick = () => {
    if (videoData.hostedVideoUrl?.trim() || videoData.videoUrl?.trim()) {
      notifyCanvasImageInfoRequest?.(id);
      return;
    }

    handleSelectNode();
  };
  const cardDimensions = resolveAspectDrivenCardDimensions(videoData.ratio);
  const handleToolbarAction = (action: VideoGenerationToolbarAction) => {
    const videoUrl = videoData.hostedVideoUrl?.trim() || videoData.videoUrl?.trim() || '';

    switch (action) {
      case 'download': {
        if (videoUrl) {
          const a = document.createElement('a');
          a.href = videoUrl;
          a.download = videoData.title || 'video';
          a.click();
        }
        break;
      }
      case 'copy-link': {
        if (videoUrl) {
          void navigator.clipboard?.writeText(videoUrl);
        }
        break;
      }
      default:
        break;
    }
  };

  useEffect(() => {
    const handleClearNodeUi = () => setPromptFocused(false);

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

  return (
    <VideoGenerationNode
      id={id}
      data={data as VideoGenerationNodeData}
      cardDimensions={cardDimensions}
      selected={isActive}
      dragging={!!dragging}
      connectedImages={connectedImages}
      connectedVideos={connectedVideos}
      onChange={(next) => updateNodeData<'video_generation'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'video_generation'>(id, { title: nextTitle })}
      onRun={(promptOverride) => generateVideo(id, promptOverride)}
      onUpload={() => notifyVideoGenerationReferenceUpload?.(id)}
      onToolbarAction={handleToolbarAction}
      onSelectNode={handleVideoCardClick}
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
      promptFocusRequestId={renderData.canvasFocusRequestId}
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

const ImageNodeAdapter = memo(function ImageNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateThreeViewImage = useCanvasStore((s) => s.generateThreeViewImageFromNode);
  const splitImageNodeToGrid = useCanvasStore((s) => s.splitImageNodeToGrid);
  const threeViewControllerNodeId = useCanvasStore((s) => s.threeViewControllerNodeId);
  const setThreeViewControllerNodeId = useCanvasStore((s) => s.setThreeViewControllerNodeId);
  const animateFocusViewport = useThreeViewFocusAnimator();
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;
  const imageData = data as ImageNodeData;
  const hasImage = Boolean(imageData.imageUrl?.trim() || imageData.hostedImageUrl?.trim());
  const cameraAngle = imageData.cameraAngle ?? THREE_VIEW_DEFAULT_ANGLE;
  const threeViewOpen = threeViewControllerNodeId === id;
  const cardDimensions = resolveImageNodeCardDimensions(imageData);
  const controllerLeft = cardDimensions.width / 2 - THREE_VIEW_CONTROLLER_WIDTH / 2;
  const controllerTop = 74 + 22 + cardDimensions.height + THREE_VIEW_CONTROLLER_GAP;
  const focusNodeViewport = () => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find((candidate) => candidate.id === id);

    if (!node) {
      return;
    }

    const bounds = getImageNodeFocusBounds(node);
    animateFocusViewport(bounds);
  };
  const handleToolbarAction = (action: ImageGenerationToolbarAction) => {
    switch (action) {
      case 'organize': {
        const source = createMaterialSourceFromImageNodeData(imageData);
        if (source) {
          notifyMaterialLibraryRequest?.(source);
        }
        break;
      }
      case 'download': {
        const url = imageData.hostedImageUrl || imageData.imageUrl;
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = imageData.title || 'image';
          a.click();
        }
        break;
      }
      case 'expand':
        notifyCanvasImageInfoRequest?.(id);
        break;
      case 'pan':
        focusNodeViewport();
        setThreeViewControllerNodeId(threeViewOpen ? null : id);
        notifyCanvasNodeSelect?.(id);
        break;
      case 'panorama-360':
        void useCanvasStore.getState().createPanorama360FromImageNode(id)
          .then((nextNodeId) => {
            notifyCanvasNodeSelect?.(nextNodeId);
          })
          .catch((error) => {
            console.error('create panorama 360 node failed', error);
            const message = error instanceof Error ? error.message : '360 panorama generation failed';
            useCanvasStore.getState().setSaveMessage(message);
            window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
          });
        break;
      case 'crop': {
        const imageUrl = imageData.hostedImageUrl?.trim() || imageData.imageUrl?.trim();

        if (!imageUrl) {
          break;
        }

        notifyImageNodeCropRequest?.(id, imageData, cardDimensions, imageUrl);
        break;
      }
      case 'split-2x2-crop':
      case 'split-3x3-crop':
      case 'split-5x5-crop': {
        const dimension = action === 'split-2x2-crop' ? 2 : action === 'split-3x3-crop' ? 3 : 5;
        void splitImageNodeToGrid(id, dimension).catch((error) => {
          console.error('split image node failed', error);
          const message = error instanceof Error ? error.message : 'split image failed';
          useCanvasStore.getState().setSaveMessage(message);
          window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
        });
        break;
      }
      default:
        break;
    }
  };

  const handleReplace = async (file: File) => {
    const next = await readImageFile(file);
    updateNodeData<'image'>(id, {
      title: next.title,
      imageUrl: next.imageUrl,
      hostedImageUrl: next.hostedImageUrl,
      prompt: next.prompt,
      width: next.width,
      height: next.height,
      sizeBytes: next.sizeBytes,
      generatedAt: next.generatedAt,
      generatedOutputFileName: undefined,
    });
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: `${cardDimensions.width}px`, paddingTop: '74px' }}>
      <div className="relative" style={{ width: `${cardDimensions.width}px` }}>
        <ImageGenerationNodeToolbar
          visible={isActive}
          top={-IMAGE_NODE_TOOLBAR_LIFT}
          hasGeneratedImage={hasImage}
          panActive={threeViewOpen}
          onAction={handleToolbarAction}
          onOpenLightbox={() => notifyCanvasImageInfoRequest?.(id)}
        />
        <UploadedImageNode
          data={data as ImageNodeData}
          selected={selected}
          accessoriesVisible={isActive}
          onReplace={handleReplace}
          onTitleChange={(nextTitle) => updateNodeData<'image'>(id, { title: nextTitle })}
          onSelectNode={() => notifyImageGenerationNodeSelect?.(id)}
          onShowInfo={() => notifyCanvasImageInfoRequest?.(id)}
        />
      </div>
      {threeViewOpen ? (
        <div
          className="absolute flex justify-center"
          data-canvas-menu-ignore="true"
          style={{
            left: `${controllerLeft}px`,
            top: `${controllerTop}px`,
            width: `${THREE_VIEW_CONTROLLER_WIDTH}px`,
          }}
        >
          <ThreeViewController
            visible
            value={cameraAngle}
            imageUrl={imageData.hostedImageUrl || imageData.imageUrl}
            onChange={(next) => updateNodeData<'image'>(id, { cameraAngle: next })}
            onGenerate={() => {
              void generateThreeViewImage(id, cameraAngle)
                .then((nextNodeId) => {
                  setThreeViewControllerNodeId(null);
                  notifyCanvasNodeSelect?.(nextNodeId);
                })
                .catch((error) => {
                  console.error('three view generation failed', error);
                  const message = error instanceof Error ? error.message : '3D view generation failed';
                  useCanvasStore.getState().setSaveMessage(message);
                  window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
                });
            }}
            onClose={() => {
              focusNodeViewport();
              setThreeViewControllerNodeId(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
});

const UploadedImageNodeAdapter = memo(function UploadedImageNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateThreeViewImage = useCanvasStore((s) => s.generateThreeViewImageFromNode);
  const threeViewControllerNodeId = useCanvasStore((s) => s.threeViewControllerNodeId);
  const setThreeViewControllerNodeId = useCanvasStore((s) => s.setThreeViewControllerNodeId);
  const animateFocusViewport = useThreeViewFocusAnimator();
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;
  const uploadedData = data as UploadedImageNodeData;
  const hasImage = Boolean(uploadedData.imageUrl?.trim());
  const [cameraAngle, setCameraAngle] = useState<ThreeViewControllerValue>(THREE_VIEW_DEFAULT_ANGLE);
  const threeViewOpen = threeViewControllerNodeId === id;
  const cardDimensions = resolveUploadedImageCardDimensions(uploadedData);
  const controllerLeft = cardDimensions.width / 2 - THREE_VIEW_CONTROLLER_WIDTH / 2;
  const controllerTop = 74 + 22 + cardDimensions.height + THREE_VIEW_CONTROLLER_GAP;
  const cardLayoutRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const focusNodeViewport = () => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find((candidate) => candidate.id === id);

    if (!node) {
      return;
    }

    const bounds = getImageNodeFocusBounds(node);
    animateFocusViewport(bounds);
  };

  const handleReplace = async (file: File) => {
    const next = toUploadedImageNodeData(await readImageFile(file));
    updateNodeData<'uploaded_image'>(id, next);
  };

  const handleToolbarAction = (action: ImageGenerationToolbarAction) => {
    if (action === 'pan') {
      focusNodeViewport();
      setThreeViewControllerNodeId(threeViewOpen ? null : id);
      notifyCanvasNodeSelect?.(id);
      return;
    }

    notifyUploadedImageToolbarAction?.(action, id, uploadedData, cardLayoutRef.current);
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: `${cardDimensions.width}px`, paddingTop: '74px' }}>
      <div className="relative" style={{ width: `${cardDimensions.width}px` }}>
        <ImageGenerationNodeToolbar
          visible={isActive}
          top={-IMAGE_NODE_TOOLBAR_LIFT}
          hasGeneratedImage={hasImage}
          panActive={threeViewOpen}
          onAction={handleToolbarAction}
          onOpenLightbox={() => handleToolbarAction('expand')}
        />
        <UploadedImageNode
          data={data as UploadedImageNodeData}
          selected={selected}
          accessoriesVisible={isActive}
          onReplace={handleReplace}
          onTitleChange={(nextTitle) => updateNodeData<'uploaded_image'>(id, { title: nextTitle })}
          onSelectNode={() => notifyImageGenerationNodeSelect?.(id)}
          onShowInfo={() => notifyCanvasImageInfoRequest?.(id)}
          onCardLayout={(layout) => { cardLayoutRef.current = layout; }}
        />
      </div>
      {threeViewOpen ? (
        <div
          className="absolute flex justify-center"
          data-canvas-menu-ignore="true"
          style={{
            left: `${controllerLeft}px`,
            top: `${controllerTop}px`,
            width: `${THREE_VIEW_CONTROLLER_WIDTH}px`,
          }}
        >
          <ThreeViewController
            visible
            value={cameraAngle}
            imageUrl={uploadedData.hostedImageUrl || uploadedData.imageUrl}
            onChange={setCameraAngle}
            onGenerate={() => {
              void generateThreeViewImage(id, cameraAngle)
                .then((nextNodeId) => {
                  setThreeViewControllerNodeId(null);
                  notifyCanvasNodeSelect?.(nextNodeId);
                })
                .catch((error) => {
                  console.error('three view generation failed', error);
                  const message = error instanceof Error ? error.message : '3D view generation failed';
                  useCanvasStore.getState().setSaveMessage(message);
                  window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
                });
            }}
            onClose={() => {
              focusNodeViewport();
              setThreeViewControllerNodeId(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
});

const VideoNodeAdapter = memo(function VideoNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const createProcessedVideoNode = useCanvasStore((s) => s.createVideoNodeFromProcessedResult);
  const createImageNodeFromVideoFrame = useCanvasStore((s) => s.createImageNodeFromVideoFrame);
  const animateFocusViewport = useThreeViewFocusAnimator();
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;
  const videoData = data as VideoNodeData;
  const hasVideo = Boolean(videoData.hostedVideoUrl?.trim() || videoData.videoUrl?.trim());
  const cardDimensions = resolveUploadedVideoCardDimensions(videoData);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(() => Math.min(3, videoData.durationSeconds || 3));
  const [clipBusy, setClipBusy] = useState(false);
  const [clipMessage, setClipMessage] = useState<string | null>(null);
  const [clipThumbs, setClipThumbs] = useState<string[]>([]);
  const [clipVideoDuration, setClipVideoDuration] = useState(videoData.durationSeconds || 0);
  const clipTrackRef = useRef<HTMLDivElement | null>(null);
  const clipDragRef = useRef<{
    mode: 'left' | 'right' | 'move' | null;
    pointerOffsetSec: number;
  } | null>(null);
  const clipDuration = Math.max(clipVideoDuration || videoData.durationSeconds || clipEnd || 0, 0);
  const clipStartPct = clipDuration > 0 ? Math.max(0, Math.min(100, (clipStart / clipDuration) * 100)) : 0;
  const clipEndPct = clipDuration > 0 ? Math.max(0, Math.min(100, (clipEnd / clipDuration) * 100)) : 0;
  const clipWidthPct = Math.max(0, clipEndPct - clipStartPct);

  const handleReplace = async (file: File) => {
    const next = await readVideoFile(file);
    updateNodeData<'video'>(id, next);
  };

  const focusNodeViewport = () => {
    const state = useCanvasStore.getState();
    const node = state.nodes.find((candidate) => candidate.id === id);

    if (!node) {
      return;
    }

    const bounds = getVideoClipFocusBounds(node);
    animateFocusViewport(bounds);
  };

  const handleOpenClip = () => {
    const duration = videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
      ? videoRef.current.duration
      : videoData.durationSeconds || 3;
    const currentTime = videoRef.current?.currentTime || 0;
    const length = Math.min(3, duration);
    const start = Math.min(Math.max(0, currentTime), Math.max(0, duration - length));

    setClipStart(Number(start.toFixed(2)));
    setClipEnd(Number((start + length).toFixed(2)));
    setClipMessage(null);
    setClipThumbs([]);
    setClipVideoDuration(duration);
    setClipOpen(true);
  };

  useEffect(() => {
    if (!clipOpen) {
      return;
    }

    const sourceUrl = videoData.hostedVideoUrl?.trim() || videoData.videoUrl.trim();

    if (!sourceUrl) {
      return;
    }

    let cancelled = false;
    const tempVideo = document.createElement('video');
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.preload = 'auto';
    tempVideo.crossOrigin = 'anonymous';

    const waitForEvent = (eventName: string, timeoutMs: number) =>
      new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          cleanup();
          reject(new Error('timeout'));
        }, timeoutMs);
        const cleanup = () => {
          window.clearTimeout(timer);
          tempVideo.removeEventListener(eventName, handleEvent);
          tempVideo.removeEventListener('error', handleError);
        };
        const handleEvent = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error('video load failed'));
        };

        tempVideo.addEventListener(eventName, handleEvent, { once: true });
        tempVideo.addEventListener('error', handleError, { once: true });
      });

    const renderThumbs = async () => {
      try {
        tempVideo.src = sourceUrl;
        await waitForEvent('loadedmetadata', 1800);

        const duration = Number.isFinite(tempVideo.duration) && tempVideo.duration > 0
          ? tempVideo.duration
          : clipDuration;

        if (!duration || cancelled) {
          return;
        }

        const canvas = document.createElement('canvas');
        const height = 44;
        const aspect = Math.max(tempVideo.videoWidth || 16, 1) / Math.max(tempVideo.videoHeight || 9, 1);
        canvas.width = Math.max(1, Math.round(height * aspect));
        canvas.height = height;
        const context = canvas.getContext('2d');

        if (!context) {
          return;
        }

        const nextThumbs: string[] = [];

        for (let index = 0; index < 10; index += 1) {
          if (cancelled) return;
          tempVideo.currentTime = Math.min(Math.max(0, ((index + 0.5) / 10) * duration), Math.max(0, duration - 0.05));
          await waitForEvent('seeked', 700).catch(() => undefined);
          context.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          nextThumbs.push(canvas.toDataURL('image/jpeg', 0.72));
        }

        if (!cancelled) {
          setClipThumbs(nextThumbs);
        }
      } catch {
        if (!cancelled) {
          setClipThumbs([]);
        }
      } finally {
        tempVideo.removeAttribute('src');
        tempVideo.load();
      }
    };

    void renderThumbs();

    return () => {
      cancelled = true;
      tempVideo.removeAttribute('src');
      tempVideo.load();
    };
  }, [clipDuration, clipOpen, videoData.hostedVideoUrl, videoData.videoUrl]);

  const applyClipDrag = useCallback((clientX: number) => {
    const track = clipTrackRef.current;
    const drag = clipDragRef.current;

    if (!track || !drag || clipDuration <= 0) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const posSec = ratio * clipDuration;
    const minRange = Math.min(0.1, clipDuration);

    if (drag.mode === 'left') {
      const nextStart = Math.min(Math.max(0, posSec), clipEnd - minRange);
      setClipStart(Number(nextStart.toFixed(2)));
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = nextStart;
      }
      return;
    }

    if (drag.mode === 'right') {
      const nextEnd = Math.max(Math.min(clipDuration, posSec), clipStart + minRange);
      setClipEnd(Number(nextEnd.toFixed(2)));
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = nextEnd;
      }
      return;
    }

    const length = Math.max(minRange, clipEnd - clipStart);
    const nextStart = Math.max(0, Math.min(clipDuration - length, posSec - drag.pointerOffsetSec));
    setClipStart(Number(nextStart.toFixed(2)));
    setClipEnd(Number((nextStart + length).toFixed(2)));
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = nextStart;
    }
  }, [clipDuration, clipEnd, clipStart]);

  const handleClipTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (clipDuration <= 0 || clipBusy) {
      return;
    }

    const track = clipTrackRef.current;

    if (!track) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = track.getBoundingClientRect();
    const startX = rect.left + (clipStart / clipDuration) * rect.width;
    const endX = rect.left + (clipEnd / clipDuration) * rect.width;
    const x = event.clientX;
    const edgePx = 20;
    const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const posSec = ratio * clipDuration;

    if (Math.abs(x - startX) <= edgePx) {
      clipDragRef.current = { mode: 'left', pointerOffsetSec: 0 };
    } else if (Math.abs(x - endX) <= edgePx) {
      clipDragRef.current = { mode: 'right', pointerOffsetSec: 0 };
    } else if (x > startX && x < endX) {
      clipDragRef.current = { mode: 'move', pointerOffsetSec: posSec - clipStart };
    } else {
      const length = Math.max(0.1, Math.min(clipEnd - clipStart, clipDuration));
      const nextStart = Math.max(0, Math.min(clipDuration - length, posSec - length / 2));
      setClipStart(Number(nextStart.toFixed(2)));
      setClipEnd(Number((nextStart + length).toFixed(2)));
      if (videoRef.current) videoRef.current.currentTime = nextStart;
      clipDragRef.current = { mode: 'move', pointerOffsetSec: length / 2 };
    }

    applyClipDrag(event.clientX);

    const handleMove = (moveEvent: PointerEvent) => applyClipDrag(moveEvent.clientX);
    const handleUp = () => {
      clipDragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp, true);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, true);
  };

  useEffect(() => {
    if (!clipOpen || clipDuration <= 0) {
      return;
    }

    const moveSelection = (direction: number, frames: number) => {
      const length = Math.max(0.1, clipEnd - clipStart);
      const delta = (frames / 30) * direction;
      const nextStart = Math.max(0, Math.min(clipDuration - length, clipStart + delta));
      setClipStart(Number(nextStart.toFixed(2)));
      setClipEnd(Number((nextStart + length).toFixed(2)));
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = nextStart;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setClipOpen(false);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey ? 10 : 1);
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        const video = videoRef.current;

        if (!video) return;

        if (video.paused) {
          if (video.currentTime < clipStart || video.currentTime >= clipEnd) {
            video.currentTime = clipStart;
          }
          void video.play();
        } else {
          video.pause();
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      const target = event.target as Node | null;

      if (!clipTrackRef.current?.contains(target)) {
        return;
      }

      event.preventDefault();
      moveSelection(event.deltaY > 0 ? 1 : -1, event.shiftKey ? 10 : 1);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [clipDuration, clipEnd, clipOpen, clipStart]);

  useEffect(() => {
    if (!clipOpen) {
      return;
    }

    let raf = 0;
    const tick = () => {
      const video = videoRef.current;

      if (video && !video.paused && video.currentTime > clipEnd) {
        video.currentTime = clipStart;
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [clipEnd, clipOpen, clipStart]);

  const runCut = async () => {
    if (!(clipEnd > clipStart)) {
      setClipMessage('结束时间必须大于开始时间');
      return;
    }

    setClipBusy(true);
    setClipMessage('正在准备视频源...');

    try {
      const sourceUrl = await ensureVideoProcessingSourceUrl(videoData);
      setClipMessage('正在创建裁剪任务...');
      const jobId = await createVideoClipJob({
        kind: 'cut',
        sourceUrl,
        start: clipStart,
        end: clipEnd,
        fps: 24,
      });
      const done = await pollVideoClipJob(jobId, (status) => {
        if (status.ok) {
          setClipMessage(`处理中 ${Math.round((status.progress || 0) * 100)}%`);
        }
      });
      const segment = done.segments?.[0];

      if (!segment?.url) {
        throw new Error('裁剪任务没有返回视频结果');
      }

      const nextNodeId = await createProcessedVideoNode({
        sourceNodeId: id,
        title: `剪辑自 ${videoData.title || videoData.fileName || '视频'}`,
        resultUrl: segment.url,
        durationSeconds: segment.duration ?? clipEnd - clipStart,
        width: segment.width ?? videoData.width,
        height: segment.height ?? videoData.height,
        sizeBytes: segment.sizeBytes,
        mimeType: segment.mimeType,
        position: {
          x: xPos + cardDimensions.width + 48,
          y: yPos,
        },
      });

      setClipMessage('裁剪完成');
      setClipOpen(false);
      notifyCanvasNodeSelect?.(nextNodeId);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : '裁剪失败');
    } finally {
      setClipBusy(false);
    }
  };

  const runSmartClip = async () => {
    setClipBusy(true);
    setClipMessage('正在准备视频源...');

    try {
      const sourceUrl = await ensureVideoProcessingSourceUrl(videoData);
      setClipMessage('正在创建智能剪辑任务...');
      const jobId = await createVideoClipJob({
        kind: 'smart_clip',
        sourceUrl,
        options: { mode: 'balanced', maxSegments: 20, fps: 24 },
      });
      const done = await pollVideoClipJob(jobId, (status) => {
        if (status.ok) {
          setClipMessage(`智能剪辑 ${status.doneCount ?? 0}/${status.total ?? '?'} ${Math.round((status.progress || 0) * 100)}%`);
        }
      });
      const segments = done.segments?.filter((segment) => segment.url) ?? [];

      if (!segments.length) {
        throw new Error('未检测到可生成的剪辑片段');
      }

      const nextNodeIds: string[] = [];

      for (const [index, segment] of segments.entries()) {
        const nextNodeId = await createProcessedVideoNode({
          sourceNodeId: id,
          title: `智能剪辑 ${index + 1}`,
          resultUrl: segment.url,
          durationSeconds: segment.duration,
          width: segment.width ?? videoData.width,
          height: segment.height ?? videoData.height,
          sizeBytes: segment.sizeBytes,
          mimeType: segment.mimeType,
          position: {
            x: xPos + cardDimensions.width + 48,
            y: yPos + index * 40,
          },
        });
        nextNodeIds.push(nextNodeId);
      }

      setClipMessage('智能剪辑完成');
      setClipOpen(false);
      if (nextNodeIds[0]) notifyCanvasNodeSelect?.(nextNodeIds[0]);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : '智能剪辑失败');
    } finally {
      setClipBusy(false);
    }
  };

  const extractFrame = async () => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setClipMessage('视频尚未加载完成');
      setClipOpen(true);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas 不可用');
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const nextNodeId = await createImageNodeFromVideoFrame({
        sourceNodeId: id,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        title: '视频帧',
        position: {
          x: xPos + cardDimensions.width + 48,
          y: yPos,
        },
      });

      notifyCanvasNodeSelect?.(nextNodeId);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : '提取视频帧失败，可能是视频源不允许浏览器截帧');
      setClipOpen(true);
    }
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: `${cardDimensions.width}px`, paddingTop: '74px' }}>
      <div className="relative" style={{ width: `${cardDimensions.width}px` }}>
        <ImageGenerationNodeToolbar
          visible={isActive && !clipOpen}
          top={-IMAGE_NODE_TOOLBAR_LIFT}
          hasGeneratedImage={hasVideo}
          placeholderOnly={false}
          onAction={(action) => {
            if (action === 'crop') {
              focusNodeViewport();
              handleOpenClip();
            } else if (action === 'download') {
              const videoUrl = videoData.hostedVideoUrl?.trim() || videoData.videoUrl.trim();
              if (videoUrl) {
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = videoData.title || videoData.fileName || 'video';
                a.click();
              }
            }
          }}
        />
        <UploadedVideoNode
          data={videoData}
          selected={selected}
          accessoriesVisible={isActive}
          onReplace={handleReplace}
          onTitleChange={(nextTitle) => updateNodeData<'video'>(id, { title: nextTitle })}
          onSelectNode={() => notifyCanvasImageInfoRequest?.(id)}
          videoRef={videoRef}
          controlsVisible={!clipOpen}
          onLoadedMetadata={(duration) => {
            if (duration > 0) {
              setClipVideoDuration(duration);
            }
          }}
        />
        {clipOpen ? (
          <div
            data-canvas-menu-ignore="true"
            className="nodrag nopan absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2"
            style={{
              top: `${cardDimensions.height + VIDEO_CLIP_CONTROLS_TOP_OFFSET}px`,
              width: `${Math.min(Math.max((cardDimensions.width + 60) * 0.67, 280), 430)}px`,
              maxWidth: 'calc(100vw - 64px)',
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex w-full items-center justify-center gap-1">
              <button
                type="button"
                aria-label="取消裁剪"
                disabled={clipBusy}
                onClick={() => setClipOpen(false)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1b1d21]/95 text-gl-text-secondary shadow-[0_10px_24px_rgba(0,0,0,0.34)] transition hover:text-white disabled:opacity-50"
              >
                <X size={8} strokeWidth={2.4} />
              </button>

              <div
                ref={clipTrackRef}
                onPointerDown={handleClipTrackPointerDown}
                className="relative h-6 min-w-0 flex-1 cursor-grab overflow-hidden rounded-[6px] border border-white/15 bg-[#16181c] shadow-[0_10px_28px_rgba(0,0,0,0.38)] active:cursor-grabbing"
              >
                <div className="absolute inset-0 opacity-70">
                  <div className="flex h-full">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-full flex-1 border-r border-black/40 bg-[linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,255,255,.03))]"
                        style={clipThumbs[index] ? {
                          backgroundImage: `url(${clipThumbs[index]})`,
                          backgroundPosition: 'center',
                          backgroundSize: 'cover',
                        } : undefined}
                      />
                    ))}
                  </div>
                </div>
                <div
                  className="absolute inset-y-0 border-x-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,.45)]"
                  style={{ left: `${clipStartPct}%`, width: `${clipWidthPct}%` }}
                />
                <div
                  className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.45)]"
                  style={{ left: `${clipStartPct}%` }}
                />
                <div
                  className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.45)]"
                  style={{ left: `${clipEndPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a2d32]/95 px-1.5 py-0.5 text-[6px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,.34)]"
                  style={{ left: `${clipStartPct + clipWidthPct / 2}%` }}
                >
                  {Math.max(0, clipEnd - clipStart).toFixed(2)}s
                </div>
              </div>

              <button
                type="button"
                aria-label="确认裁剪"
                disabled={clipBusy || !(clipEnd > clipStart)}
                onClick={() => void runCut()}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.2)] transition hover:bg-white/90 disabled:opacity-50"
              >
                <Check size={8} strokeWidth={2.6} />
              </button>
            </div>

            <div className="flex w-full items-center justify-between gap-1.5">
              <div />

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={clipBusy}
                  onClick={() => void runSmartClip()}
                  className="flex h-4 items-center justify-center gap-0.5 rounded-full border border-white/10 bg-[#24262b]/95 px-1.5 py-0 text-[6px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,.28)] transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Box size={7} strokeWidth={1.9} className="text-white/86" />
                  智能剪辑
                </button>
                <button
                  type="button"
                  aria-label="提取帧"
                  disabled={clipBusy}
                  onClick={() => void extractFrame()}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-[#24262b]/95 p-0 text-white shadow-[0_4px_10px_rgba(0,0,0,.28)] transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Camera size={8} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {clipMessage ? (
              <div className="max-w-full rounded-full bg-[#17191d]/95 px-3 py-1 text-center text-[12px] text-gl-text-secondary shadow-[0_8px_20px_rgba(0,0,0,.28)]">
                {clipMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

const Panorama360NodeAdapter = memo(function Panorama360NodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const createPanorama360ScreenshotNode = useCanvasStore((s) => s.createPanorama360ScreenshotNode);
  const connectedImages = useCanvasStore((s) =>
    s.getConnectedImagesForPanorama360Node(id),
  );
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;
  const panoramaData = data as Panorama360NodeData;
  const panorama = panoramaData.panorama360Node.panorama;
  const hasGeneratedPanoramaImage = Boolean(
    panorama.generatedHostedImageUrl?.trim() ||
    panorama.generatedImageUrl?.trim(),
  );
  const usesInternalPanoramaImage =
    hasGeneratedPanoramaImage ||
    panorama.generationStatus === 'generating' ||
    panorama.generationStatus === 'error';
  const sourceImage = usesInternalPanoramaImage ? null : connectedImages[0] ?? null;

  const handleViewChange = (view: Panorama360ViewState) => {
    updateNodeData<'panorama-360'>(id, {
      panorama360Node: {
        ...panoramaData.panorama360Node,
        viewport: {
          ...panoramaData.panorama360Node.viewport,
          panoramaView: view,
        },
      },
    });
  };

  return (
    <Panorama360Node
      data={panoramaData}
      selected={selected}
      sourceImage={sourceImage}
      accessoriesVisible={isActive}
      onTitleChange={(nextTitle) => updateNodeData<'panorama-360'>(id, { title: nextTitle })}
      onViewChange={handleViewChange}
      onNavigationActiveChange={(active) => notifyPanorama360NavigationActiveChange?.(id, active)}
      onUploadPanorama={(file) => notifyPanorama360UploadRequest?.(id, file)}
      onScreenshot={(capture) => createPanorama360ScreenshotNode(id, capture)
        .then((nextNodeId) => notifyCanvasNodeSelect?.(nextNodeId))
        .catch((error) => {
          console.error('create panorama screenshot node failed', error);
      const message = error instanceof Error ? error.message : '创建截图失败';
          useCanvasStore.getState().setSaveMessage(message);
          window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
        })}
      onSelectNode={() => notifyCanvasNodeSelect?.(id)}
    />
  );
});

const nodeTypes = {
  text: TextNodeAdapter,
  image_generation: ImageGenerationNodeAdapter,
  video_generation: VideoGenerationNodeAdapter,
  video: VideoNodeAdapter,
  ai_text_result: AITextResultNodeAdapter,
  image: ImageNodeAdapter,
  uploaded_image: UploadedImageNodeAdapter,
  'panorama-360': Panorama360NodeAdapter,
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
const IMAGE_GENERATION_MAX_CARD_EDGE = 540;
const IMAGE_GENERATION_MIN_CARD_EDGE = 220;
const IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE = 64;
const IMAGE_GENERATION_CARD_ACCESSORY_GAP = 12;
const UPLOADED_IMAGE_MAX_CARD_WIDTH = 420;
const UPLOADED_IMAGE_MAX_CARD_HEIGHT = 540;
const UPLOADED_IMAGE_MIN_CARD_WIDTH = 300;
const IMAGE_NODE_ADAPTER_TOP_PADDING = 74;
const THREE_VIEW_CONTROLLER_WIDTH = 760;
const THREE_VIEW_CONTROLLER_HEIGHT = 380;
const THREE_VIEW_CONTROLLER_GAP = 12;
const IMAGE_NODE_TOOLBAR_LIFT = 56;
const THREE_VIEW_FOCUS_BOTTOM_PADDING = 32;
const THREE_VIEW_FOCUS_ANIMATION_DURATION_MS = 680;
const THREE_VIEW_FOCUS_PADDING = 0.14;
const THREE_VIEW_FOCUS_EASE = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const VIDEO_CLIP_CONTROLS_TOP_OFFSET = 48;
const VIDEO_CLIP_CONTROLS_FOCUS_HEIGHT = 96;
const VIDEO_CLIP_CONTROLS_MIN_FOCUS_WIDTH = 430;
const CANVAS_MINIMAP_WIDTH = 200;
const CANVAS_MINIMAP_HEIGHT = 150;
const CANVAS_MINIMAP_PADDING = 14;
const MULTI_NODE_SELECTION_PADDING = 14;
const MULTI_NODE_SELECTION_TOOLBAR_GAP = 10;
const GROUP_SOURCE_HANDLE_SIZE = 10;
const GROUP_SOURCE_HANDLE_BADGE_SIZE = 22;
const GROUP_SOURCE_HANDLE_BADGE_GAP = GROUP_SOURCE_HANDLE_BADGE_SIZE;
const GROUP_SOURCE_HANDLE_ZONE_WIDTH = 56;
const GROUP_SOURCE_HANDLE_HITBOX_BASE =
  'z-30 pointer-events-auto rounded-full border-0 bg-transparent transition-[opacity] duration-150 ease-out cursor-crosshair nodrag nopan';
const GROUP_SOURCE_HANDLE_BADGE_BASE =
  'pointer-events-none absolute z-40 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-gl-stroke-medium bg-gl-panel text-gl-text-tertiary transition-[opacity,color,box-shadow,border-color] duration-150 ease-out nodrag nopan';
const GROUP_SOURCE_HANDLE_ZONE_BASE =
  'pointer-events-auto absolute z-20 cursor-crosshair nodrag nopan';
const GROUP_LAYOUT_GAP_X = 48;
const GROUP_LAYOUT_GAP_Y = 48;
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
  connection?: OnConnectStartParams;
  sourceRefs?: GroupConnectionSource[];
};

type BlankConnectionDropEventDetail = {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target';
  screen: { x: number; y: number };
};

type GroupConnectionSource = {
  nodeId: string;
  sourceHandle?: string;
  screen: { x: number; y: number };
};

type GroupConnectionPreview = {
  sources: GroupConnectionSource[];
  target: { x: number; y: number };
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

function resetCopiedNodeData(node: CanvasNode): CanvasNode['data'] {
  if (node.type === 'text') {
    const data = cloneNodeData(node.data);

    return {
      ...data,
      status: 'idle',
      errorMessage: undefined,
    };
  }

  if (node.type === 'image_generation') {
    const data = cloneNodeData(node.data);

    return {
      ...data,
      effectivePromptOverride: undefined,
      generatedModel: undefined,
      generatedImageUrl: undefined,
      generatedHostedImageUrl: undefined,
      generatedOutputFileName: undefined,
      generatedImageWidth: undefined,
      generatedImageHeight: undefined,
      generatedImageFormat: undefined,
      generatedImageSizeBytes: undefined,
      generatedAt: undefined,
      generationResults: undefined,
      status: 'idle',
      errorMessage: undefined,
    };
  }

  if (node.type === 'panorama-360') {
    const data = cloneNodeData(node.data);

    return {
      ...data,
      panorama360Node: {
        ...data.panorama360Node,
        ui: {
          ...data.panorama360Node.ui,
          isEditing: false,
        },
      },
    };
  }

  return cloneNodeData(node.data);
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
    data: resetCopiedNodeData(node),
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

function findContainingGroupForNodeSelection(
  groups: NodeGroup[],
  selectedNodeIds: Set<string>,
): NodeGroup | null {
  if (selectedNodeIds.size < 2) {
    return null;
  }

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    const groupNodeIds = new Set(group.nodeIds);
    let containsSelection = true;

    for (const nodeId of selectedNodeIds) {
      if (!groupNodeIds.has(nodeId)) {
        containsSelection = false;
        break;
      }
    }

    if (containsSelection) {
      return group;
    }
  }

  return null;
}

function findGroupAtCanvasPoint(
  groups: NodeGroup[],
  point: { x: number; y: number },
): NodeGroup | null {
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];

    if (
      point.x >= group.x &&
      point.x <= group.x + group.width &&
      point.y >= group.y &&
      point.y <= group.y + group.height
    ) {
      return group;
    }
  }

  return null;
}

function getRectCenter(rect: MultiNodeSelectionBounds): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function syncNodeGroupMembership(
  nodeId: string,
  nextPosition?: { x: number; y: number },
) {
  const state = useCanvasStore.getState();
  const currentNode = state.nodes.find((node) => node.id === nodeId);

  if (!currentNode) {
    return;
  }

  const node = nextPosition
    ? ({ ...currentNode, position: nextPosition } as CanvasNode)
    : currentNode;
  const nodeCenter = getRectCenter(getEstimatedNodeBounds(node));
  const targetGroupId = findGroupAtCanvasPoint(state.groups, nodeCenter)?.id ?? null;
  let changed = false;

  const groups = state.groups
    .map((group) => {
      const hasNode = group.nodeIds.includes(nodeId);
      const shouldHaveNode = group.id === targetGroupId;

      if (hasNode === shouldHaveNode) {
        return group;
      }

      changed = true;

      if (shouldHaveNode) {
        return { ...group, nodeIds: [...group.nodeIds, nodeId] };
      }

      return {
        ...group,
        nodeIds: group.nodeIds.filter((id) => id !== nodeId),
      };
    })
    .filter((group) => group.nodeIds.length > 0);

  if (!changed) {
    return;
  }

  useCanvasStore.setState({
    groups,
    dirty: true,
  });
}

function updateGroupBoundsAndMembership(
  groupId: string,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const state = useCanvasStore.getState();
  const groupExists = state.groups.some((group) => group.id === groupId);

  if (!groupExists) {
    return;
  }

  const groupsWithNextBounds = state.groups.map((group) =>
    group.id === groupId ? { ...group, ...bounds } : group,
  );
  const nextNodeIdsByGroupId = new Map<string, string[]>(
    groupsWithNextBounds.map((group) => [group.id, []]),
  );

  for (const node of state.nodes) {
    const nodeCenter = getRectCenter(getEstimatedNodeBounds(node));
    const targetGroup = findGroupAtCanvasPoint(groupsWithNextBounds, nodeCenter);

    if (targetGroup) {
      nextNodeIdsByGroupId.get(targetGroup.id)?.push(node.id);
    }
  }

  const groups = groupsWithNextBounds.map((group) => ({
    ...group,
    nodeIds: nextNodeIdsByGroupId.get(group.id) ?? [],
  }));

  useCanvasStore.setState({
    groups,
    dirty: true,
  });
}

function layoutGroupNodes(groupId: string, mode: GroupLayoutMode) {
  const state = useCanvasStore.getState();
  const group = state.groups.find((candidate) => candidate.id === groupId);

  if (!group || group.nodeIds.length <= 1) {
    return false;
  }

  const groupNodeIds = new Set(group.nodeIds);
  const layoutItems = state.nodes
    .filter((node) => groupNodeIds.has(node.id))
    .map((node) => ({
      node,
      bounds: getEstimatedNodeBounds(node),
    }))
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

  if (layoutItems.length <= 1) {
    return false;
  }

  const maxWidth = Math.max(...layoutItems.map((item) => item.bounds.width));
  const maxHeight = Math.max(...layoutItems.map((item) => item.bounds.height));
  const columns = mode === 'grid'
    ? Math.max(1, Math.ceil(Math.sqrt(layoutItems.length)))
    : mode === 'horizontal'
      ? layoutItems.length
      : 1;
  const padding = MULTI_NODE_SELECTION_PADDING;
  const startX = group.x + padding;
  const startY = group.y + padding;
  const nextPositionsByNodeId = new Map<string, { x: number; y: number }>();
  const nextRects: MultiNodeSelectionBounds[] = [];

  layoutItems.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const nextBounds = {
      x: startX + column * (maxWidth + GROUP_LAYOUT_GAP_X),
      y: startY + row * (maxHeight + GROUP_LAYOUT_GAP_Y),
      width: item.bounds.width,
      height: item.bounds.height,
    };

    nextPositionsByNodeId.set(item.node.id, {
      x: item.node.position.x + nextBounds.x - item.bounds.x,
      y: item.node.position.y + nextBounds.y - item.bounds.y,
    });
    nextRects.push(nextBounds);
  });

  const nextContentBounds = getBoundsForRects(nextRects);

  if (!nextContentBounds) {
    return false;
  }

  const nextGroupBounds = {
    x: nextContentBounds.x - padding,
    y: nextContentBounds.y - padding,
    width: nextContentBounds.width + padding * 2,
    height: nextContentBounds.height + padding * 2,
  };

  useCanvasStore.setState((currentState) => ({
    nodes: currentState.nodes.map((node) => {
      const nextPosition = nextPositionsByNodeId.get(node.id);
      return nextPosition ? { ...node, position: nextPosition } : node;
    }),
    groups: currentState.groups.map((candidate) =>
      candidate.id === groupId ? { ...candidate, ...nextGroupBounds } : candidate,
    ),
    dirty: true,
  }));

  return true;
}

type CanvasNodeRenderData = CanvasNode['data'] & {
  canvasNodeActive?: boolean;
  canvasFocusRequestId?: number;
};

type EmptyCanvasWelcomeAction = 'text' | 'image_generation';

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

function isNodeCardFocusTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      'button, input, textarea, select, [contenteditable="true"], [data-canvas-menu-ignore="true"], .node-visible-title',
    )
  ) {
    return false;
  }

  return Boolean(target.closest('.node-connectable-card'));
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

function getElementScreenCenter(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getGroupConnectionSourcesFromDom(group: NodeGroup): GroupConnectionSource[] {
  const sources: GroupConnectionSource[] = [];
  const seen = new Set<string>();

  for (const nodeId of group.nodeIds) {
    const nodeElement = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
    );

    if (!nodeElement) {
      continue;
    }

    const sourceHandles = Array.from(
      nodeElement.querySelectorAll<HTMLElement>('.react-flow__handle.source'),
    );

    for (const sourceHandle of sourceHandles) {
      const sourceNodeId = sourceHandle.getAttribute('data-nodeid') || nodeId;
      const sourceHandleId = sourceHandle.getAttribute('data-handleid') || undefined;
      const key = `${sourceNodeId}:${sourceHandleId ?? ''}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      sources.push({
        nodeId: sourceNodeId,
        sourceHandle: sourceHandleId,
        screen: getElementScreenCenter(sourceHandle),
      });
    }
  }

  return sources;
}

function findClosestConnectionHandle(
  mouseEvent: MouseEvent,
  handles: HTMLElement[],
  maxDistance = Number.POSITIVE_INFINITY,
): HTMLElement | null {
  let closestHandle: HTMLElement | null = null;
  let closestDistance = maxDistance;

  for (const candidate of handles) {
    const candidateNodeId = candidate.getAttribute('data-nodeid');

    if (!candidateNodeId) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(mouseEvent.clientX - centerX, mouseEvent.clientY - centerY);

    if (distance <= closestDistance) {
      closestDistance = distance;
      closestHandle = candidate;
    }
  }

  return closestHandle;
}

function findTargetHandleFromNodeBody(mouseEvent: MouseEvent, doc: Document): HTMLElement | null {
  const candidateNodes = Array.from(doc.querySelectorAll<HTMLElement>('.react-flow__node'));
  let matchedHandle: HTMLElement | null = null;
  let matchedDistance = Number.POSITIVE_INFINITY;

  for (const candidateNode of candidateNodes) {
    const cardElement = candidateNode.querySelector<HTMLElement>('.node-connectable-card');
    const bounds = (cardElement ?? candidateNode).getBoundingClientRect();
    const isInsideCard = (
      mouseEvent.clientX >= bounds.left &&
      mouseEvent.clientX <= bounds.right &&
      mouseEvent.clientY >= bounds.top &&
      mouseEvent.clientY <= bounds.bottom
    );

    if (!isInsideCard) {
      continue;
    }

    const nodeHandles = Array.from(
      candidateNode.querySelectorAll<HTMLElement>('.react-flow__handle.target'),
    );
    const nodeHandle = findClosestConnectionHandle(mouseEvent, nodeHandles);

    if (!nodeHandle) {
      continue;
    }

    const center = getElementScreenCenter(nodeHandle);
    const distance = Math.hypot(mouseEvent.clientX - center.x, mouseEvent.clientY - center.y);

    if (distance < matchedDistance) {
      matchedDistance = distance;
      matchedHandle = nodeHandle;
    }
  }

  return matchedHandle;
}

function resolveGroupConnectionTargetHandle(mouseEvent: MouseEvent): HTMLElement | null {
  const doc = document;
  const directTarget = doc.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
  const directHandle = directTarget?.closest('.react-flow__handle') as HTMLElement | null;

  if (directHandle?.classList.contains('target')) {
    return directHandle;
  }

  const directNode = directTarget?.closest('.react-flow__node') as HTMLElement | null;

  if (directNode) {
    const nodeHandles = Array.from(
      directNode.querySelectorAll<HTMLElement>('.react-flow__handle.target'),
    );
    const directNodeHandle = findClosestConnectionHandle(mouseEvent, nodeHandles);

    if (directNodeHandle) {
      return directNodeHandle;
    }
  }

  const nodeBodyHandle = findTargetHandleFromNodeBody(mouseEvent, doc);

  if (nodeBodyHandle) {
    return nodeBodyHandle;
  }

  const candidateHandles = Array.from(
    doc.querySelectorAll<HTMLElement>('.react-flow__handle.target'),
  );

  return findClosestConnectionHandle(mouseEvent, candidateHandles, 32);
}

function resolveGroupConnectionTarget(mouseEvent: MouseEvent): {
  nodeId: string;
  targetHandle?: string;
  screen: { x: number; y: number };
} | null {
  const targetHandle = resolveGroupConnectionTargetHandle(mouseEvent);

  if (targetHandle) {
    const nodeId = targetHandle.getAttribute('data-nodeid');

    if (!nodeId) {
      return null;
    }

    return {
      nodeId,
      targetHandle: targetHandle.getAttribute('data-handleid') || undefined,
      screen: getElementScreenCenter(targetHandle),
    };
  }

  const dropTarget = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
  const targetNodeElement = dropTarget?.closest('.react-flow__node');
  const targetNodeId = targetNodeElement?.getAttribute('data-id');

  if (!targetNodeId) {
    return null;
  }

  return {
    nodeId: targetNodeId,
    screen: {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
    },
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

function getImageGenerationZipItems(data: ImageGenerationNodeData): ZipImageDownloadItem[] {
  const items: ZipImageDownloadItem[] = [];
  const completedResults = data.generationResults?.filter((result) =>
    result.status === 'completed' && Boolean(result.imageUrl?.trim() || result.hostedImageUrl?.trim()),
  ) ?? [];

  if (completedResults.length > 0) {
    for (const [index, result] of completedResults.entries()) {
      items.push({
        url: result.hostedImageUrl?.trim() || result.imageUrl?.trim() || '',
        fileName: data.generatedOutputFileName,
        title: data.title ? `${data.title}-${index + 1}` : `image-${index + 1}`,
        format: result.format,
      });
    }

    return items;
  }

  const url = data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim();

  if (url) {
    items.push({
      url,
      fileName: data.generatedOutputFileName,
      title: data.title,
      format: data.generatedImageFormat,
    });
  }

  return items;
}

function getGroupZipItems(group: NodeGroup, nodes: CanvasNode[]): ZipImageDownloadItem[] {
  const groupNodeIds = new Set(group.nodeIds);
  const items: ZipImageDownloadItem[] = [];

  for (const node of nodes) {
    if (!groupNodeIds.has(node.id)) {
      continue;
    }

    if (node.type === 'image_generation') {
      items.push(...getImageGenerationZipItems(node.data));
      continue;
    }

    if (node.type === 'image') {
      const url = node.data.hostedImageUrl?.trim() || node.data.imageUrl?.trim();

      if (url) {
        items.push({
          url,
          title: node.data.title,
        });
      }

      continue;
    }

    if (node.type === 'uploaded_image') {
      const url = node.data.hostedImageUrl?.trim() || node.data.imageUrl?.trim();

      if (url) {
        items.push({
          url,
          fileName: node.data.fileName,
          title: node.data.title,
        });
      }
    }
  }

  return items;
}

type MultiNodeSelectionOverlayProps = {
  nodes: CanvasNode[];
  selectedNodeIds: Set<string>;
  groups: NodeGroup[];
  visible: boolean;
  onGroup: (nodeIds: string[]) => void;
};

type GroupOverlayProps = {
  groups: NodeGroup[];
  selectedGroupId: string | null;
  hoveredGroupId: string | null;
  onStartGroupConnection: (group: NodeGroup, event: React.MouseEvent<HTMLElement>) => void;
  onSelectGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string | undefined) => void;
  onUpdateGroupBackgroundColor: (groupId: string, backgroundColor: string | undefined) => void;
  onMoveGroup: (groupId: string, dx: number, dy: number) => void;
  onResizeGroup: (groupId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onExecuteGroup: (groupId: string, mode: GroupExecutionMode) => void;
  onLayoutGroup: (groupId: string, mode: GroupLayoutMode) => void;
  onDownloadGroup: (groupId: string) => void;
};

type GroupExecutionMode = 'parallel' | 'sequence';
type GroupLayoutMode = 'grid' | 'horizontal' | 'vertical';

const GroupExecutionMenuContext =
  React.createContext<((mode: GroupExecutionMode) => void) | null>(null);
const GroupLayoutMenuContext =
  React.createContext<((mode: GroupLayoutMode) => void) | null>(null);

const GROUP_BACKGROUND_COLORS = [
  { label: 'Red', value: '#a85b5b' },
  { label: 'Orange', value: '#a3682a' },
  { label: 'Yellow', value: '#9b8f36' },
  { label: 'Green', value: '#4d9156' },
  { label: 'Teal', value: '#43909d' },
  { label: 'Blue', value: '#3473ad' },
  { label: 'Purple', value: '#8a4aa3' },
] as const;

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getGroupFrameColorStyle(
  backgroundColor: string | undefined,
  selected: boolean,
): React.CSSProperties {
  if (!backgroundColor) {
    return {
      backgroundColor: selected ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.02)',
      borderColor: selected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)',
    };
  }

  return {
    backgroundColor: hexToRgba(backgroundColor, selected ? 0.22 : 0.16),
    borderColor: hexToRgba(backgroundColor, selected ? 0.9 : 0.58),
    boxShadow: selected
      ? `0 0 0 1px ${hexToRgba(backgroundColor, 0.28)}, 0 0 24px ${hexToRgba(backgroundColor, 0.18)}`
      : undefined,
  };
}

function GroupOverlay({
  groups,
  selectedGroupId,
  hoveredGroupId,
  onStartGroupConnection,
  onSelectGroup,
  onDeleteGroup,
  onRenameGroup,
  onUpdateGroupBackgroundColor,
  onMoveGroup,
  onResizeGroup,
  onExecuteGroup,
  onLayoutGroup,
  onDownloadGroup,
}: GroupOverlayProps) {
  const viewport = useViewport();

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      {groups.map((group) => (
        <GroupFrame
          key={group.id}
          group={group}
          viewport={viewport}
          selected={selectedGroupId === group.id}
          hovered={hoveredGroupId === group.id}
          onStartConnection={(event) => onStartGroupConnection(group, event)}
          onSelect={() => onSelectGroup(group.id)}
          onDelete={() => onDeleteGroup(group.id)}
          onRename={(name) => onRenameGroup(group.id, name)}
          onUpdateBackgroundColor={(backgroundColor) =>
            onUpdateGroupBackgroundColor(group.id, backgroundColor)
          }
          onMove={(dx, dy) => onMoveGroup(group.id, dx, dy)}
          onResize={(bounds) => onResizeGroup(group.id, bounds)}
          onExecute={(mode) => onExecuteGroup(group.id, mode)}
          onLayout={(mode) => onLayoutGroup(group.id, mode)}
          onDownload={() => onDownloadGroup(group.id)}
        />
      ))}
    </>
  );
}

type GroupFrameProps = {
  group: NodeGroup;
  viewport: { x: number; y: number; zoom: number };
  selected: boolean;
  hovered: boolean;
  onStartConnection: (event: React.MouseEvent<HTMLElement>) => void;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string | undefined) => void;
  onUpdateBackgroundColor: (backgroundColor: string | undefined) => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onExecute: (mode: GroupExecutionMode) => void;
  onLayout: (mode: GroupLayoutMode) => void;
  onDownload: () => void;
};

// Convert canvas coords to screen coords
function canvasToScreen(
  cx: number,
  cy: number,
  viewport: { x: number; y: number; zoom: number },
) {
  return {
    x: cx * viewport.zoom + viewport.x,
    y: cy * viewport.zoom + viewport.y,
  };
}

function GroupFrame({
  group,
  viewport,
  selected,
  hovered,
  onStartConnection,
  onSelect,
  onDelete,
  onRename,
  onUpdateBackgroundColor,
  onMove,
  onResize,
  onExecute,
  onLayout,
  onDownload,
}: GroupFrameProps) {
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{
    handle: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const topLeft = canvasToScreen(group.x, group.y, viewport);
  const screenW = group.width * viewport.zoom;
  const screenH = group.height * viewport.zoom;

  const nodeCount = group.nodeIds.length;
  const defaultName = `分组 · ${nodeCount} 个节点`;
  const frameColorStyle = getGroupFrameColorStyle(group.backgroundColor, selected);
  const showResizeHandles = selected || hovered || resizing;
  const showSourceHandle = selected || hovered;
  const sourceHandleCenter = {
    x: topLeft.x + screenW,
    y: topLeft.y + screenH / 2,
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('.group-frame-no-drag')) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect();
    dragRef.current = { startX: event.clientX, startY: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    const dx = (event.clientX - dragRef.current.startX) / viewport.zoom;
    const dy = (event.clientY - dragRef.current.startY) / viewport.zoom;
    dragRef.current = { startX: event.clientX, startY: event.clientY };
    onMove(dx, dy);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  const startResize = useCallback((handle: string, clientX: number, clientY: number) => {
    resizeRef.current = {
      handle,
      startX: clientX,
      startY: clientY,
      origX: group.x,
      origY: group.y,
      origW: group.width,
      origH: group.height,
    };
    setResizing(true);
  }, [group.height, group.width, group.x, group.y]);

  const handleResizePointerDown = (event: React.PointerEvent) => {
    const handle = (event.currentTarget as HTMLElement).dataset.handle;
    if (!handle) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect();
    startResize(handle, event.clientX, event.clientY);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer listeners below keep resize active if capture is unavailable.
    }
  };

  const handleResizeMouseDown = (event: React.MouseEvent) => {
    const handle = (event.currentTarget as HTMLElement).dataset.handle;
    if (!handle) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect();

    if (!resizeRef.current) {
      startResize(handle, event.clientX, event.clientY);
    }
  };

  const updateResizeFromClientPoint = useCallback((clientX: number, clientY: number) => {
    if (!resizeRef.current) {
      return;
    }

    const { handle, startX, startY, origX, origY, origW, origH } = resizeRef.current;
    const dx = (clientX - startX) / viewport.zoom;
    const dy = (clientY - startY) / viewport.zoom;
    const MIN = 80;

    let x = origX, y = origY, w = origW, h = origH;

    if (handle.includes('e')) w = Math.max(MIN, origW + dx);
    if (handle.includes('s')) h = Math.max(MIN, origH + dy);
    if (handle.includes('w')) { const nw = Math.max(MIN, origW - dx); x = origX + origW - nw; w = nw; }
    if (handle.includes('n')) { const nh = Math.max(MIN, origH - dy); y = origY + origH - nh; h = nh; }

    onResize({ x, y, width: w, height: h });
  }, [onResize, viewport.zoom]);

  const handleResizePointerMove = (event: React.PointerEvent) => {
    if (!resizeRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    updateResizeFromClientPoint(event.clientX, event.clientY);
  };

  const handleResizePointerUp = (event: React.PointerEvent) => {
    if (!resizeRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    resizeRef.current = null;
    setResizing(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that already released capture.
    }
  };

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!resizeRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      updateResizeFromClientPoint(event.clientX, event.clientY);
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!resizeRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = null;
      setResizing(false);
    };

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!resizeRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      updateResizeFromClientPoint(event.clientX, event.clientY);
    };

    const handleWindowMouseUp = (event: MouseEvent) => {
      if (!resizeRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = null;
      setResizing(false);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, true);
    window.addEventListener('pointerup', handleWindowPointerUp, true);
    window.addEventListener('pointercancel', handleWindowPointerUp, true);
    window.addEventListener('mousemove', handleWindowMouseMove, true);
    window.addEventListener('mouseup', handleWindowMouseUp, true);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true);
      window.removeEventListener('pointerup', handleWindowPointerUp, true);
      window.removeEventListener('pointercancel', handleWindowPointerUp, true);
      window.removeEventListener('mousemove', handleWindowMouseMove, true);
      window.removeEventListener('mouseup', handleWindowMouseUp, true);
    };
  }, [updateResizeFromClientPoint]);

  const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const handleCursor: Record<string, string> = {
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
  };
  const HANDLE_CORNER_HIT_SIZE = 16;
  const HANDLE_EDGE_HIT_LONG = 38;
  const HANDLE_EDGE_HIT_SHORT = 18;
  const HANDLE_CORNER_SIZE = 5;
  const HANDLE_EDGE_LONG = 34;
  const HANDLE_EDGE_SHORT = 6;

  function getHandleStyle(h: string): React.CSSProperties {
    const isHorizontalEdge = h === 'n' || h === 's';
    const isVerticalEdge = h === 'e' || h === 'w';
    const width = isHorizontalEdge
      ? HANDLE_EDGE_HIT_LONG
      : isVerticalEdge
        ? HANDLE_EDGE_HIT_SHORT
        : HANDLE_CORNER_HIT_SIZE;
    const height = isVerticalEdge
      ? HANDLE_EDGE_HIT_LONG
      : isHorizontalEdge
        ? HANDLE_EDGE_HIT_SHORT
        : HANDLE_CORNER_HIT_SIZE;
    const pos: React.CSSProperties = {
      position: 'absolute',
      width,
      height,
      touchAction: 'none',
      userSelect: 'none',
    };

    if (h === 'n') return { ...pos, left: topLeft.x + screenW / 2 - width / 2, top: topLeft.y - height / 2 };
    if (h === 's') return { ...pos, left: topLeft.x + screenW / 2 - width / 2, top: topLeft.y + screenH - height / 2 };
    if (h === 'e') return { ...pos, left: topLeft.x + screenW - width / 2, top: topLeft.y + screenH / 2 - height / 2 };
    if (h === 'w') return { ...pos, left: topLeft.x - width / 2, top: topLeft.y + screenH / 2 - height / 2 };
    if (h === 'ne') return { ...pos, left: topLeft.x + screenW - width / 2, top: topLeft.y - height / 2 };
    if (h === 'nw') return { ...pos, left: topLeft.x - width / 2, top: topLeft.y - height / 2 };
    if (h === 'se') return { ...pos, left: topLeft.x + screenW - width / 2, top: topLeft.y + screenH - height / 2 };
    if (h === 'sw') return { ...pos, left: topLeft.x - width / 2, top: topLeft.y + screenH - height / 2 };
    return pos;
  }

  function getHandleVisualStyle(h: string): React.CSSProperties {
    const isHorizontalEdge = h === 'n' || h === 's';
    const isVerticalEdge = h === 'e' || h === 'w';

    return {
      width: isHorizontalEdge ? HANDLE_EDGE_LONG : isVerticalEdge ? HANDLE_EDGE_SHORT : HANDLE_CORNER_SIZE,
      height: isVerticalEdge ? HANDLE_EDGE_LONG : isHorizontalEdge ? HANDLE_EDGE_SHORT : HANDLE_CORNER_SIZE,
      borderRadius: isHorizontalEdge || isVerticalEdge ? 2 : 1,
      background: '#2f80d8',
      boxShadow: '0 0 0 1px rgba(47, 128, 216, 0.18)',
    };
  }

  return (
    <>
      {/* Frame body sits below nodes in stacking order (no z-index boost).
          Group hit testing runs in pane mouse handlers so this layer does not
          steal clicks from node toolbars or prompt inputs. */}
      <div
        className="group-frame-body nodrag nopan pointer-events-none absolute z-[3]"
        style={{ left: topLeft.x, top: topLeft.y, width: screenW, height: screenH }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Border */}
        <div
          className={[
            'absolute inset-0 rounded-[10px] pointer-events-none',
            selected ? 'border-2' : 'border',
          ].join(' ')}
          style={frameColorStyle}
        />

        {/* Resize handles only when selected */}
      </div>

      {/* Label z-[19] above nodes */}
      {showResizeHandles && handles.map((h) => (
        <div
          key={h}
          data-canvas-menu-ignore="true"
          data-group-id={group.id}
          data-handle={h}
          className={[
            'group-frame-no-drag nodrag nopan pointer-events-auto absolute flex items-center justify-center',
            'z-[21]',
          ].join(' ')}
          style={{ ...getHandleStyle(h), cursor: handleCursor[h] }}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          onMouseDown={handleResizeMouseDown}
          onDragStart={(event) => event.preventDefault()}
        >
          <div style={getHandleVisualStyle(h)} />
        </div>
      ))}

      <div
        data-group-id={group.id}
        className="group-frame-no-drag nodrag nopan pointer-events-auto absolute z-[19]"
        style={{
          left: topLeft.x + 12 * viewport.zoom,
          top: topLeft.y - 52 * viewport.zoom,
          transform: `scale(${viewport.zoom * 1.5})`,
          transformOrigin: 'left top',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GroupFrameLabel value={group.name} fallback={defaultName} onCommit={onRename} />
      </div>

      {showSourceHandle ? (
        <div
          data-canvas-menu-ignore="true"
          data-group-id={group.id}
          className="group-frame-no-drag nodrag nopan pointer-events-none absolute z-[20] overflow-visible"
          style={{
            left: topLeft.x,
            top: topLeft.y,
            width: screenW,
            height: screenH,
          }}
        >
          <div
            className={GROUP_SOURCE_HANDLE_HITBOX_BASE}
            style={{
              position: 'absolute',
              left: sourceHandleCenter.x - topLeft.x - GROUP_SOURCE_HANDLE_SIZE / 2,
              top: sourceHandleCenter.y - topLeft.y - GROUP_SOURCE_HANDLE_SIZE / 2,
              width: GROUP_SOURCE_HANDLE_SIZE,
              height: GROUP_SOURCE_HANDLE_SIZE,
            }}
          />
          <div
            data-canvas-menu-ignore="true"
            data-group-id={group.id}
            className={GROUP_SOURCE_HANDLE_ZONE_BASE}
            style={{
              left: screenW + GROUP_SOURCE_HANDLE_SIZE / 2,
              top: 0,
              width: GROUP_SOURCE_HANDLE_ZONE_WIDTH,
              height: screenH,
            }}
            onMouseDown={onStartConnection}
          />
          <span
            aria-hidden="true"
            className={GROUP_SOURCE_HANDLE_BADGE_BASE}
            style={{
              top: screenH / 2,
              left: screenW + GROUP_SOURCE_HANDLE_BADGE_GAP,
            }}
          >
            <Plus size={12} className="pointer-events-none" />
          </span>
        </div>
      ) : null}

      {/* Toolbar z-[19], only when selected */}
      {selected && (
        <GroupLayoutMenuContext.Provider value={onLayout}>
          <GroupExecutionMenuContext.Provider value={onExecute}>
            <div
              data-canvas-menu-ignore="true"
              className="group-frame-no-drag nodrag nopan pointer-events-auto absolute z-[19] flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
              style={{
                left: topLeft.x + screenW / 2,
                top: topLeft.y - 84,
                transform: 'translateX(-50%)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GroupBackgroundColorButton
                value={group.backgroundColor}
                onChange={onUpdateBackgroundColor}
              />
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Group}>布局</MultiNodeSelectionToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Play}>整组执行</MultiNodeSelectionToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Ungroup} onClick={onDelete}>解组</MultiNodeSelectionToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Download} onClick={onDownload}>批量下载</MultiNodeSelectionToolbarButton>
            </div>
          </GroupExecutionMenuContext.Provider>
        </GroupLayoutMenuContext.Provider>
      )}
    </>
  );
}

function getGroupConnectionPreviewPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
): string {
  const bend = Math.max(48, Math.abs(target.x - source.x) * 0.45);

  return [
    `M ${source.x} ${source.y}`,
    `C ${source.x + bend} ${source.y}`,
    `${target.x - bend} ${target.y}`,
    `${target.x} ${target.y}`,
  ].join(' ');
}

function GroupConnectionPreviewOverlay({ preview }: { preview: GroupConnectionPreview | null }) {
  if (!preview || preview.sources.length === 0) {
    return null;
  }

  return (
    <svg className="pointer-events-none fixed inset-0 z-[18] h-screen w-screen overflow-visible">
      {preview.sources.map((source) => (
        <path
          key={`${source.nodeId}:${source.sourceHandle ?? ''}`}
          d={getGroupConnectionPreviewPath(source.screen, preview.target)}
          fill="none"
          stroke="rgba(190, 205, 225, 0.34)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function GroupFrameLabel({
  value,
  fallback,
  onCommit,
}: {
  value?: string;
  fallback: string;
  onCommit: (name: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? fallback);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    onCommit(trimmed && trimmed !== fallback ? trimmed : undefined);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value ?? fallback);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="flex select-none items-center gap-1.5 text-gl-text-tertiary">
        <Group size={24} />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          style={{ width: `${Math.max((draft || fallback).length + 1, 8)}ch` }}
        />
      </span>
    );
  }

  return (
    <span className="flex cursor-text select-none items-center gap-1.5 text-gl-text-tertiary hover:text-gl-text-secondary">
      <Group size={24} />
      <span
        className="text-[22px] font-medium leading-none"
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDraft(value ?? fallback);
          setEditing(true);
        }}
      >
        {value ?? fallback}
      </span>
    </span>
  );
}

function GroupBackgroundColorButton({
  value,
  onChange,
}: {
  value?: string;
  onChange: (backgroundColor: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeColor = GROUP_BACKGROUND_COLORS.find((color) => color.value === value);
  const swatchColor = activeColor?.value ?? '#ffffff';

  return (
    <div className="relative mr-1">
      <button
        type="button"
        aria-label="选择分组背景色"
        aria-expanded={open}
        className="nodrag nopan flex h-10 w-10 items-center justify-center rounded-gl-pill transition-colors hover:bg-gl-panel-hover"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span
          className="block h-5 w-5 rounded-full border border-white/70 shadow-[0_2px_8px_rgba(0,0,0,0.28)]"
          style={{ backgroundColor: swatchColor }}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="分组背景色"
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 grid -translate-x-1/2 place-items-center gap-3 rounded-[18px] border border-white/10 bg-gl-panel/95 px-3 py-3 shadow-gl-toolbar backdrop-blur-md"
          style={{
            width: 156,
            gridTemplateColumns: 'repeat(4, 24px)',
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <GroupBackgroundColorMenuItem
            label="默认"
            color="#ffffff"
            selected={!activeColor}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          />
          {GROUP_BACKGROUND_COLORS.map((color) => (
            <GroupBackgroundColorMenuItem
              key={color.value}
              label={color.label}
              color={color.value}
              selected={color.value === value}
              onClick={() => {
                onChange(color.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GroupBackgroundColorMenuItem({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-label={label}
      aria-checked={selected}
      className="relative flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ backgroundColor: color }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {selected ? (
        <span className="h-2 w-2 rounded-full bg-[#1c1c1e] shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" />
      ) : null}
    </button>
  );
}

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
  onClick,
}: {
  children?: React.ReactNode;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  compact?: boolean;
  onClick?: () => void;
}) {
  const [executeMenuOpen, setExecuteMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const groupExecute = React.useContext(GroupExecutionMenuContext);
  const groupLayout = React.useContext(GroupLayoutMenuContext);
  const isGroupExecuteButton = Boolean(groupExecute && Icon === Play && !compact && !onClick);
  const isGroupLayoutButton = Boolean(groupLayout && Icon === Group && !compact && !onClick);
  const button = (
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
        if (isGroupLayoutButton) {
          setLayoutMenuOpen((open) => !open);
          setExecuteMenuOpen(false);
          return;
        }
        if (isGroupExecuteButton) {
          setExecuteMenuOpen((open) => !open);
          setLayoutMenuOpen(false);
          return;
        }
        onClick?.();
      }}
    >
      <Icon size={16} strokeWidth={1.9} />
      {children ? <span className="whitespace-nowrap">{children}</span> : null}
    </button>
  );

  if (isGroupLayoutButton) {
    return (
      <div className="relative">
        {button}
        {layoutMenuOpen ? (
          <div
            role="menu"
            className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 min-w-[116px] -translate-x-1/2 overflow-hidden rounded-lg border border-white/10 bg-gl-panel/95 p-1 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <GroupExecuteMenuItem
              icon={Grid2x2}
              label="网格"
              onClick={() => {
                setLayoutMenuOpen(false);
                groupLayout?.('grid');
              }}
            />
            <GroupExecuteMenuItem
              icon={Columns3}
              label="横向"
              onClick={() => {
                setLayoutMenuOpen(false);
                groupLayout?.('horizontal');
              }}
            />
            <GroupExecuteMenuItem
              icon={Rows3}
              label="纵向"
              onClick={() => {
                setLayoutMenuOpen(false);
                groupLayout?.('vertical');
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (isGroupExecuteButton) {
    return (
      <div className="relative">
        {button}
        {executeMenuOpen ? (
          <div
            role="menu"
            className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 min-w-[132px] -translate-x-1/2 overflow-hidden rounded-lg border border-white/10 bg-gl-panel/95 p-1 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <GroupExecuteMenuItem
              icon={Play}
              label="并行运行"
              onClick={() => {
                setExecuteMenuOpen(false);
                groupExecute?.('parallel');
              }}
            />
            <GroupExecuteMenuItem
              icon={ListOrdered}
              label="顺序运行"
              onClick={() => {
                setExecuteMenuOpen(false);
                groupExecute?.('sequence');
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return button;
}

function GroupExecuteMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-semibold text-gl-text-primary transition-colors hover:bg-gl-panel-hover"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon size={15} strokeWidth={1.9} className="text-gl-text-secondary" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function MultiNodeSelectionOverlay({
  nodes,
  selectedNodeIds,
  groups,
  visible,
  onGroup,
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
  const selectedGroup = useMemo(
    () => findContainingGroupForNodeSelection(groups, selectedNodeIds),
    [groups, selectedNodeIds],
  );

  useEffect(() => {
    if (selectedNodes.length <= 1 || selectedGroup) {
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
  }, [selectedGroup, selectedNodeIdsKey, selectedNodes, viewport.x, viewport.y, viewport.zoom]);

  if (!visible || !bounds || selectedNodes.length <= 1 || selectedGroup) {
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
           加入素材库
        </MultiNodeSelectionToolbarButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={Copy}>
           复制
        </MultiNodeSelectionToolbarButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton icon={Plus} compact />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <MultiNodeSelectionToolbarButton
          icon={Group}
          onClick={() => onGroup(selectedNodes.map((n) => n.id))}
        >
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
  onSmartReset,
  nodes,
}: {
  edgeStyle: CanvasEdgeStyle;
  onToggleEdgeStyle: () => void;
  onSmartReset: () => void;
  nodes: CanvasNode[];
}) {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow();
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true);
  const clampedZoom = clampZoomLevel(zoom);
  const edgeStyleLabel = edgeStyle === 'straight'
    ? '\u76f4\u7ebf'
    : '\u66f2\u7ebf';
  const nextEdgeStyleLabel = edgeStyle === 'straight'
    ? '\u5207\u6362\u4e3a\u66f2\u7ebf'
    : '\u5207\u6362\u4e3a\u76f4\u7ebf';
  const resetLabel = '\u91cd\u7f6e (G)';
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
              onClick={onSmartReset}
              title={resetLabel}
              aria-label="重置视图"
            >
              <Expand size={15} />
            </button>
            <Tooltip label={resetLabel} side="top" />
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

type CropRect = { x: number; y: number; width: number; height: number };
type CropAspectRatio = null | number;

const CROP_ASPECT_RATIOS: Array<{ label: string; value: CropAspectRatio }> = [
  { label: '自由裁剪', value: null },
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
  nodeType: 'image_generation' | 'uploaded_image' | 'image';
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
  }, [data]);

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
      // normAspect = targetPixelRatio * (imgH / imgW), keeping normalized coordinates proportional.
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
    // Use the full image as the baseline and center the largest rect that fits the selected ratio.
    // normAspect = targetPixelRatio * (imgH / imgW), keeping normalized coordinates proportional.
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
          {/* Crop overlay mask */}
      <div className="fixed inset-0 z-[80] pointer-events-none">
        {/* Top mask */}
        <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: screenY }} />
        {/* Bottom mask */}
        <div className="absolute bg-black/55" style={{ left: 0, top: screenY + screenH, right: 0, bottom: 0 }} />
        {/* Left mask */}
        <div className="absolute bg-black/55" style={{ left: 0, top: screenY, width: screenX, height: screenH }} />
        {/* Right mask */}
        <div className="absolute bg-black/55" style={{ left: screenX + screenW, top: screenY, right: 0, height: screenH }} />
        {/* Top crop mask */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: screenY, width: screenW, height: cropRect.y * screenH }} />
        {/* Bottom crop mask */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: screenY + (cropRect.y + cropRect.height) * screenH, width: screenW, height: (1 - cropRect.y - cropRect.height) * screenH }} />
        {/* Left crop mask */}
        <div className="absolute bg-black/55" style={{ left: screenX, top: cropScreenY, width: cropRect.x * screenW, height: cropScreenH }} />
        {/* Right crop mask */}
        <div className="absolute bg-black/55" style={{ left: cropScreenX + cropScreenW, top: cropScreenY, width: (1 - cropRect.x - cropRect.width) * screenW, height: cropScreenH }} />
      </div>

      {/* Crop box */}
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
          {/* 娑撳鐡戦崚鍡欑秹閺嶈偐鍤?*/}
          <div className="absolute inset-0 pointer-events-none" style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderLeft: '1px solid rgba(255,255,255,0.25)', backgroundImage: 'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)', backgroundSize: `100% ${cropScreenH / 3}px`, backgroundPosition: `0 ${cropScreenH / 3}px` }} />

          {/* Corner markers */}
          <div className="absolute -top-px -left-px h-5 w-5 border-t-2 border-l-2 border-white rounded-tl pointer-events-none" />
          <div className="absolute -top-px -right-px h-5 w-5 border-t-2 border-r-2 border-white rounded-tr pointer-events-none" />
          <div className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-white rounded-bl pointer-events-none" />
          <div className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-white rounded-br pointer-events-none" />
        </div>

        {/* Resize handles */}
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

      {/* 鎼存洟鍎村銉ュ徔閺?*/}
      <div className="fixed bottom-0 left-0 right-0 z-[82] flex items-center justify-center gap-3 py-5 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/16 hover:text-white"
            aria-label="关闭"
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
                {/* 閼奉亜鐣炬稊澶愨偓澶愩€?*/}
                {!customMode ? (
                  <button
                    type="button"
                    className={[
                      'flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/[0.07]',
                      customMode ? 'text-white' : 'text-gl-text-primary',
                    ].join(' ')}
                    onClick={() => { setCustomMode(true); setAspectRatio(null); }}
                  >
                    閼奉亜鐣炬稊?..
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

function EmptyCanvasWelcome({
  onCreateNode,
}: {
  onCreateNode: (action: EmptyCanvasWelcomeAction) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 px-5"
      data-canvas-menu-ignore="true"
    >
      <div className="flex flex-wrap items-center justify-center gap-3 text-center">
        <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/12 bg-white/[0.08] px-4 text-[14px] font-semibold text-gl-text-primary shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <MousePointer2 size={16} className="text-gl-text-secondary" />
          空画布
        </span>
        <span className="text-[18px] font-medium text-gl-text-secondary">
          从这里开始创建
        </span>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => onCreateNode('text')}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/10 bg-[#191A1C]/90 px-4 text-[13px] font-medium text-gl-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-gl-text-primary"
        >
          <Type size={15} strokeWidth={2} />
          文本
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => onCreateNode('image_generation')}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/10 bg-[#191A1C]/90 px-4 text-[13px] font-medium text-gl-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-gl-text-primary"
        >
          <ImageIcon size={15} strokeWidth={2} />
          图片生成
        </button>
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
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const attachProject = useCanvasStore((s) => s.attachProject);
  const renameProject = useCanvasStore((s) => s.renameProject);
  const deleteProject = useCanvasStore((s) => s.deleteProject);
  const generateTextFromTextNode = useCanvasStore((s) => s.generateTextFromTextNode);
  const generateImageFromImageGenerationNode = useCanvasStore((s) => s.generateImageFromImageGenerationNode);
  const createPanorama360FromImageNode = useCanvasStore((s) => s.createPanorama360FromImageNode);

  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const addNodes = useCanvasStore((s) => s.addNodes);
  const splitImageGenerationNodeToGrid = useCanvasStore((s) => s.splitImageGenerationNodeToGrid);
  const cropImageGenerationNode = useCanvasStore((s) => s.cropImageGenerationNode);
  const splitUploadedImageNodeToGrid = useCanvasStore((s) => s.splitUploadedImageNodeToGrid);
  const cropUploadedImageNode = useCanvasStore((s) => s.cropUploadedImageNode);
  const cropImageNode = useCanvasStore((s) => s.cropImageNode);
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const addEdgeStore = useCanvasStore((s) => s.addEdge);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const addReferenceImagesToImageGenerationNode = useCanvasStore(
    (s) => s.addReferenceImagesToImageGenerationNode,
  );
  const addReferenceMediaToVideoGenerationNode = useCanvasStore(
    (s) => s.addReferenceMediaToVideoGenerationNode,
  );
  const materials = useCanvasStore((s) => s.materials);
  const addMaterial = useCanvasStore((s) => s.addMaterial);
  const deleteMaterial = useCanvasStore((s) => s.deleteMaterial);
  const storeGroups = useCanvasStore((s) => s.groups);
  const createGroup = useCanvasStore((s) => s.createGroup);
  const deleteGroup = useCanvasStore((s) => s.deleteGroup);
  const renameGroup = useCanvasStore((s) => s.renameGroup);
  const updateGroupBackgroundColor = useCanvasStore((s) => s.updateGroupBackgroundColor);
  const moveGroup = useCanvasStore((s) => s.moveGroup);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeFocusRequest, setNodeFocusRequest] = useState<{
    nodeId: string;
    requestId: number;
  } | null>(null);
  const [panorama360NavigationNodeId, setPanorama360NavigationNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [groupConnectionPreview, setGroupConnectionPreview] = useState<GroupConnectionPreview | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
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
  const [materialLibraryAnchor, setMaterialLibraryAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pendingMaterialSource, setPendingMaterialSource] = useState<PendingMaterialSource | null>(null);
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

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

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
        canvasFocusRequestId: nodeFocusRequest?.nodeId === n.id
          ? nodeFocusRequest.requestId
          : undefined,
      },
      selected: selectedNodeIds.has(n.id),
      dragHandle:
        n.type === 'text'
          ? '.text-node-drag-handle'
          : n.type === 'image_generation' || n.type === 'video_generation'
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
  }, [activeNodeId, connectionMenu, nodeFocusRequest, storeNodes, selectedNodeIds]);

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

    if (connectionMenu?.connection?.nodeId && connectionMenu.connection.handleType) {
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
  const videoReferenceUploadNodeIdRef = React.useRef<string | null>(null);
  const copiedNodesRef = useRef<CanvasNode[]>([]);
  const connectedCopyBufferRef = useRef<ConnectedCopyBuffer | null>(null);
  const pasteCountRef = useRef(0);
  const promptBarInteractionRef = useRef(false);
  const pendingConnectionRef = useRef<OnConnectStartParams | null>(null);
  const suppressNextPaneClearRef = useRef(false);
  const skipNextPaneClickClearRef = useRef(false);
  const cropPrevViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const selectionDragActiveRef = useRef(false);
  const panePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const paneGroupDragRef = useRef<{ groupId: string; lastX: number; lastY: number; moved: boolean } | null>(null);
  const smartResetFocusedSelectionRef = useRef(false);
  const [paneSelectionDragging, setPaneSelectionDragging] = useState(false);
  const [selectionInProgress, setSelectionInProgress] = useState(false);

  const { fitView, getViewport, project, setViewport } = useReactFlow();

  const showProjectMessage = useCallback((message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => {
      setSaveMessage(null);
    }, 2200);
  }, [setSaveMessage]);

  const animateFocusToBounds = useCallback((bounds: { x: number; y: number; width: number; height: number }, padding: number) => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (!width || !height) {
      return;
    }

    const target = getViewportForBounds(bounds, width, height, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM, padding);
    const start = getViewport();
    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / THREE_VIEW_FOCUS_ANIMATION_DURATION_MS);
      const eased = THREE_VIEW_FOCUS_EASE(progress);
      void setViewport({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
      }, { duration: 0 });

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [getViewport, setViewport]);

  const focusSingleNodeViewport = useCallback((nodeId: string) => {
    smartResetFocusedSelectionRef.current = true;
    const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    animateFocusToBounds(getEstimatedNodeBounds(node), 0.32);
  }, [animateFocusToBounds]);

  const handleSmartResetViewport = useCallback(() => {
    const nodeId =
      activeNodeId ??
      (selectedNodeIdsRef.current.size === 1 ? Array.from(selectedNodeIdsRef.current)[0] ?? null : null);

    if (smartResetFocusedSelectionRef.current) {
      smartResetFocusedSelectionRef.current = false;
      void fitView({ duration: 220, padding: 0.18 });
      return;
    }

    if (nodeId) {
      focusSingleNodeViewport(nodeId);
      return;
    }

    void fitView({ duration: 220, padding: 0.18 });
  }, [activeNodeId, focusSingleNodeViewport, fitView]);

  const updateHoveredGroupFromPointer = useCallback((event: {
    target?: EventTarget | null;
    clientX: number;
    clientY: number;
  }) => {
    const target = event.target;

    if (target instanceof Element) {
      const groupElement = target.closest('.group-frame-no-drag[data-group-id]');
      const groupId = groupElement instanceof HTMLElement
        ? groupElement.dataset.groupId ?? null
        : null;

      if (groupId && storeGroups.some((group) => group.id === groupId)) {
        setHoveredGroupId((current) => (current === groupId ? current : groupId));
        return;
      }
    }

    const group = findGroupAtCanvasPoint(
      storeGroups,
      project({ x: event.clientX, y: event.clientY }),
    );
    const nextGroupId = group?.id ?? null;
    setHoveredGroupId((current) => (current === nextGroupId ? current : nextGroupId));
  }, [project, storeGroups]);

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
    notifyPanorama360NavigationActiveChange = (nodeId, active) => {
      setPanorama360NavigationNodeId((current) => {
        if (active) {
          return nodeId;
        }

        return current === nodeId ? null : current;
      });
    };

    return () => {
      notifyPanorama360NavigationActiveChange = null;
    };
  }, []);

  useEffect(() => {
    notifyMaterialLibraryRequest = (source) => {
      setPendingMaterialSource(source);
      setImageInfoPopover(null);
      setImageLightbox(null);
    };

    return () => {
      notifyMaterialLibraryRequest = null;
    };
  }, []);

  useEffect(() => {
    notifyImageToolbarAction = (action, data) => {
      if (action === 'organize') {
        const source = createMaterialSourceFromImageGenerationData(data);

        if (!source) {
          showProjectMessage('当前节点没有可加入素材库的图片');
          return;
        }

        notifyMaterialLibraryRequest?.(source);
        return;
      }

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

        const connectedImages = useCanvasStore
          .getState()
          .getConnectedImagesForImageGenerationNode(targetNode.id);
        const referenceImage = getFirstValidImageDimensions(connectedImages);
        const referenceAspectRatio =
          referenceImage?.width && referenceImage?.height
            ? referenceImage.width / referenceImage.height
            : null;
        const aspectRatioValue = (() => {
          const ar = data.aspectRatio;
          if (!ar || ar === 'auto') return null;
          const m = ar.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
          if (!m) return null;
          const w = Number(m[1]); const h = Number(m[2]);
          return (w > 0 && h > 0) ? w / h : null;
        })();
        const generatedAspectRatio =
          data.generatedImageWidth && data.generatedImageHeight
            ? data.generatedImageWidth / data.generatedImageHeight
            : null;
        const autoAspectRatio =
          data.aspectRatio === 'auto'
            ? referenceAspectRatio ?? generatedAspectRatio
            : generatedAspectRatio;
        const resolvedAspect = aspectRatioValue ??
          autoAspectRatio ??
          16 / 9;
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
          nodeType: 'image_generation',
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

      if (action === 'panorama-360') {
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

        void createPanorama360FromImageNode(targetNode.id)
          .then((nextNodeId) => {
            setSelectedNodeIds(new Set([nextNodeId]));
            setActiveNodeId(nextNodeId);
            setSelectedEdgeId(null);
            setEdgeDeleteButtonPosition(null);
          })
          .catch((error) => {
            setSaveMessage(error instanceof Error ? error.message : '360 panorama generation failed');
            window.setTimeout(() => setSaveMessage(null), 2200);
          });
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
  }, [
    createPanorama360FromImageNode,
    cropImageGenerationNode,
    getViewport,
    setCropMode,
    setSaveMessage,
    setViewport,
    showProjectMessage,
    splitImageGenerationNodeToGrid,
    storeNodes,
  ]);

  useEffect(() => {
    notifyUploadedImageToolbarAction = (action, nodeId, data, cardLayout) => {
      if (action === 'crop') {
        const targetNode = storeNodes.find(
          (node): node is Extract<CanvasNode, { type: 'uploaded_image' }> =>
            node.id === nodeId && node.type === 'uploaded_image',
        );
        const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

        if (!targetNode || !imageUrl) return;

        // cardLayout.top is relative to UploadedImageNode root, add paddingTop(74) for adapter wrapper
        const ADAPTER_PADDING_TOP = 74;
        const cardW = cardLayout?.width ?? data.displayWidth ?? Math.min(420, data.width || 320);
        const cardH = cardLayout?.height ?? data.displayHeight ?? Math.round(cardW * (data.height || 320) / (data.width || 320));
        const cardLeft = cardLayout?.left ?? 0;
        const cardTop = ADAPTER_PADDING_TOP + (cardLayout?.top ?? 22);

        cropPrevViewportRef.current = getViewport();

        const targetZoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM,
          Math.min(
            (window.innerWidth * 0.72) / cardW,
            (window.innerHeight * 0.72) / cardH,
          ),
        ));
        const cardCenterX = targetNode.position.x + cardLeft + cardW / 2;
        const cardCenterY = targetNode.position.y + cardTop + cardH / 2;
        void setViewport({
          x: window.innerWidth / 2 - cardCenterX * targetZoom,
          y: window.innerHeight / 2 - cardCenterY * targetZoom,
          zoom: targetZoom,
        }, { duration: 520 });

        setImageInfoPopover(null);
        setImageLightbox(null);
        setCropMode({
          nodeId: targetNode.id,
          nodeType: 'uploaded_image',
          imageUrl,
          nodeData: {} as ImageGenerationNodeData,
          nodePosition: targetNode.position,
          cardLeft,
          cardTop,
          cardWidth: cardW,
          cardHeight: cardH,
          imageNaturalWidth: data.width || cardW,
          imageNaturalHeight: data.height || cardH,
        });
        return;
      }

      if (action === 'organize') {
        const source = createMaterialSourceFromUploadedImageData(data);

        if (!source) {
          showProjectMessage('当前节点没有可加入素材库的图片');
          return;
        }

        notifyMaterialLibraryRequest?.(source);
        return;
      }

      if (action === 'panorama-360') {
        void createPanorama360FromImageNode(nodeId)
          .then((nextNodeId) => {
            setSelectedNodeIds(new Set([nextNodeId]));
            setActiveNodeId(nextNodeId);
            setSelectedEdgeId(null);
            setEdgeDeleteButtonPosition(null);
          })
          .catch((error) => {
            setSaveMessage(error instanceof Error ? error.message : '360 panorama generation failed');
            window.setTimeout(() => setSaveMessage(null), 2200);
          });
        return;
      }

      if (action === 'expand') {
        const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();
        if (imageUrl) {
          setImageInfoPopover(null);
          setImageLightbox({
            imageUrl,
            alt: data.title || data.fileName || 'image',
            width: data.width,
            height: data.height,
          });
        }
        return;
      }

      if (action === 'download') {
        const url = data.hostedImageUrl || data.imageUrl;
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = data.title || data.fileName || 'image';
          a.click();
        }
        return;
      }

      if (action === 'split-2x2-crop' || action === 'split-3x3-crop' || action === 'split-5x5-crop') {
        const dimension = action === 'split-2x2-crop' ? 2 : action === 'split-3x3-crop' ? 3 : 5;
        void splitUploadedImageNodeToGrid(nodeId, dimension).catch((error) => {
          console.error('split uploaded image node failed', error);
        });
        return;
      }
    };

    return () => {
      notifyUploadedImageToolbarAction = null;
    };
  }, [
    createPanorama360FromImageNode,
    getViewport,
    setCropMode,
    setSaveMessage,
    setViewport,
    showProjectMessage,
    splitUploadedImageNodeToGrid,
    storeNodes,
  ]);

  useEffect(() => {
    notifyImageNodeCropRequest = (nodeId, data, cardDimensions, imageUrl) => {
      const targetNode = storeNodes.find(
        (node): node is Extract<CanvasNode, { type: 'image' }> =>
          node.id === nodeId && node.type === 'image',
      );

      if (!targetNode) {
        return;
      }

      const ADAPTER_PADDING_TOP = 74;
      const cardW = cardDimensions.width;
      const cardH = cardDimensions.height;
      const cardLeft = 0;
      const cardTop = ADAPTER_PADDING_TOP + 22;

      cropPrevViewportRef.current = getViewport();

      const targetZoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM,
        Math.min(
          (window.innerWidth * 0.72) / cardW,
          (window.innerHeight * 0.72) / cardH,
        ),
      ));
      const cardCenterX = targetNode.position.x + cardLeft + cardW / 2;
      const cardCenterY = targetNode.position.y + cardTop + cardH / 2;
      void setViewport({
        x: window.innerWidth / 2 - cardCenterX * targetZoom,
        y: window.innerHeight / 2 - cardCenterY * targetZoom,
        zoom: targetZoom,
      }, { duration: 520 });

      setImageInfoPopover(null);
      setImageLightbox(null);
      setCropMode({
        nodeId: targetNode.id,
        nodeType: 'image',
        imageUrl,
        nodeData: {} as ImageGenerationNodeData,
        nodePosition: targetNode.position,
        cardLeft,
        cardTop,
        cardWidth: cardW,
        cardHeight: cardH,
        imageNaturalWidth: data.width || cardW,
        imageNaturalHeight: data.height || cardH,
      });
    };

    return () => {
      notifyImageNodeCropRequest = null;
    };
  }, [
    getViewport,
    setCropMode,
    setViewport,
    storeNodes,
  ]);

  useEffect(() => {
    notifyImageGenerationReferenceUpload = (nodeId) => {
      referenceUploadNodeIdRef.current = nodeId;
      videoReferenceUploadNodeIdRef.current = null;
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

  useEffect(() => {
    notifyVideoGenerationReferenceUpload = (nodeId) => {
      videoReferenceUploadNodeIdRef.current = nodeId;
      referenceUploadNodeIdRef.current = null;
      const input = uploadInputRef.current;

      if (!input) {
        return;
      }
      openFileInput(input);
    };

    return () => {
      notifyVideoGenerationReferenceUpload = null;
    };
  }, []);

  const clearEdgeSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeDeleteButtonPosition(null);
  }, []);

  useEffect(() => {
    notifyPanorama360UploadRequest = (nodeId, file) => {
      void (async () => {
        const state = useCanvasStore.getState();
        const targetNode = state.nodes.find((node) => node.id === nodeId);

        if (!targetNode) {
          return;
        }

        const imageData = await readImageFile(file);
        const sourceNode = createImportedImageNode(imageData, {
          x: targetNode.position.x - 480,
          y: targetNode.position.y,
        });
        const incomingEdges = state.edges.filter((edge) => edge.target === nodeId);

        incomingEdges.forEach((edge) => deleteEdge(edge.id));
        addNodes([sourceNode]);
        addEdgeStore({
          id: crypto.randomUUID(),
          source: sourceNode.id,
          target: nodeId,
        });
        setSelectedNodeIds(new Set([nodeId]));
        setActiveNodeId(nodeId);
        clearEdgeSelection();
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '创建图片节点失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    };

    return () => {
      notifyPanorama360UploadRequest = null;
    };
  }, [addEdgeStore, addNodes, clearEdgeSelection, deleteEdge, setSaveMessage]);

  const selectGroup = useCallback((groupId: string) => {
    clearCanvasNodeUi();
    setActiveNodeId(null);
    selectedNodeIdsRef.current = new Set();
    setSelectedNodeIds((current) => (current.size === 0 ? current : new Set()));
    setSelectedGroupId(groupId);
    clearEdgeSelection();
  }, [clearEdgeSelection]);

  const selectSingleNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) =>
      current.size === 1 && current.has(nodeId) ? current : new Set([nodeId]),
    );
    setActiveNodeId(nodeId);
    setSelectedGroupId(null);
    clearEdgeSelection();
  }, [clearEdgeSelection]);

  const focusCreatedNode = useCallback((nodeId: string) => {
    setSelectedNodeIds(new Set([nodeId]));
    setActiveNodeId(nodeId);
    setSelectedGroupId(null);
    clearEdgeSelection();
    setNodeFocusRequest({
      nodeId,
      requestId: Date.now(),
    });
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

      if (!node || !isCanvasMediaInfoNodeType(node.type)) {
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
    setSelectedGroupId(null);

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

  const handleNodeDoubleClick = useCallback((
    event: React.MouseEvent,
    node: ReactFlowNode,
  ) => {
    if (!isNodeCardFocusTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectSingleNode(node.id);
    focusSingleNodeViewport(node.id);
  }, [focusSingleNodeViewport, selectSingleNode]);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: ReactFlowNode[] }) => {
    if (paneGroupDragRef.current) {
      return;
    }

    const nextSelectedNodeIds = new Set(nodes.map((node) => node.id));
    selectedNodeIdsRef.current = nextSelectedNodeIds;

    setSelectedNodeIds((current) => {
      return areSetsEqual(current, nextSelectedNodeIds) ? current : nextSelectedNodeIds;
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
    if (paneGroupDragRef.current) {
      selectionDragActiveRef.current = false;
      setSelectionInProgress(false);
      setPaneSelectionDragging(false);
      return;
    }

    selectionDragActiveRef.current = true;
    selectedNodeIdsRef.current = new Set();
    setSelectionInProgress(true);
    setSelectedGroupId(null);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    selectionDragActiveRef.current = false;
    panePointerStartRef.current = null;
    setPaneSelectionDragging(false);
    setSelectionInProgress(false);

    if (paneGroupDragRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      const group = findContainingGroupForNodeSelection(
        useCanvasStore.getState().groups,
        selectedNodeIdsRef.current,
      );

      if (group) {
        selectGroup(group.id);
      }
    });
  }, [selectGroup]);

  const handlePaneMouseDown = useCallback((event: React.MouseEvent) => {
    const target = event.target;
    const internalTarget = target instanceof Element && Boolean(
      target.closest(
        '[data-canvas-menu-ignore="true"], .node-connectable-root, .node-connectable-card, .react-flow__node, .group-frame-body, .group-frame-no-drag',
      ),
    );

    if (event.button !== 0 || internalTarget) {
      panePointerStartRef.current = null;
      setPaneSelectionDragging(false);
      setSelectionInProgress(false);
      return;
    }

    const group = findGroupAtCanvasPoint(storeGroups, project({ x: event.clientX, y: event.clientY }));

    if (group) {
      event.preventDefault();
      event.stopPropagation();
      paneGroupDragRef.current = {
        groupId: group.id,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
      };
      skipNextPaneClickClearRef.current = true;
      panePointerStartRef.current = null;
      selectionDragActiveRef.current = false;
      setPaneSelectionDragging(false);
      setSelectionInProgress(false);
      selectGroup(group.id);
      return;
    }

    panePointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setPaneSelectionDragging(false);
  }, [project, selectGroup, storeGroups]);

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    updateHoveredGroupFromPointer(event);

    const groupDrag = paneGroupDragRef.current;

    if (groupDrag) {
      event.preventDefault();
      event.stopPropagation();

      const dx = event.clientX - groupDrag.lastX;
      const dy = event.clientY - groupDrag.lastY;

      if (dx !== 0 || dy !== 0) {
        const { zoom } = getViewport();
        paneGroupDragRef.current = {
          groupId: groupDrag.groupId,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: true,
        };
        moveGroup(groupDrag.groupId, dx / zoom, dy / zoom);
      }

      setPaneSelectionDragging(false);
      setSelectionInProgress(false);
      return;
    }

    const start = panePointerStartRef.current;

    if (!start) {
      return;
    }

    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);

    if (dx > 3 || dy > 3) {
      setPaneSelectionDragging(true);
    }
  }, [getViewport, moveGroup, updateHoveredGroupFromPointer]);

  const handlePaneMouseUp = useCallback((event?: React.MouseEvent) => {
    if (paneGroupDragRef.current) {
      event?.preventDefault();
      event?.stopPropagation();
      paneGroupDragRef.current = null;
      window.setTimeout(() => {
        skipNextPaneClickClearRef.current = false;
      }, 0);
    }

    panePointerStartRef.current = null;
    setPaneSelectionDragging(false);
    setSelectionInProgress(false);
  }, []);

  const handlePaneMouseLeave = useCallback((event: React.MouseEvent) => {
    setHoveredGroupId(null);
    handlePaneMouseUp(event);
  }, [handlePaneMouseUp]);

  const handleCopySelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return false;
    }

    const selectedNodes = storeNodes.filter((node) => selectedNodeIds.has(node.id));

    if (selectedNodes.length === 0) {
      return false;
    }

    copiedNodesRef.current = selectedNodes.map((node) => cloneCanvasNode(node, 0));
    connectedCopyBufferRef.current = createConnectedCopyBuffer(
      selectedNodes,
      storeEdges,
      selectedNodeIds,
    );
    pasteCountRef.current = 0;
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

    pasteCountRef.current += 1;

    const pastedNodes = copyBuffer.nodes.map((node) =>
      cloneCanvasNode(node, pasteCountRef.current),
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
    options?: { select?: boolean },
  ) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    const imageDataList = await Promise.all(imageFiles.map((file) => readImageFile(file)));
    const nextNodes = imageDataList.map((data, index) =>
      createImportedImageNode(
        data,
        getImageImportPosition(basePosition, index),
      ),
    );
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    if (options?.select !== false) {
      setSelectedNodeIds(nextNodeIds);
      setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
      clearEdgeSelection();
    }
  }, [addNodes, clearEdgeSelection]);

  const addUploadedVideos = useCallback(async (
    files: File[],
    basePosition: { x: number; y: number },
    options?: { select?: boolean },
  ) => {
    const videoFiles = files.filter((file) => file.type.startsWith('video/'));

    if (videoFiles.length === 0) {
      return;
    }

    const videoDataList = await Promise.all(videoFiles.map((file) => readVideoFile(file)));
    const nextNodes = videoDataList.map((data, index) =>
      createImportedVideoNode(
        data,
        getImageImportPosition(basePosition, index),
      ),
    );
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    if (options?.select !== false) {
      setSelectedNodeIds(nextNodeIds);
      setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
      clearEdgeSelection();
    }
  }, [addNodes, clearEdgeSelection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (isModifierPressed && !event.altKey && key === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }

        return;
      }

      if (isModifierPressed && !event.altKey && !event.shiftKey && key === 'c') {
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

      if (!isModifierPressed && !event.altKey && !event.shiftKey && key === 'g') {
        event.preventDefault();
        handleSmartResetViewport();
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
    handleCopySelectedNodes,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    handlePasteNodesWithUpstream,
    handleSmartResetViewport,
    redo,
    selectedEdgeId,
    selectedNodeIds,
    undo,
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
      if (change.type === 'position') {
        if (change.position) {
          updateNodePosition(change.id, change.position);
        }

        if (change.dragging === true) {
          draggingNodeIdRef.current = change.id;
        } else if (change.dragging === false) {
          draggingNodeIdRef.current = null;
          syncNodeGroupMembership(change.id, change.position);
        }
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
        setPanorama360NavigationNodeId((current) => (current === change.id ? null : current));
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

  const handleNodeDragStop = useCallback((
    _event: React.MouseEvent,
    node: ReactFlowNode,
    draggedNodes: ReactFlowNode[],
  ) => {
    const nodesToSync = draggedNodes.length > 0 ? draggedNodes : [node];

    for (const draggedNode of nodesToSync) {
      updateNodePosition(draggedNode.id, draggedNode.position);
      syncNodeGroupMembership(draggedNode.id, draggedNode.position);
    }

    draggingNodeIdRef.current = null;
  }, [updateNodePosition]);

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

    return Boolean(target.closest('[data-canvas-menu-ignore="true"], .group-frame-body, .group-frame-no-drag'));
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

  const handlePaneClick = useCallback((event?: {
    target?: EventTarget | null;
    clientX?: number;
    clientY?: number;
  }) => {
    if (skipNextPaneClickClearRef.current) {
      skipNextPaneClickClearRef.current = false;
      return;
    }

    if (suppressNextPaneClearRef.current || isInteractiveCanvasTarget(event?.target ?? null)) {
      return;
    }

    if (
      typeof event?.clientX === 'number' &&
      typeof event.clientY === 'number'
    ) {
      const group = findGroupAtCanvasPoint(
        storeGroups,
        project({ x: event.clientX, y: event.clientY }),
      );

      if (group) {
        selectGroup(group.id);
        return;
      }
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
    setSelectedGroupId(null);
    clearEdgeSelection();
  }, [clearConnectionMenu, clearEdgeSelection, isInteractiveCanvasTarget, project, selectGroup, storeGroups]);

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
    const videoReferenceUploadNodeId = videoReferenceUploadNodeIdRef.current;

    if (files.length > 0 && videoReferenceUploadNodeId) {
      void (async () => {
        const media = await Promise.all(
          files
            .filter((file) =>
              file.type.startsWith('image/') ||
              file.type.startsWith('video/') ||
              file.type.startsWith('audio/'),
            )
            .map(async (file) => {
              const videoFrame = file.type.startsWith('video/')
                ? await captureVideoFirstFrame(file).catch(() => null)
                : null;
              const uploaded = await uploadMediaFileToOss(file);
              return {
                id: crypto.randomUUID(),
                url: uploaded.url,
                hostedUrl: uploaded.url,
                previewUrl: file.type.startsWith('image/')
                  ? URL.createObjectURL(file)
                  : videoFrame?.previewUrl,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
                width: videoFrame?.width,
                height: videoFrame?.height,
                durationSeconds: videoFrame?.durationSeconds,
              };
            }),
        );

        addReferenceMediaToVideoGenerationNode(videoReferenceUploadNodeId, media);
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '上传视频参考失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    } else if (files.length > 0 && referenceUploadNodeId) {
      void (async () => {
        const imageFiles = files.filter((file) => file.type.startsWith('image/'));

        if (imageFiles.length === 0) {
          return;
        }

        const imageDataList = await Promise.all(imageFiles.map((file) => readImageFile(file)));
        addReferenceImagesToImageGenerationNode(referenceUploadNodeId, imageDataList);
      })();
    } else if (files.length > 0 && position) {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const videoFiles = files.filter((file) => file.type.startsWith('video/'));

      void (async () => {
        if (imageFiles.length > 0) {
          await addUploadedImages(imageFiles, position, { select: videoFiles.length === 0 });
        }

        if (videoFiles.length === 0) {
          return;
        }

        const videoPosition = imageFiles.length > 0
          ? {
              x: position.x,
              y: position.y + Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
            }
          : position;
        await addUploadedVideos(videoFiles, videoPosition);
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '上传媒体失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    }

    event.target.value = '';
    uploadPositionRef.current = null;
    referenceUploadNodeIdRef.current = null;
    videoReferenceUploadNodeIdRef.current = null;
  }, [addReferenceImagesToImageGenerationNode, addReferenceMediaToVideoGenerationNode, addUploadedImages, addUploadedVideos, setSaveMessage]);

  const handleSelectMaterial = useCallback((
    item: MaterialLibraryItem,
    screenPosition?: { x: number; y: number },
  ) => {
    const screenPoint =
      screenPosition && Number.isFinite(screenPosition.x) && Number.isFinite(screenPosition.y)
        ? screenPosition
        : {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          };
    const center = project(screenPoint);
    const position = findOpenHistoryNodePosition(
      {
        x: center.x - HISTORY_NODE_WIDTH / 2,
        y: center.y - 260,
      },
      storeNodes,
    );
    const node = createImageNodeFromMaterial(item, position);

    addNodes([node]);
    setSelectedNodeIds(new Set([node.id]));
    setActiveNodeId(node.id);
    clearEdgeSelection();
  }, [addNodes, clearEdgeSelection, project, storeNodes]);

  const handleMediaDrop = useCallback((event: React.DragEvent) => {
    const materialId = event.dataTransfer.getData('application/x-genlink-material-id');

    if (materialId) {
      const material = materials.find((item) => item.id === materialId);

      if (!material) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setAddMenu(null);
      setImageInfoPopover(null);
      handleSelectMaterial(material, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter((item) => item.type.startsWith('image/'));
    const videoFiles = files.filter((item) => item.type.startsWith('video/'));

    if (imageFiles.length === 0 && videoFiles.length === 0) {
      return;
    }

    event.preventDefault();
    setAddMenu(null);
    setImageInfoPopover(null);
    const position = project({ x: event.clientX, y: event.clientY });

    void (async () => {
      if (imageFiles.length > 0) {
        await addUploadedImages(imageFiles, position, { select: videoFiles.length === 0 });
      }

      if (videoFiles.length === 0) {
        return;
      }

      const videoPosition = imageFiles.length > 0
        ? {
            x: position.x,
            y: position.y + Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
          }
        : position;
      await addUploadedVideos(videoFiles, videoPosition);
    })().catch((error) => {
      setSaveMessage(error instanceof Error ? error.message : '上传媒体失败');
      window.setTimeout(() => setSaveMessage(null), 2200);
    });
  }, [addUploadedImages, addUploadedVideos, handleSelectMaterial, materials, project, setSaveMessage]);

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

  const handleEmptyCanvasCreateNode = useCallback((action: EmptyCanvasWelcomeAction) => {
    const canvasPosition = project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const node = addNodeAtCenter(action, canvasPosition);

    focusCreatedNode(node.id);
    setAddMenu(null);
    clearConnectionMenu();
  }, [addNodeAtCenter, clearConnectionMenu, focusCreatedNode, project]);

  const handleAddMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }

    if (action === 'text' && addMenu) {
      const node = addNodeAtCenter('text', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'image_generation' && addMenu) {
      const node = addNodeAtCenter('image_generation', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'video_generation' && addMenu) {
      const node = addNodeAtCenter('video_generation', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'panorama-360' && addMenu) {
      const node = addNodeAtCenter('panorama-360', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'upload' && addMenu) {
      openUploadPicker(addMenu.canvas);
    }

    setAddMenu(null);
  }, [addMenu, addNodeAtCenter, focusCreatedNode, openUploadPicker]);

  const addGroupConnectionEdges = useCallback((
    sourceRefs: GroupConnectionSource[],
    targetNodeId: string,
    targetHandle?: string,
  ) => {
    const state = useCanvasStore.getState();
    const existing = new Set(
      state.edges.map((edge) => [
        edge.source,
        edge.target,
        edge.sourceHandle ?? '',
        edge.targetHandle ?? '',
      ].join('|')),
    );
    let addedCount = 0;

    for (const sourceRef of sourceRefs) {
      if (sourceRef.nodeId === targetNodeId) {
        continue;
      }

      const key = [
        sourceRef.nodeId,
        targetNodeId,
        sourceRef.sourceHandle ?? '',
        targetHandle ?? '',
      ].join('|');

      if (existing.has(key)) {
        continue;
      }

      existing.add(key);
      addedCount += 1;
      addEdgeStore({
        id: crypto.randomUUID(),
        source: sourceRef.nodeId,
        target: targetNodeId,
        sourceHandle: sourceRef.sourceHandle,
        targetHandle,
      });
    }

    return addedCount;
  }, [addEdgeStore]);

  const handleExecuteGroup = useCallback((groupId: string, mode: GroupExecutionMode) => {
    const state = useCanvasStore.getState();
    const group = state.groups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return;
    }

    const groupNodeIds = new Set(group.nodeIds);
    const runnableNodes = state.nodes
      .filter((
        node,
      ): node is Extract<CanvasNode, { type: 'text' | 'image_generation' }> =>
        groupNodeIds.has(node.id) &&
        (node.type === 'text' || node.type === 'image_generation'),
      )
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    if (runnableNodes.length === 0) {
      showProjectMessage('分组内没有可执行节点');
      return;
    }

    const runNode = (node: (typeof runnableNodes)[number]) => {
      if (node.type === 'text') {
        return generateTextFromTextNode(node.id);
      }

      return generateImageFromImageGenerationNode(node.id);
    };

    void (async () => {
      if (mode === 'parallel') {
        const results = await Promise.allSettled(runnableNodes.map(runNode));
        const failedCount = results.filter((result) => result.status === 'rejected').length;

        if (failedCount > 0) {
          showProjectMessage(`${failedCount} 个节点运行失败`);
        }
        return;
      }

      let failedCount = 0;

      for (const node of runnableNodes) {
        try {
          await runNode(node);
        } catch {
          failedCount += 1;
        }
      }

      if (failedCount > 0) {
        showProjectMessage(`${failedCount} 个节点运行失败`);
      }
    })();
  }, [
    generateImageFromImageGenerationNode,
    generateTextFromTextNode,
    showProjectMessage,
  ]);

  const handleDownloadGroup = useCallback((groupId: string) => {
    const state = useCanvasStore.getState();
    const group = state.groups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return;
    }

    const zipItems = getGroupZipItems(group, state.nodes);

    if (zipItems.length === 0) {
      showProjectMessage('分组内没有可下载图片');
      return;
    }

    const zipFileName = group.name?.trim() || `group-${group.id.slice(0, 8)}`;
    showProjectMessage('正在打包下载...');

    void import('@/lib/image-zip-download')
      .then(({ downloadImagesAsZip }) => downloadImagesAsZip(zipItems, zipFileName))
      .then((count) => {
        showProjectMessage(`已下载 ${count} 张图片`);
      })
      .catch((error) => {
        showProjectMessage(error instanceof Error ? error.message : '下载失败');
      });
  }, [showProjectMessage]);

  const handleStartGroupConnection = useCallback((
    group: NodeGroup,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sources = getGroupConnectionSourcesFromDom(group);

    if (sources.length === 0) {
      showProjectMessage('分组内没有可连接的源节点');
      return;
    }

    clearConnectionMenu();
    clearEdgeSelection();
    setAddMenu(null);
    setImageInfoPopover(null);
    setImageLightbox(null);
    setGroupConnectionPreview({
      sources,
      target: { x: event.clientX, y: event.clientY },
    });

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
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      resetTargetHandleHighlight();
      setGroupConnectionPreview(null);
    };

    const updatePreviewFromMouse = (mouseEvent: MouseEvent) => {
      const targetHandle = resolveGroupConnectionTargetHandle(mouseEvent);

      if (targetHandle) {
        setTargetHandleHighlight(targetHandle);
        setGroupConnectionPreview({
          sources,
          target: getElementScreenCenter(targetHandle),
        });
        return;
      }

      resetTargetHandleHighlight();
      setGroupConnectionPreview({
        sources,
        target: { x: mouseEvent.clientX, y: mouseEvent.clientY },
      });
    };

    function handleMouseMove(moveEvent: MouseEvent) {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      updatePreviewFromMouse(moveEvent);
    }

    function handleMouseUp(upEvent: MouseEvent) {
      upEvent.preventDefault();
      upEvent.stopPropagation();

      const target = resolveGroupConnectionTarget(upEvent);

      if (target) {
        const addedCount = addGroupConnectionEdges(
          sources,
          target.nodeId,
          target.targetHandle,
        );

        if (addedCount === 0) {
          showProjectMessage('没有新增连接');
        }
      } else {
        suppressNextPaneClearRef.current = true;
        window.setTimeout(() => {
          suppressNextPaneClearRef.current = false;
        }, 250);
        setConnectionMenu({
          screen: { x: upEvent.clientX, y: upEvent.clientY },
          canvas: project({ x: upEvent.clientX, y: upEvent.clientY }),
          sourceRefs: sources,
        });
      }

      cleanup();
    }

    function handleWindowBlur() {
      cleanup();
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleWindowBlur);
  }, [
    addGroupConnectionEdges,
    clearConnectionMenu,
    clearEdgeSelection,
    project,
    showProjectMessage,
  ]);

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

  const toggleMaterialLibraryPanel = useCallback((anchor: DOMRect) => {
    setMaterialLibraryAnchor((current) => {
      if (current) {
        return null;
      }

      return {
        x: anchor.right + 16,
        y: anchor.top - 72,
      };
    });
    setHistoryAnchor(null);
    setAddMenu(null);
    clearConnectionMenu();
  }, [clearConnectionMenu]);

  const handleConfirmAddMaterial = useCallback((item: Omit<MaterialLibraryItem, 'id' | 'createdAt'>) => {
    const existing = materials.find(
      (candidate) =>
        candidate.name.trim() === item.name.trim() &&
        candidate.category === item.category,
    );
    addMaterial(item);
    setPendingMaterialSource(null);
    showProjectMessage(existing ? '素材已存在' : '已加入素材库');
  }, [addMaterial, materials, showProjectMessage]);

  const handleSelectHistoryImage = useCallback(async (item: ImageHistoryItem) => {
    const viewportBeforeInsert = getViewport();
    const displayPrompt = getImageHistoryDisplayPrompt(item.nodeData);
    let resolvedImage: Awaited<ReturnType<typeof resolveHistoryImageUrls>>;

    try {
      resolvedImage = await resolveHistoryImageUrls(item);
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '载入历史图片失败');
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

    if (action !== 'text' && action !== 'image_generation' && action !== 'video_generation' && action !== 'panorama-360' && action !== 'video') {
      clearConnectionMenu();
      return;
    }

    if (action === 'video') {
      clearConnectionMenu();
      return;
    }

    const nodeType: NodeType =
      action === 'text'
        ? 'text'
        : action === 'video_generation'
          ? 'video_generation'
        : action === 'panorama-360'
          ? 'panorama-360'
          : 'image_generation';
    const nextNode = addNodeAtCenter(nodeType, connectionMenu.canvas);
    const connection = connectionMenu.connection;

    if (connectionMenu.sourceRefs?.length) {
      addGroupConnectionEdges(connectionMenu.sourceRefs, nextNode.id);
    } else if (connection?.nodeId && connection.handleType) {
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
    setNodeFocusRequest({
      nodeId: nextNode.id,
      requestId: Date.now(),
    });
    clearEdgeSelection();
    clearConnectionMenu();
  }, [
    addEdgeStore,
    addGroupConnectionEdges,
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
    window.localStorage.setItem(CANVAS_TEXT_RUNNINGHUB_API_KEY_STORAGE_KEY, values.textApiKeys.runninghub);
    window.localStorage.setItem(CANVAS_TEXT_GRSAI_API_KEY_STORAGE_KEY, values.textApiKeys.grsai);
    window.localStorage.setItem(CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY, values.imageApiKeys.vibe);
    window.localStorage.setItem(CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY, values.imageApiKeys.fucheers);
    window.localStorage.setItem(CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY, values.imageApiKeys.comfly);
    window.localStorage.setItem(CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY, values.imageApiKeys.zhenzhen);
    window.localStorage.setItem(CANVAS_IMAGE_RUNNINGHUB_API_KEY_STORAGE_KEY, values.imageApiKeys.runninghub);
    window.localStorage.setItem(CANVAS_IMAGE_GRSAI_API_KEY_STORAGE_KEY, values.imageApiKeys.grsai);
    window.localStorage.setItem(CANVAS_RUNNINGHUB_WORKFLOW_API_KEY_STORAGE_KEY, values.runningHubWorkflowApiKey);
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
    const nodeType = cropMode?.nodeType;
    setCropMode(null);
    cropPrevViewportRef.current = null;
    try {
      if (nodeType === 'uploaded_image') {
        await cropUploadedImageNode(nodeId, cropRect);
      } else if (nodeType === 'image') {
        await cropImageNode(nodeId, cropRect);
      } else {
        await cropImageGenerationNode(nodeId, cropRect);
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '裁剪失败');
      window.setTimeout(() => setSaveMessage(null), 2200);
    }
  }, [cropImageGenerationNode, cropImageNode, cropUploadedImageNode, cropMode?.nodeType, setSaveMessage]);

  const handleGroup = useCallback((nodeIds: string[]) => {
    if (nodeIds.length < 2) return;
    // Compute bounding box from node elements, with padding
    const padding = MULTI_NODE_SELECTION_PADDING;
    const rects = nodeIds.map((id) => {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === id);
      if (!node) return null;
      return getEstimatedNodeBounds(node);
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (rects.length === 0) return;

    const minX = Math.min(...rects.map((r) => r.x)) - padding;
    const minY = Math.min(...rects.map((r) => r.y)) - padding;
    const maxX = Math.max(...rects.map((r) => r.x + r.width)) + padding;
    const maxY = Math.max(...rects.map((r) => r.y + r.height)) + padding;

    const group = createGroup(nodeIds, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    clearCanvasNodeUi();
    setActiveNodeId(null);
    setSelectedNodeIds(new Set());
    clearEdgeSelection();
    setSelectedGroupId(group.id);
  }, [createGroup, clearEdgeSelection]);

  const handleResizeGroup = useCallback((
    groupId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => {
    updateGroupBoundsAndMembership(groupId, bounds);
  }, []);

  const handleLayoutGroup = useCallback((groupId: string, mode: GroupLayoutMode) => {
    const changed = layoutGroupNodes(groupId, mode);

    if (!changed) {
      showProjectMessage('分组内没有可布局的节点');
    }
  }, [showProjectMessage]);

  const handleSaveProject = useCallback(async () => {
    await saveProject();
    setSaveMessage('保存成功');
    window.setTimeout(() => {
      setSaveMessage(null);
    }, 2200);
  }, [saveProject, setSaveMessage]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || key !== 's') {
        return;
      }

      event.preventDefault();

      if (!event.repeat) {
        void handleSaveProject();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [handleSaveProject]);

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
      showProjectMessage(error instanceof Error ? error.message : '下载失败');
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
      showProjectMessage(error instanceof Error ? error.message : '下载失败');
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
      showProjectMessage(error instanceof Error ? error.message : '下载失败');
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
      showProjectMessage(error instanceof Error ? error.message : '下载失败');
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
        <div className="fixed bottom-8 left-1/2 z-[95] -translate-x-1/2 rounded-[12px] border border-white/12 bg-[#1d1f23] px-4 py-2 text-[13px] text-white shadow-[0_18px_36px_rgba(0,0,0,0.4)]">
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
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
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
        onPaneMouseLeave={handlePaneMouseLeave}
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
        panOnScroll={panorama360NavigationNodeId === null}
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
        onDrop={handleMediaDrop}
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes('application/x-genlink-material-id') ||
            Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
      >
        {storeNodes.length === 0 && !loading ? (
          <EmptyCanvasWelcome onCreateNode={handleEmptyCanvasCreateNode} />
        ) : null}
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
          onSmartReset={handleSmartResetViewport}
          nodes={storeNodes}
        />
        <MultiNodeSelectionOverlay
          nodes={storeNodes}
          selectedNodeIds={selectedNodeIds}
          groups={storeGroups}
          visible={!selectionInProgress && !paneSelectionDragging}
          onGroup={handleGroup}
        />
        <GroupOverlay
          groups={storeGroups}
          selectedGroupId={selectedGroupId}
          hoveredGroupId={hoveredGroupId}
          onStartGroupConnection={handleStartGroupConnection}
          onSelectGroup={selectGroup}
          onDeleteGroup={deleteGroup}
          onRenameGroup={renameGroup}
          onUpdateGroupBackgroundColor={updateGroupBackgroundColor}
          onMoveGroup={moveGroup}
          onResizeGroup={handleResizeGroup}
          onExecuteGroup={handleExecuteGroup}
          onLayoutGroup={handleLayoutGroup}
          onDownloadGroup={handleDownloadGroup}
        />
      </ReactFlow>

      <GroupConnectionPreviewOverlay preview={groupConnectionPreview} />

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
        onToggleMaterialLibrary={toggleMaterialLibraryPanel}
        onToggleHistory={toggleHistoryPopover}
        onSaveProject={() => void handleSaveProject()}
        materialLibraryOpen={materialLibraryAnchor !== null}
        historyOpen={historyAnchor !== null}
      />
      <MaterialLibraryPanel
        open={materialLibraryAnchor !== null}
        anchor={materialLibraryAnchor}
        materials={materials}
        onClose={() => setMaterialLibraryAnchor(null)}
        onSelectMaterial={handleSelectMaterial}
        onDeleteMaterial={deleteMaterial}
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
      <MaterialLibraryDialog
        source={pendingMaterialSource}
        existingMaterials={materials}
        onClose={() => setPendingMaterialSource(null)}
        onConfirm={handleConfirmAddMaterial}
      />
      <CropOverlay
        data={cropMode}
        onClose={handleCloseCrop}
        onConfirm={(nodeId, cropRect) => void handleConfirmCrop(nodeId, cropRect)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="sr-only"
        onChange={handleUploadInputChange}
      />
      <ApiSettingsPanel
        key={apiSettingsOpen ? 'api-settings-open' : 'api-settings-closed'}
        open={apiSettingsOpen}
        initialSettings={apiSettings}
        onClose={() => setApiSettingsOpen(false)}
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
