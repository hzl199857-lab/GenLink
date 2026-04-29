'use client';

import React, { useState } from 'react';
import { FilePlus2, Save, FolderOpen, Loader2 } from 'lucide-react';

export interface CanvasHeaderProps {
  projectName: string;
  loading?: boolean;
  hasError?: boolean;
  onProjectNameChange?: (name: string) => void;
  onSave?: () => void;
  onOpenLoadDialog?: () => void;
  onNewProject?: () => void;
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
    <div className="fixed left-1/2 top-4 -translate-x-1/2 z-50 bg-gl-panel/80 backdrop-blur-md border border-gl-stroke-subtle rounded-gl-md shadow-gl-toolbar px-3 py-2 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-transparent border border-transparent focus:border-gl-stroke-soft outline-none rounded px-1 py-0.5 text-[13px] font-medium text-gl-text-primary w-[240px] transition-colors"
          placeholder="Untitled Project"
        />
        {/* Status Indicators */}
        <div className="flex items-center min-w-[60px]">
          {loading && (
            <span className="text-[11px] text-gl-text-tertiary">保存中...</span>
          )}
          {!loading && hasError && (
            <div 
              className="bg-gl-error w-2 h-2 rounded-full"
              title="保存失败"
            />
          )}
        </div>
      </div>

      <div className="bg-gl-stroke-subtle w-px h-4 mx-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewProject}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          title="新建项目"
        >
          <FilePlus2 size={16} />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors disabled:opacity-50"
          title="保存项目"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        </button>
        <button
          type="button"
          onClick={onOpenLoadDialog}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          title="打开项目"
        >
          <FolderOpen size={16} />
        </button>
      </div>
    </div>
  );
}
