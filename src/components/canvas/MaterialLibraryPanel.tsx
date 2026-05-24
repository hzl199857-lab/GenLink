'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ChevronRight, X } from 'lucide-react';
import type { MaterialLibraryCategory, MaterialLibraryItem } from '@/types/canvas';

type MaterialFilter = '全部' | MaterialLibraryCategory;

const FILTERS: MaterialFilter[] = ['全部', '人物', '场景', '物品', '风格', '其他'];
const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 462;
const PANEL_MARGIN = 12;

export interface MaterialLibraryPanelProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  materials: MaterialLibraryItem[];
  onClose: () => void;
  onSelectMaterial: (item: MaterialLibraryItem, screenPosition?: { x: number; y: number }) => void;
  onDeleteMaterial: (id: string) => void;
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

export function MaterialLibraryPanel({
  open,
  anchor,
  materials,
  onClose,
  onSelectMaterial,
  onDeleteMaterial,
}: MaterialLibraryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<MaterialFilter>('全部');
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MaterialLibraryItem | null>(null);

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

      if (target instanceof Element && target.closest('[data-material-library-toggle="true"]')) {
        return;
      }

      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, open]);

  const filteredMaterials = useMemo(() => {
    if (activeFilter === '全部') {
      return materials;
    }

    return materials.filter((item) => item.category === activeFilter);
  }, [activeFilter, materials]);

  if (!open || !anchor) {
    return null;
  }

  const { left, top } = getPanelPosition(anchor);

  return (
    <div
      ref={panelRef}
      className="fixed z-[70] h-[462px] w-[480px] overflow-hidden rounded-[9px] border border-white/10 bg-[#17181B] text-white shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-[52px] items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="text-white/86">我的素材</span>
        </div>
        <button
          type="button"
          aria-label="关闭素材库"
          className="flex h-8 w-8 items-center justify-center rounded-md text-white/48 transition hover:bg-white/8 hover:text-white/72"
          onClick={onClose}
        >
          <X size={19} strokeWidth={1.7} />
        </button>
      </div>

      <div className="flex h-12 items-end gap-6 border-b border-white/10 px-4">
        {FILTERS.map((filter) => {
          const active = activeFilter === filter;

          return (
            <button
              key={filter}
              type="button"
              className={[
                'h-full border-b-2 px-0.5 pt-4 text-[14px] font-semibold transition',
                active
                  ? 'border-white/78 text-white/86'
                  : 'border-transparent text-white/44 hover:text-white/70',
              ].join(' ')}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="更多分类"
          className="mb-2.5 ml-auto flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/24 text-white/66 transition hover:bg-white/8 hover:text-white"
        >
          <ChevronRight size={17} strokeWidth={1.8} />
        </button>
      </div>

      <div className="generation-history-scrollable h-[398px] overflow-y-auto px-4 pb-4 pt-1">
        {filteredMaterials.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-white/34">
            暂无素材
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {filteredMaterials.map((item, index) => {
              const imageUrl = item.hostedImageUrl?.trim() || item.imageUrl.trim();

              return (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  className="group text-left outline-none"
                  onClick={() => onSelectMaterial(item)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('application/x-genlink-material-id', item.id);
                    event.dataTransfer.setData('text/plain', item.name);
                  }}
                >
                  <span className="relative block h-[136px] overflow-hidden rounded-[9px] bg-black/28 ring-1 ring-white/0 transition group-hover:scale-[1.012] group-hover:ring-white/28 group-focus-visible:ring-white/70">
                    <NextImage
                      src={imageUrl}
                      alt={item.name}
                      fill
                      unoptimized
                      loading="lazy"
                      sizes="136px"
                      className="object-cover"
                    />
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="删除素材"
                      className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/72 text-white opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.32)] transition hover:bg-[#CCFF00] hover:text-[#141510] group-hover:opacity-100 group-focus-within:opacity-100"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPendingDeleteItem(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return;
                        }

                        event.preventDefault();
                        event.stopPropagation();
                        setPendingDeleteItem(item);
                      }}
                    >
                      <X size={14} strokeWidth={2} />
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[12px] leading-4 text-white/64">
                    {item.name || index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {pendingDeleteItem ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/38 px-5 backdrop-blur-[2px]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="w-[260px] rounded-[9px] border border-white/12 bg-[#1f2023] p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.46)]">
            <div className="text-[14px] font-semibold text-white/88">删除素材</div>
            <div className="mt-2 text-[12px] leading-5 text-white/52">
              确定要删除“{pendingDeleteItem.name}”吗？该操作会从素材库中移除这个素材。
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-8 rounded-[8px] px-3 text-[12px] font-semibold text-white/58 transition hover:bg-white/8 hover:text-white/78"
                onClick={() => setPendingDeleteItem(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="h-8 rounded-[8px] bg-[#CCFF00] px-3 text-[12px] font-semibold text-[#141510] transition hover:bg-[#d7ff33]"
                onClick={() => {
                  onDeleteMaterial(pendingDeleteItem.id);
                  setPendingDeleteItem(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
