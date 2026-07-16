'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { AudioLines, ChevronDown, Folder, FolderPlus, ImageIcon, Video, X } from 'lucide-react';
import type {
  MaterialLibraryCategory,
  MaterialLibraryFolder,
  MaterialLibraryItem,
  PendingMaterialSource,
} from '@/types/canvas';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';
import { getMaterialKind, getMaterialMediaUrl } from '@/lib/material-library';

export const MATERIAL_LIBRARY_CATEGORIES: MaterialLibraryCategory[] = [
  '人物',
  '场景',
  '物品',
  '风格',
  '音效',
  '文本',
  '其他',
];

export type MaterialLibraryDialogMode = 'save' | 'batch' | 'move';

export interface MaterialLibraryDialogProps {
  mode: MaterialLibraryDialogMode;
  source: PendingMaterialSource | null;
  sources: PendingMaterialSource[];
  movingMaterial: MaterialLibraryItem | null;
  existingMaterials: MaterialLibraryItem[];
  folders: MaterialLibraryFolder[];
  onClose: () => void;
  onCreateFolder: (folder: Omit<MaterialLibraryFolder, 'id' | 'createdAt'>) => MaterialLibraryFolder;
  onConfirmSave: (item: Omit<MaterialLibraryItem, 'id' | 'createdAt'>) => void;
  onConfirmBatchSave: (
    sources: PendingMaterialSource[],
    target: { category: MaterialLibraryCategory; folderId?: string },
  ) => void;
  onConfirmMove: (
    itemId: string,
    target: { category: MaterialLibraryCategory; folderId?: string },
  ) => void;
}

type Draft = {
  sourceId: string | null;
  name: string;
  category: MaterialLibraryCategory;
  folderId?: string;
  expanded: Set<MaterialLibraryCategory>;
  error: string | null;
  creatingFolder: boolean;
  folderName: string;
};

function sourceKey(
  mode: MaterialLibraryDialogMode,
  source: PendingMaterialSource | null,
  sources: PendingMaterialSource[],
  movingMaterial: MaterialLibraryItem | null,
): string | null {
  if (mode === 'batch' && sources.length > 0) {
    return ['batch', ...sources.map((item) => item.mediaUrl || item.imageUrl)].join('|');
  }

  if (source) {
    return [
      'save',
      source.defaultName,
      source.imageUrl,
      source.hostedImageUrl ?? '',
      source.outputFileName ?? '',
    ].join('|');
  }

  if (movingMaterial) {
    return ['move', movingMaterial.id, movingMaterial.category, movingMaterial.folderId ?? ''].join('|');
  }

  return null;
}

