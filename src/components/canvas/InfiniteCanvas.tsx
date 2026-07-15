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
  Grid3x3,
  Map as MapIcon,
  MousePointer2,
  Plus,
  Video,
  Volume2,
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
  Pencil,
  Square,
  Type as TypeIcon,
  Eraser,
  Trash2,
  Save,
  Undo2,
  Redo2,
  RotateCw,
  CircleDot,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Panel,
  useReactFlow,
  useUpdateNodeInternals,
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
  applyNodeChanges,
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
  readUserScopedCanvasSetting,
  type StoredApiSettings,
  runCanvasUserScopedOperation,
  useCanvasStore,
  writeUserScopedCanvasSetting,
} from '@/store/canvas-store';
import {
  createProjectAtParentDirectory,
  pickProjectParentDirectory,
} from '@/lib/project-storage';
import {
  UPDATE_REFRESH_VIEWPORT_REQUEST_EVENT,
  clearUpdateRefreshRestoreState,
  mergeUpdateRefreshRestoreViewport,
  readUpdateRefreshRestoreState,
} from '@/lib/update-refresh-restore';
import {
  createHostedCanvasImageData,
  createPendingCanvasImageData,
  type CanvasImageAssetUploadKind,
  type CanvasImageDerivativeOptions,
} from '@/lib/canvas-image-assets';
import { uploadImageAsset } from '@/lib/browser-oss-upload';
import { layoutAgentWorkflowNodes } from '@/lib/canvas/agent-layout';
import { THREE_VIEW_DEFAULT_ANGLE } from '@/lib/three-view-defaults';
import type {
  CanvasEdge,
  CanvasNode,
  AudioGenerationNodeData,
  AudioNodeData,
  DirectorNodeData,
  ImageHistoryItem,
  MaterialLibraryItem,
  NodeGroup,
  NodeType,
  StoryboardScriptNodeData,
  TextNodeData,
  ImageGenerationNodeData,
  AITextResultNodeData,
  ImageNodeData,
  Panorama360NodeData,
  Panorama360ViewState,
  UploadedImageNodeData,
  VideoNodeData,
  VideoGenerationNodeData,
  VideoUpscaleNodeData,
  ImageAnnotation,
  StoryboardGridCellImage,
  StoryboardGridNodeData,
  StoryboardGridSize,
} from '@/types/canvas';
import { getStoryboardCardSize } from '@/lib/storyboard/layout';
import type {
  AgentActionNodeRef,
  AgentExecutionPlan,
  AgentTaskAttachment,
  CanvasAgentAction,
} from '@/types/agent';
import type { ZipImageDownloadItem } from '@/lib/image-zip-download';

import { TextNode } from '../nodes/TextNode';
import { shouldFocusNodeOnDoubleClick } from '@/lib/canvas/node-double-click';
import { StoryboardScriptNode } from '../nodes/StoryboardScriptNode';
import {
  getStoryboardGridCellCount,
  getStoryboardGridNodeSize,
  getStoryboardGridAspectValue,
  parseStoryboardGridSize,
  StoryboardGridNode,
  STORYBOARD_GRID_EMPTY_HINT_HEIGHT,
  STORYBOARD_GRID_TITLE_HEIGHT,
  type StoryboardGridDropTarget,
} from '../nodes/StoryboardGridNode';
import { ImageGenerationNode } from '../nodes/ImageGenerationNode';
import {
  VideoGenerationNode,
  type VideoGenerationToolbarAction,
} from '../nodes/VideoGenerationNode';
import { AudioGenerationNode } from '../nodes/AudioGenerationNode';
import { VideoUpscaleNode } from '../nodes/VideoUpscaleNode';
import { getVideoModelLabel } from '../nodes/VideoGenerationPromptBar';
import { AITextResultNode } from '../nodes/AITextResultNode';
import { Panorama360Node } from '../nodes/Panorama360Node';
import {
  DirectorNode,
  DIRECTOR_NODE_CARD_HEIGHT,
  DIRECTOR_NODE_CARD_WIDTH,
  DIRECTOR_NODE_TITLE_HEIGHT,
} from '../nodes/DirectorNode';
import { DirectorDeskFullscreen } from '@/components/director-desk/DirectorDeskFullscreen';
import type { DirectorDeskCaptureToCanvas } from '@/components/director-desk/editor/io/hostBridge';
import { UploadedImageNode } from '../nodes/UploadedImageNode';
import {
  UploadedVideoNode,
  resolveUploadedVideoCardDimensions,
} from '../nodes/UploadedVideoNode';
import {
  UploadedAudioNode,
  UPLOADED_AUDIO_CARD_HEIGHT,
  UPLOADED_AUDIO_CARD_WIDTH,
} from '../nodes/UploadedAudioNode';
import { CardSideHandle, MagneticSidePlus } from '../nodes/CardSideHandle';
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
import { CanvasContextMenu, getCanvasContextMenuPosition, type CanvasContextMenuPlatform } from './CanvasContextMenu';
import { NodeContextMenu } from './NodeContextMenu';
import { CanvasHeader } from './CanvasHeader';
import { CanvasAgentPanel } from './CanvasAgentPanel';
import UniqueLoading from '../ui/grid-loading';
import { CanvasToolbar } from './CanvasToolbar';
import { GenerationHistoryPopover } from './GenerationHistoryPopover';
import {
  MaterialLibraryDialog,
  type MaterialLibraryDialogMode,
  type PendingMaterialSource,
} from './MaterialLibraryDialog';
import { MaterialLibraryPanel } from './MaterialLibraryPanel';
import { PromptLibraryDialog } from './PromptLibraryDialog';
import { PromptLibraryEntryButton } from './PromptLibraryEntryButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { AGENT_PANEL_FLOATING_INSET } from '@/lib/agent-panel-layout';
import { downloadImageGenerationResult } from '@/lib/image-download';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';
import { createVideoClipJob, pollVideoClipJob } from '@/lib/video/clip-client';
import type { CreateVideoClipJobRequest } from '@/lib/video/clip-types';
import { ensureVideoProcessingSourceUrl } from '@/lib/video/source-upload';
import { getImageHistoryDisplayPrompt } from '@/lib/image-prompt';
import { validateCanvasAgentActions } from '@/lib/agent-actions';
import {
  createAgentAttachmentFromNode,
  getNodeClipboardContent,
  getNodeExport,
  isNodeRenameable,
  type NodeExport,
} from '@/lib/canvas/node-context-actions';
import { writeClipboardContent } from '@/lib/clipboard-content';
import { areCanvasNodesSynced } from '@/lib/project-open-transition';
import {
  CreateProjectDialog,
  getProjectDirectoryLabel,
  type CreateProjectDraft,
} from '@/components/project/CreateProjectDialog';
import { DeleteProjectDialog } from '@/components/project/DeleteProjectDialog';
import { ThreeViewController } from '../nodes/ThreeViewController';
import type { ThreeViewControllerValue } from '../nodes/ThreeViewController';
import type { PromptLibraryEntry } from '@/features/prompt-library/types';

let notifyPromptBarInteraction: (() => void) | null = null;
let notifyImageToolbarAction:
  | ((action: string, data: ImageGenerationNodeData) => void)
  | null = null;
let notifyUploadedImageToolbarAction:
  | ((action: ImageGenerationToolbarAction, nodeId: string, data: UploadedImageNodeData, cardLayout: { left: number; top: number; width: number; height: number } | null) => void)
  | null = null;
let notifyImageNodeCropRequest:
  | ((nodeId: string, data: ImageNodeData, cardDimensions: { width: number; height: number }, imageUrl: string, mode?: 'crop' | 'annotate') => void)
  | null = null;
let notifyMaterialLibraryRequest:
  | ((source: PendingMaterialSource) => void)
  | null = null;
const MATERIAL_LIBRARY_REQUEST_EVENT = 'genlink:material-library-request';
let notifyImageGenerationNodeSelect:
  | ((nodeId: string) => void)
  | null = null;
let notifyCanvasNodeSelect:
  | ((nodeId: string) => void)
  | null = null;
let notifyDirectorDeskOpen:
  | ((nodeId: string) => void)
  | null = null;
let notifyCanvasImageInfoRequest:
  | ((nodeId: string) => void)
  | null = null;
let notifyCanvasImageLightboxRequest:
  | ((nodeId: string) => void)
  | null = null;
let notifyImageGenerationReferenceUpload:
  | ((nodeId: string) => void)
  | null = null;
let notifyTextReferenceUpload:
  | ((nodeId: string) => void)
  | null = null;
let notifyVideoGenerationReferenceUpload:
  | ((nodeId: string) => void)
  | null = null;
let notifyStoryboardReferenceUpload:
  | ((nodeId: string) => void)
  | null = null;
let notifyStoryboardGridCellUpload:
  | ((nodeId: string, cellIndex: number, file: File) => Promise<void>)
  | null = null;
let notifyStoryboardGridCompose:
  | ((nodeId: string) => Promise<void>)
  | null = null;
let notifyStoryboardGridCellPreview:
  | ((data: ImageLightboxData) => void)
  | null = null;
let notifyQuickReferenceConnectRequest:
  | ((mode: QuickReferenceConnectMode) => void)
  | null = null;
let notifyAgentPanelOpenRequest: (() => void) | null = null;
let notifyPanorama360NavigationActiveChange:
  | ((nodeId: string, active: boolean) => void)
  | null = null;
let notifyPanorama360UploadRequest:
  | ((nodeId: string, file: File) => void)
  | null = null;

function createStoryboardGridDropTargetStore() {
  let snapshot: StoryboardGridDropTarget | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot: (next: StoryboardGridDropTarget | null) => {
      if (
        snapshot?.nodeId === next?.nodeId &&
        snapshot?.cellIndex === next?.cellIndex
      ) {
        return;
      }

      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const storyboardGridDropTargetStore = createStoryboardGridDropTargetStore();

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

  return `${Math.round(width)}*${Math.round(height)}`;
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
    image.src = getBrowserImageDisplayUrl(imageUrl);
  });
}

async function readRemoteImageSizeBytes(imageUrl: string): Promise<number | undefined> {
  if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) {
    return undefined;
  }

  const response = await fetch(
    `/api/image-hosting/read?url=${encodeURIComponent(imageUrl)}`,
    {
      cache: 'no-store',
      headers: {
        Range: 'bytes=0-0',
      },
    },
  );

  try {
    if (!response.ok) {
      return undefined;
    }

    const contentRange = response.headers.get('content-range');
    const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
    const rawSize = rangeTotal || (response.status === 200
      ? response.headers.get('content-length')
      : null);
    const sizeBytes = rawSize ? Number(rawSize) : 0;

    return Number.isSafeInteger(sizeBytes) && sizeBytes > 0
      ? sizeBytes
      : undefined;
  } finally {
    await response.body?.cancel();
  }
}

async function resolveImageInfoPopoverMetadata(
  base: ImageGenerationInfoPopoverData,
  imageUrl: string,
): Promise<ImageGenerationInfoPopoverData> {
  const [dimensionsResult, sizeResult] = await Promise.allSettled([
    readImageDimensions(imageUrl),
    base.size === '-' ? readRemoteImageSizeBytes(imageUrl) : Promise.resolve(undefined),
  ]);

  return {
    ...base,
    resolution: dimensionsResult.status === 'fulfilled'
      ? formatImageResolution(dimensionsResult.value.width, dimensionsResult.value.height)
      : base.resolution,
    size: sizeResult.status === 'fulfilled' && sizeResult.value
      ? formatImageSize(sizeResult.value)
      : base.size,
  };
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

function toImageNodeLightboxData(
  data: ImageNodeData,
): ImageLightboxData | null {
  const imageUrl =
    data.hostedImageUrl?.trim() ||
    data.imageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    imageUrl,
    alt: data.title || data.prompt || 'image',
    width: data.width,
    height: data.height,
  };
}

function toStoryboardGridCellLightboxData(
  data: StoryboardGridCellImage,
): ImageLightboxData | null {
  const imageUrl =
    data.hostedImageUrl?.trim() ||
    data.previewUrl?.trim() ||
    data.imageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    imageUrl,
    alt: data.title || data.fileName || 'storyboard grid image',
    width: data.width,
    height: data.height,
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
    title: 'Video',
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
    title: 'Generated video',
    model: getVideoModelLabel(data.generatedModel?.trim() || data.model?.trim() || '-'),
    format: inferVideoFormatFromData({
      videoUrl,
      width: 0,
      height: 0,
      fileName: data.generatedOutputFileName,
      mimeType: 'video/mp4',
    }),
    size: '-',
    resolution: formatVideoResolutionFromPreset(data.resolution, data.ratio),
    createdTime: formatGeneratedAt(data.generatedAt) || undefined,
  };
}

