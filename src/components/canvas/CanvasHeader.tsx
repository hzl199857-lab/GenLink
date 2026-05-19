'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

const HEADER_LOGO_SRC = '/project-library-logo.png';
const HEADER_WORDMARK_SRC = '/genlink-wordmark.png';

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
      className="fixed left-5 top-5 z-50 flex max-w-[min(460px,calc(100vw-40px))] items-center gap-0.5"
    >
      <div className="group/header-menu relative flex shrink-0 items-center">
        <button
          type="button"
          aria-label="打开项目菜单"
          className="flex h-11 items-center gap-2.5 rounded-[10px] px-2.5 pr-3 transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
        >
          <Image
            src={HEADER_LOGO_SRC}
            alt=""
            width={1090}
            height={980}
            priority
            className="h-[20px] w-[23px] object-contain"
          />
          <Image
            src={HEADER_WORDMARK_SRC}
            alt="GenLink"
            width={2266}
            height={336}
            priority
            className="h-auto w-[74px] object-contain"
          />
        </button>
        <div className="pointer-events-none absolute left-0 top-full z-[80] pt-2 opacity-0 transition duration-150 group-hover/header-menu:pointer-events-auto group-hover/header-menu:opacity-100 group-focus-within/header-menu:pointer-events-auto group-focus-within/header-menu:opacity-100">
          <div className="w-[176px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] p-2 text-[13px] text-white shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#aaaaaa] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
              onClick={onBackToLibrary}
            >
              <FolderOpen size={14} />
              回到项目库
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#aaaaaa] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
              onClick={onCreateProject}
            >
              <Plus size={14} />
              新建项目
            </button>
            <button
              type="button"
              disabled={busy || !onDeleteProject}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#ff8f8f] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#ff8f8f]"
              onClick={onDeleteProject}
            >
              <Trash2 size={14} />
              删除项目
            </button>
          </div>
        </div>
      </div>

      <div className="ml-5 mr-2.5 h-5 w-px shrink-0 bg-white/30" aria-hidden="true" />

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
          className="h-8 min-w-0 max-w-[300px] rounded-[7px] border border-white/16 bg-[#18191c] px-2.5 text-[14px] font-medium leading-6 text-white outline-none transition focus:border-white/32"
          style={{ width: `${Math.max(draft.length + 2, 10)}ch` }}
        />
      ) : (
        <div className="group/tooltip relative min-w-0">
          <button
            type="button"
            className="block max-w-[300px] truncate rounded-[7px] px-2 py-1 text-left text-[14px] font-medium leading-6 text-white transition hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
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
