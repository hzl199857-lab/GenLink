'use client';

import React from 'react';

export interface CreateProjectDraft {
  projectName: string;
  parentHandle: FileSystemDirectoryHandle | null;
  parentDirectoryLabel: string;
}

export function getProjectDirectoryLabel(
  handle: FileSystemDirectoryHandle,
): string {
  return handle.name?.trim() || '已选择目录';
}

export function CreateProjectDialog({
  open,
  variant = 'create',
  draft,
  loading,
  onChangeProjectName,
  onPickDirectory,
  onConfirm,
  onClose,
}: {
  open: boolean;
  variant?: 'create' | 'save';
  draft: CreateProjectDraft;
  loading: boolean;
  onChangeProjectName: (value: string) => void;
  onPickDirectory: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const canSubmit = Boolean(draft.projectName.trim() && draft.parentHandle);
  const title = variant === 'save'
    ? '保存项目'
    : '新建项目';
  const confirmLabel = variant === 'save'
    ? '保存'
    : '创建并进入';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/48 px-4">
      <div className="w-full max-w-[560px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="px-6 py-4 text-[16px] font-semibold tracking-[1px] text-white">{title}</div>

        <div className="border-t border-[#222222] px-6 py-6">
          <div className="text-[13px] text-[#aaaaaa]">项目</div>

        <div className="mt-4">
          <div className="mb-2 text-[12px] text-[#888888]">项目名称</div>
          <input
            autoFocus
            value={draft.projectName}
            onChange={(event) => onChangeProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                onConfirm();
              }
            }}
            className="h-10 w-full rounded-sm border border-[#333333] bg-[#050505] px-3.5 text-[13px] text-white outline-none transition-colors placeholder:text-[#555555] focus:border-[#ccff00]"
            placeholder="我的项目"
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[12px] text-[#888888]">项目目录</div>
          <div className="flex items-center gap-4">
            <input
              value={draft.parentDirectoryLabel}
              readOnly
              className="h-10 min-w-0 flex-1 rounded-sm border border-[#333333] bg-[#050505] px-3.5 text-[13px] text-[#aaaaaa] outline-none placeholder:text-[#555555]"
              placeholder="请选择项目目录"
            />
            <button
              type="button"
              className="h-10 shrink-0 rounded-sm border border-transparent px-4 text-[13px] font-medium text-white transition-colors hover:border-[#333333] hover:bg-[#141414]"
              onClick={onPickDirectory}
            >
              浏览
            </button>
          </div>
          <div className="mt-2 text-[11px] leading-5 text-[#888888]">
            先选择父目录，再在其中自动创建与你填写的项目名同名的项目文件夹。
          </div>
        </div>

        </div>

        <div className="border-t border-[#222222] px-6 py-4">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-sm border border-[#222222] px-6 py-2.5 text-[14px] text-[#aaaaaa] transition-colors hover:border-[#444444] hover:text-white"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canSubmit || loading}
              className="rounded-sm border border-transparent bg-[#ccff00] px-6 py-2.5 text-[14px] font-semibold text-[#101500] shadow-[0_0_0_1px_rgba(204,255,0,0.18),0_0_18px_rgba(204,255,0,0.18)] transition-colors hover:bg-[#d8ff33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00] disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-[#777777] disabled:shadow-none"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