function toVideoUpscaleInfoPopoverData(
  data: VideoUpscaleNodeData,
  sourceVideo?: { width?: number; height?: number } | null,
): ImageGenerationInfoPopoverData | null {
  const videoUrl = data.hostedVideoUrl?.trim() || data.videoUrl?.trim();

  if (!videoUrl) {
    return null;
  }

  return {
    title: 'RunningHub video',
    model: 'RunningHub video',
    format: inferVideoFormatFromData({
      videoUrl,
      width: 0,
      height: 0,
      fileName: data.generatedOutputFileName,
      mimeType: 'video/mp4',
    }),
    size: formatImageSize(data.sizeBytes),
    resolution: formatImageResolution(data.width, data.height) !== '-'
      ? formatImageResolution(data.width, data.height)
      : formatVideoResolutionFromPreset(
          data.targetResolution,
          sourceVideo?.width && sourceVideo.height
            ? `${sourceVideo.width}:${sourceVideo.height}`
            : undefined,
        ),
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

function toCanvasNodeInfoPopoverData(
  node: CanvasNode | ReactFlowNode,
): ImageGenerationInfoPopoverData | null {
  if (node.type === 'image_generation') {
    return toImageInfoPopoverData(node.data as ImageGenerationNodeData);
  }

  if (node.type === 'image') {
    return toImageNodeInfoPopoverData(node.data as ImageNodeData);
  }

  if (node.type === 'uploaded_image') {
    return toUploadedImageInfoPopoverData(node.data as UploadedImageNodeData);
  }

  if (node.type === 'video') {
    return toVideoInfoPopoverData(node.data as VideoNodeData);
  }

  if (node.type === 'video_generation') {
    return toVideoGenerationInfoPopoverData(node.data as VideoGenerationNodeData);
  }

  if (node.type === 'video_upscale') {
    const data = node.data as VideoUpscaleNodeData;
    const sourceVideo = useCanvasStore
      .getState()
      .getConnectedVideoForVideoUpscaleNode(node.id);

    return toVideoUpscaleInfoPopoverData(data, sourceVideo);
  }

  return null;
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

  return resolveImageInfoPopoverMetadata(base, imageUrl);
}

async function toResolvedImageNodeInfoPopoverData(
  data: ImageNodeData,
): Promise<ImageGenerationInfoPopoverData> {
  const base = toImageNodeInfoPopoverData(data);
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return base;
  }

  return resolveImageInfoPopoverMetadata(base, imageUrl);
}

async function toResolvedUploadedImageInfoPopoverData(
  data: UploadedImageNodeData,
): Promise<ImageGenerationInfoPopoverData> {
  const base = toUploadedImageInfoPopoverData(data);
  const imageUrl = data.hostedImageUrl?.trim() || data.imageUrl?.trim();

  if (!imageUrl) {
    return base;
  }

  return resolveImageInfoPopoverMetadata(base, imageUrl);
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

  if (node.type === 'video_upscale') {
    const data = node.data as VideoUpscaleNodeData;
    const sourceVideo = useCanvasStore
      .getState()
      .getConnectedVideoForVideoUpscaleNode(node.id);

    return toVideoUpscaleInfoPopoverData(data, sourceVideo);
  }

  return null;
}

function isCanvasMediaInfoNodeType(type: string): type is CanvasNode['type'] {
  return type === 'image_generation' || type === 'image' || type === 'uploaded_image' || type === 'video' || type === 'video_generation' || type === 'video_upscale';
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

function parseVideoResolutionPreset(value?: string): number | null {
  switch (value) {
    case '480p':
      return 480;
    case '720p':
      return 720;
    case '1080p':
      return 1080;
    case '4k':
      return 2160;
    default:
      return null;
  }
}

function formatVideoResolutionFromPreset(
  resolution?: string,
  aspectRatioValue?: string,
): string {
  const base = parseVideoResolutionPreset(resolution);

  if (!base) {
    return '-';
  }

  const aspectRatio = parseCanvasAspectRatio(aspectRatioValue) ?? 16 / 9;

  if (aspectRatio >= 1) {
    return formatImageResolution(base * aspectRatio, base);
  }

  return formatImageResolution(base, base / aspectRatio);
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

function resolveVideoUpscaleCardDimensions(
  sourceVideo?: {
    width?: number;
    height?: number;
  } | null,
): { width: number; height: number } {
  const width = sourceVideo?.width;
  const height = sourceVideo?.height;

  if (!width || !height || width <= 0 || height <= 0) {
    return resolveAspectDrivenCardDimensions('16:9');
  }

  return resolveAspectDrivenCardDimensions(`${width}:${height}`);
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

  if (node.type === 'storyboard_script') {
    const dimensions = getStoryboardCardSize(node.data as StoryboardScriptNodeData);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: dimensions.width,
      height: dimensions.height,
      radius: 18,
    };
  }

  if (node.type === 'storyboard_grid') {
    const data = node.data as StoryboardGridNodeData;
    const size = getStoryboardGridNodeSize(data);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: size.width,
      height: size.height,
      radius: 14,
    };
  }

  if (node.type === 'image_generation') {
    const data = node.data as ImageGenerationNodeData;
    const referenceImages = data.aspectRatio === 'auto'
      ? useCanvasStore.getState().getConnectedImagesForImageGenerationNode(node.id)
      : undefined;
    const dimensions = resolveImageGenerationCardDimensions(data, referenceImages);

    return {
      x: node.position.x,
      y: node.position.y,
      width: dimensions.width,
      height: dimensions.height,
      radius: 18,
    };
  }

  if (node.type === 'video_generation') {
    const data = node.data as VideoGenerationNodeData;
    const dimensions = resolveAspectDrivenCardDimensions(data.ratio);

    return {
      x: node.position.x,
      y: node.position.y,
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

  if (node.type === 'director') {
    return {
      x: node.position.x,
      y: node.position.y + DIRECTOR_NODE_TITLE_HEIGHT,
      width: DIRECTOR_NODE_CARD_WIDTH,
      height: DIRECTOR_NODE_CARD_HEIGHT,
      radius: 12,
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

type CanvasAlignmentGuide = {
  id: string;
  orientation: 'horizontal' | 'vertical';
  start: number;
  end: number;
  position: number;
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

  if (node.type === 'storyboard_script') {
    const dimensions = getStoryboardCardSize(node.data as StoryboardScriptNodeData);

    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: dimensions.width,
      height: dimensions.height + 36,
    };
  }

  if (node.type === 'storyboard_grid') {
    return getStoryboardGridNodeBounds(node);
  }

  if (node.type === 'image_generation') {
    const data = node.data as ImageGenerationNodeData;
    const referenceImages = data.aspectRatio === 'auto'
      ? useCanvasStore.getState().getConnectedImagesForImageGenerationNode(node.id)
      : undefined;
    const dimensions = resolveImageGenerationCardDimensions(data, referenceImages);

    return {
      x: node.position.x,
      y: node.position.y,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  if (node.type === 'video_generation') {
    const data = node.data as VideoGenerationNodeData;
    const dimensions = resolveAspectDrivenCardDimensions(data.ratio);

    return {
      x: node.position.x,
      y: node.position.y,
      width: dimensions.width,
      height: dimensions.height,
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

  if (node.type === 'audio') {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: UPLOADED_AUDIO_CARD_WIDTH,
      height: UPLOADED_AUDIO_CARD_HEIGHT + 36,
    };
  }

  if (node.type === 'audio_generation') {
    return {
      x: node.position.x,
      y: node.position.y,
      width: UPLOADED_AUDIO_CARD_WIDTH,
      height: UPLOADED_AUDIO_CARD_HEIGHT,
    };
  }

  if (node.type === 'video_upscale') {
    const sourceVideo = useCanvasStore
      .getState()
      .getConnectedVideoForVideoUpscaleNode(node.id);
    const dimensions = resolveVideoUpscaleCardDimensions(sourceVideo);

    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: Math.max(VIDEO_UPSCALE_PANEL_WIDTH, dimensions.width),
      height:
        VIDEO_UPSCALE_TITLE_HEIGHT +
        dimensions.height +
        VIDEO_UPSCALE_PANEL_TOP_GAP +
        VIDEO_UPSCALE_PANEL_HEIGHT,
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

  if (node.type === 'director') {
    return {
      x: node.position.x,
      y: node.position.y - 8,
      width: DIRECTOR_NODE_CARD_WIDTH,
      height: DIRECTOR_NODE_TITLE_HEIGHT + DIRECTOR_NODE_CARD_HEIGHT + 8,
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

function getAlignmentGuideNodeBounds(node: CanvasNode | ReactFlowNode): MultiNodeSelectionBounds {
  if (node.type === 'text') {
    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: TEXT_NODE_CARD_WIDTH,
      height: TEXT_NODE_CARD_HEIGHT,
    };
  }

  if (node.type === 'storyboard_script') {
    const dimensions = getStoryboardCardSize(node.data as StoryboardScriptNodeData);

    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  if (node.type === 'storyboard_grid') {
    const bounds = getStoryboardGridNodeBounds(node);

    return {
      ...bounds,
      y: node.position.y + STORYBOARD_GRID_TITLE_HEIGHT,
      height: Math.max(0, bounds.height - STORYBOARD_GRID_TITLE_HEIGHT),
    };
  }

  if (node.type === 'image_generation') {
    return getEstimatedNodeBounds(node);
  }

  if (node.type === 'uploaded_image') {
    const dimensions = resolveUploadedImageCardDimensions(node.data as UploadedImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y + IMAGE_NODE_ADAPTER_TOP_PADDING,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  if (node.type === 'video') {
    const dimensions = resolveUploadedVideoCardDimensions(node.data as VideoNodeData);

    return {
      x: node.position.x,
      y: node.position.y + IMAGE_NODE_ADAPTER_TOP_PADDING,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  if (node.type === 'image') {
    const dimensions = resolveImageNodeCardDimensions(node.data as ImageNodeData);

    return {
      x: node.position.x,
      y: node.position.y + IMAGE_NODE_ADAPTER_TOP_PADDING,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  if (node.type === 'panorama-360') {
    return {
      x: node.position.x,
      y: node.position.y + 18,
      width: 720,
      height: 405,
    };
  }

  if (node.type === 'director') {
    return {
      x: node.position.x,
      y: node.position.y + DIRECTOR_NODE_TITLE_HEIGHT,
      width: DIRECTOR_NODE_CARD_WIDTH,
      height: DIRECTOR_NODE_CARD_HEIGHT,
    };
  }

  return getEstimatedNodeBounds(node);
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

function getNodeGroupBounds(node: CanvasNode | ReactFlowNode): MultiNodeSelectionBounds {
  const bounds = getEstimatedNodeBounds(node);

  if (
    node.type === 'image_generation' ||
    node.type === 'video_generation' ||
    node.type === 'audio_generation'
  ) {
    return {
      ...bounds,
      y: bounds.y - GENERATION_NODE_GROUP_TOP_RESERVE,
      height: bounds.height + GENERATION_NODE_GROUP_TOP_RESERVE,
    };
  }

  return bounds;
}

function getBoundsForNodes(nodes: CanvasNode[], padding = 56): MultiNodeSelectionBounds | null {
  const bounds = getBoundsForRects(nodes.map((node) => getNodeGroupBounds(node)));

  if (!bounds) {
    return null;
  }

  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function getAgentGroupName(plan: AgentExecutionPlan, generationCount: number): string {
  const title = plan.title?.trim() || 'Agent batch generation';

  if (generationCount > 1 && !title.includes('batch') && !title.includes('group') && !title.includes('??') && !title.includes('?')) {
    return title + ' batch generation';
  }

  return title;
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

type ImportedAudioData = AudioNodeData;

type ReadImageFileOptions = {
  folder?: 'images' | 'references';
};

type MediaUploadUrlResponse =
  | {
      ok: true;
      result: {
        uploadUrl: string;
        mediaUrl: string;
        headers: Record<string, string>;
      };
    }
  | { ok: false; error: string };

type MediaUploadResponse =
  | {
      ok: true;
      result: {
        mediaUrl: string;
      };
    }
  | { ok: false; error: string };

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';

      if (!imageUrl) {
        reject(new Error('Invalid image file'));
        return;
      }

      resolve(imageUrl);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function readImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 320,
        height: image.naturalHeight || image.height || 320,
      });
    };
    image.onerror = () => reject(new Error('Invalid image file'));
    image.src = getBrowserImageDisplayUrl(url);
  });
}

function createCanvasImageDerivativeDataUrl(
  dataUrl: string,
  options: CanvasImageDerivativeOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;

      if (!sourceWidth || !sourceHeight) {
        reject(new Error('Invalid image dimensions'));
        return;
      }

      const scale = Math.min(1, options.maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Failed to create image preprocessing canvas'));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(options.mimeType, options.quality));
    };
    image.onerror = () => reject(new Error('Failed to preprocess image'));
    image.src = getBrowserImageDisplayUrl(dataUrl);
  });
}

async function uploadCanvasImageAssetDataUrl(
  dataUrl: string,
  fileName: string | undefined,
  kind: CanvasImageAssetUploadKind = 'original',
  baseFolder: 'images' | 'references' = 'images',
): Promise<string> {
  const folderByKind: Record<CanvasImageAssetUploadKind, string> = {
    original: baseFolder,
    preview: `${baseFolder}/previews`,
    semantic: `${baseFolder}/semantic`,
  };
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const uploaded = await uploadImageAsset({
    data: blob,
    contentType: blob.type || 'image/png',
    fileName,
    folder: folderByKind[kind],
  });

  return uploaded.hostedUrl;
}

async function uploadCanvasOriginalImageFile(
  file: File,
  kind: CanvasImageAssetUploadKind = 'original',
  baseFolder: 'images' | 'references' = 'images',
): Promise<string> {
  const folderByKind: Record<CanvasImageAssetUploadKind, string> = {
    original: baseFolder,
    preview: `${baseFolder}/previews`,
    semantic: `${baseFolder}/semantic`,
  };
  const uploaded = await uploadImageAsset({
    data: file,
    contentType: file.type || 'application/octet-stream',
    fileName: file.name,
    folder: folderByKind[kind],
  });

  return uploaded.hostedUrl;
}

function readImageFile(
  file: File,
  options: ReadImageFileOptions = {},
): Promise<ImportedImageData> {
  const folder = options.folder ?? 'images';

  return createHostedCanvasImageData(file, {
    readImageDataUrl: readImageFileAsDataUrl,
    readImageDimensions: readImageDimensionsFromUrl,
    createDerivativeDataUrl: createCanvasImageDerivativeDataUrl,
    uploadOriginalImageFile: (imageFile, kind) =>
      uploadCanvasOriginalImageFile(imageFile, kind, folder),
    uploadImageDataUrl: (dataUrl, fileName, kind) =>
      uploadCanvasImageAssetDataUrl(dataUrl, fileName, kind, folder),
  });
}

async function createPendingImageImportNode(
  file: File,
  position: { x: number; y: number },
): Promise<{ node: CanvasNode; localPreviewUrl: string }> {
  const localPreviewUrl = URL.createObjectURL(file);

  try {
    const dimensions = await readImageDimensionsFromUrl(localPreviewUrl);
    return {
      node: createImportedImageNode(
        createPendingCanvasImageData(file, {
          previewUrl: localPreviewUrl,
          dimensions,
        }),
        position,
      ),
      localPreviewUrl,
    };
  } catch (error) {
    URL.revokeObjectURL(localPreviewUrl);
    throw error;
  }
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

async function readAudioFile(file: File): Promise<ImportedAudioData> {
  const uploaded = await uploadMediaFileToOss(file);

  return {
    title: file.name,
    audioUrl: uploaded.url,
    hostedAudioUrl: uploaded.url,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    status: 'idle',
  };
}

async function createPendingVideoImportNode(
  file: File,
  position: { x: number; y: number },
): Promise<{ node: CanvasNode; localVideoUrl: string }> {
  const localVideoUrl = URL.createObjectURL(file);
  const videoFrame = await captureVideoFirstFrame(file).catch(() => null);

  return {
    node: createImportedVideoNode(
      {
        title: file.name,
        videoUrl: localVideoUrl,
        previewUrl: videoFrame?.previewUrl,
        fileName: file.name,
        width: videoFrame?.width ?? 320,
        height: videoFrame?.height ?? 180,
        sizeBytes: file.size,
        durationSeconds: videoFrame?.durationSeconds,
        mimeType: file.type || 'application/octet-stream',
        status: 'generating',
        statusMessage: 'Uploading...',
      },
      position,
    ),
    localVideoUrl,
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
  if (file.type.startsWith('image/')) {
    const uploaded = await uploadImageAsset({
      data: file,
      contentType: file.type || 'image/png',
      fileName: file.name,
      folder: 'references/images',
    });

    return {
      url: uploaded.hostedUrl,
      fileName: file.name,
      mimeType: file.type || 'image/png',
      sizeBytes: file.size,
    };
  }

  const folder = file.type.startsWith('video/')
    ? 'references/videos'
    : file.type.startsWith('audio/')
      ? 'references/audio'
      : 'references/images';
  let response: Response;

  try {
    response = await fetch('/api/media-hosting/upload-url', {
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
  } catch (error) {
    throw new Error(
      `无法连接媒体上传服务：${error instanceof Error ? error.message : 'Failed to fetch'}`,
    );
  }

  const json = await readMediaUploadUrlResponse(response);

  if (!response.ok || !json.ok) {
    throw new Error('error' in json ? json.error : 'Media upload URL creation failed');
  }

  let uploadedMediaUrl = json.result.mediaUrl;
  let uploadResponse: Response;

  try {
    uploadResponse = await fetch(json.result.uploadUrl, {
      method: 'PUT',
      headers: json.result.headers,
      body: file,
    });
  } catch (error) {
    const uploadHost = getUploadUrlHost(json.result.uploadUrl);
    const origin = typeof window !== 'undefined' ? window.location.origin : '当前站点';

    console.warn(
      [
        `Direct media upload to OSS failed${uploadHost ? ` (${uploadHost})` : ''}: ${error instanceof Error ? error.message : 'Failed to fetch'}.`,
        `Falling back to server upload. Check OSS CORS if this keeps happening for ${origin}.`,
      ].join(' '),
    );

    uploadedMediaUrl = await uploadMediaFileViaServer(file, folder);
    uploadResponse = new Response(null, { status: 200 });
  }

  if (!uploadResponse.ok) {
    uploadedMediaUrl = await uploadMediaFileViaServer(file, folder);
  }

  return {
    url: uploadedMediaUrl,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

async function uploadMediaFileViaServer(file: File, folder: string): Promise<string> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('fileName', file.name);
  formData.set('folder', folder);

  const response = await fetch('/api/media-hosting/upload', {
    method: 'POST',
    body: formData,
  });
  const json = await readMediaUploadResponse(response);

  if (!response.ok || !json.ok) {
    throw new Error('error' in json ? json.error : `Media server upload failed (${response.status})`);
  }

  return json.result.mediaUrl;
}

async function readMediaUploadUrlResponse(response: Response): Promise<MediaUploadUrlResponse> {
  const fallback = response.ok
    ? 'Media upload URL creation returned an invalid response'
    : `Media upload URL creation failed (${response.status})`;
  const text = await response.text().catch(() => '');

  if (!text.trim()) {
    return { ok: false, error: fallback };
  }

  try {
    return JSON.parse(text) as MediaUploadUrlResponse;
  } catch {
    return { ok: false, error: fallback };
  }
}

async function readMediaUploadResponse(response: Response): Promise<MediaUploadResponse> {
  const fallback = response.ok
    ? 'Media upload returned an invalid response'
    : `Media upload failed (${response.status})`;
  const text = await response.text().catch(() => '');

  if (!text.trim()) {
    return { ok: false, error: fallback };
  }

  try {
    return JSON.parse(text) as MediaUploadResponse;
  } catch {
    return { ok: false, error: fallback };
  }
}

function getUploadUrlHost(uploadUrl: string): string {
  try {
    return new URL(uploadUrl).host;
  } catch {
    return '';
  }
}

async function createPendingMediaReference(file: File) {
  const videoFrame = file.type.startsWith('video/')
    ? await captureVideoFirstFrame(file).catch(() => null)
    : null;
  const localUrl = URL.createObjectURL(file);

  return {
    reference: {
      id: crypto.randomUUID(),
      url: localUrl,
      hostedUrl: undefined,
      previewUrl: file.type.startsWith('image/') ? localUrl : videoFrame?.previewUrl,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      width: videoFrame?.width,
      height: videoFrame?.height,
      durationSeconds: videoFrame?.durationSeconds,
      uploadStatus: 'uploading' as const,
      uploadError: undefined,
    },
    localUrl,
  };
}

async function createPendingImageGenerationReference(file: File) {
  const localUrl = URL.createObjectURL(file);
  const dimensions = await readImageDimensionsFromUrl(localUrl).catch(() => null);

  return {
    reference: {
      id: crypto.randomUUID(),
      imageUrl: localUrl,
      hostedImageUrl: undefined,
      previewUrl: localUrl,
      fileName: file.name,
      width: dimensions?.width,
      height: dimensions?.height,
      sizeBytes: file.size,
      uploadStatus: 'uploading' as const,
      uploadError: undefined,
    },
    localUrl,
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

function createPendingAudioImportNode(
  file: File,
  position: { x: number; y: number },
): { node: CanvasNode; localAudioUrl: string } {
  const localAudioUrl = URL.createObjectURL(file);

  return {
    node: createImportedAudioNode(
      {
        title: file.name,
        audioUrl: localAudioUrl,
        previewUrl: localAudioUrl,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        status: 'generating',
        statusMessage: 'Uploading...',
      },
      position,
    ),
    localAudioUrl,
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

function createImportedAudioNode(
  data: AudioNodeData,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: 'audio',
    position,
    data,
  };
}

function toUploadedImageNodeData(data: ImportedImageData): UploadedImageNodeData {
  return {
    title: data.title,
    imageUrl: data.imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    previewUrl: data.previewUrl,
    semanticImageUrl: data.semanticImageUrl,
    fileName: data.fileName,
    width: data.width || 320,
    height: data.height || 320,
    sizeBytes: data.sizeBytes,
  };
}

function hasMaterialImageDimensions(item: MaterialLibraryItem): boolean {
  return Boolean(item.width && item.height && item.width > 0 && item.height > 0);
}

function materialMatchesImageGenerationNode(
  item: MaterialLibraryItem,
  data: ImageGenerationNodeData,
): boolean {
  const materialUrls = new Set([
    item.imageUrl.trim(),
    item.hostedImageUrl?.trim(),
    item.outputFileName ? `output:${item.outputFileName}` : undefined,
  ].filter((value): value is string => Boolean(value)));
  const generatedUrls = [
    data.generatedImageUrl?.trim(),
    data.generatedHostedImageUrl?.trim(),
    data.generatedOutputFileName ? `output:${data.generatedOutputFileName}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return generatedUrls.some((url) => materialUrls.has(url));
}

function resolveMaterialSourceDisplayDimensions(
  item: MaterialLibraryItem,
  nodes: CanvasNode[],
): { width: number; height: number } | undefined {
  if (item.displayWidth && item.displayHeight && item.displayWidth > 0 && item.displayHeight > 0) {
    return undefined;
  }

  for (const candidate of nodes) {
    if (candidate.type !== 'image_generation') {
      continue;
    }

    const data = candidate.data as ImageGenerationNodeData;
    if (!materialMatchesImageGenerationNode(item, data)) {
      continue;
    }

    const referenceImages = useCanvasStore.getState().getConnectedImagesForImageGenerationNode(candidate.id);
    return resolveImageGenerationCardDimensions(data, referenceImages);
  }

  return undefined;
}

async function createImageNodeFromMaterial(
  item: MaterialLibraryItem,
  position: { x: number; y: number },
  sourceDisplayDimensions?: { width: number; height: number },
): Promise<CanvasNode> {
  const imageUrl = item.hostedImageUrl?.trim() || item.imageUrl.trim();
  const resolvedDimensions = !hasMaterialImageDimensions(item)
    ? await readImageDimensionsFromUrl(imageUrl).catch(() => null)
    : null;
  const width = resolvedDimensions?.width || item.width || 320;
  const height = resolvedDimensions?.height || item.height || 320;
  const displayDimensions = resolveImageNodeCardDimensions({
    title: item.name,
    imageUrl,
    prompt: item.name || item.fileName || item.outputFileName || 'Image',
    generatedAt: item.createdAt || new Date().toISOString(),
    width,
    height,
    displayWidth: sourceDisplayDimensions?.width ?? item.displayWidth,
    displayHeight: sourceDisplayDimensions?.height ?? item.displayHeight,
  });

  return createImportedImageNode(
    {
      title: item.name,
      imageUrl,
      hostedImageUrl: imageUrl,
      prompt: item.name || item.fileName || item.outputFileName || 'Image',
      generatedAt: item.createdAt || new Date().toISOString(),
      width,
      height,
      displayWidth: displayDimensions.width,
      displayHeight: displayDimensions.height,
      sizeBytes: item.sizeBytes,
    },
    position,
  );
}

function resolveAgentCreatedNodeId(
  ref: AgentActionNodeRef,
  createdNodeIds: Map<string, string>,
): string | null {
  if (ref.kind === 'existing') {
    return ref.nodeId;
  }

  return createdNodeIds.get(ref.clientActionId) ?? null;
}

function createAgentSourceImageNodes(params: {
  attachments: AgentTaskAttachment[];
  startPosition: { x: number; y: number };
  existingNodeIds?: Set<string>;
}): { nodes: Array<Extract<CanvasNode, { type: 'image' }>>; nodeIdsByAttachmentId: Record<string, string> } {
  const nodes: Array<Extract<CanvasNode, { type: 'image' }>> = [];
  const nodeIdsByAttachmentId: Record<string, string> = {};

  params.attachments.forEach((attachment, index) => {
    if (attachment.sourceNodeId && params.existingNodeIds?.has(attachment.sourceNodeId)) {
      nodeIdsByAttachmentId[attachment.id] = attachment.sourceNodeId;
      return;
    }

    const nodeId = crypto.randomUUID();
    const node: Extract<CanvasNode, { type: 'image' }> = {
      id: nodeId,
      type: 'image',
      position: {
        x: params.startPosition.x,
        y: params.startPosition.y + index * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + 48),
      },
      data: {
        title: attachment.name || `Image ${index + 1}`,
        imageUrl: attachment.imageUrl,
        hostedImageUrl: attachment.hostedImageUrl ?? attachment.imageUrl,
        previewUrl: attachment.thumbnailUrl ?? attachment.previewUrl,
        semanticImageUrl: attachment.semanticImageUrl,
        fileName: attachment.name,
        prompt: attachment.name || `Image ${index + 1}`,
        width: attachment.width || 320,
        height: attachment.height || 320,
        sizeBytes: attachment.sizeBytes,
        generatedAt: new Date().toISOString(),
        status: 'idle',
      },
    };

    nodeIdsByAttachmentId[attachment.id] = nodeId;
    nodes.push(node);
  });

  return { nodes, nodeIdsByAttachmentId };
}

function createAgentGenerationNodesAndEdges(params: {
  actions: CanvasAgentAction[];
  startPosition: { x: number; y: number };
}): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  focusNodeId: string | null;
  imageGenerationNodeIds: string[];
  nodeIdMap: Record<string, string>;
} {
  const textActionIds = new Set(
    params.actions.flatMap((action) => (
      action.type === 'create_text_node' ? [action.clientActionId] : []
    )),
  );
  const generationActionIdsUsingTextInput = new Set<string>();

  for (const action of params.actions) {
    if (
      action.type === 'connect_nodes' &&
      action.sourceRef.kind === 'created' &&
      action.targetRef.kind === 'created' &&
      textActionIds.has(action.sourceRef.clientActionId)
    ) {
      generationActionIdsUsingTextInput.add(action.targetRef.clientActionId);
    }
  }
  const createdNodeIds = new Map<string, string>();
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  let generationIndex = 0;
  let textIndex = 0;
  let focusNodeId: string | null = null;
  const imageGenerationNodeIds: string[] = [];

  for (const action of params.actions) {
    if (action.type === 'create_text_node') {
      const nodeId = crypto.randomUUID();
      const position = action.position ?? {
        x: params.startPosition.x - 680,
        y: params.startPosition.y + textIndex * AGENT_IMAGE_GENERATION_NODE_ROW_SPACING,
      };
      const node: Extract<CanvasNode, { type: 'text' }> = {
        id: nodeId,
        type: 'text',
        position,
        data: {
          title: action.title || 'Agent Prompt',
          text: action.text,
          status: 'idle',
        },
      };

      textIndex += 1;
      createdNodeIds.set(action.clientActionId, nodeId);
      nodes.push(node);
      continue;
    }

    if (action.type === 'create_image_generation_node') {
      const nodeId = crypto.randomUUID();
      const position = action.position ?? {
        x: params.startPosition.x,
        y: params.startPosition.y + generationIndex * AGENT_IMAGE_GENERATION_NODE_ROW_SPACING,
      };
      const provider = action.options?.provider;
      const node: Extract<CanvasNode, { type: 'image_generation' }> = {
        id: nodeId,
        type: 'image_generation',
        position,
        data: {
          title: 'Agent Image',
          prompt: generationActionIdsUsingTextInput.has(action.clientActionId) ? '' : action.prompt,
          provider:
            provider === 'vibe' ||
            provider === 'fucheers' ||
            provider === 'comfly' ||
            provider === 'zhenzhen' ||
            provider === 'runninghub' ||
            provider === 'grsai'
              ? provider
              : undefined,
          model: action.options?.model,
          runningHubChannel: action.options?.runningHubChannel,
          aspectRatio: action.options?.aspectRatio ?? 'auto',
          quality: action.options?.quality ?? '1K',
          detail: 'medium',
          outputFormat: 'png',
          moderation: 'auto',
          parallelCount: 1,
          status: 'idle',
        },
      };

      generationIndex += 1;
      createdNodeIds.set(action.clientActionId, nodeId);
      focusNodeId = nodeId;
      imageGenerationNodeIds.push(nodeId);
      nodes.push(node);
      continue;
    }

    if (action.type === 'connect_nodes') {
      const source = resolveAgentCreatedNodeId(action.sourceRef, createdNodeIds);
      const target = resolveAgentCreatedNodeId(action.targetRef, createdNodeIds);

      if (!source || !target) {
        continue;
      }

      edges.push({
        id: crypto.randomUUID(),
        source,
        target,
        sourceHandle: action.sourceHandle,
        targetHandle: action.targetHandle,
      });
    }
  }

  return { nodes, edges, focusNodeId, imageGenerationNodeIds, nodeIdMap: Object.fromEntries(createdNodeIds) };
}

function createMaterialSourceFromImageGenerationData(
  data: ImageGenerationNodeData,
  displayDimensions?: { width: number; height: number },
): PendingMaterialSource | null {
  const imageUrl = data.generatedHostedImageUrl?.trim() || data.generatedImageUrl?.trim();

  if (!imageUrl) {
    return null;
  }

  return {
    defaultName: data.title?.trim() || 'Untitled material',
    imageUrl: data.generatedOutputFileName ? `output:${data.generatedOutputFileName}` : imageUrl,
    hostedImageUrl: imageUrl,
    outputFileName: data.generatedOutputFileName,
    fileName: data.generatedOutputFileName,
    sourceNodeType: 'image_generation',
    width: data.generatedImageWidth,
    height: data.generatedImageHeight,
    displayWidth: displayDimensions?.width,
    displayHeight: displayDimensions?.height,
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
    defaultName: data.title?.trim() || 'Untitled material',
    imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    sourceNodeType: 'image',
    width: data.width,
    height: data.height,
    displayWidth: data.displayWidth,
    displayHeight: data.displayHeight,
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
    defaultName: data.title?.trim() || data.fileName?.trim() || 'Untitled material',
    imageUrl,
    hostedImageUrl: data.hostedImageUrl,
    fileName: data.fileName,
    sourceNodeType: 'uploaded_image',
    width: data.width,
    height: data.height,
    displayWidth: data.displayWidth,
    displayHeight: data.displayHeight,
    sizeBytes: data.sizeBytes,
  };
}

function requestMaterialLibrarySave(source: PendingMaterialSource): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PendingMaterialSource>(MATERIAL_LIBRARY_REQUEST_EVENT, {
        detail: source,
      }),
    );
    return;
  }

  notifyMaterialLibraryRequest?.(source);
}

const TextNodeAdapter = memo(function TextNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateText = useCanvasStore((s) => s.generateTextFromTextNode);
  const removeReference = useCanvasStore((s) => s.removeReferenceFromNode);
  const connectedImages = useCanvasStore((s) => s.getConnectedImagesForTextNode(id));
  const connectedVideos = useCanvasStore((s) => s.getConnectedVideosForTextNode(id));
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
      connectedVideos={connectedVideos}
      onChange={(next) => updateNodeData<'text'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'text'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onStartEdit={() => {
        handleSelectNode();
        setEditing(true);
      }}
      onEndEdit={() => setEditing(false)}
      onRun={() => generateText(id)}
      onUpload={() => notifyTextReferenceUpload?.(id)}
      onQuickReferenceConnect={() => notifyQuickReferenceConnectRequest?.({
        targetKind: 'node',
        targetNodeId: id,
        targetType: 'text',
      })}
      onRemoveReference={(referenceId) => removeReference(id, referenceId)}
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

const StoryboardScriptNodeAdapter = memo(function StoryboardScriptNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateStoryboard = useCanvasStore((s) => s.generateStoryboardFromStoryboardNode);
  const removeReference = useCanvasStore((s) => s.removeReferenceFromNode);
  const connectedImages = useCanvasStore((s) => s.getConnectedImagesForStoryboardNode(id));
  const connectedVideos = useCanvasStore((s) => s.getConnectedVideosForStoryboardNode(id));
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
    <StoryboardScriptNode
      id={id}
      data={data as StoryboardScriptNodeData}
      selected={isActive}
      dragging={!!dragging}
      editing={editing}
      connectedImages={connectedImages}
      connectedVideos={connectedVideos}
      onChange={(next) => updateNodeData<'storyboard_script'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'storyboard_script'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onStartEdit={() => {
        handleSelectNode();
        setEditing(true);
      }}
      onEndEdit={() => setEditing(false)}
      onRun={() => generateStoryboard(id)}
      onUpload={() => notifyStoryboardReferenceUpload?.(id)}
      onQuickReferenceConnect={() => notifyQuickReferenceConnectRequest?.({
        targetKind: 'node',
        targetNodeId: id,
        targetType: 'storyboard_script',
      })}
      onRemoveReference={(referenceId) => removeReference(id, referenceId)}
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
  const upscaleMidjourneyGridImage = useCanvasStore((s) => s.upscaleMidjourneyGridImage);
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
  const cardDimensions = resolveImageGenerationCardDimensions(imageData, connectedImages);
  const controllerLeft = cardDimensions.width / 2 - THREE_VIEW_CONTROLLER_WIDTH / 2;
  const controllerTop = cardDimensions.height + THREE_VIEW_CONTROLLER_GAP;

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
        titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
        onRun={(promptOverride, options) => generateImage(id, promptOverride, options)}
        onMidjourneyUpscale={(quadrant) => upscaleMidjourneyGridImage(id, quadrant)}
        onUpload={() => notifyImageGenerationReferenceUpload?.(id)}
        onQuickReferenceConnect={() => notifyQuickReferenceConnectRequest?.({
          targetKind: 'node',
          targetNodeId: id,
          targetType: 'image_generation',
        })}
        onRemoveReference={(referenceImageId) => removeReferenceImage(id, referenceImageId)}
        onToolbarAction={(action) => {
          if (action === 'pan') {
            focusNodeViewport();
            setThreeViewControllerNodeId(threeViewOpen ? null : id);
            handleSelectNode();
            return;
          }

          if (action === 'organize') {
            const source = createMaterialSourceFromImageGenerationData(imageData, cardDimensions);
            if (source) {
              requestMaterialLibrarySave(source);
            }
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
                  const message = error instanceof Error ? error.message : '3D 视图生成失败';
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

const VideoGenerationNodeAdapter = memo(function VideoGenerationNodeAdapter({ id, data, selected, dragging, xPos, yPos }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateVideo = useCanvasStore((s) => s.generateVideoFromVideoGenerationNode);
  const removeReference = useCanvasStore((s) => s.removeReferenceFromNode);
  const createVideoUpscaleNode = useCanvasStore((s) => s.createVideoUpscaleNodeFromSource);
  const createImageNodeFromVideoFrame = useCanvasStore((s) => s.createImageNodeFromVideoFrame);
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
  const connectedAudio = (videoData.referenceAudio ?? []).map((reference, index) => ({
    id: reference.id,
    audioUrl: reference.hostedUrl?.trim() || reference.url,
    alt: reference.fileName || `Audio ${index + 1}`,
    fileName: reference.fileName,
    durationSeconds: reference.durationSeconds,
    uploadStatus: reference.uploadStatus,
    uploadError: reference.uploadError,
  }));
  const handleVideoCardClick = () => {
    if (videoData.hostedVideoUrl?.trim() || videoData.videoUrl?.trim()) {
      notifyCanvasImageInfoRequest?.(id);
      return;
    }

    handleSelectNode();
  };
  const cardDimensions = resolveAspectDrivenCardDimensions(videoData.ratio);
  const extractGeneratedVideoFrame = async (
    position: 'current' | 'first' | 'last',
    video: HTMLVideoElement,
  ) => {
    if (!video.videoWidth || !video.videoHeight) {
      useCanvasStore.getState().setSaveMessage('视频尚未准备好');
      window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
      return;
    }

    try {
      const originalTime = video.currentTime;
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : videoData.duration || 0;
      const targetTime = position === 'first'
        ? 0
        : position === 'last'
          ? Math.max(0, duration - 0.05)
          : originalTime;

      if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.01) {
        await new Promise<void>((resolve) => {
          const handleSeeked = () => {
            window.clearTimeout(timer);
            resolve();
          };
          const timer = window.setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            resolve();
          }, 900);

          video.addEventListener('seeked', handleSeeked, { once: true });
          video.currentTime = targetTime;
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas is not available');
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameTitle = position === 'first'
        ? 'First frame'
        : position === 'last'
          ? 'Last frame'
          : 'current';
      const nextNodeId = await createImageNodeFromVideoFrame({
        sourceNodeId: id,
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        title: frameTitle,
        position: {
          x: xPos + cardDimensions.width + 48,
          y: yPos,
        },
      });

      if (position !== 'current' && Number.isFinite(originalTime)) {
        video.currentTime = originalTime;
      }

      notifyCanvasNodeSelect?.(nextNodeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提取视频帧失败';
      useCanvasStore.getState().setSaveMessage(message);
      window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
    }
  };
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
      case 'video-upscale': {
        if (!videoUrl) {
          useCanvasStore.getState().setSaveMessage('没有可用于超分的视频');
          window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
          break;
        }

        const nextNodeId = createVideoUpscaleNode(id);
        notifyCanvasNodeSelect?.(nextNodeId);
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
      connectedAudio={connectedAudio}
      onChange={(next) => updateNodeData<'video_generation'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'video_generation'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onRun={(promptOverride) => generateVideo(id, promptOverride)}
      onUpload={() => notifyVideoGenerationReferenceUpload?.(id)}
      onQuickReferenceConnect={() => notifyQuickReferenceConnectRequest?.({
          targetKind: 'node',
          targetNodeId: id,
          targetType: 'video_generation',
        })}
      onRemoveReference={(referenceId) => removeReference(id, referenceId)}
      onToolbarAction={handleToolbarAction}
      onFrameCapture={(position, video) => void extractGeneratedVideoFrame(position, video)}
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

const AudioGenerationNodeAdapter = memo(function AudioGenerationNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateAudio = useCanvasStore((s) => s.generateAudioFromAudioGenerationNode);
  const separateAudio = useCanvasStore((s) => s.separateAudioFromNode);
  const removeReference = useCanvasStore((s) => s.removeReferenceFromNode);
  const renderData = data as CanvasNodeRenderData;
  const [promptFocused, setPromptFocused] = useState(false);
  const isActive = ((selected && renderData.canvasNodeActive) || promptFocused) && !dragging;
  const audioData = data as AudioGenerationNodeData;
  const referenceAudio = (audioData.referenceAudio ?? []).map((reference, index) => ({
    id: reference.id,
    audioUrl: reference.hostedUrl?.trim() || reference.url,
    alt: reference.fileName || `Audio ${index + 1}`,
    fileName: reference.fileName,
    durationSeconds: reference.durationSeconds,
    uploadStatus: reference.uploadStatus,
    uploadError: reference.uploadError,
  }));
  const handleSelectNode = () => notifyCanvasNodeSelect?.(id);

  useEffect(() => {
    const handleClearNodeUi = () => setPromptFocused(false);

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

  return (
    <AudioGenerationNode
      id={id}
      data={audioData}
      selected={isActive}
      dragging={!!dragging}
      referenceAudio={referenceAudio}
      onChange={(next) => updateNodeData<'audio_generation'>(id, next)}
      onRun={() => generateAudio(id)}
      onSeparateAudio={() => {
        void separateAudio(id);
      }}
      onTitleChange={(nextTitle) => updateNodeData<'audio_generation'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onUpload={() => notifyVideoGenerationReferenceUpload?.(id)}
      onQuickReferenceConnect={() => notifyQuickReferenceConnectRequest?.({
        targetKind: 'node',
        targetNodeId: id,
        targetType: 'audio_generation',
      })}
      onRemoveReference={(referenceId) => removeReference(id, referenceId)}
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

const VideoUpscaleNodeAdapter = memo(function VideoUpscaleNodeAdapter({ id, data, selected, dragging }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const runVideoUpscale = useCanvasStore((s) => s.runVideoUpscaleFromNode);
  const sourceVideo = useCanvasStore((s) => s.getConnectedVideoForVideoUpscaleNode(id));
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive && !dragging;
  const videoData = data as VideoUpscaleNodeData;
  const cardDimensions = resolveVideoUpscaleCardDimensions(sourceVideo);

  const handleSelectNode = () => {
    if (videoData.hostedVideoUrl?.trim() || videoData.videoUrl?.trim()) {
      notifyCanvasImageInfoRequest?.(id);
      return;
    }

    notifyCanvasNodeSelect?.(id);
  };

  return (
    <VideoUpscaleNode
      id={id}
      data={videoData}
      cardDimensions={cardDimensions}
      selected={isActive}
      dragging={!!dragging}
      sourceVideoAvailable={Boolean(sourceVideo)}
      onChange={(next) => updateNodeData<'video_upscale'>(id, next)}
      onTitleChange={(nextTitle) => updateNodeData<'video_upscale'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onRun={() => runVideoUpscale(id)}
      onSelectNode={handleSelectNode}
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
        titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
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
          requestMaterialLibrarySave(source);
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
        notifyCanvasImageLightboxRequest?.(id);
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
            const message = error instanceof Error ? error.message : '360 全景生成失败';
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
      case 'annotate': {
        const imageUrl = imageData.hostedImageUrl?.trim() || imageData.imageUrl?.trim();

        if (!imageUrl) {
          break;
        }

        notifyImageNodeCropRequest?.(id, imageData, cardDimensions, imageUrl, 'annotate');
        break;
      }
      case 'split-2x2-crop':
      case 'split-3x3-crop':
      case 'split-5x5-crop': {
        const dimension = action === 'split-2x2-crop' ? 2 : action === 'split-3x3-crop' ? 3 : 5;
        void splitImageNodeToGrid(id, dimension).catch((error) => {
          console.error('split image node failed', error);
          const message = error instanceof Error ? error.message : '图片分割失败';
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
      previewUrl: next.previewUrl,
      semanticImageUrl: next.semanticImageUrl,
      prompt: next.prompt,
      width: next.width,
      height: next.height,
      displayWidth: undefined,
      displayHeight: undefined,
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
          onOpenLightbox={() => notifyCanvasImageLightboxRequest?.(id)}
        />
        <UploadedImageNode
          data={data as ImageNodeData}
          selected={selected}
          accessoriesVisible={isActive}
          onReplace={handleReplace}
          onTitleChange={(nextTitle) => updateNodeData<'image'>(id, { title: nextTitle })}
          titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
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
                  const message = error instanceof Error ? error.message : '3D 视图生成失败';
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
    updateNodeData<'uploaded_image'>(id, {
      ...next,
      displayWidth: undefined,
      displayHeight: undefined,
    });
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
          titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
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
                  const message = error instanceof Error ? error.message : '3D 视图生成失败';
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

const UploadedAudioNodeAdapter = memo(function UploadedAudioNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const separateAudio = useCanvasStore((s) => s.separateAudioFromNode);
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;
  const audioData = data as AudioNodeData;
  const audioUrl = audioData.hostedAudioUrl?.trim() || audioData.audioUrl?.trim() || '';

  const handleReplace = async (file: File) => {
    const pending = createPendingAudioImportNode(file, { x: 0, y: 0 });
    updateNodeData<'audio'>(id, {
      ...(pending.node.data as AudioNodeData),
    });

    try {
      const next = await readAudioFile(file);
      updateNodeData<'audio'>(id, next);
    } catch (error) {
      updateNodeData<'audio'>(id, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      URL.revokeObjectURL(pending.localAudioUrl);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) {
      return;
    }

    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = audioData.fileName || audioData.title || 'audio';
    a.click();
  };

  const handleCopyLink = () => {
    if (audioUrl) {
      void navigator.clipboard?.writeText(audioUrl);
    }
  };

  return (
    <UploadedAudioNode
      data={audioData}
      selected={selected}
      accessoriesVisible={isActive}
      onReplace={handleReplace}
      onTitleChange={(nextTitle) => updateNodeData<'audio'>(id, { title: nextTitle })}
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onSelectNode={() => notifyCanvasNodeSelect?.(id)}
      onLoadedMetadata={(durationSeconds) => updateNodeData<'audio'>(id, { durationSeconds })}
      onDownload={handleDownload}
      onCopyLink={handleCopyLink}
      onSeparateAudio={() => {
        void separateAudio(id);
      }}
    />
  );
});

const VideoNodeAdapter = memo(function VideoNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const createProcessedVideoNode = useCanvasStore((s) => s.createVideoNodeFromProcessedResult);
  const createVideoUpscaleNode = useCanvasStore((s) => s.createVideoUpscaleNodeFromSource);
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
  const clipControlsOpen = clipOpen && isActive;

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
    if (!clipControlsOpen) {
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
  }, [clipControlsOpen, clipDuration, videoData.hostedVideoUrl, videoData.videoUrl]);

  useEffect(() => {
    const handleClearNodeUi = () => {
      setClipOpen(false);
      setClipMessage(null);
      videoRef.current?.pause();
    };

    window.addEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
    return () => window.removeEventListener(CANVAS_NODE_UI_CLEAR_EVENT, handleClearNodeUi);
  }, []);

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
    if (!clipControlsOpen || clipDuration <= 0) {
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
  }, [clipControlsOpen, clipDuration, clipEnd, clipStart]);

  useEffect(() => {
    if (!clipControlsOpen) {
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
  }, [clipControlsOpen, clipEnd, clipStart]);

  const runCut = async () => {
    if (!(clipEnd > clipStart)) {
      setClipMessage('End time must be greater than start time');
      return;
    }

    setClipBusy(true);
    setClipMessage('Preparing video...');

    try {
      const sourceUrl = await ensureVideoProcessingSourceUrl(videoData);
      setClipMessage('Creating clip job...');
      const jobId = await createVideoClipJob({
        kind: 'cut',
        sourceUrl,
        start: clipStart,
        end: clipEnd,
        fps: 24,
      });
      const done = await pollVideoClipJob(jobId, (status) => {
        if (status.ok) {
          setClipMessage(`Processing ${Math.round((status.progress || 0) * 100)}%`);
        }
      });
      const segment = done.segments?.[0];

      if (!segment?.url) {
        throw new Error('No clipped video segment was returned');
      }

      const nextNodeId = await createProcessedVideoNode({
        sourceNodeId: id,
        title: `Clip ${videoData.title || videoData.fileName || 'video'}`,
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

      setClipMessage('Clip created');
      setClipOpen(false);
      notifyCanvasNodeSelect?.(nextNodeId);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : 'Video clipping failed');
    } finally {
      setClipBusy(false);
    }
  };

  const getSmartClipAiCredentials = (): CreateVideoClipJobRequest['aiCredentials'] => {
    const settings = readStoredApiSettings();
    const preferredProvider =
      settings.textProvider === 'comfly' || settings.textProvider === 'zhenzhen'
        ? settings.textProvider
        : null;
    const providers: Array<'comfly' | 'zhenzhen'> = preferredProvider
      ? [preferredProvider, preferredProvider === 'comfly' ? 'zhenzhen' : 'comfly']
      : ['comfly', 'zhenzhen'];

    const credentials = providers
      .map((provider) => ({
        provider,
        apiKey: settings.textApiKeys[provider]?.trim() ?? '',
      }))
      .filter((credential) => credential.apiKey.length > 0);

    return credentials.length > 0 ? credentials : undefined;
  };

  const runSmartClip = async () => {
    setClipBusy(true);
    setClipMessage('Preparing video...');

    try {
      const aiCredentials = getSmartClipAiCredentials();

      if (!aiCredentials?.length) {
        throw new Error(`请先在 API 设置里填写支持 ${SMART_CLIP_MODEL_ID} 的 Comfly 或贞贞文本 API Key`);
      }

      const sourceUrl = await ensureVideoProcessingSourceUrl(videoData);
      setClipMessage(`Analyzing video with ${SMART_CLIP_MODEL_ID}...`);
      const jobId = await createVideoClipJob({
        kind: 'smart_clip',
        sourceUrl,
        aiCredentials,
        options: { mode: 'sensitive', maxSegments: 20, fps: 24 },
      });
      const done = await pollVideoClipJob(jobId, (status) => {
        if (status.ok) {
          setClipMessage(`Clipping ${status.doneCount ?? 0}/${status.total ?? '?'} ${Math.round((status.progress || 0) * 100)}%`);
        }
      });
      const segments = done.segments?.filter((segment) => segment.url) ?? [];

      if (!segments.length) {
        throw new Error('No smart clip segments were returned');
      }

      const nextNodeIds: string[] = [];
      const clipNodeGap = 32;
      let nextClipY = yPos;

      for (const [index, segment] of segments.entries()) {
        const segmentDimensions = resolveUploadedVideoCardDimensions({
          ...videoData,
          width: segment.width ?? videoData.width,
          height: segment.height ?? videoData.height,
        });
        const nextNodeId = await createProcessedVideoNode({
          sourceNodeId: id,
          title: `Clip ${index + 1}`,
          resultUrl: segment.url,
          durationSeconds: segment.duration,
          width: segment.width ?? videoData.width,
          height: segment.height ?? videoData.height,
          sizeBytes: segment.sizeBytes,
          mimeType: segment.mimeType,
          position: {
            x: xPos + cardDimensions.width + 48,
            y: nextClipY,
          },
        });
        nextNodeIds.push(nextNodeId);
        nextClipY += IMAGE_NODE_ADAPTER_TOP_PADDING + segmentDimensions.height + 36 + clipNodeGap;
      }

      setClipMessage('Smart clips created');
      setClipOpen(false);
      if (nextNodeIds[0]) notifyCanvasNodeSelect?.(nextNodeIds[0]);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : 'Smart clipping failed');
    } finally {
      setClipBusy(false);
    }
  };

  const extractFrame = async (position: 'current' | 'first' | 'last' = 'current') => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setClipMessage('视频尚未准备好');
      setClipOpen(true);
      return;
    }

    try {
      const originalTime = video.currentTime;
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : clipDuration;
      const targetTime = position === 'first'
        ? 0
        : position === 'last'
          ? Math.max(0, duration - 0.05)
          : originalTime;

      if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.01) {
        await new Promise<void>((resolve) => {
          const handleSeeked = () => {
            window.clearTimeout(timer);
            resolve();
          };
          const timer = window.setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            resolve();
          }, 900);

          video.addEventListener('seeked', handleSeeked, { once: true });
          video.currentTime = targetTime;
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas is unavailable');
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const frameTitle = position === 'first'
        ? 'First frame'
        : position === 'last'
          ? 'Last frame'
          : 'current';
      const nextNodeId = await createImageNodeFromVideoFrame({
        sourceNodeId: id,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        title: frameTitle,
        position: {
          x: xPos + cardDimensions.width + 48,
          y: yPos,
        },
      });

      if (position !== 'current' && Number.isFinite(originalTime)) {
        video.currentTime = originalTime;
      }

      notifyCanvasNodeSelect?.(nextNodeId);
    } catch (error) {
      setClipMessage(error instanceof Error ? error.message : 'Extract frame failed');
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
          videoFrameCapture
          onAction={(action) => {
            if (action === 'crop') {
              focusNodeViewport();
              handleOpenClip();
            } else if (action === 'extract-current-frame') {
              void extractFrame('current');
            } else if (action === 'extract-first-frame') {
              void extractFrame('first');
            } else if (action === 'extract-last-frame') {
              void extractFrame('last');
            } else if (action === 'video-upscale') {
              if (!hasVideo) {
                setClipMessage('没有可用于超分的视频');
                setClipOpen(true);
                return;
              }

              const nextNodeId = createVideoUpscaleNode(id);
              notifyCanvasNodeSelect?.(nextNodeId);
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
          titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
          onSelectNode={() => notifyCanvasImageInfoRequest?.(id)}
          videoRef={videoRef}
          controlsVisible={!clipControlsOpen}
          onLoadedMetadata={(duration) => {
            if (duration > 0) {
              setClipVideoDuration(duration);
            }
          }}
        />
        {clipControlsOpen ? (
          <div
            data-canvas-menu-ignore="true"
            className="nodrag nopan absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2"
            style={{
              top: `${cardDimensions.height + VIDEO_CLIP_CONTROLS_TOP_OFFSET}px`,
              width: `${Math.min(Math.max((cardDimensions.width + 60) * 0.78, 340), 520)}px`,
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1b1d21]/95 text-gl-text-secondary shadow-[0_10px_24px_rgba(0,0,0,0.34)] transition hover:text-white disabled:opacity-50"
              >
                <X size={12} strokeWidth={2.4} />
              </button>

              <div
                ref={clipTrackRef}
                onPointerDown={handleClipTrackPointerDown}
                className="relative h-8 min-w-0 flex-1 cursor-grab overflow-hidden rounded-[7px] border border-white/15 bg-[#16181c] shadow-[0_10px_28px_rgba(0,0,0,0.38)] active:cursor-grabbing"
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
                  className="absolute top-1/2 h-7 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.45)]"
                  style={{ left: `${clipStartPct}%` }}
                />
                <div
                  className="absolute top-1/2 h-7 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.45)]"
                  style={{ left: `${clipEndPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a2d32]/95 px-2 py-1 text-[9px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,.34)]"
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.2)] transition hover:bg-white/90 disabled:opacity-50"
              >
                <Check size={12} strokeWidth={2.6} />
              </button>
            </div>

            <div className="flex w-full items-center justify-between gap-1.5">
              <div />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={clipBusy}
                  onClick={() => void runSmartClip()}
                  className="flex h-6 items-center justify-center gap-1 rounded-full border border-white/10 bg-[#24262b]/95 px-2.5 py-0 text-[9px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,.28)] transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Box size={11} strokeWidth={1.9} className="text-white/86" />
                  智能剪辑
                </button>
                <button
                  type="button"
                  aria-label="提取帧"
                  disabled={clipBusy}
                  onClick={() => void extractFrame()}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#24262b]/95 p-0 text-white shadow-[0_4px_10px_rgba(0,0,0,.28)] transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Camera size={12} strokeWidth={1.8} />
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
      titleEditRequestId={(data as CanvasNodeRenderData).canvasTitleEditRequestId}
      onViewChange={handleViewChange}
      onNavigationActiveChange={(active) => notifyPanorama360NavigationActiveChange?.(id, active)}
      onUploadPanorama={(file) => notifyPanorama360UploadRequest?.(id, file)}
      onScreenshot={(capture) => createPanorama360ScreenshotNode(id, capture)
        .then((nextNodeId) => notifyCanvasNodeSelect?.(nextNodeId))
        .catch((error) => {
          console.error('create panorama screenshot node failed', error);
          const message = error instanceof Error ? error.message : '创建全景截图失败';
          useCanvasStore.getState().setSaveMessage(message);
          window.setTimeout(() => useCanvasStore.getState().setSaveMessage(null), 2200);
        })}
      onSelectNode={() => notifyCanvasNodeSelect?.(id)}
    />
  );
});

const DirectorNodeAdapter = memo(function DirectorNodeAdapter({ id, data, selected }: NodeProps) {
  const renderData = data as CanvasNodeRenderData;
  const isActive = !!selected && !!renderData.canvasNodeActive;

  return (
    <div className="relative group">
      <DirectorNode
        data={data as DirectorNodeData}
        selected={selected}
        onOpen={() => {
          notifyCanvasNodeSelect?.(id);
          notifyDirectorDeskOpen?.(id);
        }}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={isActive}
        cardTopOffset={DIRECTOR_NODE_TITLE_HEIGHT}
        cardWidth={DIRECTOR_NODE_CARD_WIDTH}
      />
    </div>
  );
});

const StoryboardGridNodeAdapter = memo(function StoryboardGridNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const dropTarget = useSyncExternalStore(
    storyboardGridDropTargetStore.subscribe,
    storyboardGridDropTargetStore.getSnapshot,
    storyboardGridDropTargetStore.getSnapshot,
  );
  const gridData = data as StoryboardGridNodeData;

  return (
    <StoryboardGridNode
      id={id}
      data={gridData}
      selected={selected}
      dropTarget={dropTarget}
      onAspectRatioChange={(aspectRatio) => {
        updateNodeData<'storyboard_grid'>(id, { aspectRatio });
      }}
      onGridChange={(grid) => {
        updateNodeData<'storyboard_grid'>(id, {
          grid,
          cells: getStoryboardGridCellsForGrid(gridData.cells, grid),
        });
      }}
      onEditingChange={(isEditing) => updateNodeData<'storyboard_grid'>(id, { isEditing })}
      onClear={() => {
        updateNodeData<'storyboard_grid'>(id, {
          cells: Array.from({ length: getStoryboardGridCellCount(gridData.grid) }, () => null),
          status: 'idle',
          errorMessage: undefined,
        });
      }}
      onCollapseChange={(isCollapsed) => updateNodeData<'storyboard_grid'>(id, {
        isCollapsed,
        isEditing: isCollapsed ? false : gridData.isEditing,
      })}
      onUploadCell={(cellIndex, file) => {
        void notifyStoryboardGridCellUpload?.(id, cellIndex, file);
      }}
      onMoveCell={(fromIndex, toIndex) => {
        if (fromIndex === toIndex) {
          return;
        }

        const cells = getStoryboardGridCellsForGrid(gridData.cells, gridData.grid);
        const nextCells = cells.slice();
        const source = nextCells[fromIndex] ?? null;
        nextCells[fromIndex] = nextCells[toIndex] ?? null;
        nextCells[toIndex] = source;
        updateNodeData<'storyboard_grid'>(id, { cells: nextCells });
      }}
      onPreviewCell={(image) => {
        const lightboxData = toStoryboardGridCellLightboxData(image);

        if (!lightboxData) {
          return;
        }

        notifyCanvasNodeSelect?.(id);
        notifyStoryboardGridCellPreview?.(lightboxData);
      }}
      onDeleteCell={(cellIndex) => {
        const cells = getStoryboardGridCellsForGrid(gridData.cells, gridData.grid);
        cells[cellIndex] = null;
        updateNodeData<'storyboard_grid'>(id, { cells });
      }}
      onCompose={() => {
        void notifyStoryboardGridCompose?.(id);
      }}
      onSelectNode={() => notifyCanvasNodeSelect?.(id)}
    />
  );
});

const nodeTypes = {
  text: TextNodeAdapter,
  storyboard_script: StoryboardScriptNodeAdapter,
  storyboard_grid: StoryboardGridNodeAdapter,
  image_generation: ImageGenerationNodeAdapter,
  video_generation: VideoGenerationNodeAdapter,
  audio_generation: AudioGenerationNodeAdapter,
  video_upscale: VideoUpscaleNodeAdapter,
  video: VideoNodeAdapter,
  audio: UploadedAudioNodeAdapter,
  ai_text_result: AITextResultNodeAdapter,
  image: ImageNodeAdapter,
  uploaded_image: UploadedImageNodeAdapter,
  'panorama-360': Panorama360NodeAdapter,
  director: DirectorNodeAdapter,
};

const EDGE_DELETE_BUTTON_SIZE = 20;
const EDGE_DELETE_BUTTON_OFFSET = 18;
const NODE_PASTE_OFFSET = 40;
const IMAGE_IMPORT_COLUMNS = 4;
const IMAGE_IMPORT_SPACING_X = 48;
const IMAGE_IMPORT_SPACING_Y = 48;
const CANVAS_MIN_ZOOM = 0.2;
const CANVAS_MAX_ZOOM = 2;
const CANVAS_SNAP_GRID_SIZE = 24;
const CANVAS_EDGE_STYLE_STORAGE_KEY = 'genlink.canvasEdgeStyle';
const CANVAS_EDGE_STYLE_CHANGE_EVENT = 'genlink:canvas-edge-style-change';
const TEXT_NODE_CARD_WIDTH = 511;
const TEXT_NODE_CARD_HEIGHT = 289;
const CANVAS_READY_MEDIA_TIMEOUT_MS = 2500;
const IMAGE_GENERATION_MAX_CARD_EDGE = 540;
const IMAGE_GENERATION_MIN_CARD_EDGE = 220;
const IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE = 64;
const IMAGE_GENERATION_CARD_ACCESSORY_GAP = 12;
const AGENT_IMAGE_GENERATION_NODE_ROW_GAP = 72;
const AGENT_IMAGE_GENERATION_NODE_ROW_SPACING =
  IMAGE_GENERATION_MAX_CARD_EDGE +
  IMAGE_GENERATION_CARD_ACCESSORY_TOP_SPACE +
  IMAGE_GENERATION_CARD_ACCESSORY_GAP +
  AGENT_IMAGE_GENERATION_NODE_ROW_GAP;
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
const SMART_CLIP_MODEL_ID = 'gemini-3.5-flash';
const VIDEO_CLIP_CONTROLS_TOP_OFFSET = 48;
const VIDEO_CLIP_CONTROLS_FOCUS_HEIGHT = 96;
const VIDEO_CLIP_CONTROLS_MIN_FOCUS_WIDTH = 430;
const CANVAS_MINIMAP_WIDTH = 200;
const CANVAS_MINIMAP_HEIGHT = 150;
const CANVAS_MINIMAP_PADDING = 14;
const MULTI_NODE_SELECTION_PADDING = 14;
const MULTI_NODE_SELECTION_TOOLBAR_GAP = 10;
const CANVAS_ALIGNMENT_GUIDE_TOLERANCE = 2;
const GENERATION_NODE_GROUP_TOP_RESERVE = 56;
const GROUP_LAYOUT_GAP_X = 48;
const GROUP_LAYOUT_GAP_Y = 48;
const VIDEO_UPSCALE_PANEL_WIDTH = 448;
const VIDEO_UPSCALE_PANEL_TOP_GAP = 24;
const VIDEO_UPSCALE_PANEL_HEIGHT = 144;
const VIDEO_UPSCALE_TITLE_HEIGHT = 34;
const HISTORY_NODE_WIDTH = 540;
const HISTORY_NODE_HEIGHT = 740;
const HISTORY_NODE_GAP = 72;
const LIGHTBOX_MIN_ZOOM = 0.5;
const LIGHTBOX_MAX_ZOOM = 5;
const LIGHTBOX_WHEEL_ZOOM_STEP = 0.0018;
const LIGHTBOX_RESET_ZOOM_EPSILON = 0.03;
const CANVAS_CTRL_WHEEL_ZOOM_STEP = 0.0015;
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

type QuickReferenceConnectMode = {
  targetKind: 'node';
  targetNodeId: string;
  targetType: 'text' | 'storyboard_script' | 'image_generation' | 'video_generation' | 'audio_generation';
} | {
  targetKind: 'agent';
  onSelect: (attachment: AgentTaskAttachment) => 'added' | 'duplicate';
};

type ConnectedCopyBuffer = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

function canNodeProvideImageReference(node: CanvasNode): boolean {
  if (node.type === 'uploaded_image') {
    return Boolean(node.data.imageUrl.trim());
  }

  if (node.type === 'image') {
    return Boolean(node.data.imageUrl.trim());
  }

  if (node.type === 'image_generation') {
    return Boolean(
      node.data.generatedHostedImageUrl?.trim() ||
      node.data.generatedImageUrl?.trim(),
    );
  }

  return false;
}

function canNodeProvideVideoReference(node: CanvasNode): boolean {
  if (node.type === 'video') {
    return Boolean(
      node.data.hostedVideoUrl?.trim() ||
      node.data.videoUrl?.trim(),
    );
  }

  if (node.type === 'video_generation') {
    return Boolean(
      node.data.hostedVideoUrl?.trim() ||
      node.data.videoUrl?.trim(),
    );
  }

  return false;
}

function canNodeProvideAudioReference(node: CanvasNode): boolean {
  if (node.type === 'audio') {
    return Boolean(
      node.data.hostedAudioUrl?.trim() ||
      node.data.audioUrl.trim(),
    );
  }

  if (node.type === 'audio_generation') {
    return Boolean(
      node.data.hostedAudioUrl?.trim() ||
      node.data.audioUrl?.trim(),
    );
  }

  return false;
}

function canNodeProvideQuickReference(
  node: CanvasNode,
  mode: QuickReferenceConnectMode,
): boolean {
  if (mode.targetKind === 'node' && node.id === mode.targetNodeId) {
    return false;
  }

  if (mode.targetKind === 'agent') {
    return canNodeProvideImageReference(node);
  }

  if (mode.targetType === 'image_generation') {
    return canNodeProvideImageReference(node);
  }

  if (mode.targetType === 'audio_generation') {
    return canNodeProvideAudioReference(node);
  }

  if (mode.targetType === 'video_generation') {
    return (
      canNodeProvideImageReference(node) ||
      canNodeProvideVideoReference(node) ||
      canNodeProvideAudioReference(node)
    );
  }

  return canNodeProvideImageReference(node) || canNodeProvideVideoReference(node);
}

function createAgentAttachmentFromCanvasImageNode(node: CanvasNode): AgentTaskAttachment | null {
  if (node.type === 'uploaded_image') {
    const imageUrl = node.data.hostedImageUrl?.trim() || node.data.imageUrl.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      kind: 'image',
      name: node.data.title?.trim() || node.data.fileName?.trim() || 'Canvas image',
      mimeType: 'image/*',
      imageUrl,
      hostedImageUrl: imageUrl,
      originalImageUrl: imageUrl,
      previewUrl: node.data.previewUrl?.trim() || imageUrl,
      thumbnailUrl: node.data.previewUrl?.trim() || undefined,
      semanticImageUrl: node.data.semanticImageUrl?.trim() || imageUrl,
      width: node.data.width,
      height: node.data.height,
      sizeBytes: node.data.sizeBytes,
      status: 'ready',
      sourceNodeId: node.id,
    };
  }

  if (node.type === 'image') {
    const imageUrl = node.data.hostedImageUrl?.trim() || node.data.imageUrl.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      kind: 'image',
      name: node.data.title?.trim() || 'Canvas image',
      mimeType: 'image/*',
      imageUrl,
      previewUrl: imageUrl,
      width: node.data.width,
      height: node.data.height,
      sizeBytes: node.data.sizeBytes,
      status: 'ready',
      sourceNodeId: node.id,
    };
  }

  if (node.type === 'image_generation') {
    const imageUrl = node.data.generatedHostedImageUrl?.trim() || node.data.generatedImageUrl?.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      kind: 'image',
      name: node.data.title?.trim() || 'Generated image',
      mimeType: 'image/*',
      imageUrl,
      previewUrl: imageUrl,
      width: node.data.generatedImageWidth,
      height: node.data.generatedImageHeight,
      sizeBytes: node.data.generatedImageSizeBytes,
      status: 'ready',
      sourceNodeId: node.id,
    };
  }

  return null;
}

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

  if (node.type === 'storyboard_script') {
    const data = cloneNodeData(node.data);

    return {
      ...data,
      status: 'idle',
      errorMessage: undefined,
    };
  }

  if (node.type === 'storyboard_grid') {
    const data = cloneNodeData(node.data);

    return {
      ...data,
      isEditing: false,
      status: 'idle',
      errorMessage: undefined,
      outputImageUrl: undefined,
      outputHostedImageUrl: undefined,
      outputFileName: undefined,
      outputWidth: undefined,
      outputHeight: undefined,
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
      bounds: getNodeGroupBounds(node),
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
  canvasTitleEditRequestId?: number;
};

type BrowserSaveFileHandle = {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

function downloadNodeExportUrl(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();
}

async function saveNodeExport(exportData: NodeExport): Promise<'saved' | 'cancelled'> {
  let blob: Blob | null = null;

  if (exportData.kind === 'text') {
    blob = new Blob([exportData.text], { type: exportData.mimeType });
  } else {
    try {
      blob = await fetch(exportData.url).then((response) => {
        if (!response.ok) {
          throw new Error(`Download failed (${response.status})`);
        }

        return response.blob();
      });
    } catch {
      downloadNodeExportUrl(exportData.url, exportData.fileName);
      return 'saved';
    }
  }

  if (!blob) {
    return 'cancelled';
  }

  const downloadBlob = blob;
  const extension = exportData.fileName.split('.').pop() || 'txt';
  const mimeType = exportData.mimeType.split(';')[0] || 'application/octet-stream';
  const saveFilePicker = (window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<BrowserSaveFileHandle>;
  }).showSaveFilePicker;

  if (saveFilePicker) {
    try {
      const handle = await saveFilePicker({
        suggestedName: exportData.fileName,
        types: [{
          description: 'File',
          accept: { [mimeType]: [`.${extension}`] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(downloadBlob);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }

      throw error;
    }
  }

  const objectUrl = URL.createObjectURL(downloadBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = exportData.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return 'saved';
}

type EmptyCanvasWelcomeAction = 'text' | 'image_generation' | 'video_generation' | 'audio_generation';

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

function hasEditableTextSelection(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.selectionStart !== target.selectionEnd;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && target.contains(selection.anchorNode));
  }

  return false;
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

function getConnectionSourcesFromNodeIds(nodeIds: Iterable<string>): GroupConnectionSource[] {
  const sources: GroupConnectionSource[] = [];
  const seen = new Set<string>();

  for (const nodeId of nodeIds) {
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

function getGroupConnectionSourcesFromDom(group: NodeGroup): GroupConnectionSource[] {
  return getConnectionSourcesFromNodeIds(group.nodeIds);
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

function snapCanvasPositionToGrid(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(position.x / CANVAS_SNAP_GRID_SIZE) * CANVAS_SNAP_GRID_SIZE,
    y: Math.round(position.y / CANVAS_SNAP_GRID_SIZE) * CANVAS_SNAP_GRID_SIZE,
  };
}

function getAlignmentGuideAnchors(bounds: MultiNodeSelectionBounds) {
  return {
    left: bounds.x,
    centerX: bounds.x + bounds.width / 2,
    right: bounds.x + bounds.width,
    top: bounds.y,
    centerY: bounds.y + bounds.height / 2,
    bottom: bounds.y + bounds.height,
  };
}

function getCanvasAlignmentGuides(
  draggingNode: CanvasNode | ReactFlowNode,
  nodes: Array<CanvasNode | ReactFlowNode>,
): CanvasAlignmentGuide[] {
  const draggingBounds = getAlignmentGuideNodeBounds(draggingNode);
  const draggingAnchors = getAlignmentGuideAnchors(draggingBounds);
  let horizontalGuide: { guide: CanvasAlignmentGuide; distance: number } | null = null;
  let verticalGuide: { guide: CanvasAlignmentGuide; distance: number } | null = null;

  for (const node of nodes) {
    if (node.id === draggingNode.id) {
      continue;
    }

    const targetBounds = getAlignmentGuideNodeBounds(node);
    const targetAnchors = getAlignmentGuideAnchors(targetBounds);
    const minX = Math.min(draggingBounds.x, targetBounds.x);
    const maxX = Math.max(
      draggingBounds.x + draggingBounds.width,
      targetBounds.x + targetBounds.width,
    );
    const minY = Math.min(draggingBounds.y, targetBounds.y);
    const maxY = Math.max(
      draggingBounds.y + draggingBounds.height,
      targetBounds.y + targetBounds.height,
    );

    for (const draggingY of [draggingAnchors.top, draggingAnchors.centerY, draggingAnchors.bottom]) {
      for (const targetY of [targetAnchors.top, targetAnchors.centerY, targetAnchors.bottom]) {
        const distance = Math.abs(draggingY - targetY);

        if (
          distance <= CANVAS_ALIGNMENT_GUIDE_TOLERANCE &&
          (!horizontalGuide || distance < horizontalGuide.distance)
        ) {
          horizontalGuide = {
            distance,
            guide: {
              id: `h:${node.id}:${targetY}`,
              orientation: 'horizontal',
              start: minX,
              end: maxX,
              position: targetY,
            },
          };
        }
      }
    }

    for (const draggingX of [draggingAnchors.left, draggingAnchors.centerX, draggingAnchors.right]) {
      for (const targetX of [targetAnchors.left, targetAnchors.centerX, targetAnchors.right]) {
        const distance = Math.abs(draggingX - targetX);

        if (
          distance <= CANVAS_ALIGNMENT_GUIDE_TOLERANCE &&
          (!verticalGuide || distance < verticalGuide.distance)
        ) {
          verticalGuide = {
            distance,
            guide: {
              id: `v:${node.id}:${targetX}`,
              orientation: 'vertical',
              start: minY,
              end: maxY,
              position: targetX,
            },
          };
        }
      }
    }
  }

  return [horizontalGuide?.guide, verticalGuide?.guide].filter(
    (guide): guide is CanvasAlignmentGuide => guide !== undefined,
  );
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

function readStoredCanvasEdgeStyle(userId: string): CanvasEdgeStyle {
  if (typeof window === 'undefined') {
    return 'curve';
  }

  return readUserScopedCanvasSetting(CANVAS_EDGE_STYLE_STORAGE_KEY, userId) === 'straight'
    ? 'straight'
    : 'curve';
}

function subscribeToCanvasEdgeStyleChange(onStoreChange: () => void): () => void {
  window.addEventListener(CANVAS_EDGE_STYLE_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CANVAS_EDGE_STYLE_CHANGE_EVENT, onStoreChange);
}

function getServerCanvasEdgeStyleSnapshot(): CanvasEdgeStyle {
  return 'curve';
}

function useStoredCanvasEdgeStyle(userId: string): CanvasEdgeStyle {
  return useSyncExternalStore(
    subscribeToCanvasEdgeStyleChange,
    () => readStoredCanvasEdgeStyle(userId),
    getServerCanvasEdgeStyleSnapshot,
  );
}

function setStoredCanvasEdgeStyle(userId: string, edgeStyle: CanvasEdgeStyle) {
  writeUserScopedCanvasSetting(CANVAS_EDGE_STYLE_STORAGE_KEY, edgeStyle, userId);
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
  flowNodes: ReactFlowNode[];
  selectedNodeIds: Set<string>;
  groups: NodeGroup[];
  visible: boolean;
  onGroup: (nodeIds: string[]) => void;
  onStartSelectionConnection: (nodeIds: string[], event: React.MouseEvent<HTMLElement>) => void;
  onSelectionFramePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSelectionFramePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSelectionFramePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSelectionFramePointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
};

type GroupOverlayProps = {
  groups: NodeGroup[];
  groupOffsets: Map<string, { x: number; y: number }>;
  selectedGroupId: string | null;
  hoveredGroupId: string | null;
  onStartGroupConnection: (group: NodeGroup, event: React.MouseEvent<HTMLElement>) => void;
  onSelectGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string | undefined) => void;
  onUpdateGroupBackgroundColor: (groupId: string, backgroundColor: string | undefined) => void;
  onGroupDragStart: (groupId: string) => void;
  onGroupDrag: (groupId: string, dx: number, dy: number) => void;
  onGroupDragEnd: (groupId: string, moved: boolean) => void;
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
  groupOffsets,
  selectedGroupId,
  hoveredGroupId,
  onStartGroupConnection,
  onSelectGroup,
  onDeleteGroup,
  onRenameGroup,
  onUpdateGroupBackgroundColor,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
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
      {groups.map((group) => {
        const offset = groupOffsets.get(group.id) ?? { x: 0, y: 0 };

        return (
          <GroupFrame
            key={group.id}
            group={{
              ...group,
              x: group.x + offset.x,
              y: group.y + offset.y,
            }}
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
            onDragStart={() => onGroupDragStart(group.id)}
            onDrag={(dx, dy) => onGroupDrag(group.id, dx, dy)}
            onDragEnd={(moved) => onGroupDragEnd(group.id, moved)}
            onResize={(bounds) => onResizeGroup(group.id, bounds)}
            onExecute={(mode) => onExecuteGroup(group.id, mode)}
            onLayout={(mode) => onLayoutGroup(group.id, mode)}
            onDownload={() => onDownloadGroup(group.id)}
          />
        );
      })}
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
  onDragStart: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: (moved: boolean) => void;
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
  onDragStart,
  onDrag,
  onDragEnd,
  onResize,
  onExecute,
  onLayout,
  onDownload,
}: GroupFrameProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const sourceAnchorRef = useRef<HTMLDivElement | null>(null);
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
  const defaultName = '组';
  const frameColorStyle = getGroupFrameColorStyle(group.backgroundColor, selected);
  const showResizeHandles = selected || hovered || resizing;
  const showSourceHandle = selected || hovered;

  const handlePointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('.group-frame-no-drag')) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect();
    onDragStart();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    const dx = (event.clientX - dragRef.current.startX) / viewport.zoom;
    const dy = (event.clientY - dragRef.current.startY) / viewport.zoom;
    dragRef.current = {
      pointerId: dragRef.current.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: dragRef.current.moved || dx !== 0 || dy !== 0,
    };
    onDrag(dx, dy);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    const moved = dragRef.current.moved;
    dragRef.current = null;
    onDragEnd(moved);
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
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
          top: topLeft.y - 38 * viewport.zoom,
          transform: `scale(${viewport.zoom})`,
          transformOrigin: 'left top',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GroupFrameLabel
          value={group.name}
          fallback={defaultName}
          nodeCount={nodeCount}
          onCommit={onRename}
        />
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
            ref={sourceAnchorRef}
            className="pointer-events-none absolute inset-0"
          />
          <MagneticSidePlus
            edge="right"
            active={showSourceHandle}
            coordinateSpace="screen"
            containerRef={sourceAnchorRef}
            anchorElementRef={sourceAnchorRef}
            onMouseDown={onStartConnection}
          />
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
              <MultiNodeSelectionToolbarButton icon={Play}>运行</MultiNodeSelectionToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Ungroup} onClick={onDelete}>取消组</MultiNodeSelectionToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <MultiNodeSelectionToolbarButton icon={Download} onClick={onDownload}>下载</MultiNodeSelectionToolbarButton>
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
  nodeCount,
  onCommit,
}: {
  value?: string;
  fallback: string;
  nodeCount: number;
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
        <Group size={18} />
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
    <span className="flex cursor-text select-none items-center gap-2 text-gl-text-tertiary hover:text-gl-text-secondary">
      <Group size={18} />
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
      {!value ? (
        <span className="pt-0.5 text-[13px] font-medium leading-none text-gl-text-muted">
          {nodeCount} 个节点
        </span>
      ) : null}
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
        aria-label="选择组背景色"
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
          aria-label="组背景色"
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
  flowNodes,
  selectedNodeIds,
  groups,
  visible,
  onGroup,
  onStartSelectionConnection,
  onSelectionFramePointerDown,
  onSelectionFramePointerMove,
  onSelectionFramePointerUp,
  onSelectionFramePointerCancel,
}: MultiNodeSelectionOverlayProps) {
  const viewport = useViewport();
  const sourceAnchorRef = useRef<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState<MultiNodeSelectionBounds | null>(null);
  const selectedNodes = useMemo(
    () => {
      const flowNodesById = new Map(flowNodes.map((node) => [node.id, node]));

      return nodes
        .filter((node) => selectedNodeIds.has(node.id))
        .map((node) => flowNodesById.get(node.id) ?? node);
    },
    [flowNodes, nodes, selectedNodeIds],
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
        const estimatedBounds = getNodeGroupBounds(node);

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
      <div
        data-canvas-menu-ignore="true"
        className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
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
          加入组
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
      <div
        data-canvas-menu-ignore="true"
        className="pointer-events-auto absolute inset-0 z-10 cursor-move"
        onPointerDown={onSelectionFramePointerDown}
        onPointerMove={onSelectionFramePointerMove}
        onPointerUp={onSelectionFramePointerUp}
        onPointerCancel={onSelectionFramePointerCancel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <div className="pointer-events-none gl-multi-node-selection-frame absolute inset-0" />
      <div
        data-canvas-menu-ignore="true"
        className="group-frame-no-drag nodrag nopan pointer-events-none absolute z-[20] overflow-visible"
        style={{
          left: 0,
          top: 0,
          width: paddedBounds.width,
          height: paddedBounds.height,
        }}
      >
        <div
          ref={sourceAnchorRef}
          className="pointer-events-none absolute inset-0"
        />
        <MagneticSidePlus
          edge="right"
          active={true}
          coordinateSpace="screen"
          containerRef={sourceAnchorRef}
          anchorElementRef={sourceAnchorRef}
          onMouseDown={(event) => onStartSelectionConnection(selectedNodes.map((node) => node.id), event)}
        />
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

function CanvasAlignmentGuidesOverlay({ guides }: { guides: CanvasAlignmentGuide[] }) {
  const { x, y, zoom } = useViewport();

  if (guides.length === 0) {
    return null;
  }

  return (
    <Panel position="top-left" className="pointer-events-none m-0 h-full w-full">
      {guides.map((guide) => {
        const style = guide.orientation === 'horizontal'
          ? {
              left: x + guide.start * zoom,
              top: y + guide.position * zoom,
              width: Math.max(1, (guide.end - guide.start) * zoom),
              height: 1,
            }
          : {
              left: x + guide.position * zoom,
              top: y + guide.start * zoom,
              width: 1,
              height: Math.max(1, (guide.end - guide.start) * zoom),
            };

        return (
          <div
            key={guide.id}
            className="canvas-alignment-guide"
            style={style}
          />
        );
      })}
    </Panel>
  );
}

function CanvasViewportControls({
  edgeStyle,
  onToggleEdgeStyle,
  gridSnapEnabled,
  onToggleGridSnap,
  onSmartReset,
  nodes,
}: {
  edgeStyle: CanvasEdgeStyle;
  onToggleEdgeStyle: () => void;
  gridSnapEnabled: boolean;
  onToggleGridSnap: () => void;
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
  const minimapLabel = isMiniMapVisible ? 'Hide minimap' : 'Show minimap';
  const gridSnapLabel = gridSnapEnabled ? '关闭网格吸附' : '开启网格吸附';

  return (
    <>
      {isMiniMapVisible ? <CanvasMiniMap nodes={nodes} /> : null}

      <Panel
        position="bottom-left"
        className="canvas-zoom-panel group-frame-no-drag"
        data-canvas-menu-ignore="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
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
              aria-label={resetLabel}
            >
              <Expand size={15} />
            </button>
            <Tooltip label={resetLabel} side="top" />
          </div>

          <div className="group/tooltip relative">
            <button
              type="button"
              className={[
                'canvas-zoom-icon-button',
                gridSnapEnabled ? 'canvas-zoom-icon-button-active' : '',
              ].filter(Boolean).join(' ')}
              onClick={onToggleGridSnap}
              aria-label={gridSnapLabel}
              aria-pressed={gridSnapEnabled}
            >
              <Grid3x3 size={15} />
            </button>
            <Tooltip label={gridSnapLabel} side="top" />
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
            className="canvas-zoom-slider group-frame-no-drag"
            data-canvas-menu-ignore="true"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="空画布"
          />
        </div>

      </Panel>
    </>
  );
}

type CropRect = { x: number; y: number; width: number; height: number };
type CropAspectRatio = null | number;

const CROP_ASPECT_RATIOS: Array<{ label: string; value: CropAspectRatio }> = [
  { label: 'Free', value: null },
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

type ImageAnnotationNodeType = 'image_generation' | 'uploaded_image' | 'image';

type ImageAnnotationOverlayData = {
  nodeId: string;
  nodeType: ImageAnnotationNodeType;
  imageUrl: string;
  nodePosition: { x: number; y: number };
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  cardHeight: number;
  annotations: ImageAnnotation[];
  flipX?: boolean;
  flipY?: boolean;
};

type AnnotationExportResult = {
  dataUrl: string;
  width: number;
  height: number;
};

function createAnnotatedImageNodeTitle(sourceNode: CanvasNode): string {
  const data = sourceNode.data as Partial<ImageNodeData & UploadedImageNodeData & ImageGenerationNodeData>;
  const sourceTitle =
    data.title?.trim() ||
    data.fileName?.trim() ||
    data.prompt?.trim() ||
    '\u56fe\u7247';
  const baseTitle = sourceTitle.replace(/(?:[-_\s]*(?:\u6807\u6ce8|Annotated image))+$/i, '').trim();

  return `${baseTitle || '\u56fe\u7247'}-\u6807\u6ce8`;
}

function clampAnnotationRect(rect: CropRect): CropRect {
  const x1 = Math.max(0, Math.min(1, rect.x));
  const y1 = Math.max(0, Math.min(1, rect.y));
  const x2 = Math.max(0, Math.min(1, rect.x + rect.width));
  const y2 = Math.max(0, Math.min(1, rect.y + rect.height));
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function loadAnnotationImageElement(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('标注原图加载失败，请稍后重试'));
    image.src = getBrowserImageDisplayUrl(imageUrl);
  });
}

function loadImageForCanvas(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = getBrowserImageDisplayUrl(imageUrl);
  });
}

async function loadAnnotationImage(imageUrl: string): Promise<{
  image: HTMLImageElement;
  cleanup: () => void;
}> {
  try {
    return {
      image: await loadAnnotationImageElement(imageUrl),
      cleanup: () => {},
    };
  } catch (directError) {
    if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) {
      throw directError;
    }

    const response = await fetch('/api/image-hosting/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      throw new Error('标注原图加载失败，请稍后重试');
    }

    const objectUrl = URL.createObjectURL(await response.blob());

    try {
      return {
        image: await loadAnnotationImageElement(objectUrl),
        cleanup: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (proxyError) {
      URL.revokeObjectURL(objectUrl);
      throw proxyError;
    }
  }
}

async function saveAnnotationImageDataUrl(dataUrl: string, fileName: string): Promise<string> {
  try {
    return await uploadCanvasImageAssetDataUrl(dataUrl, fileName, 'original', 'images');
  } catch (error) {
    console.warn('[GenLink] annotation image hosting failed; using embedded data URL fallback', error);
    return dataUrl;
  }
}

function estimateAnnotationTextPixelWidth(value: string, fontSize: number) {
  const characters = Array.from(value || 'Text');
  const units = characters.reduce((total, character) => {
    if (/[\u2e80-\uffff]/.test(character)) {
      return total + 1;
    }

    if (/[A-Z0-9]/.test(character)) {
      return total + 0.72;
    }

    if (/\s/.test(character)) {
      return total + 0.34;
    }

    return total + 0.62;
  }, 0);

  return Math.ceil(units * fontSize + 8);
}

function resolveAnnotationTextDisplayRect(
  annotation: ImageAnnotation,
  displaySize: { width: number; height: number },
): CropRect {
  const rect = annotation.rect;
  const displayFontSize = annotation.fontSize ?? 32;
  const measuredWidth = Math.min(
    0.95,
    Math.max(
      0.055,
      estimateAnnotationTextPixelWidth(annotation.name, displayFontSize) /
        Math.max(displaySize.width, 1),
    ),
  );
  const measuredHeight = Math.min(
    0.25,
    Math.max(
      0.035,
      (displayFontSize * 1.25 + 8) / Math.max(displaySize.height, 1),
    ),
  );

  return {
    ...rect,
    width: Math.max(rect.width, measuredWidth),
    height: Math.max(rect.height, measuredHeight),
  };
}

function getStoryboardGridCellsForGrid(
  cells: Array<StoryboardGridCellImage | null>,
  grid: StoryboardGridSize,
): Array<StoryboardGridCellImage | null> {
  const count = getStoryboardGridCellCount(grid);

  return Array.from({ length: count }, (_, index) => cells[index] ?? null);
}

function getStoryboardGridImageFromNode(node: CanvasNode): StoryboardGridCellImage | null {
  if (node.type === 'uploaded_image') {
    const imageUrl = node.data.hostedImageUrl?.trim() || node.data.imageUrl.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      imageUrl,
      hostedImageUrl: node.data.hostedImageUrl,
      previewUrl: node.data.previewUrl,
      semanticImageUrl: node.data.semanticImageUrl,
      fileName: node.data.fileName,
      title: node.data.title,
      width: node.data.width,
      height: node.data.height,
      sourceNodeId: node.id,
    };
  }

  if (node.type === 'image') {
    const imageUrl = node.data.hostedImageUrl?.trim() || node.data.imageUrl.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      imageUrl,
      hostedImageUrl: node.data.hostedImageUrl,
      previewUrl: node.data.previewUrl,
      semanticImageUrl: node.data.semanticImageUrl,
      fileName: node.data.fileName,
      title: node.data.title,
      width: node.data.width,
      height: node.data.height,
      sourceNodeId: node.id,
    };
  }

  if (node.type === 'image_generation') {
    const imageUrl = node.data.generatedHostedImageUrl?.trim() || node.data.generatedImageUrl?.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      imageUrl,
      hostedImageUrl: node.data.generatedHostedImageUrl,
      title: node.data.title,
      width: node.data.generatedImageWidth,
      height: node.data.generatedImageHeight,
      sourceNodeId: node.id,
    };
  }

  return null;
}

function getStoryboardGridNodeBounds(node: CanvasNode | ReactFlowNode): MultiNodeSelectionBounds {
  const data = node.data as StoryboardGridNodeData;
  const size = getStoryboardGridNodeSize(data);

  return {
    x: node.position.x,
    y: node.position.y - 8,
    width: size.width,
    height: STORYBOARD_GRID_TITLE_HEIGHT + size.height + STORYBOARD_GRID_EMPTY_HINT_HEIGHT + 8,
  };
}

function findStoryboardGridDropTarget(
  point: { x: number; y: number },
  nodes: CanvasNode[],
  excludeNodeId?: string,
): StoryboardGridDropTarget | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];

    if (node.id === excludeNodeId || node.type !== 'storyboard_grid') {
      continue;
    }

    const bounds = getStoryboardGridNodeBounds(node);

    if (
      point.x < bounds.x ||
      point.x > bounds.x + bounds.width ||
      point.y < bounds.y ||
      point.y > bounds.y + bounds.height
    ) {
      continue;
    }

    const data = node.data as StoryboardGridNodeData;
    const size = getStoryboardGridNodeSize(data);
    const grid = parseStoryboardGridSize(data.grid);
    const gridLeft = node.position.x;
    const gridTop = node.position.y + STORYBOARD_GRID_TITLE_HEIGHT;
    const relativeX = point.x - gridLeft;
    const relativeY = point.y - gridTop;

    if (
      relativeX < 0 ||
      relativeX > size.width ||
      relativeY < 0 ||
      relativeY > size.height
    ) {
      continue;
    }

    const column = Math.min(grid.columns - 1, Math.max(0, Math.floor(relativeX / (size.width / grid.columns))));
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(relativeY / (size.height / grid.rows))));

    return { nodeId: node.id, cellIndex: row * grid.columns + column };
  }

  return null;
}

async function readRemoteImageAsObjectUrl(imageUrl: string): Promise<string> {
  const response = await fetch('/api/image-hosting/read', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    throw new Error(`Failed to read image (${response.status})`);
  }

  return URL.createObjectURL(await response.blob());
}

async function loadStoryboardGridImageFromUrl(imageUrl: string): Promise<{
  element: HTMLImageElement;
  cleanup: () => void;
}> {
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
    return {
      element: await loadImageForCanvas(imageUrl),
      cleanup: () => {},
    };
  }

  try {
    return {
      element: await loadImageForCanvas(imageUrl),
      cleanup: () => {},
    };
  } catch {
    const objectUrl = await readRemoteImageAsObjectUrl(imageUrl);

    try {
      return {
        element: await loadImageForCanvas(objectUrl),
        cleanup: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
}

async function loadStoryboardGridImage(image: StoryboardGridCellImage): Promise<{
  element: HTMLImageElement;
  cleanup: () => void;
}> {
  const urls = Array.from(new Set([
    image.previewUrl?.trim(),
    image.hostedImageUrl?.trim(),
    image.imageUrl?.trim(),
  ].filter((url): url is string => Boolean(url))));

  if (urls.length === 0) {
    throw new Error('图片不可用');
  }

  let lastError: unknown = null;

  for (const url of urls) {
    try {
      return await loadStoryboardGridImageFromUrl(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to load image');
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetAspect;
    sy = (sourceHeight - sh) / 2;
  }

  context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

async function createStoryboardGridImageDataUrl(data: StoryboardGridNodeData): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const width = 1440;
  const height = Math.round(width / getStoryboardGridAspectValue(data.aspectRatio));
  const grid = parseStoryboardGridSize(data.grid);
  const gap = 12;
  const unitWidth = (width - gap * (grid.columns - 1)) / grid.columns;
  const unitHeight = (height - gap * (grid.rows - 1)) / grid.rows;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is unavailable');
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#202226';
  context.fillRect(0, 0, width, height);

  await Promise.all(
    Array.from({ length: grid.columns * grid.rows }, async (_, index) => {
      const image = data.cells[index];
      const column = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const x = Math.round(column * (unitWidth + gap));
      const y = Math.round(row * (unitHeight + gap));
      const cellWidth = Math.round(unitWidth);
      const cellHeight = Math.round(unitHeight);

      context.fillStyle = '#2a2d33';
      context.fillRect(x, y, cellWidth, cellHeight);

      if (!image) {
        return;
      }

      let loadedImage: { element: HTMLImageElement; cleanup: () => void } | null = null;

      try {
        loadedImage = await loadStoryboardGridImage(image);
        drawImageCover(context, loadedImage.element, x, y, cellWidth, cellHeight);
      } catch (error) {
        console.warn('storyboard grid image skipped during compose', error);
      } finally {
        loadedImage?.cleanup();
      }
    }),
  );

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
  };
}

function resolveAnnotationNumberRadius(displaySize: { width: number; height: number }): number {
  return Math.max(12, Math.min(22, Math.min(displaySize.width, displaySize.height) * 0.038));
}

function resolveNextAnnotationNumber(annotations: ImageAnnotation[]): number {
  const numbers = annotations
    .filter((annotation) => annotation.visible !== false && annotation.kind === 'number')
    .map((annotation) => annotation.number ?? Number(annotation.name))
    .filter((value) => Number.isFinite(value));

  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

async function createAnnotatedImageDataUrl(
  imageUrl: string,
  annotations: ImageAnnotation[],
  displaySize: { width: number; height: number },
  options?: { flipX?: boolean; flipY?: boolean },
): Promise<AnnotationExportResult> {
  const loaded = await loadAnnotationImage(imageUrl);
  const image = loaded.image;
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  try {
    if (!context) {
      throw new Error('Failed to create annotation canvas');
    }

    canvas.width = width;
    canvas.height = height;

    const applyFlipTransform = () => {
      context.translate(options?.flipX ? width : 0, options?.flipY ? height : 0);
      context.scale(options?.flipX ? -1 : 1, options?.flipY ? -1 : 1);
    };

    context.save();
    applyFlipTransform();
    context.drawImage(image, 0, 0, width, height);
    context.restore();

    const scaleX = width / Math.max(displaySize.width, 1);
    const scaleY = height / Math.max(displaySize.height, 1);
    const averageScale = (scaleX + scaleY) / 2;

  context.save();
  applyFlipTransform();
  annotations
    .filter((annotation) => annotation.visible !== false)
    .forEach((annotation) => {
      const rect = annotation.rect;
      const color = annotation.color ?? '#111111';
      const flipScaleX = options?.flipX ? -1 : 1;
      const flipScaleY = options?.flipY ? -1 : 1;

      if (annotation.kind === 'path' && annotation.points?.length) {
        context.save();
        context.strokeStyle = color;
        context.lineWidth = (annotation.strokeWidth ?? 4) * averageScale;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        annotation.points.forEach((point, index) => {
          const x = point.x * width;
          const y = point.y * height;

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        context.stroke();
        context.restore();
        return;
      }

      if (annotation.kind === 'text') {
        const displayFontSize = annotation.fontSize ?? 32;
        const displayRect = resolveAnnotationTextDisplayRect(annotation, displaySize);
        const fontSize = displayFontSize * averageScale;
        const textWidth = displayRect.width * width;
        const textHeight = displayRect.height * height;
        const x = displayRect.x * width;
        const y = displayRect.y * height;
        const fontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif';

        context.save();
        context.translate(x + textWidth / 2, y + textHeight / 2);
        context.rotate(((annotation.rotation ?? 0) * Math.PI) / 180);
        context.scale(flipScaleX, flipScaleY);
        context.fillStyle = color;
        context.font = `600 ${fontSize}px ${fontFamily}`;
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.shadowColor = 'rgba(255,255,255,0.35)';
        context.shadowBlur = 2 * averageScale;
        context.shadowOffsetY = 1 * scaleY;
        context.fillText(annotation.name, -textWidth / 2 + 2 * scaleX, 0);
        context.restore();
        return;
      }

      if (annotation.kind === 'number') {
        const centerX = (rect.x + rect.width / 2) * width;
        const centerY = (rect.y + rect.height / 2) * height;
        const radius = ((rect.width * width) + (rect.height * height)) / 4;
        const number = annotation.number ?? (Number(annotation.name) || 1);

        context.save();
        context.translate(centerX, centerY);
        context.scale(flipScaleX, flipScaleY);
        context.fillStyle = '#ffffff';
        context.strokeStyle = color;
        context.lineWidth = Math.max(2, 2.4 * averageScale);
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = color;
        context.font = `700 ${Math.max(11, radius * 1.1)}px sans-serif`;
        context.textBaseline = 'middle';
        context.textAlign = 'center';
        context.fillText(String(number), 0, radius * 0.03);
        context.restore();
        return;
      }

      context.save();
      context.strokeStyle = color;
      context.lineWidth = (annotation.strokeWidth ?? 3) * averageScale;
      context.strokeRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
      context.restore();
    });
  context.restore();

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
    };
  } finally {
    loaded.cleanup();
  }
}

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
    img.src = getBrowserImageDisplayUrl(data.imageUrl);
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
          {/* Crop grid */}
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

      {/* Crop controls */}
      <div className="fixed bottom-0 left-0 right-0 z-[82] flex items-center justify-center gap-3 py-5 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/16 hover:text-white"
            aria-label="关闭裁剪"
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
              <span>比例</span>
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
                {/* Custom aspect ratio */}
                {!customMode ? (
                  <button
                    type="button"
                    className={[
                      'flex min-h-[36px] w-full items-center rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/[0.07]',
                      customMode ? 'text-white' : 'text-gl-text-primary',
                    ].join(' ')}
                    onClick={() => { setCustomMode(true); setAspectRatio(null); }}
                  >
                    自定义
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
            <span>应用</span>
          </button>
        </div>
      </div>
    </>
  );
}

type AnnotationTool = 'text' | 'pen' | 'rect' | 'number' | 'eraser';
const TEXT_ANNOTATION_PLACEHOLDER = '\u8f93\u5165\u6587\u5b57';
type TextTransformMode = 'move' | 'resize' | 'rotate';
type TextTransformDrag = {
  annotationId: string;
  mode: TextTransformMode;
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
  startFontSize: number;
  startRotation: number;
  centerX: number;
  centerY: number;
  startAngle: number;
};

function AnnotationToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className={[
          'flex h-9 w-9 items-center justify-center rounded-[9px] transition-colors',
          active
            ? 'bg-indigo-500/35 text-white ring-1 ring-indigo-300/45'
            : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
          disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-white/70' : '',
        ].join(' ')}
        onClick={onClick}
      >
        {children}
      </button>
      <Tooltip label={label} side="top" />
    </div>
  );
}

function AnnotationOverlay({
  data,
  onClose,
  onChange,
  onSave,
}: {
  data: ImageAnnotationOverlayData | null;
  onClose: () => void;
  onChange: (nodeId: string, nodeType: ImageAnnotationNodeType, annotations: ImageAnnotation[]) => void;
  onSave: (data: ImageAnnotationOverlayData) => Promise<void>;
}) {
  const viewport = useViewport();
  const [tool, setTool] = useState<AnnotationTool>('text');
  const [color, setColor] = useState('#111111');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(32);
  const [numberSize, setNumberSize] = useState(() =>
    Math.round(resolveAnnotationNumberRadius({
      width: data?.cardWidth ?? IMAGE_GENERATION_MAX_CARD_EDGE,
      height: data?.cardHeight ?? IMAGE_GENERATION_MAX_CARD_EDGE,
    }) * 2),
  );
  const [draftRect, setDraftRect] = useState<CropRect | null>(null);
  const [draftPath, setDraftPath] = useState<Array<{ x: number; y: number }> | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; value: string; annotationId?: string } | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flipState, setFlipState] = useState(() => ({
    x: Boolean(data?.flipX),
    y: Boolean(data?.flipY),
  }));
  const [historyState, setHistoryState] = useState<{ key: string | null; undoCount: number; redoCount: number }>({
    key: null,
    undoCount: 0,
    redoCount: 0,
  });
  const historyKey = data ? `${data.nodeType}:${data.nodeId}` : null;
  const historyKeyRef = useRef<string | null>(null);
  const undoStackRef = useRef<ImageAnnotation[][]>([]);
  const redoStackRef = useRef<ImageAnnotation[][]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const textTransformRef = useRef<TextTransformDrag | null>(null);

  const { x: vpX, y: vpY, zoom } = viewport;
  const screenX = data ? vpX + (data.nodePosition.x + data.cardLeft) * zoom : 0;
  const screenY = data ? vpY + (data.nodePosition.y + data.cardTop) * zoom : 0;
  const screenW = data ? data.cardWidth * zoom : 1;
  const screenH = data ? data.cardHeight * zoom : 1;

  const getRelativePoint = (event: React.PointerEvent<HTMLDivElement>) => ({
    x: flipState.x
      ? 1 - Math.max(0, Math.min(1, (event.clientX - screenX) / screenW))
      : Math.max(0, Math.min(1, (event.clientX - screenX) / screenW)),
    y: flipState.y
      ? 1 - Math.max(0, Math.min(1, (event.clientY - screenY) / screenH))
      : Math.max(0, Math.min(1, (event.clientY - screenY) / screenH)),
  });

  const estimateTextPixelWidth = (value: string, nextFontSize: number) => {
    const characters = Array.from(value || TEXT_ANNOTATION_PLACEHOLDER);
    const units = characters.reduce((total, character) => {
      if (/[\u2e80-\uffff]/.test(character)) {
        return total + 1;
      }

      if (/[A-Z0-9]/.test(character)) {
        return total + 0.72;
      }

      if (/\s/.test(character)) {
        return total + 0.34;
      }

      return total + 0.62;
    }, 0);

    return Math.ceil(units * nextFontSize + 8);
  };

  const estimateTextRect = (value: string, nextFontSize: number, x: number, y: number): CropRect => ({
    x,
    y,
    width: Math.min(0.95, Math.max(0.055, estimateTextPixelWidth(value, nextFontSize) / Math.max(screenW, 1))),
    height: Math.min(0.25, Math.max(0.035, (nextFontSize * 1.25 + 8) / Math.max(screenH, 1))),
  });

  const toVisualRect = (rect: CropRect): CropRect => ({
    x: flipState.x ? 1 - rect.x - rect.width : rect.x,
    y: flipState.y ? 1 - rect.y - rect.height : rect.y,
    width: rect.width,
    height: rect.height,
  });

  const toVisualPoint = (point: { x: number; y: number }) => ({
    x: flipState.x ? 1 - point.x : point.x,
    y: flipState.y ? 1 - point.y : point.y,
  });

  const clampRectToFrame = (rect: CropRect): CropRect => ({
    ...rect,
    x: Math.max(0, Math.min(1 - rect.width, rect.x)),
    y: Math.max(0, Math.min(1 - rect.height, rect.y)),
  });

  const estimateNewTextRect = (value: string, nextFontSize: number, x: number, y: number): CropRect => {
    const measured = estimateTextRect(value, nextFontSize, x, y);

    return clampRectToFrame({
      ...measured,
      x: flipState.x ? x - measured.width : x,
      y: flipState.y ? y - measured.height : y,
    });
  };

  const getTextVisualRotation = (rotation: number | undefined) =>
    flipState.x !== flipState.y ? -(rotation ?? 0) : (rotation ?? 0);

  const activateHistory = useCallback((key: string) => {
    if (historyKeyRef.current === key) {
      return;
    }

    historyKeyRef.current = key;
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const syncHistoryState = useCallback((key: string) => {
    setHistoryState({
      key,
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
    });
  }, []);

  const commitAnnotations = useCallback((nextAnnotations: ImageAnnotation[]) => {
    if (!data) {
      return;
    }

    const nextHistoryKey = `${data.nodeType}:${data.nodeId}`;
    activateHistory(nextHistoryKey);
    undoStackRef.current = [...undoStackRef.current.slice(-19), data.annotations];
    redoStackRef.current = [];
    syncHistoryState(nextHistoryKey);
    onChange(data.nodeId, data.nodeType, nextAnnotations);
  }, [activateHistory, data, onChange, syncHistoryState]);

  const updateAnnotations = useCallback((nextAnnotations: ImageAnnotation[]) => {
    if (!data) {
      return;
    }

    onChange(data.nodeId, data.nodeType, nextAnnotations);
  }, [data, onChange]);

  const pushUndoSnapshot = useCallback(() => {
    if (!data) {
      return;
    }

    const nextHistoryKey = `${data.nodeType}:${data.nodeId}`;
    activateHistory(nextHistoryKey);
    undoStackRef.current = [...undoStackRef.current.slice(-19), data.annotations];
    redoStackRef.current = [];
    syncHistoryState(nextHistoryKey);
  }, [activateHistory, data, syncHistoryState]);

  const handleUndo = () => {
    if (!data) {
      return;
    }

    const nextHistoryKey = `${data.nodeType}:${data.nodeId}`;
    activateHistory(nextHistoryKey);
    const previous = undoStackRef.current.pop();

    if (!previous) {
      syncHistoryState(nextHistoryKey);
      return;
    }

    setSelectedTextId(null);
    redoStackRef.current = [...redoStackRef.current, data.annotations];
    syncHistoryState(nextHistoryKey);
    onChange(data.nodeId, data.nodeType, previous);
  };

  const handleRedo = () => {
    if (!data) {
      return;
    }

    const nextHistoryKey = `${data.nodeType}:${data.nodeId}`;
    activateHistory(nextHistoryKey);
    const next = redoStackRef.current.pop();

    if (!next) {
      syncHistoryState(nextHistoryKey);
      return;
    }

    setSelectedTextId(null);
    undoStackRef.current = [...undoStackRef.current, data.annotations];
    syncHistoryState(nextHistoryKey);
    onChange(data.nodeId, data.nodeType, next);
  };

  useEffect(() => {
    if (!data) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (textEditor) {
          setTextEditor(null);
          return;
        }

        if (selectedTextId) {
          setSelectedTextId(null);
          return;
        }

        onClose();
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTextId && !textEditor) {
        event.preventDefault();
        commitAnnotations(data.annotations.filter((annotation) => annotation.id !== selectedTextId));
        setSelectedTextId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitAnnotations, data, onClose, selectedTextId, textEditor]);

  if (!data) {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (textEditor) {
      handleConfirmText();
      return;
    }

    const point = getRelativePoint(event);
    setSelectedTextId(null);

    if (tool === 'text') {
      setTextEditor({ x: point.x, y: point.y, value: '' });
      return;
    }

    if (tool === 'number') {
      const radius = numberSize / 2;
      const rect = {
        x: Math.max(0, Math.min(1 - (radius * 2) / screenW, point.x - radius / screenW)),
        y: Math.max(0, Math.min(1 - (radius * 2) / screenH, point.y - radius / screenH)),
        width: (radius * 2) / screenW,
        height: (radius * 2) / screenH,
      };
      const number = resolveNextAnnotationNumber(data.annotations);

      commitAnnotations([
        ...data.annotations,
        {
          id: crypto.randomUUID(),
          kind: 'number',
          name: String(number),
          number,
          rect,
          color: '#111111',
          strokeWidth: Math.max(2, Math.round(numberSize * 0.06)),
          visible: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    if (tool === 'eraser') {
      const hit = data.annotations.findLast((annotation) => {
        const rect = annotation.rect;
        return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
      });

      if (hit) {
        commitAnnotations(data.annotations.filter((annotation) => annotation.id !== hit.id));
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = point;

    if (tool === 'pen') {
      setDraftPath([point]);
      return;
    }

    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (textTransformRef.current) {
      return;
    }

    if (!dragRef.current) {
      return;
    }

    event.preventDefault();
    const point = getRelativePoint(event);

    if (tool === 'pen') {
      setDraftPath((current) => current ? [...current, point] : [point]);
      return;
    }

    setDraftRect(clampAnnotationRect({
      x: dragRef.current.x,
      y: dragRef.current.y,
      width: point.x - dragRef.current.x,
      height: point.y - dragRef.current.y,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (textTransformRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;

    if (tool === 'pen') {
      const points = draftPath ?? [];
      setDraftPath(null);

      if (points.length < 2) {
        return;
      }

      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxX = Math.max(...points.map((point) => point.x));
      const maxY = Math.max(...points.map((point) => point.y));

      commitAnnotations([
        ...data.annotations,
        {
          id: crypto.randomUUID(),
          kind: 'path',
          name: 'path',
          points,
          rect: { x: minX, y: minY, width: Math.max(0.001, maxX - minX), height: Math.max(0.001, maxY - minY) },
          color,
          strokeWidth,
          visible: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    const rect = draftRect;
    setDraftRect(null);

    if (!rect || rect.width < 0.01 || rect.height < 0.01) {
      return;
    }

    commitAnnotations([
      ...data.annotations,
      {
        id: crypto.randomUUID(),
        kind: 'rect',
        name: 'rect',
        rect,
        color,
        strokeWidth,
        visible: true,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const resolveTextEditorAnnotations = (): ImageAnnotation[] | null => {
    const value = textEditor?.value.trim();

    if (!textEditor || !value) {
      return null;
    }

    if (textEditor.annotationId) {
      return data.annotations.map((annotation) =>
        annotation.id === textEditor.annotationId
          ? { ...annotation, name: value, rect: estimateNewTextRect(value, annotation.fontSize ?? fontSize, textEditor.x, textEditor.y) }
          : annotation,
      );
    }

    const nextId = crypto.randomUUID();
    return [
      ...data.annotations,
      {
        id: nextId,
        kind: 'text',
        name: value,
        rect: estimateNewTextRect(value, fontSize, textEditor.x, textEditor.y),
        color,
        fontSize,
        rotation: 0,
        visible: true,
        createdAt: new Date().toISOString(),
      },
    ];
  };

  const handleConfirmText = () => {
    const nextAnnotations = resolveTextEditorAnnotations();

    if (!nextAnnotations) {
      setTextEditor(null);
      return;
    }

    if (textEditor?.annotationId) {
      commitAnnotations(nextAnnotations);
      setSelectedTextId(textEditor.annotationId);
      setTextEditor(null);
      return;
    }

    commitAnnotations(nextAnnotations);
    setSelectedTextId(nextAnnotations[nextAnnotations.length - 1]?.id ?? null);
    setTextEditor(null);
  };

  const handleSave = async () => {
    if (!data || saving) {
      return;
    }

    const annotationsToSave = resolveTextEditorAnnotations() ?? data.annotations;

    if (textEditor) {
      commitAnnotations(annotationsToSave);
      setTextEditor(null);
    }

    setSaving(true);
    try {
      await onSave({ ...data, annotations: annotationsToSave, flipX: flipState.x, flipY: flipState.y });
    } finally {
      setSaving(false);
    }
  };

  const beginTextTransform = (
    event: React.PointerEvent<HTMLElement>,
    annotation: ImageAnnotation,
    mode: TextTransformMode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTextId(annotation.id);
    pushUndoSnapshot();

    const rect = annotation.rect;
    const visualRect = toVisualRect(rect);
    const centerX = screenX + (visualRect.x + visualRect.width / 2) * screenW;
    const centerY = screenY + (visualRect.y + visualRect.height / 2) * screenH;
    textTransformRef.current = {
      annotationId: annotation.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: rect,
      startFontSize: annotation.fontSize ?? fontSize,
      startRotation: annotation.rotation ?? 0,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTextTransformMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = textTransformRef.current;

    if (!drag) {
      return;
    }

    event.preventDefault();
    const dx = (event.clientX - drag.startClientX) / Math.max(screenW, 1);
    const dy = (event.clientY - drag.startClientY) / Math.max(screenH, 1);
    const sourceDx = flipState.x ? -dx : dx;
    const sourceDy = flipState.y ? -dy : dy;

    updateAnnotations(data.annotations.map((annotation) => {
      if (annotation.id !== drag.annotationId) {
        return annotation;
      }

      if (drag.mode === 'move') {
        return {
          ...annotation,
          rect: {
            ...annotation.rect,
            x: Math.max(0, Math.min(1 - annotation.rect.width, drag.startRect.x + sourceDx)),
            y: Math.max(0, Math.min(1 - annotation.rect.height, drag.startRect.y + sourceDy)),
          },
        };
      }

      if (drag.mode === 'resize') {
        const scale = Math.max(0.45, Math.min(4, 1 + (event.clientX - drag.startClientX + event.clientY - drag.startClientY) / 160));
        const nextFontSize = Math.max(12, Math.min(96, Math.round(drag.startFontSize * scale)));

        return {
          ...annotation,
          fontSize: nextFontSize,
          rect: estimateNewTextRect(
            annotation.name,
            nextFontSize,
            flipState.x ? drag.startRect.x + drag.startRect.width : drag.startRect.x,
            flipState.y ? drag.startRect.y + drag.startRect.height : drag.startRect.y,
          ),
        };
      }

      const nextAngle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
      const rotationSign = flipState.x !== flipState.y ? -1 : 1;
      const rotation = drag.startRotation + rotationSign * ((nextAngle - drag.startAngle) * 180) / Math.PI;

      return {
        ...annotation,
        rotation,
      };
    }));
  };

  const endTextTransform = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!textTransformRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    textTransformRef.current = null;
  };

  const handleTextColorChange = (nextColor: string) => {
    setColor(nextColor);

    if (!selectedTextId) {
      return;
    }

    commitAnnotations(data.annotations.map((annotation) =>
      annotation.id === selectedTextId && annotation.kind === 'text'
        ? { ...annotation, color: nextColor }
        : annotation,
    ));
  };

  const handleSizeChange = (nextValue: number) => {
    if (tool === 'text') {
      setFontSize(nextValue);

      if (selectedTextId) {
        commitAnnotations(data.annotations.map((annotation) =>
          annotation.id === selectedTextId && annotation.kind === 'text'
            ? {
                ...annotation,
                fontSize: nextValue,
                rect: estimateNewTextRect(
                  annotation.name,
                  nextValue,
                  flipState.x ? annotation.rect.x + annotation.rect.width : annotation.rect.x,
                  flipState.y ? annotation.rect.y + annotation.rect.height : annotation.rect.y,
                ),
              }
            : annotation,
        ));
      }
      return;
    }

    if (tool === 'number') {
      setNumberSize(nextValue);
      return;
    }

    setStrokeWidth(nextValue);
  };

  const pathPointsToSvg = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => {
      const visualPoint = toVisualPoint(point);

      return `${visualPoint.x * screenW},${visualPoint.y * screenH}`;
    }).join(' ');

  const maskLeftWidth = Math.max(0, screenX);
  const maskRightLeft = Math.max(0, screenX + screenW);
  const maskTopHeight = Math.max(0, screenY);
  const maskBottomTop = Math.max(0, screenY + screenH);
  const maskMiddleTop = Math.max(0, screenY);
  const maskMiddleHeight = Math.max(0, screenH);

  return (
    <>
      <div className="fixed inset-0 z-[80] pointer-events-none">
        <div
          className="absolute bg-black/70 pointer-events-auto"
          style={{ left: 0, top: 0, right: 0, height: maskTopHeight }}
          onPointerDown={onClose}
        />
        <div
          className="absolute bg-black/70 pointer-events-auto"
          style={{ left: 0, top: maskBottomTop, right: 0, bottom: 0 }}
          onPointerDown={onClose}
        />
        <div
          className="absolute bg-black/70 pointer-events-auto"
          style={{ left: 0, top: maskMiddleTop, width: maskLeftWidth, height: maskMiddleHeight }}
          onPointerDown={onClose}
        />
        <div
          className="absolute bg-black/70 pointer-events-auto"
          style={{ left: maskRightLeft, top: maskMiddleTop, right: 0, height: maskMiddleHeight }}
          onPointerDown={onClose}
        />
      </div>
      <div
        className="fixed z-[81] rounded-[inherit]"
        style={{ left: screenX, top: screenY, width: screenW, height: screenH }}
      >
        <NextImage
          src={getBrowserImageDisplayUrl(data.imageUrl)}
          alt=""
          fill
          unoptimized
          sizes={`${Math.max(1, Math.round(screenW))}px`}
          draggable={false}
          className="pointer-events-none absolute inset-0 rounded-[inherit] object-cover"
          style={{
            transform: `scale(${flipState.x ? -1 : 1}, ${flipState.y ? -1 : 1})`,
          }}
        />
        <div
          className="absolute left-1/2 top-[-64px] z-20 flex -translate-x-1/2 items-center gap-1 rounded-[13px] border border-white/10 bg-[#141519]/95 px-2 py-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AnnotationToolbarButton active={tool === 'text'} label={'\u6587\u5b57'} onClick={() => setTool('text')}><TypeIcon size={17} /></AnnotationToolbarButton>
          <AnnotationToolbarButton active={tool === 'pen'} label={'\u753b\u7b14'} onClick={() => setTool('pen')}><Pencil size={17} /></AnnotationToolbarButton>
          <AnnotationToolbarButton active={tool === 'rect'} label={'\u77e9\u5f62'} onClick={() => setTool('rect')}><Square size={17} /></AnnotationToolbarButton>
          <AnnotationToolbarButton active={tool === 'number'} label={'\u7f16\u53f7'} onClick={() => setTool('number')}><CircleDot size={17} /></AnnotationToolbarButton>
          <AnnotationToolbarButton active={tool === 'eraser'} label={'\u6a61\u76ae\u64e6'} onClick={() => setTool('eraser')}><Eraser size={17} /></AnnotationToolbarButton>
          <div className="mx-1 h-6 w-px bg-white/10" />
          {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#111111'].map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`\u989c\u8272 ${option}`}
              className="h-6 w-6 rounded-full border transition-transform hover:scale-110"
              style={{ backgroundColor: option, borderColor: color === option ? '#fff' : 'rgba(255,255,255,0.25)' }}
              onClick={() => handleTextColorChange(option)}
            />
          ))}
          <input
            type="range"
            min={tool === 'text' ? 18 : tool === 'number' ? 24 : 2}
            max={tool === 'text' ? 60 : tool === 'number' ? 64 : 14}
            value={tool === 'text' ? fontSize : tool === 'number' ? numberSize : strokeWidth}
            className="mx-2 w-[118px] accent-indigo-400"
            aria-label={tool === 'text' ? '\u6587\u5b57\u5927\u5c0f' : tool === 'number' ? '\u7f16\u53f7\u5927\u5c0f' : '\u7ebf\u6761\u7c97\u7ec6'}
            onChange={(event) => {
              const value = Number(event.target.value);
              handleSizeChange(value);
            }}
          />
          <AnnotationToolbarButton label={'\u64a4\u9500'} disabled={historyState.key !== historyKey || historyState.undoCount === 0} onClick={handleUndo}><Undo2 size={16} /></AnnotationToolbarButton>
          <AnnotationToolbarButton label={'\u91cd\u505a'} disabled={historyState.key !== historyKey || historyState.redoCount === 0} onClick={handleRedo}><Redo2 size={16} /></AnnotationToolbarButton>
          <AnnotationToolbarButton label={'\u6c34\u5e73\u7ffb\u8f6c'} active={flipState.x} onClick={() => setFlipState((current) => ({ ...current, x: !current.x }))}><FlipHorizontal2 size={16} /></AnnotationToolbarButton>
          <AnnotationToolbarButton label={'\u5782\u76f4\u7ffb\u8f6c'} active={flipState.y} onClick={() => setFlipState((current) => ({ ...current, y: !current.y }))}><FlipVertical2 size={16} /></AnnotationToolbarButton>
          <AnnotationToolbarButton label={'\u6e05\u7a7a'} disabled={data.annotations.length === 0} onClick={() => commitAnnotations([])}><Trash2 size={16} /></AnnotationToolbarButton>
          <button
            type="button"
            disabled={saving}
            className="ml-1 flex h-9 min-w-[72px] items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-white px-3 text-[13px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => void handleSave()}
          >
            <Save size={15} />
            {saving ? '\u4fdd\u5b58\u4e2d' : '\u4fdd\u5b58'}
          </button>
          <button
            type="button"
            aria-label={'\u9000\u51fa\u6807\u6ce8'}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-[10px] bg-red-500/18 text-red-300 ring-1 ring-red-400/35 transition-colors hover:bg-red-500/28 hover:text-red-100"
            onClick={onClose}
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        <div
          className={[
            'absolute inset-0 z-10 touch-none overflow-hidden rounded-[inherit]',
            tool === 'text' ? 'cursor-text' : tool === 'eraser' ? 'cursor-not-allowed' : 'cursor-crosshair',
          ].join(' ')}
          onPointerDown={handlePointerDown}
          onPointerMove={(event) => {
            handleTextTransformMove(event);
            handlePointerMove(event);
          }}
          onPointerUp={(event) => {
            endTextTransform(event);
            handlePointerUp(event);
          }}
          onPointerCancel={() => {
            textTransformRef.current = null;
            dragRef.current = null;
            setDraftPath(null);
            setDraftRect(null);
          }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {data.annotations.filter((annotation) => annotation.visible !== false && annotation.kind === 'path' && annotation.points?.length).map((annotation) => (
              <polyline
                key={annotation.id}
                points={pathPointsToSvg(annotation.points ?? [])}
                fill="none"
                stroke={annotation.color ?? '#ef4444'}
                strokeWidth={annotation.strokeWidth ?? 4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {draftPath ? (
              <polyline
                points={pathPointsToSvg(draftPath)}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>

          {data.annotations.filter((annotation) => annotation.visible !== false && annotation.kind !== 'path').map((annotation) => {
            const kind = annotation.kind ?? 'rect';
            const rect = annotation.rect;

            if (kind === 'text') {
              if (textEditor?.annotationId === annotation.id) {
                return null;
              }

              const selected = selectedTextId === annotation.id;
              const displayRect = resolveAnnotationTextDisplayRect(annotation, {
                width: screenW,
                height: screenH,
              });
              const visualRect = toVisualRect(displayRect);

              return (
                <div
                  key={annotation.id}
                  className="absolute"
                  style={{
                    left: `${visualRect.x * 100}%`,
                    top: `${visualRect.y * 100}%`,
                    width: `${visualRect.width * 100}%`,
                    height: `${visualRect.height * 100}%`,
                    transform: `rotate(${getTextVisualRotation(annotation.rotation)}deg)`,
                    transformOrigin: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="absolute inset-0 flex cursor-move select-none items-center bg-transparent px-0.5 py-0 text-left font-semibold leading-none"
                    style={{
                      color: annotation.color ?? '#111111',
                      fontSize: `${annotation.fontSize ?? 32}px`,
                      textShadow: '0 1px 2px rgba(255,255,255,0.35)',
                      whiteSpace: 'nowrap',
                    }}
                    onPointerDown={(event) => beginTextTransform(event, annotation, 'move')}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedTextId(annotation.id);
                      setTool('text');
                      setColor(annotation.color ?? '#111111');
                      setFontSize(annotation.fontSize ?? fontSize);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedTextId(annotation.id);
                      setColor(annotation.color ?? '#111111');
                      setFontSize(annotation.fontSize ?? fontSize);
                      setTextEditor({
                        x: flipState.x ? displayRect.x + displayRect.width : displayRect.x,
                        y: flipState.y ? displayRect.y + displayRect.height : displayRect.y,
                        value: annotation.name,
                        annotationId: annotation.id,
                      });
                    }}
                  >
                    {annotation.name}
                  </button>
                  {selected ? (
                    <>
                      <div className="pointer-events-none absolute inset-[-2px] rounded-[2px] border border-[#7aa7ff]" />
                      {[
                        'left-[-6px] top-[-6px]',
                        'right-[-6px] top-[-6px]',
                        'left-[-6px] bottom-[-6px]',
                        'right-[-6px] bottom-[-6px]',
                      ].map((className) => (
                        <span
                          key={className}
                          className={`pointer-events-none absolute h-3 w-3 rounded-full border border-[#7aa7ff] bg-white ${className}`}
                        />
                      ))}
                      <button
                        type="button"
                        aria-label={'\u5220\u9664\u6587\u5b57'}
                        className="absolute left-[-20px] top-[-20px] flex h-4 w-4 items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_1px_4px_rgba(0,0,0,0.28)]"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          commitAnnotations(data.annotations.filter((candidate) => candidate.id !== annotation.id));
                          setSelectedTextId(null);
                        }}
                      >
                        <X size={12} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        aria-label={'\u65cb\u8f6c\u6587\u5b57'}
                        className="absolute right-[-22px] top-[-22px] flex h-4 w-4 cursor-grab items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_1px_4px_rgba(0,0,0,0.28)] active:cursor-grabbing"
                        onPointerDown={(event) => beginTextTransform(event, annotation, 'rotate')}
                      >
                        <RotateCw size={11} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        aria-label={'\u8c03\u6574\u6587\u5b57\u5927\u5c0f'}
                        className="absolute bottom-[-22px] right-[-22px] flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_1px_4px_rgba(0,0,0,0.28)]"
                        onPointerDown={(event) => beginTextTransform(event, annotation, 'resize')}
                      >
                        <Expand size={11} strokeWidth={2.4} />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            }

            if (kind === 'number') {
              const number = annotation.number ?? (Number(annotation.name) || 1);
              const visualRect = toVisualRect(rect);

              return (
                <button
                  key={annotation.id}
                  type="button"
                  className="absolute flex cursor-pointer select-none items-center justify-center rounded-full border bg-white font-bold leading-none text-[#111111] shadow-[0_1px_3px_rgba(0,0,0,0.24)]"
                  style={{
                    left: `${visualRect.x * 100}%`,
                    top: `${visualRect.y * 100}%`,
                    width: `${visualRect.width * 100}%`,
                    height: `${visualRect.height * 100}%`,
                    borderColor: annotation.color ?? '#111111',
                    borderWidth: annotation.strokeWidth ?? 2,
                    fontSize: `${Math.max(11, Math.min(rect.width * screenW, rect.height * screenH) * 0.52)}px`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTool('eraser');
                  }}
                >
                  {number}
                </button>
              );
            }

            const visualRect = toVisualRect(rect);

            return (
              <button
                key={annotation.id}
                type="button"
                className="absolute border bg-transparent"
                style={{
                  left: `${visualRect.x * 100}%`,
                  top: `${visualRect.y * 100}%`,
                  width: `${visualRect.width * 100}%`,
                  height: `${visualRect.height * 100}%`,
                  borderColor: annotation.color ?? '#ef4444',
                  borderWidth: annotation.strokeWidth ?? 3,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setTool('eraser')}
              />
            );
          })}

          {draftRect ? (
            (() => {
              const visualRect = toVisualRect(draftRect);

              return (
                <div
                  className="absolute border bg-transparent"
                  style={{
                    left: `${visualRect.x * 100}%`,
                    top: `${visualRect.y * 100}%`,
                    width: `${visualRect.width * 100}%`,
                    height: `${visualRect.height * 100}%`,
                    borderColor: color,
                    borderWidth: strokeWidth,
                  }}
                />
              );
            })()
          ) : null}

          {textEditor ? (
            (() => {
              const editorFontSize = textEditor.annotationId
                ? data.annotations.find((annotation) => annotation.id === textEditor.annotationId)?.fontSize ?? fontSize
                : fontSize;
              const editorRect = estimateNewTextRect(
                textEditor.value || TEXT_ANNOTATION_PLACEHOLDER,
                editorFontSize,
                textEditor.x,
                textEditor.y,
              );
              const visualRect = toVisualRect(editorRect);

              return (
                <input
                  autoFocus
                  value={textEditor.value}
                  placeholder={TEXT_ANNOTATION_PLACEHOLDER}
                  className="absolute rounded-[4px] border border-[#7aa7ff] bg-transparent px-1 py-0 font-semibold leading-none outline-none"
                  style={{
                    left: `${visualRect.x * 100}%`,
                    top: `${visualRect.y * 100}%`,
                    width: `${Math.max(96, estimateTextPixelWidth(textEditor.value, editorFontSize) + 10)}px`,
                    color,
                    fontSize: `${editorFontSize}px`,
                    textShadow: '0 1px 2px rgba(255,255,255,0.35)',
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => setTextEditor((current) => current ? { ...current, value: event.target.value } : current)}
                  onBlur={handleConfirmText}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleConfirmText();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setTextEditor(null);
                    }
                  }}
                />
              );
            })()
          ) : null}
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
      aria-label="图片预览"
      onMouseDown={onClose}
    >
      <div className="group/tooltip absolute right-5 top-5">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/16 hover:text-white"
          aria-label="关闭裁剪"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <X size={18} strokeWidth={2.2} />
        </button>
        <Tooltip label="Close" />
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
          src={getBrowserImageDisplayUrl(data.imageUrl)}
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
          点击下方
        </span>
        <span className="text-[18px] font-medium text-gl-text-secondary">
          开始创作
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
          文本节点
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => onCreateNode('image_generation')}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/10 bg-[#191A1C]/90 px-4 text-[13px] font-medium text-gl-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-gl-text-primary"
        >
          <ImageIcon size={15} strokeWidth={2} />
          图片节点
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => onCreateNode('video_generation')}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/10 bg-[#191A1C]/90 px-4 text-[13px] font-medium text-gl-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-gl-text-primary"
        >
          <Video size={15} strokeWidth={2} />
          视频节点
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => onCreateNode('audio_generation')}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/10 bg-[#191A1C]/90 px-4 text-[13px] font-medium text-gl-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:border-white/16 hover:bg-white/[0.08] hover:text-gl-text-primary"
        >
          <Volume2 size={15} strokeWidth={2} />
          音频节点
        </button>
      </div>
    </div>
  );
}

function areNodeDataShallowEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);

  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function areReactFlowNodesShallowEqual(
  left: ReactFlowNode,
  right: ReactFlowNode,
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.className === right.className &&
    left.selected === right.selected &&
    left.dragHandle === right.dragHandle &&
    left.selectable === right.selectable &&
    left.draggable === right.draggable &&
    left.focusable === right.focusable &&
    left.style === right.style &&
    areNodeDataShallowEqual(
      left.data as Record<string, unknown>,
      right.data as Record<string, unknown>,
    )
  );
}

function mergeStableReactFlowNodes(
  previousNodes: ReactFlowNode[],
  nextNodes: ReactFlowNode[],
): ReactFlowNode[] {
  const previousNodesById = new Map(previousNodes.map((node) => [node.id, node]));
  let changed = previousNodes.length !== nextNodes.length;
  const mergedNodes = nextNodes.map((nextNode, index) => {
    const previousNode = previousNodesById.get(nextNode.id);
    const node = previousNode && areReactFlowNodesShallowEqual(previousNode, nextNode)
      ? previousNode
      : nextNode;

    if (node !== previousNodes[index]) {
      changed = true;
    }

    return node;
  });

  return changed ? mergedNodes : previousNodes;
}

interface InnerCanvasProps {
  userId: string;
  onBackToLibrary?: () => void;
  onCanvasReady?: () => void;
}

type CanvasAgentDockProps = {
  userId: string;
  projectId?: string;
  projectName: string;
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onCreateSourceNodes: (attachments: AgentTaskAttachment[]) => Record<string, string>;
  pendingReferenceAttachment?: AgentTaskAttachment | null;
  onPendingReferenceAttachmentConsumed?: (result: 'added' | 'duplicate') => void;
  onQuickReferenceSelect: (
    onSelect: (attachment: AgentTaskAttachment) => 'added' | 'duplicate',
  ) => void;
  onConfirmPlan: (payload: {
    actions: CanvasAgentAction[];
    nodes?: CanvasNode[];
    edges?: CanvasEdge[];
    nodeIdMap?: Record<string, string>;
    attachments: AgentTaskAttachment[];
    plan: AgentExecutionPlan;
    groupName?: string;
  }) => {
    ok: true;
    imageGenerationNodeId?: string;
    imageGenerationNodeIds?: string[];
    groupId?: string;
    nodeIdMap?: Record<string, string>;
  } | { ok: false; error?: string };
  onConfirmGeneration: (payload: { nodeId?: string; nodeIds?: string[]; groupId?: string }) => boolean;
  onFocusNode: (nodeId: string) => void;
  onLayoutChange?: (layout: { open: boolean; width: number }) => void;
};

const CanvasAgentDock = memo(function CanvasAgentDock({
  userId,
  projectId,
  projectName,
  nodeCount,
  edgeCount,
  groupCount,
  nodes,
  edges,
  onCreateSourceNodes,
  pendingReferenceAttachment,
  onPendingReferenceAttachmentConsumed,
  onQuickReferenceSelect,
  onConfirmPlan,
  onConfirmGeneration,
  onFocusNode,
  onLayoutChange,
}: CanvasAgentDockProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    notifyAgentPanelOpenRequest = () => setOpen(true);

    return () => {
      if (notifyAgentPanelOpenRequest) {
        notifyAgentPanelOpenRequest = null;
      }
    };
  }, []);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }, []);

  const handleQuickReferenceSelect = useCallback((
    onSelect: (attachment: AgentTaskAttachment) => 'added' | 'duplicate',
  ) => {
    setOpen(true);
    onQuickReferenceSelect(onSelect);
  }, [onQuickReferenceSelect]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="关闭裁剪"
          className="nodrag nopan fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center text-[#d8dadd] transition hover:scale-105 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={handleOpen}
        >
          <UniqueLoading variant="squares" size="agent" />
        </button>
      ) : null}
      <CanvasAgentPanel
        userId={userId}
        open={open}
        projectId={projectId}
        projectName={projectName}
        nodeCount={nodeCount}
        edgeCount={edgeCount}
        groupCount={groupCount}
        nodes={nodes}
        edges={edges}
        onClose={() => setOpen(false)}
        onCreateSourceNodes={onCreateSourceNodes}
        pendingReferenceAttachment={pendingReferenceAttachment}
        onPendingReferenceAttachmentConsumed={onPendingReferenceAttachmentConsumed}
        onQuickReferenceSelect={handleQuickReferenceSelect}
        onConfirmPlan={onConfirmPlan}
        onConfirmGeneration={onConfirmGeneration}
        onFocusNode={onFocusNode}
        onLayoutChange={onLayoutChange}
      />
    </>
  );
});

// --- Inner Canvas ---
function InnerCanvas({ userId, onBackToLibrary, onCanvasReady }: InnerCanvasProps) {
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
  const undoStackLength = useCanvasStore((s) => s.undoStack.length);
  const redoStackLength = useCanvasStore((s) => s.redoStack.length);
  const attachProject = useCanvasStore((s) => s.attachProject);
  const renameProject = useCanvasStore((s) => s.renameProject);
  const deleteProject = useCanvasStore((s) => s.deleteProject);
  const generateTextFromTextNode = useCanvasStore((s) => s.generateTextFromTextNode);
  const generateImageFromImageGenerationNode = useCanvasStore((s) => s.generateImageFromImageGenerationNode);
  const createPanorama360FromImageNode = useCanvasStore((s) => s.createPanorama360FromImageNode);
  const createDirectorDeskCaptureNode = useCanvasStore((s) => s.createDirectorDeskCaptureNode);

  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const addNodes = useCanvasStore((s) => s.addNodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
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
  const addReferenceMediaToTextNode = useCanvasStore(
    (s) => s.addReferenceMediaToTextNode,
  );
  const addReferenceMediaToStoryboardNode = useCanvasStore(
    (s) => s.addReferenceMediaToStoryboardNode,
  );
  const addReferenceMediaToVideoGenerationNode = useCanvasStore(
    (s) => s.addReferenceMediaToVideoGenerationNode,
  );
  const addReferenceMediaToAudioGenerationNode = useCanvasStore(
    (s) => s.addReferenceMediaToAudioGenerationNode,
  );
  const updateInlineReferenceMedia = useCanvasStore((s) => s.updateInlineReferenceMedia);
  const materialFolders = useCanvasStore((s) => s.materialFolders);
  const materials = useCanvasStore((s) => s.materials);
  const addMaterialFolder = useCanvasStore((s) => s.addMaterialFolder);
  const renameMaterialFolder = useCanvasStore((s) => s.renameMaterialFolder);
  const deleteMaterialFolder = useCanvasStore((s) => s.deleteMaterialFolder);
  const addMaterial = useCanvasStore((s) => s.addMaterial);
  const renameMaterial = useCanvasStore((s) => s.renameMaterial);
  const moveMaterial = useCanvasStore((s) => s.moveMaterial);
  const duplicateMaterial = useCanvasStore((s) => s.duplicateMaterial);
  const deleteMaterial = useCanvasStore((s) => s.deleteMaterial);
  const storeGroups = useCanvasStore((s) => s.groups);
  const createGroup = useCanvasStore((s) => s.createGroup);
  const deleteGroup = useCanvasStore((s) => s.deleteGroup);
  const renameGroup = useCanvasStore((s) => s.renameGroup);
  const updateGroupBackgroundColor = useCanvasStore((s) => s.updateGroupBackgroundColor);
  const moveGroup = useCanvasStore((s) => s.moveGroup);

  const canvasReadyRootRef = useRef<HTMLDivElement | null>(null);
  const canvasReadyNotifiedRef = useRef(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeFocusRequest, setNodeFocusRequest] = useState<{
    nodeId: string;
    requestId: number;
  } | null>(null);
  const [nodeTitleEditRequest, setNodeTitleEditRequest] = useState<{
    nodeId: string;
    requestId: number;
  } | null>(null);
  const [panorama360NavigationNodeId, setPanorama360NavigationNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [groupDragOffsets, setGroupDragOffsets] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const groupDragActive = groupDragOffsets.size > 0;
  const [groupConnectionPreview, setGroupConnectionPreview] = useState<GroupConnectionPreview | null>(null);
  const [quickReferenceConnect, setQuickReferenceConnect] = useState<QuickReferenceConnectMode | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [edgeDeleteButtonPosition, setEdgeDeleteButtonPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [addMenu, setAddMenu] = useState<{
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
  } | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    nodeId: string;
    screen: { x: number; y: number };
  } | null>(null);
  const [pendingAgentReferenceAttachment, setPendingAgentReferenceAttachment] =
    useState<AgentTaskAttachment | null>(null);
  const closeAddMenuTimeoutRef = useRef<number | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<PendingConnectionMenu | null>(null);
  const [imageInfoPopover, setImageInfoPopover] = useState<ImageGenerationInfoPopoverData | null>(null);
  const imageInfoRequestIdRef = useRef(0);
  const [agentPanelLayout, setAgentPanelLayout] = useState({
    open: false,
    width: 0,
  });
  const imageInfoPopoverRightOffset = agentPanelLayout.open
    ? agentPanelLayout.width + AGENT_PANEL_FLOATING_INSET + 16
    : 24;
  const promptLibraryButtonRightOffset = agentPanelLayout.open
    ? agentPanelLayout.width + AGENT_PANEL_FLOATING_INSET + 12
    : 20;
  const [imageLightbox, setImageLightbox] = useState<ImageLightboxData | null>(null);
  const [cropMode, setCropMode] = useState<CropOverlayData | null>(null);
  const [annotationMode, setAnnotationMode] = useState<ImageAnnotationOverlayData | null>(null);
  const [historyAnchor, setHistoryAnchor] = useState<{ x: number; y: number } | null>(null);
  const [historyOpenKey, setHistoryOpenKey] = useState(0);
  const [materialLibraryAnchor, setMaterialLibraryAnchor] = useState<{ x: number; y: number } | null>(null);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [materialDialogMode, setMaterialDialogMode] = useState<MaterialLibraryDialogMode>('save');
  const [materialDialogOpenKey, setMaterialDialogOpenKey] = useState(0);
  const [pendingMaterialSource, setPendingMaterialSource] = useState<PendingMaterialSource | null>(null);
  const [movingMaterial, setMovingMaterial] = useState<MaterialLibraryItem | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogBusy, setProjectDialogBusy] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [openDirectorNodeId, setOpenDirectorNodeId] = useState<string | null>(null);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const gridSnapEnabledRef = useRef(gridSnapEnabled);
  const [alignmentGuides, setAlignmentGuides] = useState<CanvasAlignmentGuide[]>([]);
  const [createDraft, setCreateDraft] = useState<CreateProjectDraft>({
    projectName: '',
    parentHandle: null,
    parentDirectoryLabel: '',
  });
  const edgeStyle = useStoredCanvasEdgeStyle(userId);
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

  useEffect(() => {
    gridSnapEnabledRef.current = gridSnapEnabled;
  }, [gridSnapEnabled]);

  useEffect(() => {
    if (
      quickReferenceConnect &&
      quickReferenceConnect.targetKind === 'node' &&
      !storeNodes.some(
        (node) => node.id === quickReferenceConnect.targetNodeId && node.type === quickReferenceConnect.targetType,
      )
    ) {
      const timeout = window.setTimeout(() => {
        setQuickReferenceConnect(null);
      }, 0);

      return () => window.clearTimeout(timeout);
    }
  }, [quickReferenceConnect, storeNodes]);

  const handleToggleEdgeStyle = useCallback(() => {
    setStoredCanvasEdgeStyle(userId, edgeStyle === 'straight' ? 'curve' : 'straight');
  }, [edgeStyle, userId]);

  const handleToggleGridSnap = useCallback(() => {
    setGridSnapEnabled((enabled) => {
      const nextEnabled = !enabled;
      gridSnapEnabledRef.current = nextEnabled;

      if (!nextEnabled) {
        setAlignmentGuides([]);
      }

      return nextEnabled;
    });
  }, []);

  function applyGridSnapToNodeChanges(changes: NodeChange[]): NodeChange[] {
    if (!gridSnapEnabledRef.current) {
      return changes;
    }

    return changes.map((change) => {
      if (change.type !== 'position' || !change.position || change.dragging !== true) {
        return change;
      }

      const position = snapCanvasPositionToGrid(change.position);
      return {
        ...change,
        position,
        positionAbsolute: position,
      };
    });
  }

  const updateAlignmentGuidesForDrag = useCallback((
    nodeId: string,
    position: { x: number; y: number } | undefined,
  ) => {
    if (!gridSnapEnabledRef.current || !position) {
      setAlignmentGuides([]);
      return;
    }

    const currentNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);

    if (!currentNode) {
      setAlignmentGuides([]);
      return;
    }

    setAlignmentGuides(getCanvasAlignmentGuides(
      { ...currentNode, position } as CanvasNode,
      useCanvasStore.getState().nodes,
    ));
  }, []);

  const derivedRfNodes = useMemo<ReactFlowNode[]>(() => {
    const nodes: ReactFlowNode[] = storeNodes.map((n) => {
      const classNames = [
        quickReferenceConnect ? 'gl-quick-reference-node' : '',
        quickReferenceConnect
          ? quickReferenceConnect.targetKind === 'node' && n.id === quickReferenceConnect.targetNodeId
            ? 'gl-quick-reference-target'
            : canNodeProvideQuickReference(n, quickReferenceConnect)
              ? 'gl-quick-reference-connectable'
              : 'gl-quick-reference-muted'
          : '',
      ].filter(Boolean);

      return {
        id: n.id,
        type: n.type,
        position: n.position,
        className: classNames.length ? classNames.join(' ') : undefined,
        data: {
          ...n.data,
          canvasNodeActive: activeNodeId === n.id,
          canvasFocusRequestId: nodeFocusRequest?.nodeId === n.id
            ? nodeFocusRequest.requestId
            : undefined,
          canvasTitleEditRequestId: nodeTitleEditRequest?.nodeId === n.id
            ? nodeTitleEditRequest.requestId
            : undefined,
        },
        selected: selectedNodeIds.has(n.id),
        dragHandle:
          n.type === 'text'
            ? '.text-node-drag-handle'
            : n.type === 'storyboard_script'
              ? '.storyboard-script-node-drag-handle'
            : n.type === 'image_generation' || n.type === 'video_generation' || n.type === 'video_upscale'
              ? '.image-generation-node-drag-handle'
            : undefined,
      };
    });

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
  }, [activeNodeId, connectionMenu, nodeFocusRequest, nodeTitleEditRequest, quickReferenceConnect, storeNodes, selectedNodeIds]);
  const [rfNodes, setRfNodes] = useState<ReactFlowNode[]>(derivedRfNodes);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (draggingNodeIdRef.current) {
        return;
      }

      setRfNodes((currentNodes) => mergeStableReactFlowNodes(currentNodes, derivedRfNodes));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [derivedRfNodes]);

  useEffect(() => {
    canvasReadyNotifiedRef.current = false;
  }, [currentProject?.id]);

  useEffect(() => {
    if (!onCanvasReady || canvasReadyNotifiedRef.current || loading) {
      return;
    }

    if (!areCanvasNodesSynced(
      storeNodes.map((node) => node.id),
      rfNodes.map((node) => node.id),
    )) {
      return;
    }

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const cleanups: Array<() => void> = [];

    const notifyReady = () => {
      if (cancelled || canvasReadyNotifiedRef.current) {
        return;
      }

      canvasReadyNotifiedRef.current = true;
      onCanvasReady();
    };

    const waitForMedia = () => {
      if (cancelled) {
        return;
      }

      const root = canvasReadyRootRef.current;
      const images = root
        ? Array.from(root.querySelectorAll('img'))
        : [];
      const videos = root
        ? Array.from(root.querySelectorAll('video'))
        : [];
      const pendingImages = images.filter((image) => image.loading !== 'lazy' && !image.complete);
      const pendingVideos = videos.filter((video) => video.readyState < 2);
      const pendingMediaCount = pendingImages.length + pendingVideos.length;

      if (pendingMediaCount === 0) {
        notifyReady();
        return;
      }

      let settledCount = 0;
      const timeoutId = window.setTimeout(notifyReady, CANVAS_READY_MEDIA_TIMEOUT_MS);
      cleanups.push(() => window.clearTimeout(timeoutId));
      const handleSettled = () => {
        settledCount += 1;

        if (settledCount >= pendingMediaCount) {
          window.clearTimeout(timeoutId);
          notifyReady();
        }
      };

      pendingImages.forEach((image) => {
        image.addEventListener('load', handleSettled, { once: true });
        image.addEventListener('error', handleSettled, { once: true });
        cleanups.push(() => {
          image.removeEventListener('load', handleSettled);
          image.removeEventListener('error', handleSettled);
        });
      });

      pendingVideos.forEach((video) => {
        video.addEventListener('loadeddata', handleSettled, { once: true });
        video.addEventListener('error', handleSettled, { once: true });
        cleanups.push(() => {
          video.removeEventListener('loadeddata', handleSettled);
          video.removeEventListener('error', handleSettled);
        });
      });
    };

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(waitForMedia);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [currentProject?.id, loading, onCanvasReady, rfNodes, storeNodes]);

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
  const materialUploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const contextMenuUploadPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const referenceUploadNodeIdRef = React.useRef<string | null>(null);
  const textReferenceUploadNodeIdRef = React.useRef<string | null>(null);
  const storyboardReferenceUploadNodeIdRef = React.useRef<string | null>(null);
  const videoReferenceUploadNodeIdRef = React.useRef<string | null>(null);
  const copiedNodesRef = useRef<CanvasNode[]>([]);
  const connectedCopyBufferRef = useRef<ConnectedCopyBuffer | null>(null);
  const pasteCountRef = useRef(0);
  const [hasCopiedNodes, setHasCopiedNodes] = useState(false);
  const promptBarInteractionRef = useRef(false);
  const pendingConnectionRef = useRef<OnConnectStartParams | null>(null);
  const suppressNextPaneClearRef = useRef(false);
  const skipNextPaneClickClearRef = useRef(false);
  const cropPrevViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const selectionDragActiveRef = useRef(false);
  const panePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const paneGroupDragRef = useRef<{ groupId: string; lastX: number; lastY: number; moved: boolean } | null>(null);
  const activeGroupDragIdRef = useRef<string | null>(null);
  const suppressSelectionWhileGroupDraggingRef = useRef(false);
  const multiSelectionFrameDragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const smartResetFocusedSelectionRef = useRef(false);
  const [paneSelectionDragging, setPaneSelectionDragging] = useState(false);
  const [selectionInProgress, setSelectionInProgress] = useState(false);

  const { fitView, getViewport, project, setViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const refreshRestoreViewportAppliedRef = useRef<string | null>(null);
  const contextMenuPlatform = useMemo<CanvasContextMenuPlatform>(() => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.platform.toLowerCase().includes('mac')
    ) {
      return 'mac';
    }

    return 'windows';
  }, []);

  const refreshNodeInternalsAfterRender = useCallback((nodeIds: string[]) => {
    const uniqueNodeIds = Array.from(new Set(nodeIds.filter(Boolean)));

    if (uniqueNodeIds.length === 0) {
      return;
    }

    const firstFrame = window.requestAnimationFrame(() => {
      updateNodeInternals(uniqueNodeIds);
      window.requestAnimationFrame(() => {
        updateNodeInternals(uniqueNodeIds);
      });
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [updateNodeInternals]);

  const showProjectMessage = useCallback((message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => {
      setSaveMessage(null);
    }, 2200);
  }, [setSaveMessage]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setNodeContextMenu(null);
  }, []);

  useEffect(() => {
    const handleViewportRequest = () => {
      if (!currentProject?.id) {
        return;
      }

      mergeUpdateRefreshRestoreViewport(userId, currentProject.id, getViewport());
    };

    window.addEventListener(UPDATE_REFRESH_VIEWPORT_REQUEST_EVENT, handleViewportRequest);
    return () => {
      window.removeEventListener(UPDATE_REFRESH_VIEWPORT_REQUEST_EVENT, handleViewportRequest);
    };
  }, [currentProject?.id, getViewport, userId]);

  useEffect(() => {
    if (loading || !currentProject?.id) {
      return;
    }

    if (refreshRestoreViewportAppliedRef.current === currentProject.id) {
      return;
    }

    const restoreState = readUpdateRefreshRestoreState(userId);
    if (
      restoreState?.mode !== 'canvas' ||
      restoreState.projectId !== currentProject.id
    ) {
      return;
    }

    if (!restoreState.viewport) {
      clearUpdateRefreshRestoreState(userId);
      return;
    }

    refreshRestoreViewportAppliedRef.current = currentProject.id;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void setViewport(restoreState.viewport!, { duration: 0 });
        clearUpdateRefreshRestoreState(userId);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [currentProject?.id, loading, setViewport, userId]);

  const openImageAnnotationMode = useCallback((data: ImageAnnotationOverlayData) => {
    cropPrevViewportRef.current = getViewport();

    const targetZoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM,
      Math.min(
        (window.innerWidth * 0.72) / data.cardWidth,
        (window.innerHeight * 0.72) / data.cardHeight,
      ),
    ));
    const cardCenterX = data.nodePosition.x + data.cardLeft + data.cardWidth / 2;
    const cardCenterY = data.nodePosition.y + data.cardTop + data.cardHeight / 2;

    void setViewport({
      x: window.innerWidth / 2 - cardCenterX * targetZoom,
      y: window.innerHeight / 2 - cardCenterY * targetZoom,
      zoom: targetZoom,
    }, { duration: 520 });

    setImageInfoPopover(null);
    setImageLightbox(null);
    setCropMode(null);
    setAnnotationMode(data);
  }, [getViewport, setViewport]);

  const handleCloseAnnotationMode = useCallback(() => {
    setAnnotationMode(null);
    const prev = cropPrevViewportRef.current;
    if (prev) {
      cropPrevViewportRef.current = null;
      void setViewport(prev, { duration: 320 });
    }
  }, [setViewport]);

  const handleChangeAnnotations = useCallback((
    nodeId: string,
    nodeType: ImageAnnotationNodeType,
    annotations: ImageAnnotation[],
  ) => {
    if (nodeType === 'image_generation') {
      updateNodeData<'image_generation'>(nodeId, { annotations });
    } else if (nodeType === 'uploaded_image') {
      updateNodeData<'uploaded_image'>(nodeId, { annotations });
    } else {
      updateNodeData<'image'>(nodeId, { annotations });
    }

    setAnnotationMode((current) =>
      current?.nodeId === nodeId ? { ...current, annotations } : current,
    );
  }, [updateNodeData]);

  const clearSourceAnnotations = useCallback((nodeId: string, nodeType: ImageAnnotationNodeType) => {
    if (nodeType === 'image_generation') {
      updateNodeData<'image_generation'>(nodeId, { annotations: [] });
    } else if (nodeType === 'uploaded_image') {
      updateNodeData<'uploaded_image'>(nodeId, { annotations: [] });
    } else {
      updateNodeData<'image'>(nodeId, { annotations: [] });
    }
  }, [updateNodeData]);

  const handleSaveAnnotationMode = useCallback(async (data: ImageAnnotationOverlayData) => {
    const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === data.nodeId);

    if (!sourceNode) {
      showProjectMessage('\u627e\u4e0d\u5230\u6e90\u56fe\u7247');
      return;
    }

    try {
      const annotationZoom = getViewport().zoom;
      const result = await createAnnotatedImageDataUrl(data.imageUrl, data.annotations, {
        width: data.cardWidth * annotationZoom,
        height: data.cardHeight * annotationZoom,
      }, {
        flipX: data.flipX,
        flipY: data.flipY,
      });
      const fileName = `annotation-${Date.now()}.png`;
      const hostedImageUrl = await saveAnnotationImageDataUrl(result.dataUrl, fileName);
      const annotatedTitle = createAnnotatedImageNodeTitle(sourceNode);
      const nextNode = createImportedImageNode(
        {
          title: annotatedTitle,
          imageUrl: hostedImageUrl,
          hostedImageUrl,
          prompt: annotatedTitle,
          width: result.width,
          height: result.height,
          displayWidth: data.cardWidth,
          displayHeight: data.cardHeight,
          generatedAt: new Date().toISOString(),
          sourceImageNodeId: data.nodeId,
        },
        {
          x: data.nodePosition.x + data.cardLeft + data.cardWidth + 80,
          y: data.nodePosition.y + data.cardTop,
        },
      );

      addNodes([nextNode]);
      clearSourceAnnotations(data.nodeId, data.nodeType);
      setSelectedNodeIds(new Set([nextNode.id]));
      setActiveNodeId(nextNode.id);
      setSelectedGroupId(null);
      setSelectedEdgeId(null);
      setEdgeDeleteButtonPosition(null);
      setAnnotationMode(null);
      const prev = cropPrevViewportRef.current;

      if (prev) {
        cropPrevViewportRef.current = null;
        void setViewport(prev, { duration: 320 });
      }

      setNodeFocusRequest({
        nodeId: nextNode.id,
        requestId: Date.now(),
      });
      showProjectMessage('\u5df2\u521b\u5efa\u6807\u6ce8\u56fe\u7247');
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '\u4fdd\u5b58\u6807\u6ce8\u56fe\u7247\u5931\u8d25');
    }
  }, [addNodes, clearSourceAnnotations, getViewport, setViewport, showProjectMessage]);

  useEffect(() => {
    const root = canvasReadyRootRef.current;

    if (!root) {
      return;
    }

    const handleCtrlWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const viewport = getViewport();
      const nextZoom = clampZoomLevel(
        viewport.zoom * (1 - event.deltaY * CANVAS_CTRL_WHEEL_ZOOM_STEP),
      );

      if (nextZoom === viewport.zoom) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const canvasX = (pointerX - viewport.x) / viewport.zoom;
      const canvasY = (pointerY - viewport.y) / viewport.zoom;

      void setViewport({
        x: pointerX - canvasX * nextZoom,
        y: pointerY - canvasY * nextZoom,
        zoom: nextZoom,
      }, { duration: 0 });
    };

    root.addEventListener('wheel', handleCtrlWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      root.removeEventListener('wheel', handleCtrlWheel, true);
    };
  }, [getViewport, setViewport]);

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

  const clearEdgeSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeDeleteButtonPosition(null);
  }, []);

  const clearConnectionMenu = useCallback(() => {
    setConnectionMenu(null);
  }, [setConnectionMenu]);

  const startQuickReferenceConnect = useCallback((mode: QuickReferenceConnectMode) => {
    setQuickReferenceConnect(mode);
    setAddMenu(null);
    setNodeContextMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
    setImageLightbox(null);
    clearEdgeSelection();
    showProjectMessage('请选择一个图片节点进行连接');
  }, [clearConnectionMenu, clearEdgeSelection, showProjectMessage]);

  const stopQuickReferenceConnect = useCallback(() => {
    setQuickReferenceConnect(null);
  }, []);

  useEffect(() => {
    notifyQuickReferenceConnectRequest = startQuickReferenceConnect;

    return () => {
      notifyQuickReferenceConnectRequest = null;
    };
  }, [startQuickReferenceConnect]);

  const updateHoveredGroupFromPointer = useCallback((event: {
    target?: EventTarget | null;
    clientX: number;
    clientY: number;
  }) => {
    if (activeGroupDragIdRef.current) {
      return;
    }

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
    const openMaterialLibraryDialog = (source: PendingMaterialSource) => {
      setMaterialDialogMode('save');
      setMaterialDialogOpenKey((value) => value + 1);
      setPendingMaterialSource(source);
      setMovingMaterial(null);
      setImageInfoPopover(null);
      setImageLightbox(null);
    };

    const handleMaterialLibraryRequest = (event: Event) => {
      const source = (event as CustomEvent<PendingMaterialSource>).detail;
      if (source) {
        openMaterialLibraryDialog(source);
      }
    };

    notifyMaterialLibraryRequest = openMaterialLibraryDialog;
    window.addEventListener(MATERIAL_LIBRARY_REQUEST_EVENT, handleMaterialLibraryRequest);

    return () => {
      window.removeEventListener(MATERIAL_LIBRARY_REQUEST_EVENT, handleMaterialLibraryRequest);
      if (notifyMaterialLibraryRequest === openMaterialLibraryDialog) {
        notifyMaterialLibraryRequest = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyImageToolbarAction = (action, data) => {
      if (action === 'organize') {
        const source = createMaterialSourceFromImageGenerationData(data);

        if (!source) {
          showProjectMessage('当前节点没有可保存到素材库的图片');
          return;
        }

        requestMaterialLibrarySave(source);
        return;
      }

      if (action === 'crop' || action === 'annotate') {
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
        const cardTopOffset = 0;
        const cardLeftOffset = 0;

        if (action === 'annotate') {
          openImageAnnotationMode({
            nodeId: targetNode.id,
            nodeType: 'image_generation',
            imageUrl,
            nodePosition: targetNode.position,
            cardLeft: cardLeftOffset,
            cardTop: cardTopOffset,
            cardWidth: cardW,
            cardHeight: cardH,
            annotations: targetNode.data.annotations ?? [],
            flipX: false,
            flipY: false,
          });
          return;
        }

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
            setSaveMessage(error instanceof Error ? error.message : '360 全景生成失败');
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
            setSaveMessage(error instanceof Error ? error.message : '下载失败');
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
    openImageAnnotationMode,
    setCropMode,
    setSaveMessage,
    setViewport,
    showProjectMessage,
    splitImageGenerationNodeToGrid,
    storeNodes,
  ]);

  useEffect(() => {
    notifyUploadedImageToolbarAction = (action, nodeId, data, cardLayout) => {
      if (action === 'crop' || action === 'annotate') {
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

        if (action === 'annotate') {
          openImageAnnotationMode({
            nodeId: targetNode.id,
            nodeType: 'uploaded_image',
            imageUrl,
            nodePosition: targetNode.position,
            cardLeft,
            cardTop,
            cardWidth: cardW,
            cardHeight: cardH,
            annotations: targetNode.data.annotations ?? [],
            flipX: false,
            flipY: false,
          });
          return;
        }

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
          showProjectMessage('当前节点没有可保存到素材库的图片');
          return;
        }

        requestMaterialLibrarySave(source);
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
            setSaveMessage(error instanceof Error ? error.message : '360 全景生成失败');
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
    openImageAnnotationMode,
    setCropMode,
    setSaveMessage,
    setViewport,
    showProjectMessage,
    splitUploadedImageNodeToGrid,
    storeNodes,
  ]);

  useEffect(() => {
    notifyImageNodeCropRequest = (nodeId, data, cardDimensions, imageUrl, mode = 'crop') => {
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

      if (mode === 'annotate') {
        openImageAnnotationMode({
          nodeId: targetNode.id,
          nodeType: 'image',
          imageUrl,
          nodePosition: targetNode.position,
          cardLeft,
          cardTop,
          cardWidth: cardW,
          cardHeight: cardH,
          annotations: targetNode.data.annotations ?? [],
          flipX: false,
          flipY: false,
        });
        return;
      }

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
    openImageAnnotationMode,
    setCropMode,
    setViewport,
    storeNodes,
  ]);

  useEffect(() => {
    notifyImageGenerationReferenceUpload = (nodeId) => {
      referenceUploadNodeIdRef.current = nodeId;
      textReferenceUploadNodeIdRef.current = null;
      storyboardReferenceUploadNodeIdRef.current = null;
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
    notifyTextReferenceUpload = (nodeId) => {
      textReferenceUploadNodeIdRef.current = nodeId;
      referenceUploadNodeIdRef.current = null;
      storyboardReferenceUploadNodeIdRef.current = null;
      videoReferenceUploadNodeIdRef.current = null;
      const input = uploadInputRef.current;

      if (!input) {
        return;
      }
      openFileInput(input);
    };

    return () => {
      notifyTextReferenceUpload = null;
    };
  }, []);

  useEffect(() => {
    notifyStoryboardReferenceUpload = (nodeId) => {
      storyboardReferenceUploadNodeIdRef.current = nodeId;
      referenceUploadNodeIdRef.current = null;
      textReferenceUploadNodeIdRef.current = null;
      videoReferenceUploadNodeIdRef.current = null;
      const input = uploadInputRef.current;

      if (!input) {
        return;
      }
      openFileInput(input);
    };

    return () => {
      notifyStoryboardReferenceUpload = null;
    };
  }, []);

  useEffect(() => {
    notifyVideoGenerationReferenceUpload = (nodeId) => {
      videoReferenceUploadNodeIdRef.current = nodeId;
      referenceUploadNodeIdRef.current = null;
      textReferenceUploadNodeIdRef.current = null;
      storyboardReferenceUploadNodeIdRef.current = null;
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
        setSaveMessage(error instanceof Error ? error.message : '连接失败');
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
    clearCanvasNodeUi();
    setSelectedNodeIds((current) =>
      current.size === 1 && current.has(nodeId) ? current : new Set([nodeId]),
    );
    setActiveNodeId(nodeId);
    setSelectedGroupId(null);
    clearEdgeSelection();
  }, [clearEdgeSelection]);

  const addPromptLibraryEntryToCanvas = useCallback((entry: PromptLibraryEntry) => {
    const viewport = getViewport();
    const nodeId = `prompt-library-${entry.kind}-${crypto.randomUUID()}`;
    const promptText = entry.promptZh?.trim() || entry.promptEn?.trim() || entry.prompt;
    const center = {
      x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
      y: (window.innerHeight / 2 - viewport.y) / viewport.zoom,
    };
    const node: CanvasNode = {
      id: nodeId,
      type: entry.kind === 'video' ? 'video_generation' : 'image_generation',
      position: {
        x: center.x - 180,
        y: center.y - 160,
      },
      data: {
        title: entry.title,
        prompt: promptText,
      },
    } as CanvasNode;

    addNodes([node]);
    selectSingleNode(nodeId);
    showProjectMessage(`\u5df2\u6dfb\u52a0\u201c${entry.title}\u201d\u5230\u753b\u5e03`);
  }, [addNodes, getViewport, selectSingleNode, showProjectMessage]);

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

  const handleDirectorDeskCaptures = useCallback(async (
    directorNodeId: string,
    captures: DirectorDeskCaptureToCanvas[],
  ) => {
    if (captures.length === 0) {
      return;
    }

    try {
      const createdNodeIds: string[] = [];

      for (const capture of captures) {
        const createdNodeId = await createDirectorDeskCaptureNode(directorNodeId, capture);
        createdNodeIds.push(createdNodeId);
      }

      const lastCreatedNodeId = createdNodeIds[createdNodeIds.length - 1];
      if (lastCreatedNodeId) {
        focusCreatedNode(lastCreatedNodeId);
      }

      showProjectMessage(
        captures.length === 1
          ? '已发送截图到画布'
          : `已发送 ${captures.length} 张截图到画布`,
      );
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '发送截图到画布失败');
    }
  }, [createDirectorDeskCaptureNode, focusCreatedNode, showProjectMessage]);

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
    notifyDirectorDeskOpen = (nodeId) => {
      setOpenDirectorNodeId(nodeId);
    };

    return () => {
      if (notifyDirectorDeskOpen) {
        notifyDirectorDeskOpen = null;
      }
    };
  }, []);

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
      const requestId = imageInfoRequestIdRef.current + 1;
      imageInfoRequestIdRef.current = requestId;
      setImageInfoPopover(toCanvasNodeInfoPopoverData(node));

      void toResolvedCanvasNodeInfoPopoverData(node).then((next) => {
        if (imageInfoRequestIdRef.current === requestId) {
          setImageInfoPopover(next);
        }
      });
    };

    return () => {
      if (notifyCanvasImageInfoRequest) {
        notifyCanvasImageInfoRequest = null;
      }
    };
  }, [selectSingleNode, storeNodes]);

  useEffect(() => {
    notifyCanvasImageLightboxRequest = (nodeId) => {
      const node = storeNodes.find(
        (item): item is Extract<CanvasNode, { type: 'image' }> =>
          item.id === nodeId && item.type === 'image',
      );

      if (!node) {
        return;
      }

      const lightboxData = toImageNodeLightboxData(node.data);

      if (!lightboxData) {
        return;
      }

      suppressNextPaneClearRef.current = true;
      window.setTimeout(() => {
        suppressNextPaneClearRef.current = false;
      }, 0);

      selectSingleNode(nodeId);
      setImageInfoPopover(null);
      setImageLightbox(lightboxData);
    };

    return () => {
      notifyCanvasImageLightboxRequest = null;
    };
  }, [selectSingleNode, storeNodes]);

  useEffect(() => {
    notifyStoryboardGridCellPreview = (lightboxData) => {
      suppressNextPaneClearRef.current = true;
      window.setTimeout(() => {
        suppressNextPaneClearRef.current = false;
      }, 0);

      setImageInfoPopover(null);
      setImageLightbox(lightboxData);
    };

    return () => {
      notifyStoryboardGridCellPreview = null;
    };
  }, []);

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

  const applyQuickReferenceSelection = useCallback((nodeId: string) => {
    if (!quickReferenceConnect) {
      return;
    }

    const sourceNode = storeNodes.find((candidate) => candidate.id === nodeId);

    if (!sourceNode || !canNodeProvideQuickReference(sourceNode, quickReferenceConnect)) {
      showProjectMessage('这个节点不能作为参考');
      return;
    }

    if (quickReferenceConnect.targetKind === 'agent') {
      const attachment = createAgentAttachmentFromCanvasImageNode(sourceNode);

      if (!attachment) {
        showProjectMessage('这个节点不能作为参考');
        return;
      }

      const result = quickReferenceConnect.onSelect(attachment);
      showProjectMessage(result === 'duplicate' ? '参考图已添加' : '已添加为 Agent 参考图');
      setQuickReferenceConnect(null);
      clearEdgeSelection();
      setSelectedGroupId(null);
      selectSingleNode(sourceNode.id);
      notifyAgentPanelOpenRequest?.();
      return;
    }

    const alreadyConnected = storeEdges.some(
      (edge) => edge.source === sourceNode.id && edge.target === quickReferenceConnect.targetNodeId,
    );

    if (alreadyConnected) {
      showProjectMessage('已经连接为参考');
    } else {
      addEdgeStore({
        id: crypto.randomUUID(),
        source: sourceNode.id,
        target: quickReferenceConnect.targetNodeId,
      });
      showProjectMessage('已连接为参考');
    }

    setQuickReferenceConnect(null);
    clearEdgeSelection();
    setSelectedGroupId(null);
    selectSingleNode(quickReferenceConnect.targetNodeId);
  }, [
    addEdgeStore,
    clearEdgeSelection,
    quickReferenceConnect,
    selectSingleNode,
    showProjectMessage,
    storeEdges,
    storeNodes,
  ]);

  const handleQuickReferenceMouseDownCapture = useCallback((event: React.MouseEvent) => {
    if (!quickReferenceConnect || event.button !== 0) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const nodeElement = target?.closest('.react-flow__node');
    const nodeId = nodeElement?.getAttribute('data-id');

    if (!nodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (quickReferenceConnect.targetKind === 'agent') {
      applyQuickReferenceSelection(nodeId);
      return;
    }

    const sourceNode = storeNodes.find((candidate) => candidate.id === nodeId);

    if (!sourceNode || !canNodeProvideQuickReference(sourceNode, quickReferenceConnect)) {
      showProjectMessage('这个节点不能作为参考');
      return;
    }

    const alreadyConnected = storeEdges.some(
      (edge) => edge.source === sourceNode.id && edge.target === quickReferenceConnect.targetNodeId,
    );

    if (alreadyConnected) {
      showProjectMessage('已经连接为参考');
    } else {
      addEdgeStore({
        id: crypto.randomUUID(),
        source: sourceNode.id,
        target: quickReferenceConnect.targetNodeId,
      });
      showProjectMessage('已连接为参考');
    }

    setQuickReferenceConnect(null);
    clearEdgeSelection();
    setSelectedGroupId(null);
    selectSingleNode(quickReferenceConnect.targetNodeId);
  }, [
    addEdgeStore,
    clearEdgeSelection,
    applyQuickReferenceSelection,
    quickReferenceConnect,
    selectSingleNode,
    showProjectMessage,
    storeEdges,
    storeNodes,
  ]);

  const handleNodeClick = useCallback((
    event: React.MouseEvent,
    node: ReactFlowNode,
  ) => {
    if (quickReferenceConnect) {
      event.preventDefault();
      event.stopPropagation();

      if (quickReferenceConnect.targetKind === 'agent') {
        applyQuickReferenceSelection(node.id);
        return;
      }

      const sourceNode = storeNodes.find((candidate) => candidate.id === node.id);

      if (!sourceNode || !canNodeProvideQuickReference(sourceNode, quickReferenceConnect)) {
        showProjectMessage('这个节点不能作为参考');
        return;
      }

      const alreadyConnected = storeEdges.some(
        (edge) => edge.source === sourceNode.id && edge.target === quickReferenceConnect.targetNodeId,
      );

      if (alreadyConnected) {
        showProjectMessage('已经连接为参考');
      } else {
        addEdgeStore({
          id: crypto.randomUUID(),
          source: sourceNode.id,
          target: quickReferenceConnect.targetNodeId,
        });
        showProjectMessage('已连接为参考');
      }

      setQuickReferenceConnect(null);
      clearEdgeSelection();
      setSelectedGroupId(null);
      selectSingleNode(quickReferenceConnect.targetNodeId);
      return;
    }

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
    }, [addEdgeStore, applyQuickReferenceSelection, clearEdgeSelection, quickReferenceConnect, selectSingleNode, showProjectMessage, storeEdges, storeNodes]);

  const handleNodeContextMenu = useCallback((
    event: React.MouseEvent,
    node: ReactFlowNode,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedNodeIds((current) => {
      if (current.has(node.id)) {
        selectedNodeIdsRef.current = current;
        return current;
      }

      const next = new Set([node.id]);
      selectedNodeIdsRef.current = next;
      return next;
    });
    setActiveNodeId(node.id);
    setSelectedGroupId(null);
    clearEdgeSelection();
    clearConnectionMenu();
    setContextMenu(null);
    setAddMenu(null);
    setImageInfoPopover(null);
    setImageLightbox(null);
    setNodeContextMenu({
      nodeId: node.id,
      screen: { x: event.clientX, y: event.clientY },
    });
  }, [clearConnectionMenu, clearEdgeSelection]);

  const handleNodeDoubleClick = useCallback((
    event: React.MouseEvent,
    node: ReactFlowNode,
  ) => {
    if (!shouldFocusNodeOnDoubleClick(node.type) || !isNodeCardFocusTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectSingleNode(node.id);
    focusSingleNodeViewport(node.id);
  }, [focusSingleNodeViewport, selectSingleNode]);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: ReactFlowNode[] }) => {
    if (paneGroupDragRef.current || suppressSelectionWhileGroupDraggingRef.current) {
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
    if (paneGroupDragRef.current || suppressSelectionWhileGroupDraggingRef.current) {
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

    if (paneGroupDragRef.current || suppressSelectionWhileGroupDraggingRef.current) {
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

  const moveSelectedFlowNodes = useCallback((dx: number, dy: number, dragging: boolean) => {
    const selectedIds = selectedNodeIdsRef.current;

    if (selectedIds.size <= 1) {
      return;
    }

    setRfNodes((currentNodes) => {
      const changes: NodeChange[] = [];

      for (const node of currentNodes) {
        if (!selectedIds.has(node.id)) {
          continue;
        }

        const position = {
          x: node.position.x + dx,
          y: node.position.y + dy,
        };

        changes.push({
          id: node.id,
          type: 'position',
          position,
          positionAbsolute: position,
          dragging,
        });
      }

      return changes.length > 0 ? applyNodeChanges(changes, currentNodes) : currentNodes;
    });
  }, []);

  const syncSelectedFlowNodePositions = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;

    if (selectedIds.size <= 1) {
      return;
    }

    for (const node of rfNodes) {
      if (!selectedIds.has(node.id)) {
        continue;
      }

      const nextPosition = gridSnapEnabled
        ? snapCanvasPositionToGrid(node.position)
        : node.position;
      updateNodePosition(node.id, nextPosition);
      syncNodeGroupMembership(node.id, nextPosition);
    }

    if (gridSnapEnabled) {
      setRfNodes((currentNodes) =>
        currentNodes.map((node) =>
          selectedIds.has(node.id)
            ? { ...node, position: snapCanvasPositionToGrid(node.position) }
            : node,
        ),
      );
    }

    draggingNodeIdRef.current = null;
  }, [gridSnapEnabled, rfNodes, updateNodePosition]);

  const moveGroupFlowNodes = useCallback((groupId: string, dx: number, dy: number) => {
    const group = useCanvasStore.getState().groups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return;
    }

    const groupNodeIds = new Set(group.nodeIds);
    setRfNodes((currentNodes) => {
      const changes: NodeChange[] = [];

      for (const node of currentNodes) {
        if (!groupNodeIds.has(node.id)) {
          continue;
        }

        const position = {
          x: node.position.x + dx,
          y: node.position.y + dy,
        };

        changes.push({
          id: node.id,
          type: 'position',
          position,
          positionAbsolute: position,
          dragging: true,
        });
      }

      return changes.length > 0 ? applyNodeChanges(changes, currentNodes) : currentNodes;
    });
  }, []);

  const snapGroupToGrid = useCallback((groupId: string): boolean => {
    const group = useCanvasStore.getState().groups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return false;
    }

    const snappedPosition = snapCanvasPositionToGrid({ x: group.x, y: group.y });
    const dx = snappedPosition.x - group.x;
    const dy = snappedPosition.y - group.y;

    if (dx === 0 && dy === 0) {
      return false;
    }

    moveGroup(groupId, dx, dy);
    moveGroupFlowNodes(groupId, dx, dy);
    return true;
  }, [moveGroup, moveGroupFlowNodes]);

  const handleGroupDragStart = useCallback((groupId: string) => {
    const group = useCanvasStore.getState().groups.find((candidate) => candidate.id === groupId);

    activeGroupDragIdRef.current = groupId;
    suppressSelectionWhileGroupDraggingRef.current = true;
    draggingNodeIdRef.current = group?.nodeIds[0] ?? null;
    setGroupDragOffsets((current) => {
      if (current.has(groupId)) {
        return current;
      }

      const next = new Map(current);
      next.set(groupId, { x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleGroupDrag = useCallback((groupId: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) {
      return;
    }

    setGroupDragOffsets((current) => {
      const currentOffset = current.get(groupId) ?? { x: 0, y: 0 };
      const next = new Map(current);
      next.set(groupId, {
        x: currentOffset.x + dx,
        y: currentOffset.y + dy,
      });
      return next;
    });
    moveGroupFlowNodes(groupId, dx, dy);
  }, [moveGroupFlowNodes]);

  const handleGroupDragEnd = useCallback((groupId: string, moved: boolean) => {
    const offset = groupDragOffsets.get(groupId);
    setGroupDragOffsets((current) => {
      if (!current.has(groupId)) {
        return current;
      }

      const next = new Map(current);
      next.delete(groupId);
      return next;
    });

    if (moved && offset && (offset.x !== 0 || offset.y !== 0)) {
      moveGroup(groupId, offset.x, offset.y);

      if (gridSnapEnabled) {
        snapGroupToGrid(groupId);
      }
    }

    activeGroupDragIdRef.current = null;
    draggingNodeIdRef.current = null;
    setAlignmentGuides([]);
    window.setTimeout(() => {
      suppressSelectionWhileGroupDraggingRef.current = false;
    }, 80);
  }, [gridSnapEnabled, groupDragOffsets, moveGroup, snapGroupToGrid]);

  const handleSelectionFramePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || selectedNodeIdsRef.current.size <= 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    multiSelectionFrameDragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    draggingNodeIdRef.current = Array.from(selectedNodeIdsRef.current)[0] ?? null;
    skipNextPaneClickClearRef.current = true;
    clearEdgeSelection();
    setSelectedGroupId(null);
  }, [clearEdgeSelection]);

  const handleSelectionFramePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = multiSelectionFrameDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const screenDx = event.clientX - drag.lastX;
    const screenDy = event.clientY - drag.lastY;

    if (screenDx === 0 && screenDy === 0) {
      return;
    }

    const { zoom } = getViewport();
    multiSelectionFrameDragRef.current = {
      pointerId: drag.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: true,
    };
    moveSelectedFlowNodes(screenDx / zoom, screenDy / zoom, true);
  }, [getViewport, moveSelectedFlowNodes]);

  const handleSelectionFramePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = multiSelectionFrameDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    multiSelectionFrameDragRef.current = null;

    if (drag.moved) {
      syncSelectedFlowNodePositions();
    } else {
      draggingNodeIdRef.current = null;
    }
    setAlignmentGuides([]);

    window.setTimeout(() => {
      skipNextPaneClickClearRef.current = false;
    }, 0);
  }, [syncSelectedFlowNodePositions]);

  const handleSelectionFramePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = multiSelectionFrameDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    multiSelectionFrameDragRef.current = null;
    draggingNodeIdRef.current = null;
    setAlignmentGuides([]);
    window.setTimeout(() => {
      skipNextPaneClickClearRef.current = false;
    }, 0);
  }, []);

  const handlePaneMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button === 0) {
      setContextMenu(null);
      setNodeContextMenu(null);
    }

    if (quickReferenceConnect) {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        stopQuickReferenceConnect();
      }

      panePointerStartRef.current = null;
      setPaneSelectionDragging(false);
      setSelectionInProgress(false);
      return;
    }

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
      handleGroupDragStart(group.id);
      selectGroup(group.id);
      return;
    }

    panePointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setPaneSelectionDragging(false);
  }, [
    handleGroupDragStart,
    project,
    quickReferenceConnect,
    selectGroup,
    stopQuickReferenceConnect,
    storeGroups,
  ]);

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
        handleGroupDrag(groupDrag.groupId, dx / zoom, dy / zoom);
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
  }, [getViewport, handleGroupDrag, updateHoveredGroupFromPointer]);

  const handlePaneMouseUp = useCallback((event?: React.MouseEvent) => {
    if (paneGroupDragRef.current) {
      event?.preventDefault();
      event?.stopPropagation();
      const { groupId, moved } = paneGroupDragRef.current;
      paneGroupDragRef.current = null;
      handleGroupDragEnd(groupId, moved);
      window.setTimeout(() => {
        skipNextPaneClickClearRef.current = false;
      }, 0);
    }

    panePointerStartRef.current = null;
    setPaneSelectionDragging(false);
    setSelectionInProgress(false);
  }, [handleGroupDragEnd]);

  const handlePaneMouseLeave = useCallback((event: React.MouseEvent) => {
    setHoveredGroupId(null);
    handlePaneMouseUp(event);
  }, [handlePaneMouseUp]);

  const copyNodeIdsToInternalClipboard = useCallback((nodeIds: Set<string>) => {
    if (nodeIds.size === 0) {
      return false;
    }

    const selectedNodes = storeNodes.filter((node) => nodeIds.has(node.id));

    if (selectedNodes.length === 0) {
      return false;
    }

    copiedNodesRef.current = selectedNodes.map((node) => cloneCanvasNode(node, 0));
    connectedCopyBufferRef.current = createConnectedCopyBuffer(
      selectedNodes,
      storeEdges,
      nodeIds,
    );
    pasteCountRef.current = 0;
    setHasCopiedNodes(true);
    return true;
  }, [storeEdges, storeNodes]);

  const handleCopySelectedNodes = useCallback(() => {
    return copyNodeIdsToInternalClipboard(selectedNodeIds);
  }, [copyNodeIdsToInternalClipboard, selectedNodeIds]);

  const nodeContextTarget = useMemo(() => (
    nodeContextMenu
      ? storeNodes.find((node) => node.id === nodeContextMenu.nodeId) ?? null
      : null
  ), [nodeContextMenu, storeNodes]);
  const nodeContextAttachment = useMemo(() => (
    nodeContextTarget ? createAgentAttachmentFromNode(nodeContextTarget) : null
  ), [nodeContextTarget]);
  const nodeContextClipboardContent = useMemo(() => (
    nodeContextTarget ? getNodeClipboardContent(nodeContextTarget) : null
  ), [nodeContextTarget]);
  const nodeContextExport = useMemo(() => (
    nodeContextTarget ? getNodeExport(nodeContextTarget) : null
  ), [nodeContextTarget]);

  const handleNodeContextAddToConversation = useCallback(() => {
    if (!nodeContextAttachment) {
      return;
    }

    setPendingAgentReferenceAttachment(nodeContextAttachment);
    notifyAgentPanelOpenRequest?.();
    setNodeContextMenu(null);
  }, [nodeContextAttachment]);

  const handleNodeContextCopyContent = useCallback(() => {
    if (!nodeContextClipboardContent) {
      return;
    }

    setNodeContextMenu(null);
    void writeClipboardContent(nodeContextClipboardContent)
      .then(() => showProjectMessage(nodeContextClipboardContent.kind === 'image' ? '已复制图片' : '已复制'))
      .catch((error) => showProjectMessage(error instanceof Error ? error.message : '复制失败'));
  }, [nodeContextClipboardContent, showProjectMessage]);

  const handleNodeContextSaveAs = useCallback(() => {
    if (!nodeContextExport) {
      return;
    }

    setNodeContextMenu(null);
    void saveNodeExport(nodeContextExport)
      .then((result) => {
        if (result === 'saved') {
          showProjectMessage('已保存');
        }
      })
      .catch((error) => showProjectMessage(error instanceof Error ? error.message : '保存失败'));
  }, [nodeContextExport, showProjectMessage]);

  const handleNodeContextRename = useCallback(() => {
    if (!nodeContextTarget || !isNodeRenameable(nodeContextTarget)) {
      return;
    }

    setNodeTitleEditRequest({
      nodeId: nodeContextTarget.id,
      requestId: Date.now(),
    });
    setNodeContextMenu(null);
  }, [nodeContextTarget]);

  const handleNodeContextCopyNode = useCallback(() => {
    if (!nodeContextTarget) {
      return;
    }

    const ids = selectedNodeIds.has(nodeContextTarget.id)
      ? selectedNodeIds
      : new Set([nodeContextTarget.id]);

    if (copyNodeIdsToInternalClipboard(ids)) {
      showProjectMessage('已复制节点');
    }

    setNodeContextMenu(null);
  }, [copyNodeIdsToInternalClipboard, nodeContextTarget, selectedNodeIds, showProjectMessage]);

  const handleNodeContextDelete = useCallback(() => {
    if (!nodeContextTarget) {
      return;
    }

    const ids = selectedNodeIds.has(nodeContextTarget.id)
      ? Array.from(selectedNodeIds)
      : [nodeContextTarget.id];

    deleteNodes(ids);
    clearCanvasNodeUi();
    setActiveNodeId(null);
    selectedNodeIdsRef.current = new Set();
    setSelectedNodeIds(new Set());
    setSelectedGroupId(null);
    clearEdgeSelection();
    setNodeContextMenu(null);
  }, [clearEdgeSelection, deleteNodes, nodeContextTarget, selectedNodeIds]);

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
    setHasCopiedNodes(copiedNodesRef.current.length > 0);
    return true;
  }, [addNodes, clearEdgeSelection]);

  const handlePasteNodesAtPosition = useCallback((targetPosition: { x: number; y: number }) => {
    if (copiedNodesRef.current.length === 0) {
      setHasCopiedNodes(false);
      return false;
    }

    pasteCountRef.current += 1;

    const minX = Math.min(...copiedNodesRef.current.map((node) => node.position.x));
    const minY = Math.min(...copiedNodesRef.current.map((node) => node.position.y));
    const offset = {
      x: targetPosition.x - minX,
      y: targetPosition.y - minY,
    };
    const pastedNodes = copiedNodesRef.current.map((node) => {
      const pastedNode = cloneCanvasNode(node, pasteCountRef.current);

      return {
        ...pastedNode,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      };
    });

    addNodes(pastedNodes);
    setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
    setActiveNodeId(pastedNodes.length === 1 ? pastedNodes[0].id : null);
    clearEdgeSelection();
    setHasCopiedNodes(true);
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
    setHasCopiedNodes(copiedNodesRef.current.length > 0);
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

    const pendingImports = await Promise.all(
      imageFiles.map((file, index) =>
        createPendingImageImportNode(file, getImageImportPosition(basePosition, index)),
      ),
    );
    const nextNodes = pendingImports.map((pending) => pending.node);
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    if (options?.select !== false) {
      setSelectedNodeIds(nextNodeIds);
      setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
      clearEdgeSelection();
    }

    pendingImports.forEach(({ node, localPreviewUrl }, index) => {
      const file = imageFiles[index];

      void readImageFile(file)
        .then((next) => {
          updateNodeData<'image'>(node.id, {
            title: next.title,
            imageUrl: next.imageUrl,
            hostedImageUrl: next.hostedImageUrl,
            previewUrl: next.previewUrl,
            semanticImageUrl: next.semanticImageUrl,
            prompt: next.prompt,
            width: next.width,
            height: next.height,
            sizeBytes: next.sizeBytes,
            generatedAt: next.generatedAt,
            status: 'idle',
            errorMessage: undefined,
          });
          URL.revokeObjectURL(localPreviewUrl);
        })
        .catch((error) => {
          updateNodeData<'image'>(node.id, {
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Image upload failed',
          });
        });
    });
  }, [addNodes, clearEdgeSelection, updateNodeData]);

  const addUploadedVideos = useCallback(async (
    files: File[],
    basePosition: { x: number; y: number },
    options?: { select?: boolean },
  ) => {
    const videoFiles = files.filter((file) => file.type.startsWith('video/'));

    if (videoFiles.length === 0) {
      return;
    }

    const pendingImports = await Promise.all(
      videoFiles.map((file, index) =>
        createPendingVideoImportNode(file, getImageImportPosition(basePosition, index)),
      ),
    );
    const nextNodes = pendingImports.map((pending) => pending.node);
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    if (options?.select !== false) {
      setSelectedNodeIds(nextNodeIds);
      setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
      clearEdgeSelection();
    }

    pendingImports.forEach(({ node, localVideoUrl }, index) => {
      const file = videoFiles[index];

      void readVideoFile(file)
        .then((next) => {
          updateNodeData<'video'>(node.id, {
            title: next.title,
            videoUrl: next.videoUrl,
            hostedVideoUrl: next.hostedVideoUrl,
            previewUrl: next.previewUrl,
            fileName: next.fileName,
            width: next.width,
            height: next.height,
            sizeBytes: next.sizeBytes,
            durationSeconds: next.durationSeconds,
            mimeType: next.mimeType,
            status: 'idle',
            statusMessage: undefined,
            errorMessage: undefined,
          });
          URL.revokeObjectURL(localVideoUrl);
        })
        .catch((error) => {
          updateNodeData<'video'>(node.id, {
            status: 'error',
            statusMessage: undefined,
            errorMessage: error instanceof Error ? error.message : 'Video upload failed',
          });
        });
    });
  }, [addNodes, clearEdgeSelection, updateNodeData]);

  const addUploadedAudios = useCallback(async (
    files: File[],
    basePosition: { x: number; y: number },
    options?: { select?: boolean },
  ) => {
    const audioFiles = files.filter((file) => file.type.startsWith('audio/'));

    if (audioFiles.length === 0) {
      return;
    }

    const pendingImports = audioFiles.map((file, index) =>
      createPendingAudioImportNode(file, getImageImportPosition(basePosition, index)),
    );
    const nextNodes = pendingImports.map((pending) => pending.node);
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));

    addNodes(nextNodes);

    if (options?.select !== false) {
      setSelectedNodeIds(nextNodeIds);
      setActiveNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
      clearEdgeSelection();
    }

    pendingImports.forEach(({ node, localAudioUrl }, index) => {
      const file = audioFiles[index];

      void readAudioFile(file)
        .then((next) => {
          updateNodeData<'audio'>(node.id, {
            title: next.title,
            audioUrl: next.audioUrl,
            hostedAudioUrl: next.hostedAudioUrl,
            previewUrl: next.previewUrl,
            fileName: next.fileName,
            mimeType: next.mimeType,
            sizeBytes: next.sizeBytes,
            status: 'idle',
            statusMessage: undefined,
            errorMessage: undefined,
          });
          URL.revokeObjectURL(localAudioUrl);
        })
        .catch((error) => {
          updateNodeData<'audio'>(node.id, {
            status: 'error',
            statusMessage: undefined,
            errorMessage: error instanceof Error ? error.message : 'Audio upload failed',
          });
          URL.revokeObjectURL(localAudioUrl);
        });
    });
  }, [addNodes, clearEdgeSelection, updateNodeData]);

  const updateStoryboardGridCell = useCallback((
    nodeId: string,
    cellIndex: number,
    image: StoryboardGridCellImage,
  ) => {
    const node = useCanvasStore.getState().nodes.find(
      (candidate): candidate is Extract<CanvasNode, { type: 'storyboard_grid' }> =>
        candidate.id === nodeId && candidate.type === 'storyboard_grid',
    );

    if (!node) {
      return;
    }

    const cells = getStoryboardGridCellsForGrid(node.data.cells, node.data.grid);
    cells[cellIndex] = image;
    updateNodeData<'storyboard_grid'>(nodeId, {
      cells,
      status: 'idle',
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  const uploadStoryboardGridCell = useCallback(async (
    nodeId: string,
    cellIndex: number,
    file: File,
  ) => {
    if (!file.type.startsWith('image/')) {
      showProjectMessage('请选择图片文件');
      return;
    }

    const localPreviewUrl = URL.createObjectURL(file);

    try {
      const dimensions = await readImageDimensionsFromUrl(localPreviewUrl);
      updateStoryboardGridCell(nodeId, cellIndex, {
        id: crypto.randomUUID(),
        imageUrl: localPreviewUrl,
        previewUrl: localPreviewUrl,
        fileName: file.name,
        title: file.name,
        width: dimensions.width,
        height: dimensions.height,
      });

      const uploaded = await readImageFile(file);
      updateStoryboardGridCell(nodeId, cellIndex, {
        id: crypto.randomUUID(),
        imageUrl: uploaded.imageUrl,
        hostedImageUrl: uploaded.hostedImageUrl,
        previewUrl: uploaded.previewUrl,
        semanticImageUrl: uploaded.semanticImageUrl,
        fileName: uploaded.fileName,
        title: uploaded.title,
        width: uploaded.width,
        height: uploaded.height,
      });
      URL.revokeObjectURL(localPreviewUrl);
    } catch (error) {
      URL.revokeObjectURL(localPreviewUrl);
      updateNodeData<'storyboard_grid'>(nodeId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  }, [showProjectMessage, updateNodeData, updateStoryboardGridCell]);

  const composeStoryboardGrid = useCallback(async (nodeId: string) => {
    const node = useCanvasStore.getState().nodes.find(
      (candidate): candidate is Extract<CanvasNode, { type: 'storyboard_grid' }> =>
        candidate.id === nodeId && candidate.type === 'storyboard_grid',
    );

    if (!node) {
      return;
    }

    const hasImage = node.data.cells.some(Boolean);

    if (!hasImage) {
      showProjectMessage('分镜格子里还没有图片');
      return;
    }

    updateNodeData<'storyboard_grid'>(nodeId, {
      status: 'idle',
      errorMessage: undefined,
    });

    const placeholderWidth = 1440;
    const placeholderHeight = Math.round(placeholderWidth / getStoryboardGridAspectValue(node.data.aspectRatio));
    const outputPosition = {
      x: node.position.x + getStoryboardGridNodeSize(node.data).width + 72,
      y: node.position.y + 28,
    };
    const imageNode = createImportedImageNode(
      {
        title: '分镜格子合成',
        imageUrl: '',
        prompt: '分镜格子合成图',
        width: placeholderWidth,
        height: placeholderHeight,
        generatedAt: new Date().toISOString(),
        status: 'generating',
        statusMessage: '合成中...',
      },
      outputPosition,
    );

    addNodes([imageNode]);
    setSelectedNodeIds(new Set([imageNode.id]));
    setActiveNodeId(imageNode.id);
    clearEdgeSelection();

    try {
      const result = await createStoryboardGridImageDataUrl(node.data);
      const fileName = `storyboard-grid-${Date.now()}.png`;
      const hostedImageUrl = await uploadImageDataUrl(result.dataUrl, fileName);

      updateNodeData<'image'>(imageNode.id, {
        imageUrl: hostedImageUrl,
        hostedImageUrl,
        width: result.width,
        height: result.height,
        status: 'idle',
        statusMessage: undefined,
        errorMessage: undefined,
        generatedOutputFileName: fileName,
      });
      updateNodeData<'storyboard_grid'>(nodeId, {
        status: 'idle',
        outputImageUrl: hostedImageUrl,
        outputHostedImageUrl: hostedImageUrl,
        outputFileName: fileName,
        outputWidth: result.width,
        outputHeight: result.height,
      });
      showProjectMessage('已合成图像节点');
    } catch (error) {
      updateNodeData<'image'>(imageNode.id, {
        status: 'error',
        statusMessage: undefined,
        errorMessage: error instanceof Error ? error.message : '合成失败',
      });
      updateNodeData<'storyboard_grid'>(nodeId, {
        status: 'idle',
        errorMessage: undefined,
      });
      showProjectMessage(error instanceof Error ? error.message : '合成失败');
    }
  }, [addNodes, clearEdgeSelection, showProjectMessage, updateNodeData]);

  useEffect(() => {
    notifyStoryboardGridCellUpload = uploadStoryboardGridCell;
    notifyStoryboardGridCompose = composeStoryboardGrid;

    return () => {
      notifyStoryboardGridCellUpload = null;
      notifyStoryboardGridCompose = null;
    };
  }, [composeStoryboardGrid, uploadStoryboardGridCell]);

  const clipboardShortcutRef = useRef({
    addUploadedImages,
    clearConnectionMenu,
    clearEdgeSelection,
    closeContextMenu,
    handleCopySelectedNodes,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    handlePasteNodes,
    handlePasteNodesWithUpstream,
    handleSmartResetViewport,
    openDirectorNodeId,
    project,
    quickReferenceConnect,
    redo,
    selectedEdgeId,
    selectedNodeIds,
    stopQuickReferenceConnect,
    undo,
  });

  useEffect(() => {
    clipboardShortcutRef.current = {
      addUploadedImages,
      clearConnectionMenu,
      clearEdgeSelection,
      closeContextMenu,
      handleCopySelectedNodes,
      handleDeleteSelectedEdge,
      handleDeleteSelectedNodes,
      handlePasteNodes,
      handlePasteNodesWithUpstream,
      handleSmartResetViewport,
      openDirectorNodeId,
      project,
      quickReferenceConnect,
      redo,
      selectedEdgeId,
      selectedNodeIds,
      stopQuickReferenceConnect,
      undo,
    };
  }, [
    addUploadedImages,
    clearConnectionMenu,
    clearEdgeSelection,
    closeContextMenu,
    handleCopySelectedNodes,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    handlePasteNodes,
    handlePasteNodesWithUpstream,
    handleSmartResetViewport,
    openDirectorNodeId,
    project,
    quickReferenceConnect,
    redo,
    selectedEdgeId,
    selectedNodeIds,
    stopQuickReferenceConnect,
    undo,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcuts = clipboardShortcutRef.current;

      if (shortcuts.openDirectorNodeId) {
        return;
      }

      if (event.key === 'Escape') {
        shortcuts.closeContextMenu();
      }

      if (event.key === 'Escape' && shortcuts.quickReferenceConnect) {
        event.preventDefault();
        shortcuts.stopQuickReferenceConnect();
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierPressed = event.ctrlKey || event.metaKey;
      const canvasHasSelection =
        shortcuts.selectedNodeIds.size > 0 || shortcuts.selectedEdgeId !== null;
      const editableTextSelected = hasEditableTextSelection(event.target);

      if (isModifierPressed && !event.altKey && key === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          shortcuts.redo();
        } else {
          shortcuts.undo();
        }

        return;
      }

      if (isModifierPressed && !event.altKey && !event.shiftKey && key === 'c') {
        if (canvasHasSelection && !editableTextSelected && shortcuts.handleCopySelectedNodes()) {
          event.preventDefault();
          return;
        }
      }

      if (isModifierPressed && !event.altKey && key === 'v') {
        if (!editableTextSelected) {
          const pasted = event.shiftKey
            ? shortcuts.handlePasteNodesWithUpstream()
            : shortcuts.handlePasteNodes();

          if (pasted) {
            event.preventDefault();
            return;
          }
        }
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (!isModifierPressed && !event.altKey && !event.shiftKey && key === 'g') {
        event.preventDefault();
        shortcuts.handleSmartResetViewport();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (!shortcuts.selectedEdgeId && shortcuts.selectedNodeIds.size === 0) {
        return;
      }

      event.preventDefault();
      if (shortcuts.selectedNodeIds.size > 0) {
        shortcuts.handleDeleteSelectedNodes();
        shortcuts.clearEdgeSelection();
        return;
      }

      shortcuts.handleDeleteSelectedEdge();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const shortcuts = clipboardShortcutRef.current;

      if (shortcuts.openDirectorNodeId) {
        return;
      }

      const editableTextSelected = hasEditableTextSelection(event.target);
      const canvasHasSelection =
        shortcuts.selectedNodeIds.size > 0 || shortcuts.selectedEdgeId !== null;
      const shouldPrioritizeCanvasPaste = canvasHasSelection && !editableTextSelected;

      if (shouldPrioritizeCanvasPaste && shortcuts.handlePasteNodesWithUpstream()) {
        event.preventDefault();
        return;
      }

      if (isTypingTarget(event.target) && !shouldPrioritizeCanvasPaste) {
        return;
      }

      if (shortcuts.handlePasteNodes()) {
        event.preventDefault();
        return;
      }

      const imageFiles = getClipboardImageFiles(event.clipboardData);

      if (imageFiles.length > 0) {
        event.preventDefault();
        shortcuts.clearEdgeSelection();
        setAddMenu(null);
        shortcuts.clearConnectionMenu();
        setImageInfoPopover(null);
        const center = shortcuts.project({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        void shortcuts.addUploadedImages(imageFiles, center);
        return;
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const snappedChanges = applyGridSnapToNodeChanges(changes);
    setRfNodes((currentNodes) => applyNodeChanges(snappedChanges, currentNodes));

    snappedChanges.forEach((change) => {
      if (change.type === 'position') {
        if (activeGroupDragIdRef.current) {
          return;
        }

        if (change.position && change.dragging !== true) {
          updateNodePosition(change.id, change.position);
        }

        if (change.dragging === true) {
          draggingNodeIdRef.current = change.id;
          const currentNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === change.id);
          updateAlignmentGuidesForDrag(change.id, change.position);

          if (currentNode && !dragStartPositionsRef.current.has(change.id)) {
            dragStartPositionsRef.current.set(change.id, currentNode.position);
          }

          if (currentNode && change.position && getStoryboardGridImageFromNode(currentNode)) {
            storyboardGridDropTargetStore.setSnapshot(
              findStoryboardGridDropTarget(
                getRectCenter(getEstimatedNodeBounds({
                  ...currentNode,
                  position: change.position,
                } as CanvasNode)),
                useCanvasStore.getState().nodes,
                change.id,
              ),
            );
          }
        } else if (change.dragging === false) {
          const stillDragging = snappedChanges.some((candidate) =>
            candidate !== change &&
            candidate.type === 'position' &&
            candidate.dragging === true,
          );

          if (!stillDragging) {
            draggingNodeIdRef.current = null;
            storyboardGridDropTargetStore.setSnapshot(null);
            setAlignmentGuides([]);
          }
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
  }, [clearEdgeSelection, updateAlignmentGuidesForDrag, updateNodePosition, deleteNode]);

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
    if (activeGroupDragIdRef.current) {
      return;
    }

    const nodesToSync = draggedNodes.length > 0 ? draggedNodes : [node];

    for (const draggedNode of nodesToSync) {
      const canvasNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === draggedNode.id);
      const dropTarget = canvasNode && getStoryboardGridImageFromNode(canvasNode)
        ? findStoryboardGridDropTarget(
            getRectCenter(getEstimatedNodeBounds({
              ...canvasNode,
              position: draggedNode.position,
            } as CanvasNode)),
            useCanvasStore.getState().nodes,
            draggedNode.id,
          )
        : null;

      if (canvasNode && dropTarget) {
        const image = getStoryboardGridImageFromNode(canvasNode);

        if (image) {
          updateStoryboardGridCell(dropTarget.nodeId, dropTarget.cellIndex, image);
          const startPosition = dragStartPositionsRef.current.get(draggedNode.id) ?? canvasNode.position;
          updateNodePosition(draggedNode.id, startPosition);
          setRfNodes((currentNodes) =>
            currentNodes.map((candidate) =>
              candidate.id === draggedNode.id
                ? { ...candidate, position: startPosition }
                : candidate,
            ),
          );
          showProjectMessage('已复制到分镜格子');
          continue;
        }
      }

      const nextPosition = gridSnapEnabled
        ? snapCanvasPositionToGrid(draggedNode.position)
        : draggedNode.position;
      updateNodePosition(draggedNode.id, nextPosition);
      syncNodeGroupMembership(draggedNode.id, nextPosition);

      if (gridSnapEnabled) {
        setRfNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === draggedNode.id
              ? { ...candidate, position: nextPosition }
              : candidate,
          ),
        );
      }
    }

    draggingNodeIdRef.current = null;
    dragStartPositionsRef.current.clear();
    storyboardGridDropTargetStore.setSnapshot(null);
  }, [gridSnapEnabled, showProjectMessage, updateNodePosition, updateStoryboardGridCell]);

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
    setContextMenu(null);
    setNodeContextMenu(null);

    if (quickReferenceConnect) {
      return;
    }

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
  }, [clearConnectionMenu, clearEdgeSelection, isInteractiveCanvasTarget, project, quickReferenceConnect, selectGroup, storeGroups]);

  const handleViewportMove = useCallback((event?: { target?: EventTarget | null }) => {
    if (isInteractiveCanvasTarget(event?.target ?? null)) {
      return;
    }

    setContextMenu(null);
    setNodeContextMenu(null);
    setAddMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
    setImageLightbox(null);
  }, [clearConnectionMenu, isInteractiveCanvasTarget]);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    if (isNodeInternalTarget(event.target) || isInteractiveCanvasTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const screen = { x: event.clientX, y: event.clientY };

    setContextMenu({
      screen,
      canvas: project(screen),
    });
    setNodeContextMenu(null);
    setAddMenu(null);
    clearConnectionMenu();
    setImageInfoPopover(null);
  }, [clearConnectionMenu, isInteractiveCanvasTarget, isNodeInternalTarget, project]);

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
    contextMenuUploadPositionRef.current = null;
    referenceUploadNodeIdRef.current = null;
    textReferenceUploadNodeIdRef.current = null;
    storyboardReferenceUploadNodeIdRef.current = null;
    videoReferenceUploadNodeIdRef.current = null;
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
    const position = contextMenuUploadPositionRef.current ?? uploadPositionRef.current;
    const referenceUploadNodeId = referenceUploadNodeIdRef.current;
    const textReferenceUploadNodeId = textReferenceUploadNodeIdRef.current;
    const storyboardReferenceUploadNodeId = storyboardReferenceUploadNodeIdRef.current;
    const videoReferenceUploadNodeId = videoReferenceUploadNodeIdRef.current;

    if (files.length > 0 && textReferenceUploadNodeId) {
      void (async () => {
        const acceptedFiles = files.filter((file) =>
          file.type.startsWith('image/') ||
          file.type.startsWith('video/'),
        );
        const pendingReferences = await Promise.all(acceptedFiles.map(createPendingMediaReference));

        addReferenceMediaToTextNode(
          textReferenceUploadNodeId,
          pendingReferences.map(({ reference }) => reference),
        );

        pendingReferences.forEach(({ reference, localUrl }, index) => {
          const file = acceptedFiles[index];

          void uploadMediaFileToOss(file)
            .then((uploaded) => {
              updateInlineReferenceMedia(textReferenceUploadNodeId, reference.id, {
                url: uploaded.url,
                hostedUrl: uploaded.url,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
                uploadStatus: 'uploaded',
                uploadError: undefined,
              });
              URL.revokeObjectURL(localUrl);
            })
            .catch((error) => {
              updateInlineReferenceMedia(textReferenceUploadNodeId, reference.id, {
                uploadStatus: 'error',
                uploadError: error instanceof Error ? error.message : 'Upload failed',
              });
            });
        });
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '上传文本参考失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    } else if (files.length > 0 && storyboardReferenceUploadNodeId) {
      void (async () => {
        const acceptedFiles = files.filter((file) =>
          file.type.startsWith('image/') ||
          file.type.startsWith('video/'),
        );
        const pendingReferences = await Promise.all(acceptedFiles.map(createPendingMediaReference));

        addReferenceMediaToStoryboardNode(
          storyboardReferenceUploadNodeId,
          pendingReferences.map(({ reference }) => reference),
        );

        pendingReferences.forEach(({ reference, localUrl }, index) => {
          const file = acceptedFiles[index];

          void uploadMediaFileToOss(file)
            .then((uploaded) => {
              updateInlineReferenceMedia(storyboardReferenceUploadNodeId, reference.id, {
                url: uploaded.url,
                hostedUrl: uploaded.url,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
                uploadStatus: 'uploaded',
                uploadError: undefined,
              });
              URL.revokeObjectURL(localUrl);
            })
            .catch((error) => {
              updateInlineReferenceMedia(storyboardReferenceUploadNodeId, reference.id, {
                uploadStatus: 'error',
                uploadError: error instanceof Error ? error.message : 'Upload failed',
              });
            });
        });
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '上传分镜参考失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    } else if (files.length > 0 && videoReferenceUploadNodeId) {
      void (async () => {
        const targetNode = useCanvasStore.getState().nodes.find((node) => node.id === videoReferenceUploadNodeId);
        const acceptsAudioOnly = targetNode?.type === 'audio_generation';
        const acceptedFiles = files.filter((file) =>
          acceptsAudioOnly
            ? file.type.startsWith('audio/')
            : file.type.startsWith('image/') ||
              file.type.startsWith('video/') ||
              file.type.startsWith('audio/'),
        );
        const pendingReferences = await Promise.all(acceptedFiles.map(createPendingMediaReference));

        if (acceptsAudioOnly) {
          addReferenceMediaToAudioGenerationNode(
            videoReferenceUploadNodeId,
            pendingReferences.map(({ reference }) => reference),
          );
        } else {
          addReferenceMediaToVideoGenerationNode(
            videoReferenceUploadNodeId,
            pendingReferences.map(({ reference }) => reference),
          );
        }

        pendingReferences.forEach(({ reference, localUrl }, index) => {
          const file = acceptedFiles[index];

          void uploadMediaFileToOss(file)
            .then((uploaded) => {
              updateInlineReferenceMedia(videoReferenceUploadNodeId, reference.id, {
                url: uploaded.url,
                hostedUrl: uploaded.url,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
                uploadStatus: 'uploaded',
                uploadError: undefined,
              });
              URL.revokeObjectURL(localUrl);
            })
            .catch((error) => {
              updateInlineReferenceMedia(videoReferenceUploadNodeId, reference.id, {
                uploadStatus: 'error',
                uploadError: error instanceof Error ? error.message : 'Upload failed',
              });
            });
        });
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

        const pendingReferences = await Promise.all(
          imageFiles.map(createPendingImageGenerationReference),
        );
        addReferenceImagesToImageGenerationNode(
          referenceUploadNodeId,
          pendingReferences.map(({ reference }) => reference),
        );

        pendingReferences.forEach(({ reference, localUrl }, index) => {
          const file = imageFiles[index];

          void readImageFile(file, { folder: 'references' })
            .then((uploaded) => {
              updateInlineReferenceMedia(referenceUploadNodeId, reference.id, {
                imageUrl: uploaded.imageUrl,
                hostedImageUrl: uploaded.hostedImageUrl,
                previewUrl: uploaded.previewUrl,
                semanticImageUrl: uploaded.semanticImageUrl,
                fileName: uploaded.fileName,
                width: uploaded.width,
                height: uploaded.height,
                sizeBytes: uploaded.sizeBytes,
                uploadStatus: 'uploaded',
                uploadError: undefined,
              });
              URL.revokeObjectURL(localUrl);
            })
            .catch((error) => {
              updateInlineReferenceMedia(referenceUploadNodeId, reference.id, {
                uploadStatus: 'error',
                uploadError: error instanceof Error ? error.message : 'Upload failed',
              });
            });
        });
      })();
    } else if (files.length > 0 && position) {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const videoFiles = files.filter((file) => file.type.startsWith('video/'));
      const audioFiles = files.filter((file) => file.type.startsWith('audio/'));

      void (async () => {
        if (imageFiles.length > 0) {
          await addUploadedImages(imageFiles, position, {
            select: videoFiles.length === 0 && audioFiles.length === 0,
          });
        }

        const videoPosition = imageFiles.length > 0
          ? {
              x: position.x,
              y: position.y + Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
            }
          : position;
        if (videoFiles.length > 0) {
          await addUploadedVideos(videoFiles, videoPosition, { select: audioFiles.length === 0 });
        }

        if (audioFiles.length > 0) {
          const audioPosition = imageFiles.length > 0 || videoFiles.length > 0
            ? {
                x: position.x,
                y: position.y +
                  Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y) +
                  Math.ceil(videoFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
              }
            : position;
          await addUploadedAudios(audioFiles, audioPosition);
        }
      })().catch((error) => {
        setSaveMessage(error instanceof Error ? error.message : '导入失败');
        window.setTimeout(() => setSaveMessage(null), 2200);
      });
    }

    event.target.value = '';
    contextMenuUploadPositionRef.current = null;
    uploadPositionRef.current = null;
    referenceUploadNodeIdRef.current = null;
    textReferenceUploadNodeIdRef.current = null;
    storyboardReferenceUploadNodeIdRef.current = null;
    videoReferenceUploadNodeIdRef.current = null;
  }, [
    addReferenceImagesToImageGenerationNode,
    addReferenceMediaToAudioGenerationNode,
    addReferenceMediaToTextNode,
    addReferenceMediaToStoryboardNode,
    addReferenceMediaToVideoGenerationNode,
    addUploadedAudios,
    addUploadedImages,
    addUploadedVideos,
    setSaveMessage,
    updateInlineReferenceMedia,
  ]);

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
    void (async () => {
      const sourceDisplayDimensions = resolveMaterialSourceDisplayDimensions(item, storeNodes);
      const node = await createImageNodeFromMaterial(item, position, sourceDisplayDimensions);

      addNodes([node]);
      setSelectedNodeIds(new Set([node.id]));
      setActiveNodeId(node.id);
      clearEdgeSelection();
    })();
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
    const audioFiles = files.filter((item) => item.type.startsWith('audio/'));

    if (imageFiles.length === 0 && videoFiles.length === 0 && audioFiles.length === 0) {
      return;
    }

    event.preventDefault();
    setAddMenu(null);
    setImageInfoPopover(null);
    const position = project({ x: event.clientX, y: event.clientY });

    void (async () => {
      if (imageFiles.length > 0) {
        await addUploadedImages(imageFiles, position, {
          select: videoFiles.length === 0 && audioFiles.length === 0,
        });
      }

      const videoPosition = imageFiles.length > 0
        ? {
            x: position.x,
            y: position.y + Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
          }
        : position;
      if (videoFiles.length > 0) {
        await addUploadedVideos(videoFiles, videoPosition, { select: audioFiles.length === 0 });
      }

      if (audioFiles.length > 0) {
        const audioPosition = imageFiles.length > 0 || videoFiles.length > 0
          ? {
              x: position.x,
              y: position.y +
                Math.ceil(imageFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y) +
                Math.ceil(videoFiles.length / IMAGE_IMPORT_COLUMNS) * (UPLOADED_IMAGE_MAX_CARD_HEIGHT + IMAGE_IMPORT_SPACING_Y),
            }
          : position;
        await addUploadedAudios(audioFiles, audioPosition);
      }
    })().catch((error) => {
      setSaveMessage(error instanceof Error ? error.message : '导入失败');
      window.setTimeout(() => setSaveMessage(null), 2200);
    });
  }, [addUploadedAudios, addUploadedImages, addUploadedVideos, handleSelectMaterial, materials, project, setSaveMessage]);

  const openAddMenuAtScreen = useCallback((screen: { x: number; y: number }) => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }

    setNodeContextMenu(null);
    setContextMenu(null);
    setAddMenu({
      screen,
      canvas: project({
        x: screen.x,
        y: screen.y,
      }),
    });
    closeContextMenu();
    clearConnectionMenu();
  }, [clearConnectionMenu, closeContextMenu, project]);

  const handleContextMenuUpload = useCallback(() => {
    if (!contextMenu) {
      return;
    }

    contextMenuUploadPositionRef.current = contextMenu.canvas;
    uploadPositionRef.current = null;
    referenceUploadNodeIdRef.current = null;
    textReferenceUploadNodeIdRef.current = null;
    storyboardReferenceUploadNodeIdRef.current = null;
    videoReferenceUploadNodeIdRef.current = null;
    closeContextMenu();

    const input = uploadInputRef.current;

    if (input) {
      openFileInput(input);
    }
  }, [closeContextMenu, contextMenu]);

  const handleContextMenuAddNode = useCallback(() => {
    if (!contextMenu) {
      return;
    }

    setAddMenu({
      screen: getCanvasContextMenuPosition({
        x: contextMenu.screen.x,
        y: contextMenu.screen.y,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
      canvas: contextMenu.canvas,
    });
    closeContextMenu();
  }, [closeContextMenu, contextMenu]);

  const handleContextMenuUndo = useCallback(() => {
    if (undoStackLength <= 0) {
      return;
    }

    closeContextMenu();
    undo();
  }, [closeContextMenu, undo, undoStackLength]);

  const handleContextMenuRedo = useCallback(() => {
    if (redoStackLength <= 0) {
      return;
    }

    closeContextMenu();
    redo();
  }, [closeContextMenu, redo, redoStackLength]);

  const handleContextMenuPaste = useCallback(() => {
    if (!contextMenu) {
      return;
    }

    if (handlePasteNodesAtPosition(contextMenu.canvas)) {
      closeContextMenu();
    }
  }, [closeContextMenu, contextMenu, handlePasteNodesAtPosition]);

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
    setNodeContextMenu(null);
    setContextMenu(null);
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

  const handleCreateAgentSourceNodes = useCallback((attachments: AgentTaskAttachment[]) => {
    const existingNodeIds = new Set(useCanvasStore.getState().nodes.map((node) => node.id));
    const result = createAgentSourceImageNodes({
      attachments,
      startPosition: project({
        x: window.innerWidth / 2 - UPLOADED_IMAGE_MAX_CARD_WIDTH / 2,
        y: window.innerHeight / 2 - 220,
      }),
      existingNodeIds,
    });

    if (result.nodes.length > 0) {
      addNodes(result.nodes);
      refreshNodeInternalsAfterRender(result.nodes.map((node) => node.id));
      const firstNodeId = result.nodes[0]?.id;

      if (firstNodeId) {
        setSelectedNodeIds(new Set([firstNodeId]));
        setActiveNodeId(firstNodeId);
      }

      clearEdgeSelection();
      setAddMenu(null);
      clearConnectionMenu();
      showProjectMessage('已创建 Agent 节点');
    }

    return result.nodeIdsByAttachmentId;
  }, [
    addNodes,
    clearConnectionMenu,
    clearEdgeSelection,
    project,
    refreshNodeInternalsAfterRender,
    showProjectMessage,
  ]);

  const handleConfirmAgentPlan = useCallback((payload: {
    actions: CanvasAgentAction[];
    nodes?: CanvasNode[];
    edges?: CanvasEdge[];
    nodeIdMap?: Record<string, string>;
    attachments: AgentTaskAttachment[];
    plan: AgentExecutionPlan;
  }) => {
    const validation = validateCanvasAgentActions(payload.actions, payload.attachments);

    if (!validation.ok) {
      showProjectMessage(validation.error);
      return { ok: false };
    }

    const sourceNodeIds = payload.attachments.flatMap((attachment) =>
      attachment.sourceNodeId ? [attachment.sourceNodeId] : [],
    );
    const existingSourceNodes = sourceNodeIds
      .map((nodeId) => useCanvasStore.getState().nodes.find((node) => node.id === nodeId))
      .filter((node): node is CanvasNode => Boolean(node));
    const sourceBounds = existingSourceNodes.length > 0
      ? getBoundsForNodes(existingSourceNodes, 0)
      : null;
    const startPosition = sourceBounds
      ? {
          x: sourceBounds.x + sourceBounds.width + 140,
          y: sourceBounds.y,
        }
      : project({
          x: window.innerWidth / 2 + UPLOADED_IMAGE_MAX_CARD_WIDTH / 2 + 180,
          y: window.innerHeight / 2 - 180,
        });
    const canvasNodesBeforeCreate = useCanvasStore.getState().nodes;
    const rawResult = payload.nodes?.length
      ? {
          nodes: payload.nodes,
          edges: payload.edges ?? [],
          focusNodeId: payload.nodes[payload.nodes.length - 1]?.id ?? null,
          imageGenerationNodeIds: payload.nodes.flatMap((node) => (
            node.type === 'image_generation' ? [node.id] : []
          )),
          nodeIdMap: payload.actions.reduce<Record<string, string>>((map, action) => {
            if (
              action.type !== 'create_text_node' &&
              action.type !== 'create_uploaded_image_node' &&
              action.type !== 'create_image_generation_node'
            ) {
              return map;
            }

            const mappedNodeId = payload.nodeIdMap?.[action.clientActionId];

            if (mappedNodeId) {
              map[action.clientActionId] = mappedNodeId;
              return map;
            }

            if (payload.nodes?.some((node) => node.id === action.clientActionId)) {
              map[action.clientActionId] = action.clientActionId;
            }

            return map;
          }, {}),
        }
      : createAgentGenerationNodesAndEdges({
          actions: payload.actions,
          startPosition,
        });
    const positionedNodes = layoutAgentWorkflowNodes({
      incomingNodes: rawResult.nodes,
      incomingEdges: rawResult.edges,
      existingNodes: canvasNodesBeforeCreate,
      sourceNodes: existingSourceNodes,
      fallbackStartPosition: startPosition,
    });
    const result = {
      ...rawResult,
      nodes: positionedNodes,
    };

    if (result.nodes.length === 0) {
      showProjectMessage('Agent 没有返回节点');
      return { ok: false };
    }

    addNodes(result.nodes);

    for (const edge of result.edges) {
      addEdgeStore(edge);
    }

    refreshNodeInternalsAfterRender(result.nodes.map((node) => node.id));

    const focusNodeId = result.focusNodeId ?? result.nodes[result.nodes.length - 1]?.id ?? null;
    const imageGenerationNodeIds = result.imageGenerationNodeIds;
    const shouldCreateGroup = imageGenerationNodeIds.length > 1;
    const agentGroupNodes = result.nodes;
    const agentGroupNodeIds = Array.from(new Set(agentGroupNodes.map((node) => node.id)));
    const agentGroupBounds = shouldCreateGroup ? getBoundsForNodes(agentGroupNodes) : null;
    const agentGroup = agentGroupBounds
      ? createGroup(agentGroupNodeIds, agentGroupBounds)
      : null;
    const agentGroupName = agentGroup
      ? getAgentGroupName(payload.plan, imageGenerationNodeIds.length)
      : undefined;

    if (agentGroup && agentGroupName) {
      renameGroup(agentGroup.id, agentGroupName);
    }

    if (agentGroup) {
      setSelectedNodeIds(new Set());
      setActiveNodeId(null);
      setSelectedGroupId(agentGroup.id);
    } else if (focusNodeId) {
      setSelectedNodeIds(new Set([focusNodeId]));
      setActiveNodeId(focusNodeId);
    }

    clearEdgeSelection();
    setAddMenu(null);
    clearConnectionMenu();
    showProjectMessage('已创建 Agent 节点');
    return {
      ok: true,
      imageGenerationNodeId: focusNodeId ?? undefined,
      imageGenerationNodeIds,
      groupId: agentGroup?.id,
      groupName: agentGroupName,
      nodeIdMap: result.nodeIdMap,
    };
  }, [
    addEdgeStore,
    addNodes,
    clearConnectionMenu,
    clearEdgeSelection,
    createGroup,
    project,
    refreshNodeInternalsAfterRender,
    renameGroup,
    showProjectMessage,
  ]);

  const handleConfirmAgentGeneration = useCallback((payload: {
    nodeId?: string;
    nodeIds?: string[];
    groupId?: string;
  }) => {
    const state = useCanvasStore.getState();
    const group = payload.groupId
      ? state.groups.find((candidate) => candidate.id === payload.groupId)
      : null;
    const nodeIds = group
      ? group.nodeIds
      : payload.nodeIds?.length
        ? payload.nodeIds
        : payload.nodeId
          ? [payload.nodeId]
          : [];
    const imageGenerationNodeIds = nodeIds.filter((nodeId) =>
      state.nodes.some((candidate) => candidate.id === nodeId && candidate.type === 'image_generation'),
    );

    if (imageGenerationNodeIds.length === 0) {
      showProjectMessage('未选中图片生成节点');
      return false;
    }

    void Promise.allSettled(
      imageGenerationNodeIds.map((nodeId) => generateImageFromImageGenerationNode(nodeId)),
    ).then((results) => {
      const failedCount = results.filter((result) => result.status === 'rejected').length;

      if (failedCount > 0) {
        showProjectMessage(`${failedCount} 个图片生成任务失败`);
      }
    });
    showProjectMessage(
      imageGenerationNodeIds.length > 1
        ? `已开始 ${imageGenerationNodeIds.length} 个图片生成任务`
        : '已开始图片生成',
    );
    return true;
  }, [generateImageFromImageGenerationNode, showProjectMessage]);

  const handleAddMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (closeAddMenuTimeoutRef.current) {
      window.clearTimeout(closeAddMenuTimeoutRef.current);
      closeAddMenuTimeoutRef.current = null;
    }

    if (action === 'text' && addMenu) {
      const node = addNodeAtCenter('text', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'storyboard_script' && addMenu) {
      const node = addNodeAtCenter('storyboard_script', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'storyboard_grid' && addMenu) {
      const node = addNodeAtCenter('storyboard_grid', addMenu.canvas);
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

    if (action === 'audio' && addMenu) {
      const node = addNodeAtCenter('audio_generation', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'panorama-360' && addMenu) {
      const node = addNodeAtCenter('panorama-360', addMenu.canvas);
      focusCreatedNode(node.id);
    }

    if (action === 'director' && addMenu) {
      const node = addNodeAtCenter('director', addMenu.canvas);
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
      showProjectMessage('组内没有可运行的节点');
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
      showProjectMessage('没有可下载的图片');
      return;
    }

    const zipFileName = group.name?.trim() || `group-${group.id.slice(0, 8)}`;
    showProjectMessage('正在下载组内图片...');

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
      showProjectMessage('没有找到可连接的源节点');
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

  const handleStartSelectionConnection = useCallback((
    nodeIds: string[],
    event: React.MouseEvent<HTMLElement>,
  ) => {
    handleStartGroupConnection(
      {
        id: '__selection__',
        nodeIds,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      event,
    );
  }, [handleStartGroupConnection]);

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
        candidate.category === item.category &&
        (candidate.folderId ?? null) === (item.folderId ?? null),
    );
    addMaterial(item);
    setPendingMaterialSource(null);
    setMovingMaterial(null);
    showProjectMessage(existing ? '素材已存在' : '已添加到素材库');
  }, [addMaterial, materials, showProjectMessage]);

  const closeMaterialDialog = useCallback(() => {
    setPendingMaterialSource(null);
    setMovingMaterial(null);
  }, []);

  const handleConfirmMoveMaterial = useCallback((
    itemId: string,
    target: { category: MaterialLibraryItem['category']; folderId?: string },
  ) => {
    moveMaterial(itemId, target);
    setMovingMaterial(null);
    setPendingMaterialSource(null);
    showProjectMessage('素材已移动');
  }, [moveMaterial, showProjectMessage]);

  const handleRequestMoveMaterial = useCallback((item: MaterialLibraryItem) => {
    setMaterialDialogMode('move');
    setMaterialDialogOpenKey((value) => value + 1);
    setMovingMaterial(item);
    setPendingMaterialSource(null);
  }, []);

  const handleMaterialAiRoleClick = useCallback(() => {
    showProjectMessage('AI 角色功能开发中');
  }, [showProjectMessage]);

  const handleOpenMaterialUpload = useCallback(() => {
    const input = materialUploadInputRef.current;
    if (!input) {
      return;
    }
    input.value = '';
    openFileInput(input);
  }, []);

  const handleMaterialUploadInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showProjectMessage('素材库上传暂只支持图片');
      return;
    }

    void readImageFile(file, { folder: 'references' })
      .then((data) => {
        setMaterialDialogMode('save');
        setMaterialDialogOpenKey((value) => value + 1);
        setMovingMaterial(null);
        setPendingMaterialSource({
          defaultName: data.title?.trim() || data.fileName?.trim() || file.name.replace(/\.[^.]+$/, ''),
          imageUrl: data.generatedOutputFileName ? `output:${data.generatedOutputFileName}` : data.imageUrl,
          hostedImageUrl: data.hostedImageUrl || data.imageUrl,
          fileName: data.fileName,
          outputFileName: data.generatedOutputFileName,
          sourceNodeType: 'image',
          width: data.width,
          height: data.height,
          sizeBytes: data.sizeBytes,
        });
      })
      .catch((error) => {
        console.error('material upload failed', error);
        showProjectMessage(error instanceof Error ? error.message : '素材上传失败');
      });
  }, [showProjectMessage]);

  const handleSelectHistoryImage = useCallback(async (item: ImageHistoryItem) => {
    const viewportBeforeInsert = getViewport();
    const displayPrompt = getImageHistoryDisplayPrompt(item.nodeData);
    let resolvedImage: Awaited<ReturnType<typeof resolveHistoryImageUrls>>;

    try {
      resolvedImage = await resolveHistoryImageUrls(item);
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '图片不可用');
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

    if (action !== 'text' && action !== 'storyboard_script' && action !== 'image_generation' && action !== 'video_generation' && action !== 'audio' && action !== 'panorama-360' && action !== 'video') {
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
        : action === 'storyboard_script'
          ? 'storyboard_script'
        : action === 'video_generation'
          ? 'video_generation'
        : action === 'audio'
          ? 'audio_generation'
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
    const settings: Array<[string, string]> = [
      [CANVAS_TEXT_API_PROVIDER_STORAGE_KEY, values.textProvider],
      [CANVAS_IMAGE_API_PROVIDER_STORAGE_KEY, values.imageProvider],
      [CANVAS_TEXT_VIBE_API_KEY_STORAGE_KEY, values.textApiKeys.vibe],
      [CANVAS_TEXT_FUCHEERS_API_KEY_STORAGE_KEY, values.textApiKeys.fucheers],
      [CANVAS_TEXT_COMFLY_API_KEY_STORAGE_KEY, values.textApiKeys.comfly],
      [CANVAS_TEXT_ZHENZHEN_API_KEY_STORAGE_KEY, values.textApiKeys.zhenzhen],
      [CANVAS_TEXT_RUNNINGHUB_API_KEY_STORAGE_KEY, values.textApiKeys.runninghub],
      [CANVAS_TEXT_GRSAI_API_KEY_STORAGE_KEY, values.textApiKeys.grsai],
      [CANVAS_IMAGE_VIBE_API_KEY_STORAGE_KEY, values.imageApiKeys.vibe],
      [CANVAS_IMAGE_FUCHEERS_API_KEY_STORAGE_KEY, values.imageApiKeys.fucheers],
      [CANVAS_IMAGE_COMFLY_API_KEY_STORAGE_KEY, values.imageApiKeys.comfly],
      [CANVAS_IMAGE_ZHENZHEN_API_KEY_STORAGE_KEY, values.imageApiKeys.zhenzhen],
      [CANVAS_IMAGE_RUNNINGHUB_API_KEY_STORAGE_KEY, values.imageApiKeys.runninghub],
      [CANVAS_IMAGE_GRSAI_API_KEY_STORAGE_KEY, values.imageApiKeys.grsai],
      [CANVAS_RUNNINGHUB_WORKFLOW_API_KEY_STORAGE_KEY, values.runningHubWorkflowApiKey],
    ];
    settings.forEach(([key, value]) => writeUserScopedCanvasSetting(key, value, userId));
    setApiSettings(values);
  }, [userId]);

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
      return getNodeGroupBounds(node);
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
      showProjectMessage('组内没有可布局的节点');
    }
  }, [showProjectMessage]);

  const handleSaveProject = useCallback(async () => {
    await saveProject();
    setSaveMessage('项目已保存');
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
      showProjectMessage(error instanceof Error ? error.message : '选择文件夹失败');
    }
  }, [showProjectMessage]);

  const handleConfirmCreateProject = useCallback(async () => {
    if (!createDraft.parentHandle || !createDraft.projectName.trim()) {
      return;
    }

    setProjectDialogBusy(true);

    try {
      const created = await runCanvasUserScopedOperation({
        getState: useCanvasStore.getState,
        run: (activeUserId) => createProjectAtParentDirectory({
          parentHandle: createDraft.parentHandle!,
          projectName: createDraft.projectName.trim(),
          userId: activeUserId,
        }),
        commit: (result) => attachProject(result.project, result.snapshot),
      });

      if (!created) {
        return;
      }

      setProjectDialogOpen(false);
      setCreateDraft({
        projectName: '',
        parentHandle: null,
        parentDirectoryLabel: '',
      });
      showProjectMessage('已清除项目文件夹');
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '更新项目文件夹失败');
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
      showProjectMessage('项目已删除');
      onBackToLibrary?.();
    } catch (error) {
      showProjectMessage(error instanceof Error ? error.message : '删除失败');
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
      <PromptLibraryEntryButton
        open={promptLibraryOpen}
        rightOffset={promptLibraryButtonRightOffset}
        onClick={() => setPromptLibraryOpen((current) => !current)}
      />
      <div ref={canvasReadyRootRef} className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onPaneScroll={handleViewportMove}
        onMoveStart={handleViewportMove}
        onPaneMouseMove={handlePaneMouseMove}
        onPaneMouseLeave={handlePaneMouseLeave}
        onMouseDown={handlePaneMouseDown}
        onMouseDownCapture={handleQuickReferenceMouseDownCapture}
        onMouseMove={handlePaneMouseMove}
        onMouseUp={handlePaneMouseUp}
        onDoubleClick={handlePaneDoubleClick}
        connectOnClick={false}
        zoomOnDoubleClick={false}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        onlyRenderVisibleElements
        className={[
          paneSelectionDragging ? 'gl-pane-selection-dragging' : '',
          quickReferenceConnect ? 'gl-quick-reference-mode' : '',
        ].filter(Boolean).join(' ') || undefined}
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
        <CanvasAlignmentGuidesOverlay guides={alignmentGuides} />
        <CanvasViewportControls
          edgeStyle={edgeStyle}
          onToggleEdgeStyle={handleToggleEdgeStyle}
          gridSnapEnabled={gridSnapEnabled}
          onToggleGridSnap={handleToggleGridSnap}
          onSmartReset={handleSmartResetViewport}
          nodes={storeNodes}
        />
        <MultiNodeSelectionOverlay
          nodes={storeNodes}
          flowNodes={rfNodes}
          selectedNodeIds={selectedNodeIds}
          groups={storeGroups}
          visible={!selectedGroupId && !groupDragActive && !selectionInProgress && !paneSelectionDragging}
          onGroup={handleGroup}
          onStartSelectionConnection={handleStartSelectionConnection}
          onSelectionFramePointerDown={handleSelectionFramePointerDown}
          onSelectionFramePointerMove={handleSelectionFramePointerMove}
          onSelectionFramePointerUp={handleSelectionFramePointerUp}
          onSelectionFramePointerCancel={handleSelectionFramePointerCancel}
        />
        <GroupOverlay
          groups={storeGroups}
          groupOffsets={groupDragOffsets}
          selectedGroupId={selectedGroupId}
          hoveredGroupId={hoveredGroupId}
          onStartGroupConnection={handleStartGroupConnection}
          onSelectGroup={selectGroup}
          onDeleteGroup={deleteGroup}
          onRenameGroup={renameGroup}
          onUpdateGroupBackgroundColor={updateGroupBackgroundColor}
          onGroupDragStart={handleGroupDragStart}
          onGroupDrag={handleGroupDrag}
          onGroupDragEnd={handleGroupDragEnd}
          onResizeGroup={handleResizeGroup}
          onExecuteGroup={handleExecuteGroup}
          onLayoutGroup={handleLayoutGroup}
          onDownloadGroup={handleDownloadGroup}
        />
      </ReactFlow>
      </div>

      {openDirectorNodeId ? (
        <DirectorDeskFullscreen
          nodeId={openDirectorNodeId}
          userId={userId}
          onClose={() => setOpenDirectorNodeId(null)}
          onSendCapturesToCanvas={(captures) =>
            void handleDirectorDeskCaptures(openDirectorNodeId, captures)
          }
        />
      ) : null}

      <GroupConnectionPreviewOverlay preview={groupConnectionPreview} />

      {activeSelectedEdgeId && edgeDeleteButtonPosition ? (
        <button
          type="button"
          aria-label="删除选中的连线"
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

      {contextMenu ? (
        <CanvasContextMenu
          x={contextMenu.screen.x}
          y={contextMenu.screen.y}
          canUndo={undoStackLength > 0}
          canRedo={redoStackLength > 0}
          canPaste={hasCopiedNodes}
          platform={contextMenuPlatform}
          onUpload={handleContextMenuUpload}
          onAddNode={handleContextMenuAddNode}
          onUndo={handleContextMenuUndo}
          onRedo={handleContextMenuRedo}
          onPaste={handleContextMenuPaste}
        />
      ) : null}

      {nodeContextMenu && nodeContextTarget ? (
        <NodeContextMenu
          x={nodeContextMenu.screen.x}
          y={nodeContextMenu.screen.y}
          canAddToConversation={nodeContextAttachment !== null}
          canCopyContent={nodeContextClipboardContent !== null}
          canSaveAs={nodeContextExport !== null}
          canRename={isNodeRenameable(nodeContextTarget)}
          canCopyNode
          canDelete
          onAddToConversation={handleNodeContextAddToConversation}
          onCopyContent={handleNodeContextCopyContent}
          onSaveAs={handleNodeContextSaveAs}
          onRename={handleNodeContextRename}
          onCopyNode={handleNodeContextCopyNode}
          onDelete={handleNodeContextDelete}
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
      <CanvasAgentDock
        userId={userId}
        projectId={currentProject?.id}
        projectName={projectName}
        nodeCount={storeNodes.length}
        edgeCount={storeEdges.length}
        groupCount={storeGroups.length}
        nodes={storeNodes}
        edges={storeEdges}
        onCreateSourceNodes={handleCreateAgentSourceNodes}
        pendingReferenceAttachment={pendingAgentReferenceAttachment}
        onPendingReferenceAttachmentConsumed={(result) => {
          setPendingAgentReferenceAttachment(null);
          showProjectMessage(result === 'duplicate' ? '参考图已添加' : '已添加到对话');
        }}
        onQuickReferenceSelect={(onSelect) => {
          startQuickReferenceConnect({
            targetKind: 'agent',
            onSelect,
          });
        }}
        onConfirmPlan={handleConfirmAgentPlan}
        onConfirmGeneration={handleConfirmAgentGeneration}
        onFocusNode={(nodeId) => {
          selectSingleNode(nodeId);
          focusSingleNodeViewport(nodeId);
        }}
        onLayoutChange={setAgentPanelLayout}
      />
      <MaterialLibraryPanel
        open={materialLibraryAnchor !== null}
        anchor={materialLibraryAnchor}
        materials={materials}
        folders={materialFolders}
        onClose={() => setMaterialLibraryAnchor(null)}
        onSelectMaterial={handleSelectMaterial}
        onUploadMaterial={handleOpenMaterialUpload}
        onCreateFolder={addMaterialFolder}
        onRenameFolder={renameMaterialFolder}
        onDeleteFolder={deleteMaterialFolder}
        onRenameMaterial={renameMaterial}
        onMoveMaterial={handleRequestMoveMaterial}
        onDuplicateMaterial={duplicateMaterial}
        onDeleteMaterial={deleteMaterial}
        onAiRoleClick={handleMaterialAiRoleClick}
      />
      <GenerationHistoryPopover
        key={historyOpenKey}
        open={historyAnchor !== null}
        anchor={historyAnchor}
        onClose={() => setHistoryAnchor(null)}
        onSelectImage={handleSelectHistoryImage}
      />
      <PromptLibraryDialog
        open={promptLibraryOpen}
        onClose={() => setPromptLibraryOpen(false)}
        onAddToCanvas={addPromptLibraryEntryToCanvas}
      />
      <ImageGenerationInfoPopover
        open={imageInfoPopover !== null}
        data={imageInfoPopover}
        onClose={() => {
          imageInfoRequestIdRef.current += 1;
          setImageInfoPopover(null);
        }}
        rightOffset={imageInfoPopoverRightOffset}
      />
      <ImageLightbox
        key={imageLightbox?.imageUrl ?? 'image-lightbox-closed'}
        data={imageLightbox}
        onClose={() => setImageLightbox(null)}
      />
      <MaterialLibraryDialog
        key={`material-dialog-${materialDialogOpenKey}`}
        mode={materialDialogMode}
        source={pendingMaterialSource}
        movingMaterial={movingMaterial}
        existingMaterials={materials}
        folders={materialFolders}
        onClose={closeMaterialDialog}
        onCreateFolder={addMaterialFolder}
        onConfirmSave={handleConfirmAddMaterial}
        onConfirmMove={handleConfirmMoveMaterial}
      />
      <CropOverlay
        data={cropMode}
        onClose={handleCloseCrop}
        onConfirm={(nodeId, cropRect) => void handleConfirmCrop(nodeId, cropRect)}
      />
      <AnnotationOverlay
        key={annotationMode ? `${annotationMode.nodeId}:${annotationMode.imageUrl}` : 'annotation-closed'}
        data={annotationMode}
        onClose={handleCloseAnnotationMode}
        onChange={handleChangeAnnotations}
        onSave={handleSaveAnnotationMode}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="sr-only"
        onChange={handleUploadInputChange}
      />
      <input
        ref={materialUploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleMaterialUploadInputChange}
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
export function InfiniteCanvas({ userId, onBackToLibrary, onCanvasReady }: InnerCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas
        userId={userId}
        onBackToLibrary={onBackToLibrary}
        onCanvasReady={onCanvasReady}
      />
    </ReactFlowProvider>
  );
}
