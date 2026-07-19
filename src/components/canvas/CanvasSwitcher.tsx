'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Ellipsis, ExternalLink, Plus, Copy, Pencil, Trash2 } from 'lucide-react';
import { getNextCanvasName } from '@/lib/canvas/multi-canvas';
import type { ProjectCanvasMetadata } from '@/types/canvas';

type CanvasSwitcherProps = {
  canvases: ProjectCanvasMetadata[];
  activeCanvasId: string | null;
  busy?: boolean;
  writeBlocked?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCanvas?: (canvasId: string) => void | Promise<void>;
  onCreateCanvas?: (name: string) => boolean | Promise<boolean>;
  onRenameCanvas?: (canvasId: string, name: string) => void | Promise<void>;
  onDuplicateCanvas?: (canvasId: string) => void | Promise<void>;
  onDeleteCanvas?: (canvasId: string) => void | Promise<void>;
  onOpenCanvasInNewWindow?: (canvasId: string) => void | Promise<void>;
};

const actionClass = 'flex h-9 w-full items-center gap-2.5 rounded-[7px] px-3 text-left text-[12px] font-medium text-white/88 transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-white/22 disabled:hover:bg-transparent';

export function CanvasSwitcher({
  canvases,
  activeCanvasId,
  busy = false,
  writeBlocked = false,
  open,
  onOpenChange,
  onSelectCanvas,
  onCreateCanvas,
  onRenameCanvas,
  onDuplicateCanvas,
  onDeleteCanvas,
  onOpenCanvasInNewWindow,
}: CanvasSwitcherProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const createSubmittingRef = useRef(false);
  const createCancelledRef = useRef(false);
  const canvasItemRefs = useRef(new Map<string, HTMLDivElement>());
  const actionTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const actionMenuRefs = useRef(new Map<string, HTMLDivElement>());
  const [actionCanvasId, setActionCanvasId] = useState<string | null>(null);
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [createDefaultName, setCreateDefaultName] = useState('');
  const [createDraft, setCreateDraft] = useState('');
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];

  useEffect(() => {
    if (renamingCanvasId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renamingCanvasId]);

  useEffect(() => {
    if (!creatingCanvas) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [creatingCanvas]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (creatingCanvas) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = canvasItemRefs.current.get(activeCanvasId ?? '')
        ?? canvasItemRefs.current.values().next().value;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCanvasId, creatingCanvas, open]);

  useEffect(() => {
    if (!actionCanvasId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      actionMenuRefs.current
        .get(actionCanvasId)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionCanvasId]);

  const commitRename = () => {
    const canvasId = renamingCanvasId;
    const nextName = renameDraft.trim();
    setRenamingCanvasId(null);
    if (canvasId && nextName) {
      void onRenameCanvas?.(canvasId, nextName);
    }
  };
  const clearCreateDraft = () => {
    setCreatingCanvas(false);
    setCreateDefaultName('');
    setCreateDraft('');
  };
  const cancelCreate = () => {
    createCancelledRef.current = true;
    createSubmittingRef.current = false;
    clearCreateDraft();
  };
  const commitCreate = useCallback(async () => {
    if (!creatingCanvas || createSubmittingRef.current || createCancelledRef.current) {
      return;
    }

    createSubmittingRef.current = true;
    const name = createDraft.trim() || createDefaultName;
    try {
      const created = await onCreateCanvas?.(name);
      if (created) {
        setCreatingCanvas(false);
        setCreateDefaultName('');
        setCreateDraft('');
        setActionCanvasId(null);
        setRenamingCanvasId(null);
        onOpenChange(false);
        return;
      }

      setCreatingCanvas(true);
      onOpenChange(true);
      window.requestAnimationFrame(() => {
        createInputRef.current?.focus();
        createInputRef.current?.select();
      });
    } finally {
      createSubmittingRef.current = false;
    }
  }, [createDefaultName, createDraft, creatingCanvas, onCreateCanvas, onOpenChange]);
  const startCreate = () => {
    const defaultName = getNextCanvasName(canvases.map((canvas) => canvas.name));
    createCancelledRef.current = false;
    createSubmittingRef.current = false;
    setActionCanvasId(null);
    setRenamingCanvasId(null);
    setCreateDefaultName(defaultName);
    setCreateDraft(defaultName);
    setCreatingCanvas(true);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && creatingCanvas) {
      void commitCreate();
      return;
    }

    setActionCanvasId(null);
    setRenamingCanvasId(null);
    onOpenChange(nextOpen);
  };
  useEffect(() => {
    if (!open && creatingCanvas && !createSubmittingRef.current) {
      void commitCreate();
    }
  }, [commitCreate, creatingCanvas, open]);
  const closeCanvasMenuAndRestoreFocus = () => {
    changeOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const closeActionMenuAndRestoreFocus = (canvasId: string) => {
    setActionCanvasId(null);
    window.requestAnimationFrame(() => {
      actionTriggerRefs.current.get(canvasId)?.focus();
    });
  };
  const handleCanvasMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (actionCanvasId || renamingCanvasId || creatingCanvas) {
      return;
    }
    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const items = canvases
      .map((canvas) => canvasItemRefs.current.get(canvas.id))
      .filter((item): item is HTMLDivElement => Boolean(item) && item?.getAttribute('aria-disabled') !== 'true');
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLDivElement);
    if (event.key === 'Home') {
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      items.at(-1)?.focus();
      return;
    }

    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  const handleActionMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    canvasId: string,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeActionMenuAndRestoreFocus(canvasId);
      return;
    }

    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const items = Array.from(
      actionMenuRefs.current
        .get(canvasId)
        ?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    );
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') {
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      items.at(-1)?.focus();
      return;
    }

    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || !activeCanvas}
        title={activeCanvas?.name}
        className="flex h-8 max-w-[150px] items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-white/90 transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09] focus-visible:outline-none"
        onClick={() => changeOpen(!open)}
      >
        <span className="truncate">{activeCanvas?.name ?? '画布 1'}</span>
        <ChevronDown size={13} className={`shrink-0 text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[90] w-[214px] rounded-[12px] border border-white/[0.08] bg-[#252526] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.48)]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              if (actionCanvasId) {
                closeActionMenuAndRestoreFocus(actionCanvasId);
              } else if (creatingCanvas) {
                cancelCreate();
              } else if (renamingCanvasId) {
                setRenamingCanvasId(null);
              } else {
                closeCanvasMenuAndRestoreFocus();
              }
              return;
            }

            handleCanvasMenuKeyDown(event);
          }}
        >
          <div className="flex h-9 items-center justify-between px-2 text-[12px] font-medium text-white/38">
            <span>画布</span>
            <button
              type="button"
              title="新建画布"
              aria-label="新建画布"
              disabled={busy || writeBlocked || creatingCanvas}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-white/72 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-35"
              onClick={startCreate}
            >
              <Plus size={17} />
            </button>
          </div>

          <div className="space-y-0.5">
            {creatingCanvas ? (
              <div className="flex h-10 w-full items-center rounded-[8px] bg-white/[0.09] px-2.5">
                <input
                  ref={createInputRef}
                  value={createDraft}
                  aria-label="新画布名称"
                  onChange={(event) => setCreateDraft(event.target.value)}
                  onBlur={() => void commitCreate()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelCreate();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-[5px] bg-black/25 px-1.5 py-1 text-[13px] font-medium text-white outline-none ring-1 ring-white/15"
                />
              </div>
            ) : null}
            {canvases.map((canvas) => {
              const current = canvas.id === activeCanvasId;
              const renaming = canvas.id === renamingCanvasId;
              return (
                <div key={canvas.id} className="group/canvas-row relative">
                  <div
                    ref={(element) => {
                      if (element) {
                        canvasItemRefs.current.set(canvas.id, element);
                      } else {
                        canvasItemRefs.current.delete(canvas.id);
                      }
                    }}
                    role="menuitemradio"
                    aria-checked={current}
                    aria-disabled={busy || renaming}
                    tabIndex={busy || renaming ? -1 : 0}
                    title={canvas.name}
                    className="flex h-10 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] font-medium text-white/90 transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09] focus-visible:outline-none"
                    onClick={() => {
                      if (busy || renaming) {
                        return;
                      }
                      if (!current) {
                        void onSelectCanvas?.(canvas.id);
                      }
                      changeOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !busy && !renaming) {
                        event.preventDefault();
                        if (!current) {
                          void onSelectCanvas?.(canvas.id);
                        }
                        closeCanvasMenuAndRestoreFocus();
                      }
                    }}
                  >
                    {renaming ? (
                      <input
                        ref={inputRef}
                        value={renameDraft}
                        aria-label="画布名称"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setRenamingCanvasId(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-[5px] bg-black/25 px-1.5 py-1 text-[13px] text-white outline-none ring-1 ring-white/15"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{canvas.name}</span>
                    )}
                    {!renaming ? (
                      <span className="relative ml-2 h-7 w-7 shrink-0 [&:has(button:focus-visible)>svg]:hidden">
                        <Check size={15} className={`absolute inset-0 m-auto text-white/80 ${current ? 'group-hover/canvas-row:hidden' : 'hidden'}`} />
                        <button
                          ref={(element) => {
                            if (element) {
                              actionTriggerRefs.current.set(canvas.id, element);
                            } else {
                              actionTriggerRefs.current.delete(canvas.id);
                            }
                          }}
                          type="button"
                          aria-label={`${canvas.name} 操作`}
                          disabled={busy || writeBlocked}
                          className={`absolute inset-0 flex h-7 w-7 items-center justify-center rounded-[6px] text-white/62 transition hover:bg-white/[0.1] hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:text-white/22 disabled:hover:bg-transparent ${current ? 'opacity-0 group-hover/canvas-row:opacity-100' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionCanvasId((value) => value === canvas.id ? null : canvas.id);
                          }}
                        >
                          <Ellipsis size={16} />
                        </button>
                      </span>
                    ) : null}
                  </div>

                  {actionCanvasId === canvas.id ? (
                    <div
                      ref={(element) => {
                        if (element) {
                          actionMenuRefs.current.set(canvas.id, element);
                        } else {
                          actionMenuRefs.current.delete(canvas.id);
                        }
                      }}
                      role="menu"
                      aria-label={`${canvas.name} 画布操作`}
                      className="absolute left-[calc(100%+6px)] top-0 z-[100] w-[166px] rounded-[10px] border border-white/[0.08] bg-[#1f1f20] p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.5)]"
                      onKeyDown={(event) => handleActionMenuKeyDown(event, canvas.id)}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy || writeBlocked}
                        className={actionClass}
                        onClick={() => {
                          setActionCanvasId(null);
                          void onOpenCanvasInNewWindow?.(canvas.id);
                        }}
                      >
                        <ExternalLink size={14} />在新窗口打开
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy || writeBlocked}
                        className={actionClass}
                        onClick={() => {
                          setActionCanvasId(null);
                          setRenameDraft(canvas.name);
                          setRenamingCanvasId(canvas.id);
                        }}
                      >
                        <Pencil size={14} />重命名画布
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy || writeBlocked}
                        className={actionClass}
                        onClick={() => {
                          setActionCanvasId(null);
                          void onDuplicateCanvas?.(canvas.id);
                        }}
                      >
                        <Copy size={14} />复制画布
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy || writeBlocked || canvases.length <= 1}
                        className={actionClass}
                        onClick={() => {
                          void onDeleteCanvas?.(canvas.id);
                        }}
                      >
                        <Trash2 size={14} />删除画布
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
