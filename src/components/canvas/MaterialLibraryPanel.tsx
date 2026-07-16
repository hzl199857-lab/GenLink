'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  Copy,
  Folder,
  FolderPlus,
  ImageIcon,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type {
  MaterialLibraryCategory,
  MaterialLibraryFolder,
  MaterialLibraryItem,
} from '@/types/canvas';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';
import { getMaterialKind, getMaterialMediaUrl } from '@/lib/material-library';
import { MATERIAL_LIBRARY_CATEGORIES } from './MaterialLibraryDialog';

type MaterialMenuState = {
  item: MaterialLibraryItem;
  x: number;
  y: number;
} | null;

type FolderMenuState = {
  folder: MaterialLibraryFolder;
  x: number;
  y: number;
} | null;

type HoverPreview = {
  item: MaterialLibraryItem;
  top: number;
} | null;

const DEFAULT_PANEL_BOTTOM = 18;
const MINIMAP_PANEL_GAP = 12;
const MATERIAL_LIBRARY_PREVIEW_HIDE_DELAY_MS = 220;

export interface MaterialLibraryPanelProps {
  open: boolean;
  anchor?: { x: number; y: number } | null;
  materials: MaterialLibraryItem[];
  folders: MaterialLibraryFolder[];
  onClose: () => void;
  onSelectMaterial: (item: MaterialLibraryItem, screenPosition?: { x: number; y: number }) => void;
  onUploadMaterial: () => void;
  onCreateFolder: (folder: Omit<MaterialLibraryFolder, 'id' | 'createdAt'>) => MaterialLibraryFolder;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameMaterial: (id: string, name: string) => void;
  onMoveMaterial: (item: MaterialLibraryItem) => void;
  onDuplicateMaterial: (id: string) => void;
  onDeleteMaterial: (id: string) => void;
  onAiRoleClick: () => void;
}

