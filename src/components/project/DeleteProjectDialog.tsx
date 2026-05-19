'use client';

import React, { useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteProjectDialogProps {
  open: boolean;
  projectName: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteProjectDialog({
  open,
  projectName,
  loading = false,
  onConfirm,
  onClose,
}: DeleteProjectDialogProps) {
  useEffect(() => {
    if (!open || loading) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose, open]);

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
      <div className="w-full max-w-[560px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="flex items-start gap-4 px-6 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-[#ff7373]/35 bg-[#1f0d0d] text-[#ff7373]">
            <Trash2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[1px] text-white">删除项目</div>
            <div className="mt-2 text-[13px] leading-6 text-[#aaaaaa]">
              确认删除项目
              <span className="mx-1 font-medium text-white">“{projectName}”</span>
              吗？此操作无法撤销。
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#222222] px-6 py-4">
          <button
            type="button"
            disabled={loading}
            className="rounded-sm border border-[#222222] px-6 py-2.5 text-[14px] text-[#aaaaaa] transition-colors hover:border-[#444444] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
