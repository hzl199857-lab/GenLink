'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { useViewport } from 'reactflow';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Eraser,
  Eye,
  Grid2x2,
  LogOut,
  Minimize2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import type {
  StoryboardGridAspectRatio,
  StoryboardGridCellImage,
  StoryboardGridNodeData,
  StoryboardGridSize,
} from '@/types/canvas';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';

export const STORYBOARD_GRID_EXPANDED_WIDTH = 760;
export const STORYBOARD_GRID_COLLAPSED_WIDTH = 420;
export const STORYBOARD_GRID_TITLE_HEIGHT = 30;
export const STORYBOARD_GRID_EMPTY_HINT_HEIGHT = 34;
const STORYBOARD_GRID_CELL_GAP = 1;
const STORYBOARD_GRID_EXPANDED_WIDTH_BY_COLUMNS: Record<number, number> = {
  2: 560,
  3: STORYBOARD_GRID_EXPANDED_WIDTH,
  4: 980,
  5: 1200,
};
const STORYBOARD_GRID_TRANSITION = '420ms cubic-bezier(0.22, 1, 0.36, 1)';
const STORYBOARD_GRID_CONTENT_TRANSITION = '260ms cubic-bezier(0.22, 1, 0.36, 1)';

export type StoryboardGridDropTarget = {
  nodeId: string;
  cellIndex: number;
};

export const STORYBOARD_GRID_ASPECT_RATIOS: StoryboardGridAspectRatio[] = [
  '16:9',
  '9:16',
  '3:4',
  '4:3',
  '1:1',
];

export const STORYBOARD_GRID_SIZES: StoryboardGridSize[] = [
  '2x2',
  '3x3',
  '4x4',
  '5x5',
];

export function parseStoryboardGridSize(grid: StoryboardGridSize): { columns: number; rows: number } {
  const [columns, rows] = grid.split('x').map((value) => Number(value));

  return {
    columns: columns || 3,
    rows: rows || 3,
  };
}

export function getStoryboardGridCellCount(grid: StoryboardGridSize): number {
  const size = parseStoryboardGridSize(grid);
  return size.columns * size.rows;
}

export function getStoryboardGridAspectValue(aspectRatio: StoryboardGridAspectRatio): number {
  const [width, height] = aspectRatio.split(':').map((value) => Number(value));
  return width && height ? width / height : 16 / 9;
}

export function getStoryboardGridExpandedHeight(aspectRatio: StoryboardGridAspectRatio): number {
  return Math.round(STORYBOARD_GRID_EXPANDED_WIDTH / getStoryboardGridAspectValue(aspectRatio));
}

export function getStoryboardGridExpandedWidth(grid: StoryboardGridSize): number {
  const size = parseStoryboardGridSize(grid);

  return STORYBOARD_GRID_EXPANDED_WIDTH_BY_COLUMNS[size.columns] ?? STORYBOARD_GRID_EXPANDED_WIDTH;
}

export function getStoryboardGridExpandedSize(
  aspectRatio: StoryboardGridAspectRatio,
  grid: StoryboardGridSize,
): { width: number; height: number } {
  const width = getStoryboardGridExpandedWidth(grid);

  return {
    width,
    height: Math.round(width / getStoryboardGridAspectValue(aspectRatio)),
  };
}

export function getStoryboardGridCollapsedHeight(aspectRatio: StoryboardGridAspectRatio): number {
  return Math.round(STORYBOARD_GRID_COLLAPSED_WIDTH / getStoryboardGridAspectValue(aspectRatio));
}

export function getStoryboardGridNodeSize(data: StoryboardGridNodeData): { width: number; height: number } {
  if (data.isCollapsed) {
    return {
      width: STORYBOARD_GRID_COLLAPSED_WIDTH,
      height: getStoryboardGridCollapsedHeight(data.aspectRatio),
    };
  }

  return getStoryboardGridExpandedSize(data.aspectRatio, data.grid);
}

function getCellImageUrl(image: StoryboardGridCellImage): string {
  return image.previewUrl?.trim() || image.hostedImageUrl?.trim() || image.imageUrl.trim();
}

function StoryboardGridImage({ image }: { image: StoryboardGridCellImage }) {
  const imageUrl = getCellImageUrl(image);
  const browserImageUrl = getBrowserImageDisplayUrl(imageUrl);
  const alt = image.title?.trim() || image.fileName?.trim() || 'Storyboard image';
  const isLocal = imageUrl.startsWith('blob:') || imageUrl.startsWith('data:');

  if (!imageUrl) {
    return null;
  }

  if (isLocal) {
    // eslint-disable-next-line @next/next/no-img-element -- blob/data previews cannot be optimized by next/image.
    return <img src={browserImageUrl} alt={alt} className="h-full w-full object-cover" draggable={false} />;
  }

  return (
    <NextImage
      src={browserImageUrl}
      alt={alt}
      fill
      unoptimized
      sizes={`${STORYBOARD_GRID_EXPANDED_WIDTH}px`}
      className="object-cover"
      draggable={false}
    />
  );
}

