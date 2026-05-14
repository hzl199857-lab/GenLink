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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/64 px-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-[380px] rounded-[16px] border border-white/10 bg-[#17181b] p-5 shadow-[0_24px_56px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#ff7474]/20 bg-[#3a2020] text-[#ff9f9f]">
            <Trash2 size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-white/94">删除项目</div>
            <div className="mt-2 text-[12px] leading-5 text-white/52">
              确认删除项目
              <span className="mx-1 font-medium text-white/86">“{projectName}”</span>
              吗？此操作无法撤销。
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2.5 border-t border-white/8 pt-4">
          <button
            type="button"
            disabled={loading}
            className="h-9 rounded-[10px] px-3.5 text-[12px] text-white/58 transition hover:bg-white/7 hover:text-white/88 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading}
            className="h-9 rounded-[10px] bg-[#f06464] px-3.5 text-[12px] font-medium text-white transition hover:bg-[#ff7373] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
          >
            {loading ? '删除中...' : '删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
