'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { Maximize2 } from 'lucide-react';
import type { ImageHistoryItem, ProjectOutputHistoryItem } from '@/types/canvas';
import { useCanvasStore } from '@/store/canvas-store';

type HistoryTab = 'images' | 'videos';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 360;
const PANEL_MARGIN = 12;

export interface GenerationHistoryPopoverProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onSelectImage: (item: ImageHistoryItem) => void;
}

function formatDateKey(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '未知日期';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function groupHistoryItems(items: ProjectOutputHistoryItem[]) {
  const groups = new Map<string, ProjectOutputHistoryItem[]>();

  for (const item of items) {
    const dateKey = formatDateKey(item.modifiedAt);
    const current = groups.get(dateKey);

    if (current) {
      current.push(item);
    } else {
      groups.set(dateKey, [item]);
    }
  }

  return Array.from(groups, ([date, groupedItems]) => ({
    date,
    items: groupedItems,
  }));
}

function getPanelPosition(anchor: { x: number; y: number }): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return {
      left: anchor.x,
      top: anchor.y,
    };
  }

  return {
    left: Math.min(anchor.x, Math.max(PANEL_MARGIN, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN)),
    top: Math.min(Math.max(16, anchor.y), Math.max(16, window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN)),
  };
}

export function GenerationHistoryPopover({
  open,
  anchor,
  onClose,
  onSelectImage,
}: GenerationHistoryPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listCurrentProjectHistory = useCanvasStore((state) => state.listCurrentProjectHistory);
  const [activeTab, setActiveTab] = useState<HistoryTab>('images');
  const [items, setItems] = useState<ProjectOutputHistoryItem[]>([]);
  const [loading, setLoading] = useState(open);
  const [error, setError] = useState<string | null>(null);
  const [selectingItemId, setSelectingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    void listCurrentProjectHistory()
      .then((nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
          setError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [listCurrentProjectHistory, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (panelRef.current?.contains(target)) {
        return;
      }

      if (target instanceof Element && target.closest('[data-history-toggle="true"]')) {
        return;
      }

      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, open]);

  const imageItems = useMemo(
    () => items.filter((item) => item.kind === 'image'),
    [items],
  );
  const videoItems = useMemo(
    () => items.filter((item) => item.kind === 'video'),
    [items],
  );
  const groups = useMemo(() => groupHistoryItems(imageItems), [imageItems]);

  const handleSelectItem = async (item: ProjectOutputHistoryItem) => {
    if (selectingItemId || !item.nodeData) {
      return;
    }

    setSelectingItemId(item.id);
    setError(null);

    try {
      onSelectImage({
        id: item.id,
        imageUrl: item.previewUrl,
        model: item.model,
        width: item.width,
        height: item.height,
        format: item.format,
        sizeBytes: item.sizeBytes,
        generatedAt: item.createdAt,
        nodeData: item.nodeData,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '读取历史失败');
    } finally {
      setSelectingItemId(null);
    }
  };

  if (!open || !anchor) {
    return null;
  }

  const { left, top } = getPanelPosition(anchor);

  return (
    <div
      ref={panelRef}
      className="fixed z-[70] h-[360px] w-[320px] overflow-hidden rounded-[9px] border border-white/10 bg-[#242529]/98 text-white shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-md"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-9 items-end justify-between border-b border-white/28 px-3.5">
        <div className="flex h-full items-end gap-3.5 text-[11px] font-semibold">
          <button
            type="button"
            className={[
              'h-full border-b-2 pt-2.5 transition',
              activeTab === 'images'
                ? 'border-white/78 text-white/82'
                : 'border-transparent text-white/34 hover:text-white/58',
            ].join(' ')}
            onClick={() => setActiveTab('images')}
          >
            图片历史 ({imageItems.length})
          </button>
          <button
            type="button"
            className={[
              'h-full border-b-2 pt-2.5 transition',
              activeTab === 'videos'
                ? 'border-white/78 text-white/82'
                : 'border-transparent text-white/34 hover:text-white/58',
            ].join(' ')}
            onClick={() => setActiveTab('videos')}
          >
            视频历史 ({videoItems.length})
          </button>
        </div>
        <button
          type="button"
          aria-label="展开历史"
          className="mb-2 flex h-5.5 w-5.5 items-center justify-center rounded text-white/52 transition hover:bg-white/8 hover:text-white/76"
        >
          <Maximize2 size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="generation-history-scrollable h-[324px] overflow-y-auto px-3.5 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[10px] text-white/38">
            加载中...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[10px] text-[#ff7878]">
            {error}
          </div>
        ) : activeTab === 'videos' ? (
          videoItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[10px] text-white/34">
              暂无视频历史
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {videoItems.map((item) => (
                <div
                  key={item.id}
                  className="flex h-[68px] items-center rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-white/72"
                >
                  {item.fileName}
                </div>
              ))}
            </div>
          )
        ) : groups.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] text-white/34">
            暂无图片历史
          </div>
        ) : (
          <div className="space-y-3.5 pb-3.5">
            {groups.map((group) => (
              <section key={group.date}>
                <h3 className="mb-2 text-[11px] font-semibold leading-none text-white/68">
                  {group.date}
                </h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {group.items.map((item) => {
                    const selecting = selectingItemId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={selectingItemId !== null || !item.nodeData}
                        className="relative h-[92px] overflow-hidden rounded-md bg-black/30 text-left outline-none ring-1 ring-white/0 transition hover:scale-[1.015] hover:ring-white/36 focus-visible:ring-white/70 disabled:cursor-wait disabled:hover:scale-100"
                        onClick={() => handleSelectItem(item)}
                      >
                        <NextImage
                          src={item.previewUrl}
                          alt="Project image history"
                          fill
                          unoptimized
                          loading="lazy"
                          sizes="92px"
                          className="object-cover"
                        />
                        {selecting ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] text-white/70">
                            加载中...
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
