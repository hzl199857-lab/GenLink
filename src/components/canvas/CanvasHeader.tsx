'use client';

import React from 'react';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface CanvasHeaderProps {
  projectName: string;
  loading?: boolean;
  hasError?: boolean;
  onSave?: () => void;
  onNewProject?: () => void;
}

function HeaderIconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] text-white/72 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
      >
        {children}
      </button>
      <Tooltip label={label} side="bottom" />
    </div>
  );
}

export function CanvasHeader({
  projectName,
  loading = false,
  hasError = false,
  onSave,
  onNewProject,
}: CanvasHeaderProps) {
  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[14px] border border-white/10 bg-[#17181b]/92 px-3 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.34)] backdrop-blur-md">
      <HeaderIconButton label="返回项目库" onClick={onNewProject}>
        <ChevronLeft size={17} />
      </HeaderIconButton>

      <div className="min-w-[260px] px-2 py-1 text-[14px] font-medium text-white">
        {projectName || '未命名项目'}
      </div>

      <div className="flex min-w-[72px] items-center justify-center text-[12px] text-white/45">
        {loading ? (
          <span>保存中...</span>
        ) : hasError ? (
          <span className="text-[#ff8f8f]">保存失败</span>
        ) : null}
      </div>

      <div className="h-4 w-px bg-white/10" />

      <HeaderIconButton label="保存" onClick={onSave} disabled={loading}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      </HeaderIconButton>
    </div>
  );
}
