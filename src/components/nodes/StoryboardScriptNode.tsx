'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Position, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import {
  Clapperboard,
  FileDown,
  Images,
  List,
  Play,
  Rows3,
  Video,
} from 'lucide-react';
import type {
  StoryboardReferenceImage,
  StoryboardReferenceVideo,
  StoryboardRow,
  StoryboardScriptNodeData,
} from '@/types/canvas';
import {
  normalizeStoryboardRow,
  type StoryboardRowField,
} from '@/lib/storyboard/normalize';
import {
  getStoryboardCardSize,
  normalizeStoryboardCardSize,
  type StoryboardCardSize,
} from '@/lib/storyboard/layout';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { ReferenceVideoThumbnail } from './ReferenceImageHoverPreview';
import { StoryboardScriptPromptBar } from './StoryboardScriptPromptBar';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  readStoredSelectedApiProvider,
  type ApiProvider,
} from '@/store/canvas-store';

const HEADER_HEIGHT = 48;
const ROW_MIN_HEIGHT = 74;
const REFERENCE_PATTERN = /@(图片|视频)(\d+)/g;

const STORYBOARD_CTRL_WHEEL_ZOOM_STEP = 0.0015;
const STORYBOARD_CANVAS_MIN_ZOOM = 0.2;
const STORYBOARD_CANVAS_MAX_ZOOM = 2;

function clampStoryboardCanvasZoom(value: number): number {
  return Math.min(
    STORYBOARD_CANVAS_MAX_ZOOM,
    Math.max(STORYBOARD_CANVAS_MIN_ZOOM, value),
  );
}

const TABLE_COLUMNS: Array<{
  field: StoryboardRowField;
  label: string;
  width: string;
  emphasis: 'shared' | 'image' | 'video';
}> = [
  { field: '镜号', label: '镜号', width: '64px', emphasis: 'shared' },
  { field: '时长', label: '时长', width: '72px', emphasis: 'shared' },
  { field: '景别', label: '景别', width: '92px', emphasis: 'shared' },
  { field: '场景', label: '场景', width: '130px', emphasis: 'shared' },
  { field: '画面描述', label: '画面描述', width: '220px', emphasis: 'shared' },
  { field: '角色', label: '角色', width: '120px', emphasis: 'shared' },
  { field: '角色动作', label: '角色动作', width: '170px', emphasis: 'shared' },
  { field: '情绪', label: '情绪', width: '100px', emphasis: 'shared' },
  { field: '角色图', label: '角色图', width: '150px', emphasis: 'shared' },
  { field: '参考', label: '参考', width: '150px', emphasis: 'shared' },
  { field: '图片提示词', label: '图片提示词', width: '260px', emphasis: 'image' },
  { field: '视频提示词', label: '视频提示词', width: '280px', emphasis: 'video' },
  { field: '对白', label: '对白', width: '180px', emphasis: 'video' },
  { field: '音效', label: '音效', width: '160px', emphasis: 'video' },
];

function getVisibleTableColumns(focusMode: StoryboardScriptNodeData['focusMode']) {
  return TABLE_COLUMNS.filter((column) => {
    if (column.emphasis === 'shared') return true;
    return column.emphasis === (focusMode === 'videoPrompt' ? 'video' : 'image');
  });
}

export interface StoryboardScriptNodeProps {
  id?: string;
  data: StoryboardScriptNodeData;
  selected?: boolean;
  dragging?: boolean;
  editing?: boolean;
  connectedImages?: Array<{
    id: string;
    imageUrl: string;
    previewUrl?: string;
    alt: string;
  }>;
  connectedVideos?: Array<{
    id: string;
    videoUrl: string;
    previewUrl?: string;
    alt: string;
    fileName?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }>;
  onChange?: (next: StoryboardScriptNodeData) => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onRun?: () => void;
  onRemoveReference?: (referenceImageId: string) => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}

function getReferenceImageMap(
  referenceImages: StoryboardReferenceImage[] | undefined,
  connectedImages: NonNullable<StoryboardScriptNodeProps['connectedImages']>,
): Map<string, StoryboardReferenceImage> {
  const map = new Map<string, StoryboardReferenceImage>();
  const resolvedReferences = referenceImages?.length
    ? referenceImages
    : connectedImages.map((image, index) => ({
        label: `@图片${index + 1}`,
        url: image.imageUrl,
        previewUrl: image.previewUrl,
        sourceNodeId: image.id,
        alt: image.alt,
      }));

  for (const image of resolvedReferences) {
    map.set(image.label, image);
  }

  return map;
}

