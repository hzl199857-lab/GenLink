'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Copy,
  Ellipsis,
  FolderOpen,
  FolderPlus,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import {
  createProjectAtParentDirectory,
  importProjectsFromParentDirectory,
  pickProjectParentDirectory,
  revokeObjectUrls,
  type ProjectHandleRecord,
} from '@/lib/project-storage';
import { useCanvasStore } from '@/store/canvas-store';
import {
  getProjectDirectoryLabel,
  type CreateProjectDraft,
} from './CreateProjectDialog';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import {
  projectLibraryCardClassName,
  projectLibraryCardSurfaceStyle,
  projectLibraryCardStyle,
  projectLibraryThumbnailStyle,
} from '@/lib/project-library-layout';

interface ProjectLibraryProps {
  onOpenProject: () => void;
  onBackToHero?: () => void;
  onProjectsReady?: (projectCount: number) => void;
  restoreProjectId?: string;
  onRestoreProjectOpened?: () => void;
  onRestoreProjectMissing?: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function ProjectMenu({
  open,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  open: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute right-0 top-8 z-20 w-[164px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] p-2 text-[13px] text-white shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#aaaaaa] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
        onClick={onOpen}
      >
        <FolderOpen size={13} />
        打开
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#aaaaaa] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
        onClick={onRename}
      >
        <Pencil size={13} />
        重命名
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#aaaaaa] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
        onClick={onDuplicate}
      >
        <Copy size={13} />
        创建副本
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-[#ff8f8f] transition-colors hover:bg-[#ccff00] hover:text-[#101500] focus-visible:bg-[#ccff00] focus-visible:text-[#101500] focus-visible:outline-none"
        onClick={onDelete}
      >
        <Trash2 size={13} />
        删除项目
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  menuOpen,
  onCardClick,
  onOpenMenu,
  onScheduleCloseMenu,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectHandleRecord;
  menuOpen: boolean;
  onCardClick: () => void;
  onOpenMenu: () => void;
  onScheduleCloseMenu: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const thumbnailUrl = project.thumbnailUrl?.trim();

  return (
    <article
      className={`relative ${menuOpen ? 'z-40' : 'z-0'} ${projectLibraryCardClassName}`}
      style={{
        ...projectLibraryCardStyle,
        ...projectLibraryCardSurfaceStyle,
      }}
    >
      <button type="button" onClick={onCardClick} className="block w-full text-left">
        <div className="relative overflow-hidden rounded-[15px] bg-[#17191d]" style={projectLibraryThumbnailStyle}>
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              sizes="220px"
              unoptimized
              className="object-cover"
            />
          ) : null}
        </div>
      </button>

      <div className="flex items-start justify-between gap-2 px-3 pb-3 pt-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold leading-none text-white/92">
            {project.name}
          </div>
          <div className="mt-2 text-[12px] font-semibold leading-none text-white/86">
            {formatDate(project.updatedAt)}
          </div>
        </div>

        <div
          className="relative shrink-0"
          onMouseEnter={onOpenMenu}
          onMouseLeave={onScheduleCloseMenu}
          onFocus={onOpenMenu}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              onScheduleCloseMenu();
            }
          }}
        >
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-[9px] text-white/70 transition hover:bg-white/8 hover:text-white/92"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu();
            }}
          >
            <Ellipsis size={15} />
          </button>
          <ProjectMenu
            open={menuOpen}
            onOpen={onOpen}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </div>
      </div>
    </article>
  );
}

function CreateProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={projectLibraryCardClassName}
      style={{
        ...projectLibraryCardStyle,
        ...projectLibraryCardSurfaceStyle,
      }}
      onClick={onClick}
    >
      <div className="flex flex-col items-center justify-center rounded-[15px] border border-dashed border-white/18 bg-[linear-gradient(180deg,#17191d,#101114)] text-white/84 transition duration-150 hover:border-white/30 hover:bg-[linear-gradient(180deg,#1b1d22,#15171a)]" style={projectLibraryThumbnailStyle}>
        <Plus size={24} strokeWidth={1.8} />
        <div className="mt-2.5 text-[14px] font-semibold">开始创作</div>
      </div>
      <div className="px-3 pb-3 pt-3 text-[12px] leading-none text-white/50">创建新项目</div>
    </button>
  );
}

