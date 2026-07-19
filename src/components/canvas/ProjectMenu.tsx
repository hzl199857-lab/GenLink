'use client';

import React from 'react';
import { FolderKanban, Home, Plus, Trash2 } from 'lucide-react';

type ProjectMenuProps = {
  busy?: boolean;
  writeBlocked?: boolean;
  onBackHome?: () => void;
  onAllProjects?: () => void;
  onCreateProject?: () => void;
  onDeleteProject?: () => void;
  onAction?: () => void;
};

const itemClass = 'flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-left text-[13px] font-medium text-white/88 transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-white/24 disabled:hover:bg-transparent';

export function ProjectMenu({
  busy = false,
  writeBlocked = false,
  onBackHome,
  onAllProjects,
  onCreateProject,
  onDeleteProject,
  onAction,
}: ProjectMenuProps) {
  const run = (action?: () => void) => () => {
    onAction?.();
    action?.();
  };

  return (
    <div
      role="menu"
      className="absolute left-0 top-[calc(100%+8px)] z-[90] w-[200px] rounded-[12px] border border-white/[0.08] bg-[#252526] p-1.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.48)]"
    >
      <button type="button" role="menuitem" className={itemClass} onClick={run(onBackHome)}>
        <Home size={15} />
        回到主页
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(onAllProjects)}>
        <FolderKanban size={15} />
        全部项目
      </button>
      <div className="my-1 h-px bg-white/[0.07]" />
      <button
        type="button"
        role="menuitem"
        disabled={busy || writeBlocked || !onCreateProject}
        className={itemClass}
        onClick={run(onCreateProject)}
      >
        <Plus size={15} />
        创建新项目
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy || writeBlocked || !onDeleteProject}
        className={itemClass}
        onClick={run(onDeleteProject)}
      >
        <Trash2 size={15} />
        删除项目
      </button>
    </div>
  );
}