function getFolderNamePrompt(defaultName = ''): string | null {
  const name = window.prompt('文件夹名称', defaultName);
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

function getMaterialNamePrompt(defaultName: string): string | null {
  const name = window.prompt('素材名称', defaultName);
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

function getMaterialLibraryBottomOffset(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_PANEL_BOTTOM;
  }

  const candidates = [
    document.querySelector('.canvas-minimap-frame'),
    document.querySelector('.canvas-zoom-panel'),
  ].filter((element): element is HTMLElement => element instanceof HTMLElement);

  const visibleRects = candidates
    .map((element) => element.getBoundingClientRect())
    .filter(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight,
    );

  if (visibleRects.length === 0) {
    return DEFAULT_PANEL_BOTTOM;
  }

  const topMostControlTop = Math.min(...visibleRects.map((rect) => rect.top));
  return Math.max(DEFAULT_PANEL_BOTTOM, window.innerHeight - topMostControlTop + MINIMAP_PANEL_GAP);
}

export function MaterialLibraryPanel({
  open,
  materials,
  folders,
  onClose,
  onSelectMaterial,
  onUploadMaterial,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameMaterial,
  onMoveMaterial,
  onDuplicateMaterial,
  onDeleteMaterial,
  onAiRoleClick,
}: MaterialLibraryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [query, setQuery] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MaterialLibraryCategory>('人物');
  const [expanded, setExpanded] = useState<Set<MaterialLibraryCategory>>(
    () => new Set(['人物', '场景', '物品', '风格']),
  );
  const [hoverPreview, setHoverPreview] = useState<HoverPreview>(null);
  const [materialMenu, setMaterialMenu] = useState<MaterialMenuState>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenuState>(null);
  const [bottomOffset, setBottomOffset] = useState(DEFAULT_PANEL_BOTTOM);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const hidePreviewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hidePreviewTimerRef.current !== null) {
        window.clearTimeout(hidePreviewTimerRef.current);
        hidePreviewTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    let frameId: number | null = null;

    const updateBottomOffset = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setBottomOffset(getMaterialLibraryBottomOffset());
      });
    };

    updateBottomOffset();

    const observer = new MutationObserver(updateBottomOffset);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    window.addEventListener('resize', updateBottomOffset);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener('resize', updateBottomOffset);
    };
  }, [open]);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    const video = videoPreviewRef.current;

    if (audio) {
      void audio.play().then(
        () => setAudioBlocked(false),
        () => setAudioBlocked(true),
      );
    }

    return () => {
      if (audio) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // Some streaming sources do not expose a seekable range yet.
        }
      }

      if (video) {
        video.pause();
        try {
          video.currentTime = 0;
        } catch {
          // Some streaming sources do not expose a seekable range yet.
        }
      }
    };
  }, [hoverPreview]);

  const normalizedQuery = query.trim().toLowerCase();
  const materialsByCategory = useMemo(() => {
    const map = new Map<MaterialLibraryCategory, MaterialLibraryItem[]>();
    for (const category of MATERIAL_LIBRARY_CATEGORIES) {
      map.set(category, []);
    }

    for (const item of materials) {
      if (normalizedQuery && !item.name.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      map.get(item.category)?.push(item);
    }

    return map;
  }, [materials, normalizedQuery]);

  const foldersByCategory = useMemo(() => {
    const map = new Map<MaterialLibraryCategory, MaterialLibraryFolder[]>();
    for (const category of MATERIAL_LIBRARY_CATEGORIES) {
      map.set(category, []);
    }
    for (const folder of folders) {
      map.get(folder.category)?.push(folder);
    }
    return map;
  }, [folders]);

  const cancelHidePreview = () => {
    if (hidePreviewTimerRef.current === null) {
      return;
    }
    window.clearTimeout(hidePreviewTimerRef.current);
    hidePreviewTimerRef.current = null;
  };

  const scheduleHidePreview = (event?: React.MouseEvent<HTMLElement>) => {
    const nextTarget = event?.relatedTarget;
    if (nextTarget instanceof Node && previewRef.current?.contains(nextTarget)) {
      return;
    }

    cancelHidePreview();
    hidePreviewTimerRef.current = window.setTimeout(() => {
      hidePreviewTimerRef.current = null;
      setAudioBlocked(false);
      setHoverPreview(null);
    }, MATERIAL_LIBRARY_PREVIEW_HIDE_DELAY_MS);
  };

  if (!open) {
    return null;
  }

  const toggleCategory = (category: MaterialLibraryCategory) => {
    setActiveCategory(category);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const createFolderInActiveCategory = () => {
    const name = getFolderNamePrompt();
    if (!name) {
      return;
    }
    const folder = onCreateFolder({ name, category: activeCategory });
    setExpanded((current) => new Set([...current, folder.category]));
    setActiveCategory(folder.category);
  };

  const showPreview = (item: MaterialLibraryItem, element: HTMLElement) => {
    cancelHidePreview();
    const rect = element.getBoundingClientRect();
    const top = Math.min(Math.max(90, rect.top - 48), window.innerHeight - 330);
    setAudioBlocked(false);
    setHoverPreview({ item, top });
  };

  const hidePreview = () => {
    cancelHidePreview();
    setAudioBlocked(false);
    setHoverPreview(null);
  };

  const renderMaterialRow = (item: MaterialLibraryItem) => {
    const materialKind = getMaterialKind(item);

    return (
      <div
        key={item.id}
        className="group/material relative flex h-9 items-center gap-2 rounded-[8px] px-2 text-white/68 transition hover:bg-white/10 hover:text-white"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-genlink-material-id', item.id);
          event.dataTransfer.setData('text/plain', item.name);
        }}
        onMouseEnter={(event) => showPreview(item, event.currentTarget)}
        onMouseLeave={scheduleHidePreview}
        onClick={() => {
          setAudioBlocked(false);
          setHoverPreview((current) => current ?? { item, top: 160 });
        }}
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-black/30 ring-1 ring-[#333438]">
          {materialKind === 'image' ? (
            <NextImage
              src={getBrowserImageDisplayUrl(getMaterialMediaUrl(item))}
              alt={item.name}
              fill
              unoptimized
              loading="lazy"
              sizes="24px"
              className="object-cover"
            />
          ) : materialKind === 'video' ? (
            <Video size={14} className="text-white/66" />
          ) : (
            <AudioLines size={14} className="text-white/66" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{item.name}</span>
        <button
          type="button"
          aria-label="素材操作"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-white/42 opacity-0 transition hover:bg-white/12 hover:text-white group-hover/material:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setMaterialMenu({ item, x: rect.right + 6, y: rect.top });
            setFolderMenu(null);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    );
  };

  const previewKind = hoverPreview ? getMaterialKind(hoverPreview.item) : 'image';
  const previewUrl = hoverPreview ? getMaterialMediaUrl(hoverPreview.item) : '';

  return (
    <>
      <div
        ref={panelRef}
        className="fixed left-[70px] top-[70px] z-[70] flex w-[336px] flex-col overflow-visible rounded-[16px] border border-[#2f3033] bg-[#111214]/[0.995] text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-[2px]"
        style={{ bottom: bottomOffset }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-[54px] shrink-0 items-center gap-2 px-4">
          <button
            type="button"
            aria-label="返回"
            className="-ml-1 flex h-8 w-8 items-center justify-center rounded-[8px] text-white/58 transition hover:bg-white/8 hover:text-white"
            onClick={onClose}
          >
            <ChevronLeft size={18} strokeWidth={2.1} />
          </button>
          <div className="mr-auto text-[20px] font-semibold text-white/94">素材库</div>
          <button
            type="button"
            className="flex h-8 items-center rounded-[8px] bg-[#2b2b2d] px-3 text-[13px] font-semibold text-white/90 transition hover:bg-[#343438]"
            onClick={onAiRoleClick}
          >
            AI 角色
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="新增"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#2b2b2d] text-white/92 transition hover:bg-[#343438]"
              onClick={() => setPlusOpen((value) => !value)}
            >
              <Plus size={18} strokeWidth={2.1} />
            </button>
            {plusOpen ? (
              <div className="absolute right-0 top-10 z-20 w-[198px] overflow-hidden rounded-[12px] border border-[#3a3a3c] bg-[#303030] p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.48)]">
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
                  onClick={() => {
                    setPlusOpen(false);
                    onUploadMaterial();
                  }}
                >
                  <Upload size={16} />
                  上传
                </button>
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
                  onClick={() => {
                    setPlusOpen(false);
                    createFolderInActiveCategory();
                  }}
                >
                  <FolderPlus size={16} />
                  新建文件夹
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="flex h-9 items-center gap-2 rounded-[11px] border border-[#2f3033] bg-black/18 px-3 text-white/42">
            <Search size={16} />
            <input
              value={query}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/34"
              placeholder="搜索"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#2a2a2c] px-5 text-[13px] font-semibold text-white/58">
          <Star size={16} fill="rgba(255,255,255,0.72)" />
          收藏
        </div>

        <div className="mt-3 px-5 text-[12px] font-semibold text-white/38">文件夹</div>

        <div className="generation-history-scrollable mt-2 flex-1 overflow-y-auto px-4 pb-5">
          {MATERIAL_LIBRARY_CATEGORIES.map((category) => {
            const categoryMaterials = materialsByCategory.get(category) ?? [];
            const rootMaterials = categoryMaterials.filter((item) => !item.folderId);
            const categoryFolders = foldersByCategory.get(category) ?? [];
            const isExpanded = expanded.has(category);

            return (
              <div key={category} className="mb-1">
                <button
                  type="button"
                  className="group/category flex h-10 w-full items-center gap-2 rounded-[8px] px-2 text-left transition hover:bg-white/10"
                  onClick={() => toggleCategory(category)}
                >
                  <ChevronDown
                    size={15}
                    className={isExpanded ? 'text-white/68' : '-rotate-90 text-white/44 group-hover/category:text-white/68'}
                  />
                  <Folder size={23} strokeWidth={0} fill="rgba(136,136,140,0.72)" className="text-[#8a8a8e] group-hover/category:text-[#a2a2a6]" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white/78 group-hover/category:text-white">
                    {category}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="ml-[17px] border-l border-[#2a2b2e] pl-5">
                    {rootMaterials.map(renderMaterialRow)}
                    {categoryFolders.map((folder) => {
                      const childMaterials = categoryMaterials.filter((item) => item.folderId === folder.id);
                      return (
                        <div key={folder.id} className="mb-1">
                          <div className="group/folder flex h-9 items-center gap-2 rounded-[8px] px-2 text-white/70 transition hover:bg-white/10 hover:text-white">
                            <Folder size={19} strokeWidth={0} fill="rgba(136,136,140,0.68)" className="text-[#8a8a8e] group-hover/folder:text-[#a2a2a6]" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                              {folder.name}
                            </span>
                            <button
                              type="button"
                              aria-label="文件夹操作"
                              className="flex h-6 w-6 items-center justify-center rounded-[6px] text-white/42 opacity-0 transition hover:bg-white/12 hover:text-white group-hover/folder:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation();
                                const rect = event.currentTarget.getBoundingClientRect();
                                setFolderMenu({ folder, x: rect.right + 6, y: rect.top });
                                setMaterialMenu(null);
                              }}
                            >
                              <MoreHorizontal size={15} />
                            </button>
                          </div>
                          <div className="ml-5 border-l border-[#2a2b2e] pl-3">
                            {childMaterials.map(renderMaterialRow)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {hoverPreview ? (
        <div
          ref={previewRef}
          className="fixed left-[418px] z-[75] w-[280px] overflow-hidden rounded-[14px] border border-[#3a3a3c] bg-[#111214]/[0.995] text-white shadow-[0_22px_56px_rgba(0,0,0,0.52)] backdrop-blur-[2px]"
          style={{ top: hoverPreview.top }}
          onMouseEnter={cancelHidePreview}
          onMouseLeave={scheduleHidePreview}
        >
          <div className="relative h-[190px] bg-black/30">
            {previewKind === 'image' ? (
              <NextImage
                src={getBrowserImageDisplayUrl(previewUrl)}
                alt={hoverPreview.item.name}
                fill
                unoptimized
                sizes="280px"
                className="object-contain"
              />
            ) : previewKind === 'video' ? (
              <video
                ref={videoPreviewRef}
                src={previewUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <AudioLines size={52} className="text-white/38" />
                <audio ref={audioPreviewRef} src={previewUrl} preload="auto" />
                {audioBlocked ? (
                  <button
                    type="button"
                    aria-label="播放音频预览"
                    className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-white/16 text-white transition hover:bg-white/24"
                    onClick={() => {
                      const audio = audioPreviewRef.current;
                      if (!audio) {
                        return;
                      }
                      void audio.play().then(
                        () => setAudioBlocked(false),
                        () => setAudioBlocked(true),
                      );
                    }}
                  >
                    <Play size={19} fill="currentColor" />
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <div className="border-t border-[#2f3033] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white/90">{hoverPreview.item.name}</div>
                <div className="mt-1 text-[12px] text-white/42">
                  创建于 {new Date(hoverPreview.item.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
              {previewKind === 'image' ? (
                <ImageIcon size={16} className="mt-0.5 text-white/42" />
              ) : previewKind === 'video' ? (
                <Video size={16} className="mt-0.5 text-white/42" />
              ) : (
                <AudioLines size={16} className="mt-0.5 text-white/42" />
              )}
            </div>
            <button
              type="button"
              className="mt-3 h-10 w-full rounded-[9px] bg-white/30 text-[13px] font-semibold text-white transition hover:bg-white/40"
              onClick={() => {
                onSelectMaterial(hoverPreview.item, {
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                });
                hidePreview();
              }}
            >
              应用到画布
            </button>
          </div>
        </div>
      ) : null}

      {materialMenu ? (
        <div
          className="fixed z-[80] w-[240px] overflow-hidden rounded-[14px] border border-[#3a3a3c] bg-[#303030] py-2 text-white shadow-[0_22px_52px_rgba(0,0,0,0.5)]"
          style={{ left: materialMenu.x, top: materialMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
            onClick={() => {
              const name = getMaterialNamePrompt(materialMenu.item.name);
              if (name) {
                onRenameMaterial(materialMenu.item.id, name);
              }
              setMaterialMenu(null);
            }}
          >
            <Pencil size={15} />
            重命名
          </button>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
            onClick={() => {
              onMoveMaterial(materialMenu.item);
              setMaterialMenu(null);
            }}
          >
            <MoveRight size={15} />
            移动到...
          </button>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
            onClick={() => {
              onDuplicateMaterial(materialMenu.item.id);
              setMaterialMenu(null);
            }}
          >
            <Copy size={15} />
            创建副本
          </button>
          <div className="my-1 h-px bg-[#3a3a3c]" />
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-[#ff5f68] transition hover:bg-[#ff5f68]/10"
            onClick={() => {
              onDeleteMaterial(materialMenu.item.id);
              setMaterialMenu(null);
            }}
          >
            <Trash2 size={15} />
            删除
          </button>
        </div>
      ) : null}

      {folderMenu ? (
        <div
          className="fixed z-[80] w-[210px] overflow-hidden rounded-[14px] border border-[#3a3a3c] bg-[#303030] py-2 text-white shadow-[0_22px_52px_rgba(0,0,0,0.5)]"
          style={{ left: folderMenu.x, top: folderMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-white/86 transition hover:bg-white/10"
            onClick={() => {
              const name = getFolderNamePrompt(folderMenu.folder.name);
              if (name) {
                onRenameFolder(folderMenu.folder.id, name);
              }
              setFolderMenu(null);
            }}
          >
            <Pencil size={15} />
            重命名
          </button>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-semibold text-[#ff5f68] transition hover:bg-[#ff5f68]/10"
            onClick={() => {
              onDeleteFolder(folderMenu.folder.id);
              setFolderMenu(null);
            }}
          >
            <Trash2 size={15} />
            删除
          </button>
        </div>
      ) : null}
    </>
  );
}
