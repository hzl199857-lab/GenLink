'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import logoImage from '../../../logo.png';

export interface CanvasHeaderProps {
  projectName: string;
  busy?: boolean;
  onProjectNameCommit?: (nextName: string) => void | Promise<void>;
  onBackToLibrary?: () => void;
  onCreateProject?: () => void;
  onDeleteProject?: () => void;
}

export function CanvasHeader({
  projectName,
  busy = false,
  onProjectNameCommit,
  onBackToLibrary,
  onCreateProject,
  onDeleteProject,
}: CanvasHeaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const displayProjectName = projectName.trim() || 'Untitled';

  useEffect(() => {
    if (!editing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitProjectName = () => {
    const nextName = draft.trim();

    setEditing(false);

    if (!nextName) {
      setDraft(displayProjectName);
      return;
    }

    if (nextName === displayProjectName) {
      setDraft(displayProjectName);
      return;
    }

    void onProjectNameCommit?.(nextName);
  };

  const cancelProjectNameEdit = () => {
    setDraft(displayProjectName);
    setEditing(false);
  };

  return (
    <div
      data-canvas-menu-ignore="true"
      className="fixed left-5 top-5 z-50 flex max-w-[min(360px,calc(100vw-40px))] items-center gap-2.5"
    >
      <div className="group/header-menu relative flex shrink-0 items-center">
        <button
          type="button"
          aria-label="Logo"
          className="flex h-9 w-9 items-center justify-center rounded-[9px] transition hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
        >
          <Image
            src={logoImage}
            alt="Logo"
            width={32}
            height={32}
            priority
            className="h-8 w-8 rounded-[8px] object-cover"
          />
        </button>
        <div className="pointer-events-none absolute left-0 top-full z-[80] pt-2 opacity-0 transition duration-150 group-hover/header-menu:pointer-events-auto group-hover/header-menu:opacity-100 group-focus-within/header-menu:pointer-events-auto group-focus-within/header-menu:opacity-100">
          <div className="w-[164px] rounded-[14px] border border-white/10 bg-[#2a2b2e] p-2 text-[12px] text-white shadow-[0_14px_36px_rgba(0,0,0,0.42)]">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-white/84 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none"
              onClick={onBackToLibrary}
            >
              <FolderOpen size={14} />
              回到项目库
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-white/84 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none"
              onClick={onCreateProject}
            >
              <Plus size={14} />
              新建项目
            </button>
            <button
              type="button"
              disabled={busy || !onDeleteProject}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[#ff9f9f] transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              onClick={onDeleteProject}
            >
              <Trash2 size={14} />
              删除项目
            </button>
          </div>
        </div>
      </div>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitProjectName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              cancelProjectNameEdit();
            }
          }}
          className="h-7 min-w-0 max-w-[300px] rounded-[7px] border border-white/16 bg-[#18191c] px-2 text-[15px] font-medium leading-5 text-white outline-none transition focus:border-white/32"
          style={{ width: `${Math.max(draft.length + 2, 10)}ch` }}
        />
      ) : (
        <div className="group/tooltip relative min-w-0">
          <button
            type="button"
            className="block max-w-[300px] truncate rounded-[7px] px-1.5 py-1 text-left text-[15px] font-medium leading-5 text-white transition hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            title={displayProjectName}
            onClick={() => {
              setDraft(displayProjectName);
              setEditing(true);
            }}
          >
            {displayProjectName}
          </button>
          <Tooltip label="点击重命名" side="bottom" />
        </div>
      )}
    </div>
  );
}