function RenameProjectDialog({
  initialValue,
  loading,
  onConfirm,
  onClose,
}: {
  initialValue: string;
  loading: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[400px] rounded-[16px] border border-white/10 bg-[#141518] p-5 shadow-[0_24px_56px_rgba(0,0,0,0.46)]">
        <div className="text-[15px] font-medium text-white/92">重命名项目</div>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) {
              onConfirm(value.trim());
            }
          }}
          className="mt-4 h-10 w-full rounded-[10px] border border-white/10 bg-[#0d0e11] px-3 text-[13px] text-white outline-none transition focus:border-white/24"
          placeholder="请输入项目名"
        />
        <div className="mt-4 flex justify-end gap-2.5">
          <button
            type="button"
            className="h-9 rounded-[10px] px-3.5 text-[12px] text-white/56 transition hover:bg-white/7 hover:text-white/88"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading || !value.trim()}
            className="h-9 rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onConfirm(value.trim())}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateProjectDialog({
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/48 px-4">
      <div className="w-full max-w-[560px] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="px-6 py-4 text-[16px] font-semibold tracking-[1px] text-white">新建项目</div>

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
              创建并进入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectLibrary({
  onOpenProject,
  onBackToHero,
  onProjectsReady,
  restoreProjectId,
  onRestoreProjectOpened,
  onRestoreProjectMissing,
}: ProjectLibraryProps) {
  const router = useRouter();
  const attachProject = useCanvasStore((state) => state.attachProject);
  const listProjects = useCanvasStore((state) => state.listProjects);
  const loadProject = useCanvasStore((state) => state.loadProject);
  const deleteProject = useCanvasStore((state) => state.deleteProject);
  const renameProject = useCanvasStore((state) => state.renameProject);
  const duplicateProject = useCanvasStore((state) => state.duplicateProject);

  const [projects, setProjects] = useState<ProjectHandleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [renameProjectTarget, setRenameProjectTarget] = useState<ProjectHandleRecord | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<ProjectHandleRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateProjectDraft>({
    projectName: '',
    parentHandle: null,
    parentDirectoryLabel: '',
  });
  const restoreProjectAttemptRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);
  const thumbnailUrlsRef = useRef<string[]>([]);

  const clearCloseMenuTimeout = useCallback(() => {
    if (closeMenuTimeoutRef.current) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
  }, []);

  const openProjectMenu = useCallback((projectId: string) => {
    clearCloseMenuTimeout();
    setMenuProjectId(projectId);
  }, [clearCloseMenuTimeout]);

  const closeProjectMenu = useCallback(() => {
    clearCloseMenuTimeout();
    setMenuProjectId(null);
  }, [clearCloseMenuTimeout]);

  const scheduleCloseProjectMenu = useCallback((projectId: string) => {
    clearCloseMenuTimeout();
    closeMenuTimeoutRef.current = window.setTimeout(() => {
      setMenuProjectId((current) => (current === projectId ? null : current));
      closeMenuTimeoutRef.current = null;
    }, 180);
  }, [clearCloseMenuTimeout]);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextProjects = await listProjects();
      revokeObjectUrls(thumbnailUrlsRef.current);
      thumbnailUrlsRef.current = nextProjects.flatMap((project) =>
        project.thumbnailUrl ? [project.thumbnailUrl] : [],
      );
      setProjects(nextProjects);
      onProjectsReady?.(nextProjects.length);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '项目列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [listProjects, onProjectsReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshProjects]);

  useEffect(() => {
    return () => {
      clearCloseMenuTimeout();
      revokeObjectUrls(thumbnailUrlsRef.current);
      thumbnailUrlsRef.current = [];
    };
  }, [clearCloseMenuTimeout]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (dialogRef.current?.contains(event.target)) {
        return;
      }

      closeProjectMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [closeProjectMenu]);

  const orderedProjects = useMemo(
    () =>
      [...projects].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [projects],
  );

  const handleOpenCreateDialog = () => {
    setError(null);
    setCreateDraft({
      projectName: '',
      parentHandle: null,
      parentDirectoryLabel: '',
    });
    setCreateDialogOpen(true);
  };

  const handleImportProjects = async () => {
    setBusy(true);
    setError(null);

    try {
      const parentHandle = await pickProjectParentDirectory();
      const result = await importProjectsFromParentDirectory(parentHandle);
      await refreshProjects();

      if (result.projects.length === 0) {
        setError('没有在所选目录下找到可导入的项目，请选择包含项目文件夹的父目录。');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '导入项目失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePickCreateDirectory = async () => {
    setError(null);

    try {
      const parentHandle = await pickProjectParentDirectory();
      setCreateDraft((current) => ({
        ...current,
        parentHandle,
        parentDirectoryLabel: getProjectDirectoryLabel(parentHandle),
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '选择目录失败');
    }
  };

  const handleConfirmCreateProject = async () => {
    if (!createDraft.parentHandle || !createDraft.projectName.trim()) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const created = await createProjectAtParentDirectory({
        parentHandle: createDraft.parentHandle,
        projectName: createDraft.projectName.trim(),
      });

      attachProject(created.project, created.snapshot);
      setCreateDialogOpen(false);
      setCreateDraft({
        projectName: '',
        parentHandle: null,
        parentDirectoryLabel: '',
      });
      await refreshProjects();
      onOpenProject();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '创建项目失败');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenProject = async (project: ProjectHandleRecord) => {
    setBusy(true);
    setError(null);

    try {
      await loadProject(project);
      onOpenProject();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '打开项目失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectTarget) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await deleteProject(deleteProjectTarget);
      await refreshProjects();
      setDeleteProjectTarget(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '删除项目失败');
    } finally {
      setBusy(false);
      setMenuProjectId(null);
    }
  };

  const handleDuplicateProject = async (project: ProjectHandleRecord) => {
    setBusy(true);
    setError(null);

    try {
      await duplicateProject(project);
      await refreshProjects();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '创建副本失败');
    } finally {
      setBusy(false);
      setMenuProjectId(null);
    }
  };

  const handleRenameProject = async (value: string) => {
    if (!renameProjectTarget) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await renameProject(renameProjectTarget, value);
      await refreshProjects();
      setRenameProjectTarget(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '重命名失败');
    } finally {
      setBusy(false);
      setMenuProjectId(null);
    }
  };

  useEffect(() => {
    if (!restoreProjectId || loading || busy) {
      return;
    }

    if (restoreProjectAttemptRef.current === restoreProjectId) {
      return;
    }

    const project = projects.find((candidate) => candidate.id === restoreProjectId);
    if (!project) {
      restoreProjectAttemptRef.current = restoreProjectId;
      onRestoreProjectMissing?.();
      return;
    }

    restoreProjectAttemptRef.current = restoreProjectId;
    void (async () => {
      setBusy(true);
      setError(null);

      try {
        await loadProject(project);
        onRestoreProjectOpened?.();
        onOpenProject();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '打开项目失败');
        onRestoreProjectMissing?.();
      } finally {
        setBusy(false);
      }
    })();
  }, [
    busy,
    loadProject,
    loading,
    onOpenProject,
    onRestoreProjectMissing,
    onRestoreProjectOpened,
    projects,
    restoreProjectId,
  ]);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#0f1012] text-white">
      <div className="px-6 pt-5">
        <div className="flex items-center gap-2">
          <Image
            src="/project-library-logo.png"
            alt=""
            width={1090}
            height={980}
            priority
            className="h-[24px] w-[27px] object-contain"
          />
          <Image
            src="/genlink-canvas-wordmark.png"
            alt="GenLink"
            width={2391}
            height={372}
            priority
            className="h-auto w-[92px] object-contain"
          />
        </div>
      </div>

      <div className="mx-auto max-w-[1360px] px-16 pb-14 pt-6">
        <div className="flex items-center gap-3 text-[12px] font-medium text-white/72">
          <button
            type="button"
            onClick={onBackToHero}
            className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 transition hover:bg-white/10 hover:text-white/92 focus-visible:bg-white/10 focus-visible:text-white/92 focus-visible:outline-none"
          >
            <ChevronLeft size={15} />
            返回
          </button>
          <div className="h-3.5 w-px bg-white/14" />
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] text-white/72 transition hover:bg-white/10 hover:text-white/92 focus-visible:bg-white/10 focus-visible:text-white/92 focus-visible:outline-none"
            onClick={() => void handleImportProjects()}
          >
            <FolderPlus size={14} />
            批量导入
          </button>
          <div className="h-3.5 w-px bg-white/14" />
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] text-white/72 transition hover:bg-white/10 hover:text-white/92 focus-visible:bg-white/10 focus-visible:text-white/92 focus-visible:outline-none"
            onClick={() => void handleSignOut()}
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-[12px] border border-[#553434] bg-[#2a1616] px-4 py-3 text-[12px] text-[#ffb4b4]">
            {error}
          </div>
        ) : null}

        <div ref={dialogRef} className="mt-8 flex flex-wrap items-start gap-x-5 gap-y-9">
          <CreateProjectCard onClick={handleOpenCreateDialog} />
          {orderedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              menuOpen={menuProjectId === project.id}
              onCardClick={() => void handleOpenProject(project)}
              onOpenMenu={() => openProjectMenu(project.id)}
              onScheduleCloseMenu={() => scheduleCloseProjectMenu(project.id)}
              onOpen={() => void handleOpenProject(project)}
              onRename={() => setRenameProjectTarget(project)}
              onDuplicate={() => void handleDuplicateProject(project)}
              onDelete={() => {
                setDeleteProjectTarget(project);
                closeProjectMenu();
              }}
            />
          ))}
        </div>

      </div>

      <CreateProjectDialog
        open={createDialogOpen}
        draft={createDraft}
        loading={busy}
        onChangeProjectName={(value) =>
          setCreateDraft((current) => ({
            ...current,
            projectName: value,
          }))
        }
        onPickDirectory={() => void handlePickCreateDirectory()}
        onConfirm={() => void handleConfirmCreateProject()}
        onClose={() => {
          if (busy) {
            return;
          }

          setCreateDialogOpen(false);
        }}
      />

      {renameProjectTarget ? (
        <RenameProjectDialog
          key={renameProjectTarget.id}
          initialValue={renameProjectTarget.name}
          loading={busy}
          onConfirm={handleRenameProject}
          onClose={() => setRenameProjectTarget(null)}
        />
      ) : null}

      <DeleteProjectDialog
        open={deleteProjectTarget !== null}
        projectName={deleteProjectTarget?.name ?? ''}
        loading={busy}
        onConfirm={() => void handleDeleteProject()}
        onClose={() => {
          if (busy) {
            return;
          }

          setDeleteProjectTarget(null);
        }}
      />
    </div>
  );
}
