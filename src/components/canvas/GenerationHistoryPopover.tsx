'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { Maximize2 } from 'lucide-react';
import type { ImageHistoryItem, ImageHistoryListItem } from '@/types/canvas';

type HistoryTab = 'images' | 'videos';

type ImageHistoryResponse =
  | { ok: true; items: ImageHistoryListItem[] }
  | { ok: true; item: ImageHistoryItem }
  | { ok: false; error: string };

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 320;
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

function groupImageHistoryItems(items: ImageHistoryListItem[]) {
  const groups = new Map<string, ImageHistoryListItem[]>();

  for (const item of items) {
    const dateKey = formatDateKey(item.generatedAt);
    const group = groups.get(dateKey);

    if (group) {
      group.push(item);
    } else {
      groups.set(dateKey, [item]);
    }
  }

  return Array.from(groups, ([date, groupedItems]) => ({
    date,
    items: groupedItems,
  }));
}

function getImageUrl(item: ImageHistoryListItem): string {
  return item.hostedImageUrl?.trim() || item.imageUrl?.trim() || '';
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
  const [activeTab, setActiveTab] = useState<HistoryTab>('images');
  const [items, setItems] = useState<ImageHistoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingItemId, setSelectingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();

    fetch('/api/image-history?limit=160', { signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as ImageHistoryResponse;

        if (!response.ok || !json.ok) {
          throw new Error('error' in json ? json.error : '加载失败');
        }

        if (!('items' in json)) {
          throw new Error('鍔犺浇澶辫触');
        }

        setItems(json.items);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [open]);

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

  const groups = useMemo(() => groupImageHistoryItems(items), [items]);

  const handleSelectItem = async (item: ImageHistoryListItem) => {
    if (selectingItemId) {
      return;
    }

    setSelectingItemId(item.id);
    setError(null);

    try {
      const response = await fetch(`/api/image-history?id=${encodeURIComponent(item.id)}`);
      const json = (await response.json()) as ImageHistoryResponse;

      if (!response.ok || !json.ok || !('item' in json)) {
        throw new Error('error' in json ? json.error : '鍔犺浇澶辫触');
      }

      onSelectImage(json.item);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '鍔犺浇澶辫触');
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
      className="fixed z-[70] h-[320px] w-[320px] overflow-hidden rounded-[9px] border border-white/10 bg-[#242529]/98 text-white shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-md"
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
            图片历史 ({items.length})
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
            视频历史
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

      <div className="generation-history-scrollable h-[284px] overflow-y-auto px-3.5 py-3">
        {activeTab === 'videos' ? (
          <div className="flex h-full items-center justify-center text-[10px] text-white/34">
            暂无视频历史
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-[10px] text-white/38">
            加载中...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[10px] text-[#ff7878]">
            {error}
          </div>
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
                    const imageUrl = getImageUrl(item);
                    const selecting = selectingItemId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={selectingItemId !== null}
                        className="relative h-[92px] overflow-hidden rounded-md bg-black/30 text-left outline-none ring-1 ring-white/0 transition hover:scale-[1.015] hover:ring-white/36 focus-visible:ring-white/70 disabled:cursor-wait disabled:hover:scale-100"
                        onClick={() => handleSelectItem(item)}
                      >
                        {imageUrl ? (
                          <NextImage
                            src={imageUrl}
                            alt="Generated image history"
                            fill
                            unoptimized
                            loading="lazy"
                            sizes="92px"
                            className="object-cover"
                          />
                        ) : null}
                        {selecting ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] text-white/70">
                            鍔犺浇涓?..
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
