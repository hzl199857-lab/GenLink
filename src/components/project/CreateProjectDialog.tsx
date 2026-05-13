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
  draft,
  loading,
  onChangeProjectName,
  onPickDirectory,
  onConfirm,
  onClose,
}: {
  open: boolean;
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[520px] rounded-[16px] border border-white/10 bg-[#1d1e20] p-6 shadow-[0_24px_56px_rgba(0,0,0,0.46)]">
        <div className="text-[14px] font-semibold text-white/96">新建项目</div>

        <div className="mt-7 text-[12px] font-medium text-white/88">项目</div>

        <div className="mt-4">
          <div className="mb-2 text-[12px] text-white/58">项目名称</div>
          <input
            autoFocus
            value={draft.projectName}
            onChange={(event) => onChangeProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                onConfirm();
              }
            }}
            className="h-10 w-full rounded-[6px] border border-white/12 bg-[#161719] px-3 text-[13px] text-white outline-none transition focus:border-white/24"
            placeholder="my-project"
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[12px] text-white/58">项目目录</div>
          <div className="flex items-center gap-2">
            <input
              value={draft.parentDirectoryLabel}
              readOnly
              className="h-10 min-w-0 flex-1 rounded-[6px] border border-white/12 bg-[#161719] px-3 text-[13px] text-white/72 outline-none"
              placeholder="请选择项目目录"
            />
            <button
              type="button"
              className="h-10 shrink-0 rounded-[6px] bg-white/12 px-4 text-[13px] text-white/88 transition hover:bg-white/16"
              onClick={onPickDirectory}
            >
              浏览
            </button>
          </div>
          <div className="mt-2 text-[11px] leading-5 text-white/28">
            先选择父目录，再在其中自动创建与你填写的项目名同名的项目文件夹。
          </div>
        </div>

        <div className="mt-5 border-t border-white/8 pt-4">
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              className="h-9 rounded-[10px] px-3.5 text-[12px] text-white/56 transition hover:bg-white/7 hover:text-white/88"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canSubmit || loading}
              className="h-9 rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onConfirm}
            >
              创建并进入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