function ToolbarMenu({
  label,
  value,
  open,
  options,
  onOpenChange,
  onSelect,
}: {
  label: string;
  value: string;
  open: boolean;
  options: string[];
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="nodrag nopan flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-gl-pill px-3 text-[13px] font-medium text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
        onClick={() => onOpenChange(!open)}
      >
        <span>{label} {value}</span>
        {open ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
      </button>

      {open ? (
        <div
          className="absolute bottom-[calc(100%+10px)] left-0 z-[80] min-w-[86px] rounded-[14px] border border-white/10 bg-gl-panel/95 p-1.5 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={[
                'block h-8 w-full whitespace-nowrap rounded-[8px] px-3 text-left text-[12px] font-medium transition-colors',
                option === value
                  ? 'bg-gl-panel-hover text-gl-text-primary'
                  : 'text-gl-text-secondary hover:bg-gl-panel-hover hover:text-gl-text-primary',
              ].join(' ')}
              onClick={() => {
                onSelect(option);
                onOpenChange(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarAction({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        'nodrag nopan flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-gl-pill px-3 text-[13px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-gl-text-muted/45'
          : active
          ? 'bg-gl-panel-hover text-gl-text-primary'
          : 'text-gl-text-secondary hover:bg-gl-panel-hover hover:text-gl-text-primary',
      ].join(' ')}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export interface StoryboardGridNodeProps {
  id: string;
  data: StoryboardGridNodeData;
  selected?: boolean;
  dropTarget?: StoryboardGridDropTarget | null;
  onAspectRatioChange?: (aspectRatio: StoryboardGridAspectRatio) => void;
  onGridChange?: (grid: StoryboardGridSize) => void;
  onEditingChange?: (editing: boolean) => void;
  onClear?: () => void;
  onCollapseChange?: (collapsed: boolean) => void;
  onUploadCell?: (cellIndex: number, file: File) => void;
  onMoveCell?: (fromIndex: number, toIndex: number) => void;
  onPreviewCell?: (image: StoryboardGridCellImage) => void;
  onDeleteCell?: (cellIndex: number) => void;
  onCompose?: () => void;
  onSelectNode?: () => void;
}

export function StoryboardGridNode({
  id,
  data,
  selected = false,
  dropTarget,
  onAspectRatioChange,
  onGridChange,
  onEditingChange,
  onClear,
  onCollapseChange,
  onUploadCell,
  onMoveCell,
  onPreviewCell,
  onDeleteCell,
  onCompose,
  onSelectNode,
}: StoryboardGridNodeProps) {
  const { zoom } = useViewport();
  const [openMenu, setOpenMenu] = useState<'ratio' | 'grid' | null>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const dragCellIndexRef = useRef<number | null>(null);
  const previousLayoutKeyRef = useRef(`${data.aspectRatio}:${data.grid}:${data.isCollapsed ? 'collapsed' : 'expanded'}`);
  const grid = parseStoryboardGridSize(data.grid);
  const size = getStoryboardGridNodeSize(data);
  const cellCount = getStoryboardGridCellCount(data.grid);
  const cells = useMemo(
    () => Array.from({ length: cellCount }, (_, index) => data.cells[index] ?? null),
    [cellCount, data.cells],
  );
  const coverImage = useMemo(
    () => cells.find((cell): cell is StoryboardGridCellImage => Boolean(cell)) ?? null,
    [cells],
  );
  const isDropTarget = dropTarget?.nodeId === id;
  const gridHeight = size.height;
  const frameHeight = data.isCollapsed
    ? size.height
    : gridHeight;
  const hintHeight = STORYBOARD_GRID_EMPTY_HINT_HEIGHT;
  const nodeHeight = STORYBOARD_GRID_TITLE_HEIGHT + frameHeight + hintHeight;

  useEffect(() => {
    const layoutKey = `${data.aspectRatio}:${data.grid}:${data.isCollapsed ? 'collapsed' : 'expanded'}`;

    if (previousLayoutKeyRef.current === layoutKey) {
      return;
    }

    previousLayoutKeyRef.current = layoutKey;
    setLayoutAnimating(true);
    const timeoutId = window.setTimeout(() => setLayoutAnimating(false), 320);

    return () => window.clearTimeout(timeoutId);
  }, [data.aspectRatio, data.grid, data.isCollapsed]);

  return (
    <div
      className="relative node-connectable-root"
      style={{
        width: size.width,
        height: nodeHeight,
        transition: `width ${STORYBOARD_GRID_TRANSITION}, height ${STORYBOARD_GRID_TRANSITION}`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectNode?.();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (data.isCollapsed) {
          onCollapseChange?.(false);
          return;
        }
        onEditingChange?.(true);
      }}
    >
      {selected ? (
        <div
          data-canvas-menu-ignore="true"
          onPointerDown={(event) => event.stopPropagation()}
          className="nodrag nopan absolute -top-[58px] left-1/2 z-50 flex min-w-max items-center gap-1 rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md"
          style={{
            transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
            transformOrigin: 'bottom center',
          }}
        >
          <ToolbarMenu
            label="比例"
            value={data.aspectRatio}
            open={openMenu === 'ratio'}
            options={STORYBOARD_GRID_ASPECT_RATIOS}
            onOpenChange={(open) => setOpenMenu(open ? 'ratio' : null)}
            onSelect={(value) => onAspectRatioChange?.(value as StoryboardGridAspectRatio)}
          />
          <ToolbarMenu
            label="网格"
            value={data.grid}
            open={openMenu === 'grid'}
            options={STORYBOARD_GRID_SIZES}
            onOpenChange={(open) => setOpenMenu(open ? 'grid' : null)}
            onSelect={(value) => onGridChange?.(value as StoryboardGridSize)}
          />
          <div className="mx-1 h-5 w-px shrink-0 bg-gl-stroke-soft" />
          <ToolbarAction
            label={data.isEditing ? '退出' : '编辑'}
            active={data.isEditing}
            disabled={data.isCollapsed}
            icon={data.isEditing ? <LogOut size={13} strokeWidth={1.9} /> : <Edit3 size={13} strokeWidth={1.9} />}
            onClick={() => onEditingChange?.(!data.isEditing)}
          />
          <ToolbarAction
            label="合成"
            icon={<UserRound size={13} strokeWidth={1.9} />}
            onClick={onCompose}
          />
          <ToolbarAction
            label="清空"
            icon={<Eraser size={13} strokeWidth={1.9} />}
            onClick={onClear}
          />
          <ToolbarAction
            label={data.isCollapsed ? '展开' : '折叠'}
            icon={data.isCollapsed ? <ChevronUp size={13} strokeWidth={2} /> : <Minimize2 size={13} strokeWidth={1.9} />}
            onClick={() => onCollapseChange?.(!data.isCollapsed)}
          />
        </div>
      ) : null}

      <div className="h-[30px] select-none pl-1 text-[14px] font-semibold leading-[30px] text-gl-text-secondary">
        {data.title?.trim() || '分镜格子'}
      </div>

      <div
        className={[
          'relative overflow-hidden rounded-[10px] bg-[#202020] transition-[border-color,box-shadow]',
          selected || isDropTarget
            ? 'border border-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.52)]'
            : 'border border-transparent',
        ].join(' ')}
        style={{
          width: size.width,
          height: frameHeight,
          transition: [
            `width ${STORYBOARD_GRID_TRANSITION}`,
            `height ${STORYBOARD_GRID_TRANSITION}`,
            `border-color ${STORYBOARD_GRID_CONTENT_TRANSITION}`,
            `box-shadow ${STORYBOARD_GRID_CONTENT_TRANSITION}`,
          ].join(', '),
        }}
      >
        {data.isCollapsed ? (
          <div
            className="relative h-full w-full bg-[#202020]"
            style={{
              opacity: layoutAnimating ? 0.9 : 1,
              transform: `scale(${layoutAnimating ? 0.985 : 1})`,
              transition: `opacity ${STORYBOARD_GRID_CONTENT_TRANSITION}, transform ${STORYBOARD_GRID_CONTENT_TRANSITION}`,
              transformOrigin: 'center',
            }}
          >
            {coverImage ? (
              <StoryboardGridImage image={coverImage} />
            ) : null}
            <button
              type="button"
              aria-label="展开分镜格子"
              className="nodrag nopan absolute right-4 top-4 z-20 flex h-9 items-center gap-2 rounded-[12px] bg-black/62 px-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-md transition-colors hover:bg-black/76"
              onClick={(event) => {
                event.stopPropagation();
                onCollapseChange?.(false);
              }}
            >
              <Grid2x2 size={18} strokeWidth={1.9} />
              <span>{cellCount}</span>
            </button>
            <button
              type="button"
              aria-label="展开分镜格子"
              className="nodrag nopan absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[34px] font-light leading-none text-white/24 transition-colors hover:bg-black/25 hover:text-white/52"
              onClick={(event) => {
                event.stopPropagation();
                onCollapseChange?.(false);
              }}
            >
              +
            </button>
          </div>
        ) : (
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
              gap: STORYBOARD_GRID_CELL_GAP,
              backgroundColor: '#2c2c2c',
              opacity: layoutAnimating ? 0.86 : 1,
              transform: `scale(${layoutAnimating ? 0.992 : 1})`,
              transition: [
                `opacity ${STORYBOARD_GRID_CONTENT_TRANSITION}`,
                `transform ${STORYBOARD_GRID_CONTENT_TRANSITION}`,
                `grid-template-columns ${STORYBOARD_GRID_TRANSITION}`,
                `grid-template-rows ${STORYBOARD_GRID_TRANSITION}`,
              ].join(', '),
              transformOrigin: 'center',
            }}
          >
            {cells.map((image, index) => {
              const active = isDropTarget && dropTarget?.cellIndex === index;
              const hovering = hoveredCell === index;
              const showAddButton = !image || (data.isEditing && hovering);

              return (
                <div
                  key={`${data.grid}-${index}`}
                  data-storyboard-grid-node-id={id}
                  data-storyboard-grid-cell-index={index}
                  className={[
                    'relative overflow-hidden bg-[#202020] transition-[background-color,box-shadow,opacity,transform]',
                    data.isEditing ? 'nodrag nopan' : '',
                    active ? 'bg-white/8 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.82)]' : '',
                  ].join(' ')}
                  style={{
                    opacity: layoutAnimating ? 0.82 : 1,
                    transform: `scale(${layoutAnimating ? 0.975 : 1})`,
                    transitionDuration: layoutAnimating ? '220ms' : '180ms',
                    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    transitionDelay: layoutAnimating ? `${Math.min(index, 10) * 10}ms` : '0ms',
                  }}
                  draggable={data.isEditing && Boolean(image)}
                  onDragStart={(event) => {
                    if (!data.isEditing || !image) {
                      event.preventDefault();
                      return;
                    }
                    dragCellIndexRef.current = index;
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    if (data.isEditing && dragCellIndexRef.current !== null) {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    if (!data.isEditing || dragCellIndexRef.current === null) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveCell?.(dragCellIndexRef.current, index);
                    dragCellIndexRef.current = null;
                  }}
                  onDragEnd={() => {
                    dragCellIndexRef.current = null;
                  }}
                  onMouseEnter={() => setHoveredCell(index)}
                  onMouseLeave={() => setHoveredCell((current) => (current === index ? null : current))}
                >
                  {image ? (
                    <StoryboardGridImage image={image} />
                  ) : null}

                  {data.isEditing && image ? (
                    <div
                      className="nodrag nopan absolute right-2 top-2 z-20 flex items-center gap-1"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label="预览图片"
                        className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-black/55 text-white/88 shadow-[0_8px_16px_rgba(0,0,0,0.26)] backdrop-blur-md transition-colors hover:bg-black/72 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreviewCell?.(image);
                        }}
                      >
                        <Eye size={15} strokeWidth={1.9} />
                      </button>
                      <button
                        type="button"
                        aria-label="重新上传图片"
                        className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-black/55 text-white/88 shadow-[0_8px_16px_rgba(0,0,0,0.26)] backdrop-blur-md transition-colors hover:bg-black/72 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          inputRefs.current[index]?.click();
                        }}
                      >
                        <Upload size={15} strokeWidth={1.9} />
                      </button>
                      <button
                        type="button"
                        aria-label="删除图片"
                        className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-black/55 text-white/88 shadow-[0_8px_16px_rgba(0,0,0,0.26)] backdrop-blur-md transition-colors hover:bg-black/72 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteCell?.(index);
                        }}
                      >
                        <X size={15} strokeWidth={2.1} />
                      </button>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    aria-label="添加图片"
                    disabled={!data.isEditing}
                    className={[
                      'nodrag nopan absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[24px] font-light leading-none transition-[opacity,color,background-color]',
                      data.isEditing
                        ? 'cursor-pointer text-white/38 hover:bg-black/35 hover:text-white/72'
                        : 'cursor-default text-white/28',
                      showAddButton ? 'opacity-100' : 'opacity-0',
                    ].join(' ')}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!data.isEditing) {
                        return;
                      }
                      inputRefs.current[index]?.click();
                    }}
                  >
                    +
                  </button>
                  <input
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        onUploadCell?.(index, file);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-[34px] select-none text-center text-[12px] font-medium leading-[34px] text-gl-text-muted">
        {data.isCollapsed ? '双击或点击右上角展开' : '双击以进入分镜编辑排序'}
      </div>
    </div>
  );
}
