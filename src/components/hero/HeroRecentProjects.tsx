"use client";

import Image from "next/image";
import { ArrowRight, FolderOpen, Loader2, Plus } from "lucide-react";

import { selectRecentProjects } from "@/lib/home-agent-entry";
import type { ProjectHandleRecord } from "@/lib/project-storage";

export interface HeroRecentProjectsProps {
  projects: ProjectHandleRecord[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: (project: ProjectHandleRecord) => void;
  onAllProjects: () => void;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "最近编辑";
  }

  return `编辑于 ${date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  })}`;
}

export function HeroRecentProjects({
  projects,
  loading,
  busy,
  error,
  onCreate,
  onOpen,
  onAllProjects,
}: HeroRecentProjectsProps) {
  const recentProjects = selectRecentProjects(projects);
  const desktopCardWidth =
    recentProjects.length >= 3 ? "lg:w-[176px]" : "lg:w-[190px]";
  const cardClassName = [
    "w-[190px] shrink-0 snap-start overflow-hidden rounded-[8px] bg-[#151619] text-left shadow-[0_14px_34px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 sm:w-[210px]",
    desktopCardWidth,
  ].join(" ");

  return (
    <section aria-label="最近项目" className="mt-3 w-full">
      <div className="flex snap-x items-stretch gap-2.5 overflow-x-auto pb-2">
        <button
          type="button"
          disabled={busy}
          className={cardClassName}
          onClick={onCreate}
        >
          <div className="flex aspect-[4/3] items-center justify-center bg-[#1c1d20]">
            <div className="flex flex-col items-center text-white/72">
              <Plus size={22} strokeWidth={1.6} />
              <span className="mt-2 text-[13px] font-medium">新建项目</span>
            </div>
          </div>
          <div className="h-[54px] px-3 py-2.5 text-[12px] text-white/42">
            选择目录并创建
          </div>
        </button>

        {loading && recentProjects.length === 0 ? (
          <div className={`${cardClassName} flex min-h-[210px] items-center justify-center text-white/42`}>
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : null}

        {recentProjects.map((project) => (
          <button
            key={project.id}
            type="button"
            disabled={busy}
            className={cardClassName}
            onClick={() => onOpen(project)}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-[#1c1d20]">
              {project.thumbnailUrl ? (
                <Image
                  src={project.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 210px, 220px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/20">
                  <FolderOpen size={24} strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="h-[54px] px-3 py-2.5">
              <div className="truncate text-[13px] font-medium text-white/86">
                {project.name}
              </div>
              <div className="mt-1 truncate text-[11px] text-white/42">
                {formatUpdatedAt(project.updatedAt)}
              </div>
            </div>
          </button>
        ))}

        <button
          type="button"
          className="mb-1 flex h-8 shrink-0 self-end items-center gap-1.5 px-1 text-[12px] text-white/48 transition hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 lg:w-[76px] lg:justify-end"
          onClick={onAllProjects}
        >
          所有项目
          <ArrowRight size={13} />
        </button>
      </div>

      {error ? (
        <p className="mt-1 px-1 text-[12px] text-red-300/82">{error}</p>
      ) : null}
    </section>
  );
}
