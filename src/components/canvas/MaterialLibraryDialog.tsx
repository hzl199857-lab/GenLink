'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ChevronDown, X } from 'lucide-react';
import type { MaterialLibraryCategory, MaterialLibraryItem } from '@/types/canvas';

export const MATERIAL_LIBRARY_CATEGORIES: MaterialLibraryCategory[] = [
  '人物',
  '场景',
  '物品',
  '风格',
  '其他',
];

export type PendingMaterialSource = Omit<
  MaterialLibraryItem,
  'id' | 'name' | 'category' | 'createdAt'
> & {
  defaultName: string;
};

export interface MaterialLibraryDialogProps {
  source: PendingMaterialSource | null;
  existingMaterials: MaterialLibraryItem[];
  onClose: () => void;
  onConfirm: (item: Omit<MaterialLibraryItem, 'id' | 'createdAt'>) => void;
}

type MaterialLibraryDialogDraft = {
  sourceId: string | null;
  name: string;
  category: MaterialLibraryCategory | '';
  categoryOpen: boolean;
  error: string | null;
};

export function MaterialLibraryDialog({
  source,
  existingMaterials,
  onClose,
  onConfirm,
}: MaterialLibraryDialogProps) {
  const [draft, setDraft] = useState<MaterialLibraryDialogDraft>({
    sourceId: null,
    name: '',
    category: '',
    categoryOpen: false,
    error: null,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, source]);

  const sourceDraftId = source
    ? [
        source.defaultName,
        source.imageUrl,
        source.hostedImageUrl ?? '',
        source.outputFileName ?? '',
      ].join('|')
    : null;
  const activeDraft =
    source && draft.sourceId === sourceDraftId
      ? draft
      : {
          sourceId: sourceDraftId,
          name: source?.defaultName.trim() || '图片素材',
          category: '' as const,
          categoryOpen: false,
          error: null,
        };
  const name = activeDraft.name;
  const category = activeDraft.category;
  const categoryOpen = activeDraft.categoryOpen;
  const error = activeDraft.error;
  const updateDraft = (partial: Partial<MaterialLibraryDialogDraft>) => {
    setDraft((current) => ({
      ...(current.sourceId === sourceDraftId ? current : activeDraft),
      ...partial,
    }));
  };

  const duplicate = useMemo(() => {
    const normalizedName = name.trim();

    if (!normalizedName || !category) {
      return false;
    }

    return existingMaterials.some(
      (item) => item.name.trim() === normalizedName && item.category === category,
    );
  }, [category, existingMaterials, name]);

  if (!source) {
    return null;
  }

  const imageUrl = source.hostedImageUrl?.trim() || source.imageUrl.trim();
  const canCreate = Boolean(name.trim() && category);

  const handleConfirm = () => {
    const normalizedName = name.trim();

    if (!normalizedName) {
      updateDraft({ error: '请输入名称' });
      return;
    }

    if (!category) {
      updateDraft({ error: '请选择分类' });
      return;
    }

    onConfirm({
      ...source,
      name: normalizedName,
      category,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/32 px-6 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="w-[640px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[9px] border border-white/10 bg-[#1f2023] text-white shadow-[0_24px_64px_rgba(0,0,0,0.48)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-white/12 px-4">
          <div className="flex items-center gap-5 text-[13px] font-semibold">
            <span className="text-white/86">创建素材</span>
            <span className="text-white/42">添加到素材库</span>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/52 transition hover:bg-white/8 hover:text-white/78"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="grid grid-cols-[300px_1fr] gap-4 px-4 py-4">
          <div>
            <div className="mb-2 text-[12px] font-medium text-white/50">封面</div>
            <div className="relative h-[377px] overflow-hidden rounded-[10px] bg-black/28 ring-1 ring-white/10">
              <NextImage
                src={imageUrl}
                alt={name || '素材封面'}
                fill
                unoptimized
                sizes="300px"
                className="object-cover"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <label className="mb-2 text-[12px] font-medium text-white/50" htmlFor="material-name">
              名称 <span className="text-[#ff6b6b]">*</span>
            </label>
            <input
              id="material-name"
              value={name}
              onChange={(event) => {
                updateDraft({
                  name: event.target.value,
                  error: null,
                });
              }}
              className="h-10 rounded-[8px] border border-white/12 bg-black/18 px-3 text-[14px] text-white outline-none transition placeholder:text-white/28 focus:border-white/28"
              placeholder="图片素材"
            />

            <label className="mb-2 mt-5 text-[12px] font-medium text-white/50" htmlFor="material-category">
              分类 <span className="text-[#ff6b6b]">*</span>
            </label>
            <div className="relative">
              <button
                id="material-category"
                type="button"
                aria-expanded={categoryOpen}
                className="flex h-9 w-full items-center justify-between rounded-[8px] border border-white/14 bg-black/18 px-3 text-left text-[13px] text-white/78 outline-none transition hover:border-white/24"
                onClick={() => updateDraft({ categoryOpen: !categoryOpen })}
              >
                <span className={category ? 'text-white/84' : 'text-white/32'}>
                  {category || '请选择'}
                </span>
                <ChevronDown
                  size={14}
                  className={categoryOpen ? 'rotate-180 text-white/46 transition' : 'text-white/46 transition'}
                />
              </button>

              {categoryOpen ? (
                <div className="absolute left-0 right-0 top-[42px] z-10 overflow-hidden rounded-[8px] border border-white/12 bg-[#202124] py-1 shadow-[0_16px_34px_rgba(0,0,0,0.36)]">
                  {MATERIAL_LIBRARY_CATEGORIES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="flex h-10 w-full items-center px-3 text-left text-[13px] text-white/78 transition hover:bg-white/8 hover:text-white"
                      onClick={() => {
                        updateDraft({
                          category: option,
                          categoryOpen: false,
                          error: null,
                        });
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 min-h-5 text-[12px] text-[#ff8b8b]">
              {error ?? (duplicate ? '已存在同名同分类素材，将使用已有素材去重' : '')}
            </div>

            <div className="mt-auto flex justify-end pt-6">
              <button
                type="button"
                disabled={!canCreate}
                className="h-9 rounded-[9px] bg-[#CCFF00] px-4 text-[13px] font-semibold text-[#141510] shadow-[0_10px_24px_rgba(204,255,0,0.22)] transition hover:bg-[#d7ff33] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/32 disabled:shadow-none"
                onClick={handleConfirm}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
