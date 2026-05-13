'use client';

import React, { useState } from 'react';
import { FilePlus2, Save, FolderOpen, Loader2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface CanvasHeaderProps {
  projectName: string;
  loading?: boolean;
  hasError?: boolean;
  onProjectNameChange?: (name: string) => void;
  onSave?: () => void;
  onOpenLoadDialog?: () => void;
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
        className="flex h-[30px] w-[30px] items-center justify-center rounded-gl-sm text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary disabled:opacity-50"
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
  onProjectNameChange,
  onSave,
  onOpenLoadDialog,
  onNewProject,
}: CanvasHeaderProps) {
  const [localName, setLocalName] = useState(projectName);
  const [lastProjectName, setLastProjectName] = useState(projectName);

  if (projectName !== lastProjectName) {
    setLastProjectName(projectName);
    setLocalName(projectName);
  }

  const handleBlur = () => {
    if (localName.trim() !== projectName && onProjectNameChange) {
      onProjectNameChange(localName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-gl-md border border-gl-stroke-subtle bg-gl-panel/80 px-3 py-2 shadow-gl-toolbar backdrop-blur-md">
      <div className="flex items-center gap-2">
        <input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-[240px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-gl-text-primary outline-none transition-colors focus:border-gl-stroke-soft"
          placeholder="未命名项目"
        />
        <div className="flex min-w-[60px] items-center">
          {loading ? (
            <span className="text-[11px] text-gl-text-tertiary">保存中...</span>
          ) : null}
          {!loading && hasError ? (
            <div className="group/tooltip relative">
              <div className="h-2 w-2 rounded-full bg-gl-error" />
              <Tooltip label="保存失败" side="bottom" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-1 h-4 w-px bg-gl-stroke-subtle" />

      <div className="flex items-center gap-1">
        <HeaderIconButton label="新建项目" onClick={onNewProject}>
          <FilePlus2 size={16} />
        </HeaderIconButton>
        <HeaderIconButton label="保存项目" onClick={onSave} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        </HeaderIconButton>
        <HeaderIconButton label="打开项目" onClick={onOpenLoadDialog}>
          <FolderOpen size={16} />
        </HeaderIconButton>
      </div>
    </div>
  );
}