export function MaterialLibraryDialog({
  mode,
  source,
  sources,
  movingMaterial,
  existingMaterials,
  folders,
  onClose,
  onCreateFolder,
  onConfirmSave,
  onConfirmBatchSave,
  onConfirmMove,
}: MaterialLibraryDialogProps) {
  const active = mode === 'batch' ? sources.length > 0 : mode === 'save' ? source !== null : movingMaterial !== null;
  const key = sourceKey(mode, source, sources, movingMaterial);
  const [draft, setDraft] = useState<Draft>({
    sourceId: null,
    name: '',
    category: '人物',
    folderId: undefined,
    expanded: new Set(['人物']),
    error: null,
    creatingFolder: false,
    folderName: '',
  });
  const folderNameInputRef = useRef<HTMLInputElement>(null);
  const folderCommitLockRef = useRef(false);

  const currentDraft = useMemo<Draft>(() => {
    if (draft.sourceId === key) {
      return draft;
    }

    const category = movingMaterial?.category ?? '人物';
    return {
      sourceId: key,
      name: source?.defaultName.trim() || movingMaterial?.name.trim() || '图片素材',
      category,
      folderId: movingMaterial?.folderId,
      expanded: new Set([category]),
      error: null,
      creatingFolder: false,
      folderName: '',
    };
  }, [draft, key, movingMaterial, source]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onClose]);

  useEffect(() => {
    if (!active || !currentDraft.creatingFolder) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      folderNameInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active, currentDraft.creatingFolder]);

  if (!active) {
    return null;
  }

  const sourceKind = source ? getMaterialKind(source) : 'image';
  const sourceUrl = source ? getMaterialMediaUrl(source) : '';
  const selectedFolder = currentDraft.folderId
    ? folders.find((folder) => folder.id === currentDraft.folderId)
    : undefined;
  const selectedFolderId =
    selectedFolder && selectedFolder.category === currentDraft.category ? selectedFolder.id : undefined;
  const batchCounts = sources.reduce(
    (counts, item) => {
      const kind = item.kind === 'video' || item.kind === 'audio' ? item.kind : 'image';
      counts[kind] += 1;
      return counts;
    },
    { image: 0, video: 0, audio: 0 },
  );

  const updateDraft = (partial: Partial<Draft>) => {
    setDraft((current) => ({
      ...(current.sourceId === key ? current : currentDraft),
      ...partial,
    }));
  };

  const selectTarget = (category: MaterialLibraryCategory, folderId?: string) => {
    updateDraft({
      category,
      folderId,
      error: null,
    });
  };

  const toggleCategory = (category: MaterialLibraryCategory) => {
    updateDraft({
      category,
      folderId: undefined,
      error: null,
      expanded: (() => {
        const next = new Set(currentDraft.expanded);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        return next;
      })(),
    });
  };

  const duplicate = existingMaterials.some(
    (item) =>
      item.id !== movingMaterial?.id &&
      item.name.trim() === currentDraft.name.trim() &&
      item.category === currentDraft.category &&
      (item.folderId ?? null) === (selectedFolderId ?? null),
  );

  const renderExistingMaterialRow = (item: MaterialLibraryItem) => {
    const itemKind = getMaterialKind(item);

    return (
      <div
        key={item.id}
        className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-white/68"
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-black/30 ring-1 ring-[#333438]">
          {itemKind === 'image' ? (
            <NextImage
              src={getBrowserImageDisplayUrl(getMaterialMediaUrl(item))}
              alt={item.name}
              fill
              unoptimized
              loading="lazy"
              sizes="24px"
              className="object-cover"
            />
          ) : itemKind === 'video' ? (
            <Video size={14} className="text-white/66" />
          ) : (
            <AudioLines size={14} className="text-white/66" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/82">
          {item.name}
        </span>
      </div>
    );
  };

  const handleCreateFolder = (showError = false) => {
    if (folderCommitLockRef.current) {
      return;
    }

    folderCommitLockRef.current = true;
    const name = currentDraft.folderName.trim();
    if (!name) {
      updateDraft({
        creatingFolder: false,
        folderName: '',
        error: showError ? '请输入文件夹名称' : null,
      });
      return;
    }

    const folder = onCreateFolder({
      name,
      category: currentDraft.category,
    });

    updateDraft({
      creatingFolder: false,
      folderName: '',
      category: folder.category,
      folderId: folder.id,
      expanded: new Set([...currentDraft.expanded, folder.category]),
      error: null,
    });
  };

  const handleConfirm = () => {
    if (mode === 'move') {
      if (!movingMaterial) {
        return;
      }
      onConfirmMove(movingMaterial.id, {
        category: currentDraft.category,
        folderId: selectedFolderId,
      });
      return;
    }

    if (mode === 'batch') {
      onConfirmBatchSave(sources, {
        category: currentDraft.category,
        folderId: selectedFolderId,
      });
      return;
    }

    if (!source) {
      return;
    }

    const name = currentDraft.name.trim();
    if (!name) {
      updateDraft({ error: '请输入素材名称' });
      return;
    }

    onConfirmSave({
      ...source,
      name,
      category: currentDraft.category,
      folderId: selectedFolderId,
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-6 backdrop-blur-[2px]">
      <div className="w-[430px] overflow-hidden rounded-[16px] border border-[#2f3033] bg-[#111214]/[0.995] text-white shadow-[0_28px_70px_rgba(0,0,0,0.55)] backdrop-blur-[2px]">
        <div className="flex h-[54px] items-center justify-between px-4">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-white/94">
            <Folder size={17} strokeWidth={0} fill="rgba(136,136,140,0.72)" className="text-[#8a8a8e]" />
            {mode === 'move' ? '移动到文件夹' : '保存到素材库'}
          </div>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#2b2b2d] px-3 text-[13px] font-semibold text-white/90 transition hover:bg-[#343438]"
            onClick={() => {
              folderCommitLockRef.current = false;
              updateDraft({
                creatingFolder: true,
                folderName: '',
                error: null,
              });
            }}
          >
            <FolderPlus size={14} />
            新建文件夹
          </button>
        </div>

        <div className="px-4 pb-4">
          {mode === 'save' ? (
            <div className="mb-3 grid grid-cols-[72px_1fr] gap-3">
              <div className="relative h-[72px] overflow-hidden rounded-[8px] bg-black/30 ring-1 ring-[#333438]">
                {sourceKind === 'image' && sourceUrl ? (
                  <NextImage
                    src={getBrowserImageDisplayUrl(sourceUrl)}
                    alt={currentDraft.name || '素材预览'}
                    fill
                    unoptimized
                    sizes="72px"
                    className="object-cover"
                  />
                ) : sourceKind === 'video' && sourceUrl ? (
                  <video
                    src={sourceUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : sourceKind === 'audio' ? (
                  <AudioLines className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/46" />
                ) : (
                  <ImageIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/36" />
                )}
              </div>
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-white/48">
                素材名称
                <input
                  value={currentDraft.name}
                  className="h-9 rounded-[11px] border border-[#2f3033] bg-black/18 px-3 text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#3a3a3c]"
                  placeholder="图片素材"
                  onChange={(event) => updateDraft({ name: event.target.value, error: null })}
                />
              </label>
            </div>
          ) : mode === 'batch' ? (
            <div className="mb-3 flex items-center justify-between rounded-[8px] border border-[#2f3033] bg-black/18 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-white/82">
                已选择 {sources.length} 个素材
              </span>
              <div className="flex items-center gap-3 text-[12px] font-semibold text-white/58">
                {batchCounts.image > 0 ? (
                  <span className="flex items-center gap-1"><ImageIcon size={14} />{batchCounts.image}</span>
                ) : null}
                {batchCounts.video > 0 ? (
                  <span className="flex items-center gap-1"><Video size={14} />{batchCounts.video}</span>
                ) : null}
                {batchCounts.audio > 0 ? (
                  <span className="flex items-center gap-1"><AudioLines size={14} />{batchCounts.audio}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentDraft.creatingFolder ? (
            <input
              ref={folderNameInputRef}
              value={currentDraft.folderName}
              className="mb-3 h-9 w-full rounded-[11px] border border-[#2f3033] bg-black/18 px-3 text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#3a3a3c]"
              placeholder="文件夹名称"
              onBlur={() => handleCreateFolder()}
              onChange={(event) => updateDraft({ folderName: event.target.value, error: null })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCreateFolder(true);
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  updateDraft({ creatingFolder: false, folderName: '', error: null });
                }
              }}
            />
          ) : null}

          <div className="max-h-[286px] overflow-y-auto py-1">
            {MATERIAL_LIBRARY_CATEGORIES.map((category) => {
              const categoryMaterials = existingMaterials.filter((item) => item.category === category);
              const rootMaterials = categoryMaterials.filter((item) => !item.folderId);
              const categoryFolders = folders.filter((folder) => folder.category === category);
              const categorySelected = currentDraft.category === category && !selectedFolderId;
              const isExpanded = currentDraft.expanded.has(category);

              return (
                <div key={category} className="mb-1">
                  <button
                    type="button"
                    className={[
                      'flex h-10 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[14px] font-semibold transition',
                      categorySelected
                        ? 'bg-white/10 text-white'
                        : 'text-white/78 hover:bg-white/10 hover:text-white',
                    ].join(' ')}
                    onClick={() => toggleCategory(category)}
                  >
                    <ChevronDown
                      size={15}
                      className={isExpanded ? 'text-white/68' : '-rotate-90 text-white/44'}
                    />
                    <Folder size={22} strokeWidth={0} fill="rgba(136,136,140,0.72)" className="text-[#8a8a8e]" />
                    <span>{category}</span>
                  </button>

                  {isExpanded ? (
                    <div className="ml-[17px] border-l border-[#2a2b2e] pl-5">
                      {rootMaterials.map(renderExistingMaterialRow)}
                      {categoryFolders.map((folder) => {
                        const selected = selectedFolderId === folder.id;
                        const childMaterials = categoryMaterials.filter((item) => item.folderId === folder.id);

                        return (
                          <div key={folder.id} className="mb-1">
                            <button
                              type="button"
                              className={[
                                'flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-semibold transition',
                                selected
                                  ? 'bg-white/10 text-white'
                                  : 'text-white/70 hover:bg-white/10 hover:text-white',
                              ].join(' ')}
                              onClick={() => selectTarget(category, folder.id)}
                            >
                              <Folder size={19} strokeWidth={0} fill="rgba(136,136,140,0.68)" className="text-[#8a8a8e]" />
                              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                            </button>
                            {childMaterials.length > 0 ? (
                              <div className="ml-5 border-l border-[#2a2b2e] pl-3">
                                {childMaterials.map(renderExistingMaterialRow)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-2 min-h-5 text-[12px] text-[#ff8b8b]">
            {currentDraft.error ?? (duplicate ? '该位置已存在同名素材，保存后会复用已有素材' : '')}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-[9px] bg-[#2b2b2d] px-4 text-[13px] font-semibold text-white/78 transition hover:bg-[#343438] hover:text-white"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="h-9 rounded-[9px] bg-[#f2f2f0] px-4 text-[13px] font-semibold text-[#161616] shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-white"
              onClick={handleConfirm}
            >
              {mode === 'move' ? '移动' : '保存'}
            </button>
          </div>
        </div>
      </div>

      <button type="button" aria-label="关闭" className="fixed inset-0 -z-10 cursor-default" onClick={onClose} />
      <button
        type="button"
        aria-label="关闭"
        className="fixed right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full text-white/52 transition hover:bg-white/10 hover:text-white"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </div>
  );
}