type StoryboardReferenceMedia =
  | ({ type: 'image' } & StoryboardReferenceImage)
  | ({ type: 'video' } & StoryboardReferenceVideo);

function getReferenceMediaMap(
  referenceImages: StoryboardReferenceImage[] | undefined,
  connectedImages: NonNullable<StoryboardScriptNodeProps['connectedImages']>,
  referenceVideos: StoryboardReferenceVideo[] | undefined,
  connectedVideos: NonNullable<StoryboardScriptNodeProps['connectedVideos']>,
): Map<string, StoryboardReferenceMedia> {
  const map = new Map<string, StoryboardReferenceMedia>();
  const imageMap = getReferenceImageMap(referenceImages, connectedImages);
  const resolvedVideos = referenceVideos?.length
    ? referenceVideos
    : connectedVideos.map((video, index) => ({
        label: `@视频${index + 1}`,
        url: video.videoUrl,
        previewUrl: video.previewUrl,
        sourceNodeId: video.id,
        alt: video.alt,
        fileName: video.fileName,
        width: video.width,
        height: video.height,
        durationSeconds: video.durationSeconds,
      }));

  for (const [label, image] of imageMap) {
    map.set(label, { type: 'image', ...image });
  }

  for (const video of resolvedVideos) {
    map.set(video.label, { type: 'video', ...video });
  }

  return map;
}

function extractReferenceLabels(value: string): string[] {
  const labels: string[] = [];

  for (const match of value.matchAll(REFERENCE_PATTERN)) {
    labels.push(`@${match[1]}${match[2]}`);
  }

  return Array.from(new Set(labels));
}

