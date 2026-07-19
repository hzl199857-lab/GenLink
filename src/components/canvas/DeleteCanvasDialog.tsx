'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Trash2 } from 'lucide-react';

type DeleteCanvasDialogProps = {
  open: boolean;
  canvasName: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function DeleteCanvasDialog({
  open,
  canvasName,
  loading = false,
  onConfirm,
  onClose,
}: DeleteCanvasDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!loading) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable.at(-1);
        const activeElement = document.activeElement;
        if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [loading, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/48 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[560px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-start gap-4 px-6 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-[#ff7373]/35 bg-[#1f0d0d] text-[#ff7373]">
            <Trash2 size={18} />
          </div>
          <div className="min-w-0">
            <div id={titleId} className="text-[16px] font-semibold tracking-[1px] text-white">
              删除画布
            </div>
            <div id={descriptionId} className="mt-2 text-[13px] leading-6 text-[#aaaaaa]">
              确认删除画布
              <span className="mx-1 font-medium text-white">“{canvasName}”</span>
              吗？该画布内容和 Agent 会话将被移除，项目共享素材和生成文件会保留。此操作无法撤销。
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#222222] px-6 py-4">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={loading}
            className="rounded-sm border border-[#222222] px-6 py-2.5 text-[14px] text-[#aaaaaa] transition-colors hover:border-[#444444] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading}
            className="rounded-sm border border-transparent bg-[#ff7373] px-6 py-2.5 text-[14px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,115,115,0.18),0_0_18px_rgba(255,115,115,0.16)] transition-colors hover:bg-[#ff8585] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff7373] disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-[#777777] disabled:shadow-none"
            onClick={onConfirm}
          >
            {loading ? '删除中...' : '删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
