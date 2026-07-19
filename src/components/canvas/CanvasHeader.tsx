'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import type { ProjectCanvasMetadata } from '@/types/canvas';
import { CanvasSwitcher } from './CanvasSwitcher';
import { EditableProjectName } from './EditableProjectName';
import { ProjectMenu } from './ProjectMenu';

const HEADER_LOGO_SRC = '/project-library-logo.png';

export interface CanvasHeaderProps {
  projectName: string;
  canvases: ProjectCanvasMetadata[];
  activeCanvasId: string | null;
  busy?: boolean;
  writeBlocked?: boolean;
  onProjectNameCommit?: (nextName: string) => void | Promise<void>;
  onBackHome?: () => void;
  onAllProjects?: () => void;
  onCreateProject?: () => void;
  onDeleteProject?: () => void;
  onSelectCanvas?: (canvasId: string) => void | Promise<void>;
  onCreateCanvas?: () => void | Promise<void>;
  onRenameCanvas?: (canvasId: string, name: string) => void | Promise<void>;
  onDuplicateCanvas?: (canvasId: string) => void | Promise<void>;
  onDeleteCanvas?: (canvasId: string) => void | Promise<void>;
  onOpenCanvasInNewWindow?: (canvasId: string) => void | Promise<void>;
}

export function CanvasHeader({
  projectName,
  canvases,
  activeCanvasId,
  busy = false,
  writeBlocked = false,
  onProjectNameCommit,
  onBackHome,
  onAllProjects,
  onCreateProject,
  onDeleteProject,
  onSelectCanvas,
  onCreateCanvas,
  onRenameCanvas,
  onDuplicateCanvas,
  onDeleteCanvas,
  onOpenCanvasInNewWindow,
}: CanvasHeaderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<'project' | 'canvas' | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-canvas-menu-ignore="true"
      className="fixed left-4 top-4 z-[70] flex h-10 max-w-[calc(100vw-32px)] items-center rounded-[10px] border border-white/[0.07] bg-[#242526]/96 p-1 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"
    >
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="打开项目菜单"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'project'}
          className="flex h-8 items-center gap-1 rounded-[8px] px-2 transition hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none"
          onClick={() => setOpenMenu((value) => value === 'project' ? null : 'project')}
        >
          <Image
            src={HEADER_LOGO_SRC}
            alt="GenLink"
            width={1090}
            height={980}
            priority
            className="h-[18px] w-[21px] object-contain"
          />
          <ChevronDown
            size={12}
            className={`text-white/42 transition-transform ${openMenu === 'project' ? 'rotate-180' : ''}`}
          />
        </button>
        {openMenu === 'project' ? (
          <ProjectMenu
            busy={busy}
            writeBlocked={writeBlocked}
            onBackHome={onBackHome}
            onAllProjects={onAllProjects}
            onCreateProject={onCreateProject}
            onDeleteProject={onDeleteProject}
            onAction={() => setOpenMenu(null)}
          />
        ) : null}
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
      <EditableProjectName
        value={projectName}
        busy={busy}
        writeBlocked={writeBlocked}
        onCommit={onProjectNameCommit}
        onEditStart={() => setOpenMenu(null)}
      />
      <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
      <CanvasSwitcher
        canvases={canvases}
        activeCanvasId={activeCanvasId}
        busy={busy}
        writeBlocked={writeBlocked}
        open={openMenu === 'canvas'}
        onOpenChange={(open) => setOpenMenu(open ? 'canvas' : null)}
        onSelectCanvas={onSelectCanvas}
        onCreateCanvas={onCreateCanvas}
        onRenameCanvas={onRenameCanvas}
        onDuplicateCanvas={onDuplicateCanvas}
        onDeleteCanvas={onDeleteCanvas}
        onOpenCanvasInNewWindow={onOpenCanvasInNewWindow}
      />
    </div>
  );
}