function ReferenceChips({
  value,
  referenceMap,
  centered = false,
}: {
  value: string;
  referenceMap: Map<string, StoryboardReferenceMedia>;
  centered?: boolean;
}) {
  const labels = extractReferenceLabels(value);

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className={[
      'flex flex-wrap gap-1.5',
      centered ? 'h-full min-h-[58px] items-center justify-center gap-2' : 'mt-1.5',
    ].join(' ')}>
      {labels.map((label) => {
        const reference = referenceMap.get(label);

        if (!reference) {
          return (
            <span
              key={label}
              className="rounded-[7px] border border-gl-error/30 bg-gl-error/10 px-1.5 py-0.5 text-[10px] font-medium text-gl-error"
            >
              {label}
            </span>
          );
        }

        return (
          <span
            key={label}
            className="group/tooltip relative inline-flex h-16 w-28 overflow-visible"
            title={label}
          >
            <span className="inline-flex h-full w-full overflow-hidden border border-white/12 bg-white/[0.04]">
              {reference.type === 'video' ? (
                <span className="relative block h-full w-full">
                  <ReferenceVideoThumbnail
                    videoUrl={reference.url}
                    previewUrl={reference.previewUrl}
                    alt={reference.alt || label}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
                    <Play size={14} fill="currentColor" strokeWidth={0} />
                  </span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- storyboard references can be blob/data/provider URLs.
                <img
                  src={reference.previewUrl || reference.url}
                  alt={reference.alt || label}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </span>
            <Tooltip
              label={label}
              side="top"
              className="!rounded-[6px] !bg-white !px-3 !py-2 !text-[12px] !font-semibold !text-[#1b1f27]"
            />
          </span>
        );
      })}
    </div>
  );
}

function StoryboardCell({
  row,
  field,
  active,
  editing,
  referenceMap,
  onChange,
}: {
  row: StoryboardRow;
  field: StoryboardRowField;
  active: boolean;
  editing: boolean;
  referenceMap: Map<string, StoryboardReferenceMedia>;
  onChange: (next: string) => void;
}) {
  const value = row[field] || '';
  const isShotNumber = field === '镜号';
  const isReferenceField = field === '角色图' || field === '参考';
  const referenceLabels = isReferenceField ? extractReferenceLabels(value) : [];
  const hasResolvedReference =
    isReferenceField && referenceLabels.some((label) => referenceMap.has(label));

  return (
    <div
      className={[
        'h-full min-h-[74px] border-r border-b border-white/[0.055]',
        isShotNumber ? 'px-0 py-2' : 'p-2',
        active ? 'bg-white/[0.035]' : '',
      ].join(' ')}
    >
      {isReferenceField && !editing && hasResolvedReference ? (
        <ReferenceChips
          value={value}
          referenceMap={referenceMap}
          centered
        />
      ) : !editing ? (
        <div className="flex h-full min-h-[58px] w-full items-center justify-center whitespace-pre-wrap break-words text-center text-[11px] leading-4 text-gl-text-secondary">
          {value || '-'}
        </div>
      ) : (
        <textarea
          value={value}
          tabIndex={undefined}
          aria-readonly={false}
          placeholder=""
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
          className={[
            'text-node-scrollable h-full min-h-[44px] w-full resize-none border-0 bg-transparent text-[11px] leading-4 text-gl-text-secondary outline-none placeholder:text-gl-text-muted',
            isShotNumber ? 'text-center' : '',
            isReferenceField ? 'text-center' : '',
            'nodrag nopan',
          ].join(' ')}
        />
      )}
    </div>
  );
}

function StoryboardCardField({
  row,
  field,
  editing,
  referenceMap,
  onChange,
}: {
  row: StoryboardRow;
  field: StoryboardRowField;
  editing: boolean;
  referenceMap: Map<string, StoryboardReferenceMedia>;
  onChange: (next: string) => void;
}) {
  const value = row[field] || '';
  const isReferenceField = field === '角色图' || field === '参考';
  const referenceLabels = isReferenceField ? extractReferenceLabels(value) : [];
  const hasResolvedReference =
    isReferenceField && referenceLabels.some((label) => referenceMap.has(label));

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold leading-none text-gl-text-muted">{field}</div>
      {isReferenceField && !editing && hasResolvedReference ? (
        <ReferenceChips
          value={value}
          referenceMap={referenceMap}
        />
      ) : editing ? (
        <textarea
          value={value}
          placeholder="-"
          onChange={(event) => onChange(event.currentTarget.value)}
          className="text-node-scrollable nodrag nopan min-h-[48px] w-full resize-none border-0 bg-transparent text-[11px] leading-4 text-gl-text-secondary outline-none placeholder:text-gl-text-muted"
        />
      ) : (
        <div className="whitespace-pre-wrap break-words text-[11px] font-medium leading-[1.55] text-gl-text-secondary">
          {value || '-'}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
      <Clapperboard size={42} className="text-gl-text-muted" />
      <div className="text-[15px] font-medium text-gl-text-secondary">还没有分镜表</div>
      <div className="w-full max-w-[520px] text-[12px] leading-5 text-gl-text-muted">
        在下方输入剧本、镜头数量、风格或时长，也可以连接参考图后生成结构化分镜。
      </div>
    </div>
  );
}

export const StoryboardScriptNode = memo(function StoryboardScriptNode({
  id,
  data,
  selected = false,
  dragging = false,
  editing = false,
  connectedImages = [],
  connectedVideos = [],
  onChange,
  onStartEdit,
  onEndEdit,
  onTitleChange,
  onRun,
  onRemoveReference,
  onPromptPointerDown,
  onPromptFocusWithinChange,
}: StoryboardScriptNodeProps) {
  const reactFlow = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [suppressTransientUi, setSuppressTransientUi] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [draftCardSize, setDraftCardSize] = useState<StoryboardCardSize | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef(data);
  const resizeFrameRef = useRef<number | null>(null);
  const clearDraftSizeFrameRef = useRef<number | null>(null);
  const pendingResizeSizeRef = useRef<StoryboardCardSize | null>(null);
  const resizeRef = useRef<{
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    latestSize: StoryboardCardSize;
  } | null>(null);
  const uiVisible = (selected || promptFocused) && !dragging && !suppressTransientUi;
  const isGenerating = data.status === 'generating';
  const isError = data.status === 'error';
  const persistedCardSize = getStoryboardCardSize(data);
  const cardSize = draftCardSize ?? persistedCardSize;
  const rows = useMemo(
    () => Array.isArray(data.rows) ? data.rows.map(normalizeStoryboardRow) : [],
    [data.rows],
  );
  const viewMode = data.viewMode || 'list';
  const focusMode = data.focusMode || 'imagePrompt';
  const visibleTableColumns = useMemo(
    () => getVisibleTableColumns(focusMode),
    [focusMode],
  );
  const visibleTableGridTemplateColumns = useMemo(
    () => visibleTableColumns.map((column) => `minmax(${column.width}, 1fr)`).join(' '),
    [visibleTableColumns],
  );
  const referenceMap = useMemo(
    () => getReferenceMediaMap(
      data.referenceImages,
      connectedImages,
      data.referenceVideos,
      connectedVideos,
    ),
    [
      connectedImages,
      connectedVideos,
      data.referenceImages,
      data.referenceVideos,
    ],
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (
      resizing ||
      !draftCardSize ||
      persistedCardSize.width !== draftCardSize.width ||
      persistedCardSize.height !== draftCardSize.height
    ) {
      return;
    }

    clearDraftSizeFrameRef.current = window.requestAnimationFrame(() => {
      clearDraftSizeFrameRef.current = null;
      setDraftCardSize(null);
    });

    return () => {
      if (clearDraftSizeFrameRef.current !== null) {
        window.cancelAnimationFrame(clearDraftSizeFrameRef.current);
        clearDraftSizeFrameRef.current = null;
      }
    };
  }, [
    draftCardSize,
    persistedCardSize.height,
    persistedCardSize.width,
    resizing,
  ]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [cardSize.height, cardSize.width, id, updateNodeInternals]);

  useEffect(() => {
    if (!suppressTransientUi) {
      return;
    }

    const clearSuppression = () => setSuppressTransientUi(false);

    window.addEventListener('pointerup', clearSuppression);
    window.addEventListener('pointercancel', clearSuppression);

    return () => {
      window.removeEventListener('pointerup', clearSuppression);
      window.removeEventListener('pointercancel', clearSuppression);
    };
  }, [suppressTransientUi]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEndEdit?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, onEndEdit]);

  const patchData = useCallback((partial: Partial<StoryboardScriptNodeData>) => {
    const currentData = dataRef.current;

    onChange?.({
      ...currentData,
      ...partial,
      status: partial.status ?? (currentData.status === 'error' ? 'idle' : currentData.status),
      errorMessage: partial.errorMessage,
    });
  }, [onChange]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSuppressTransientUi(false);
    setResizing(true);
    resizeRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: cardSize.width,
      startHeight: cardSize.height,
      latestSize: cardSize,
    };
    setDraftCardSize(cardSize);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer listeners below keep resize active if capture is unavailable.
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeRef.current;

      if (!resizeState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const nextSize = normalizeStoryboardCardSize(
        resizeState.startWidth + (event.clientX - resizeState.startClientX) / zoom,
        resizeState.startHeight + (event.clientY - resizeState.startClientY) / zoom,
      );
      resizeState.latestSize = nextSize;
      pendingResizeSizeRef.current = nextSize;

      if (resizeFrameRef.current === null) {
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          const pendingSize = pendingResizeSizeRef.current;

          if (pendingSize) {
            setDraftCardSize(pendingSize);
          }
        });
      }
    };

    const stopResize = (event: PointerEvent) => {
      const resizeState = resizeRef.current;

      if (!resizeState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = null;
      pendingResizeSizeRef.current = null;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      patchData({
        cardWidth: resizeState.latestSize.width,
        cardHeight: resizeState.latestSize.height,
      });
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', stopResize, true);
    window.addEventListener('pointercancel', stopResize, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', stopResize, true);
      window.removeEventListener('pointercancel', stopResize, true);

      if (resizeRef.current) {
        resizeRef.current = null;
        pendingResizeSizeRef.current = null;
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        if (clearDraftSizeFrameRef.current !== null) {
          window.cancelAnimationFrame(clearDraftSizeFrameRef.current);
          clearDraftSizeFrameRef.current = null;
        }
        setDraftCardSize(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [patchData, reactFlow]);

  const updateRow = (rowIndex: number, field: StoryboardRowField, value: string) => {
    const nextRows = rows.map((row, index) =>
      index === rowIndex
        ? {
            ...row,
            [field]: value,
          }
        : row,
    );

    patchData({ rows: nextRows });
  };

  const handleScrollableWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const viewport = reactFlow.getViewport();
    const nextZoom = clampStoryboardCanvasZoom(
      viewport.zoom * (1 - event.deltaY * STORYBOARD_CTRL_WHEEL_ZOOM_STEP),
    );

    if (nextZoom === viewport.zoom) {
      return;
    }

    const canvasRoot = stageRef.current?.closest('.react-flow');
    const rect = canvasRoot instanceof HTMLElement
      ? canvasRoot.getBoundingClientRect()
      : document.documentElement.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const canvasX = (pointerX - viewport.x) / viewport.zoom;
    const canvasY = (pointerY - viewport.y) / viewport.zoom;

    void reactFlow.setViewport({
      x: pointerX - canvasX * nextZoom,
      y: pointerY - canvasY * nextZoom,
      zoom: nextZoom,
    }, { duration: 0 });
  }, [reactFlow]);

  const activePromptField: StoryboardRowField =
    focusMode === 'imagePrompt' ? '图片提示词' : '视频提示词';

  return (
    <div
      ref={stageRef}
      className="relative group node-connectable-root"
      style={{ width: `${cardSize.width}px` }}
      onPointerDownCapture={() => {
        if (!selected) {
          setSuppressTransientUi(true);
        }
      }}
    >
      <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex select-none items-center gap-1.5 text-gl-text-tertiary nodrag nopan">
        <Clapperboard size={24} />
        <EditableNodeTitle
          value={data.title}
          fallbackValue="分镜脚本"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card storyboard-script-node-drag-handle relative rounded-gl-lg border bg-gl-panel shadow-gl-card',
          'flex cursor-grab flex-col overflow-hidden transition-[border-color,box-shadow] duration-150',
          isGenerating
            ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
            : isError
              ? 'border-gl-error/70 shadow-[0_0_0_1px_rgba(239,68,68,0.45),0_0_24px_rgba(239,68,68,0.16)]'
              : selected || resizing
                ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
                : 'border-gl-stroke-subtle',
        ].join(' ')}
        style={{
          width: `${cardSize.width}px`,
          height: `${cardSize.height}px`,
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onStartEdit?.();
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4"
          style={{ height: HEADER_HEIGHT }}
        >
          <div className="flex items-center gap-2">
            <Clapperboard size={15} className="text-gl-text-tertiary" />
            <span className="text-[13px] font-semibold text-gl-text-secondary">分镜脚本</span>
            <span className="rounded-[5px] border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
              BETA
            </span>
            {isGenerating ? (
              <span className="ml-2 text-[11px] text-gl-text-muted">生成中...</span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 nodrag nopan">
            <button
              type="button"
              className={[
                'inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium transition-colors',
                focusMode === 'imagePrompt'
                  ? 'bg-white/[0.1] text-gl-text-primary'
                  : 'text-gl-text-secondary hover:bg-white/[0.06]',
              ].join(' ')}
              onClick={() => patchData({ focusMode: 'imagePrompt' })}
            >
              <Images size={12} />
              图片提示词
            </button>
            <button
              type="button"
              className={[
                'inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium transition-colors',
                focusMode === 'videoPrompt'
                  ? 'bg-white/[0.1] text-gl-text-primary'
                  : 'text-gl-text-secondary hover:bg-white/[0.06]',
              ].join(' ')}
              onClick={() => patchData({ focusMode: 'videoPrompt' })}
            >
              <Video size={12} />
              视频提示词
            </button>
            <button
              type="button"
              className={[
                'inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-white/[0.1] text-gl-text-primary'
                  : 'text-gl-text-secondary hover:bg-white/[0.06]',
              ].join(' ')}
              onClick={() => patchData({ viewMode: 'list' })}
            >
              <List size={12} />
              列表视图
            </button>
            <button
              type="button"
              className={[
                'inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium transition-colors',
                viewMode === 'card'
                  ? 'bg-white/[0.1] text-gl-text-primary'
                  : 'text-gl-text-secondary hover:bg-white/[0.06]',
              ].join(' ')}
              onClick={() => patchData({ viewMode: 'card' })}
            >
              <Rows3 size={12} />
              卡片视图
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium text-gl-text-muted opacity-60"
              title="导出将在后续版本提供"
            >
              <FileDown size={12} />
            </button>
          </div>
        </div>

        <div
          className="text-node-scrollable min-h-0 flex-1 overflow-auto"
          onWheelCapture={handleScrollableWheel}
          onWheel={handleScrollableWheel}
          onBlur={(event) => {
            if (
              editing &&
              event.currentTarget instanceof HTMLElement &&
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              onEndEdit?.();
            }
          }}
        >
          {rows.length === 0 ? (
            <EmptyState />
          ) : viewMode === 'list' ? (
            <div className="min-w-full">
              <div className="sticky top-0 z-10 grid border-b border-white/[0.08] bg-[#1b1d21]/95">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: visibleTableGridTemplateColumns,
                  }}
                >
                  {visibleTableColumns.map((column) => (
                    <div
                      key={column.field}
                      className={[
                        'border-r border-white/[0.06] px-2 py-2 text-[11px] font-semibold text-gl-text-muted',
                        column.field === '镜号' ? 'text-center' : '',
                        column.emphasis === 'image' && focusMode === 'imagePrompt' ? 'text-gl-text-primary' : '',
                        column.emphasis === 'video' && focusMode === 'videoPrompt' ? 'text-gl-text-primary' : '',
                      ].join(' ')}
                    >
                      {column.label}
                    </div>
                  ))}
                </div>
              </div>
              {rows.map((row, rowIndex) => (
                <div
                  key={`storyboard-row-${rowIndex}`}
                  className="grid"
                  style={{
                    gridTemplateColumns: visibleTableGridTemplateColumns,
                    minHeight: ROW_MIN_HEIGHT,
                  }}
                >
                  {visibleTableColumns.map((column) => (
                    <StoryboardCell
                      key={column.field}
                      row={row}
                      field={column.field}
                      active={column.field === activePromptField}
                      editing={editing}
                      referenceMap={referenceMap}
                      onChange={(next) => updateRow(rowIndex, column.field, next)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5 p-3">
              {rows.map((row, rowIndex) => (
                <div
                  key={`storyboard-card-${rowIndex}`}
                  className="min-h-[220px] rounded-[7px] border border-white/[0.08] bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="text-[15px] font-bold leading-none text-gl-text-primary">
                      {row['镜号'] || rowIndex + 1}
                    </div>
                    <div className="text-[11px] font-semibold leading-none text-gl-text-muted">
                      {row['时长'] || '-'}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {visibleTableColumns
                      .filter((column) => column.field !== '镜号' && column.field !== '时长')
                      .map((column) => (
                        <StoryboardCardField
                          key={column.field}
                          row={row}
                          field={column.field}
                          editing={editing}
                          referenceMap={referenceMap}
                          onChange={(next) => updateRow(rowIndex, column.field, next)}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isError && data.errorMessage ? (
          <div className="shrink-0 border-t border-gl-error/20 bg-gl-error/10 px-4 py-2 text-[11px] text-gl-error">
            {data.errorMessage}
          </div>
        ) : null}

        <button
          type="button"
          aria-label="调整分镜主卡片大小"
          className={[
            'nodrag nopan absolute bottom-[-4px] right-[-4px] z-20 h-10 w-10 cursor-nwse-resize touch-none border-0 bg-transparent p-0',
            'opacity-70 transition-opacity hover:opacity-100',
            uiVisible || resizing ? 'pointer-events-auto' : 'pointer-events-auto opacity-0 group-hover:opacity-70',
          ].join(' ')}
          onPointerDown={handleResizePointerDown}
        >
          <span className="absolute bottom-[9px] right-[9px] h-[12px] w-[12px] border-b border-r border-white/55" />
          <span className="absolute bottom-[14px] right-[9px] h-[7px] w-[7px] border-b border-r border-white/30" />
        </button>
      </div>

      <CardSideHandle
        type="target"
        position={Position.Left}
        visible={uiVisible}
        cardTopOffset={30}
        cardLeftOffset={0}
        cardWidth={cardSize.width}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={uiVisible}
        cardTopOffset={30}
        cardLeftOffset={0}
        cardWidth={cardSize.width}
      />

      <StoryboardScriptPromptBar
        key={uiVisible ? 'visible' : 'hidden'}
        nodeId={id}
        visible={uiVisible}
        prompt={data.prompt || ''}
        provider={data.provider || readStoredSelectedApiProvider('text')}
        model={data.model || 'gpt-5.4'}
        generating={isGenerating}
        connectedImages={connectedImages}
        connectedVideos={connectedVideos}
        onPromptChange={(next) => patchData({ prompt: next })}
        onProviderModelChange={(next: { provider: ApiProvider; model: string }) =>
          patchData({
            provider: next.provider,
            model: next.model,
          })
        }
        onRun={onRun}
        onRemoveReference={onRemoveReference}
        onPointerDownWithin={onPromptPointerDown}
        onFocusWithinChange={(focused) => {
          setPromptFocused(focused);
          onPromptFocusWithinChange?.(focused);
        }}
      />
    </div>
  );
});
