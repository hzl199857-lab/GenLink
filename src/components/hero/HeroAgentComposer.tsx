"use client";

import Image from "next/image";
import { ArrowUp, ChevronDown, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import {
  AGENT_MODEL_OPTIONS,
  isAgentModelId,
  type AgentModelId,
} from "@/lib/agent-model-options";

export interface HeroAgentComposerProps {
  prompt: string;
  model: AgentModelId;
  files: File[];
  busy: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onModelChange: (value: AgentModelId) => void;
  onFilesChange: (files: File[]) => void;
  onRun: () => void;
}

function mergeImageFiles(current: File[], incoming: File[]): File[] {
  const result = [...current];
  const keys = new Set(
    current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
  );

  for (const file of incoming) {
    if (!file.type.startsWith("image/")) {
      continue;
    }

    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!keys.has(key)) {
      keys.add(key);
      result.push(file);
    }
  }

  return result;
}

export function HeroAgentComposer({
  prompt,
  model,
  files,
  busy,
  error,
  onPromptChange,
  onModelChange,
  onFilesChange,
  onRun,
}: HeroAgentComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previews]);

  return (
    <div className="w-full rounded-[8px] bg-[#17181b]/96 p-3 shadow-[0_20px_54px_rgba(0,0,0,0.38)] backdrop-blur-md sm:p-4">
      {previews.length ? (
        <div className="mb-3 flex min-h-16 gap-2 overflow-x-auto pb-1">
          {previews.map(({ file, url }) => (
            <div
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[6px] bg-black/30"
            >
              <Image
                src={url}
                alt={file.name}
                fill
                sizes="64px"
                unoptimized
                className="object-cover"
              />
              <button
                type="button"
                aria-label={`移除图片 ${file.name}`}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/76 opacity-100 transition hover:bg-black hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                onClick={() => onFilesChange(files.filter((item) => item !== file))}
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        value={prompt}
        rows={3}
        placeholder="描述你想在画布上完成什么"
        className="block min-h-[92px] w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-white outline-none placeholder:text-white/36"
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            if (prompt.trim() && !busy) {
              onRun();
            }
          }
        }}
      />

      <div className="mt-3 flex min-h-10 items-center justify-between gap-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            title="上传图片"
            aria-label="上传图片"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/54 transition hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={17} strokeWidth={1.8} />
          </button>

          <div className="relative min-w-0">
            <Sparkles
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-white/50"
            />
            <select
              value={model}
              aria-label="选择 Agent 模型"
              className="h-9 max-w-[190px] appearance-none rounded-full bg-white/[0.05] py-0 pl-8 pr-8 text-[12px] font-medium text-white/76 outline-none transition hover:bg-white/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
              onChange={(event) => {
                if (isAgentModelId(event.target.value)) {
                  onModelChange(event.target.value);
                }
              }}
            >
              {AGENT_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} className="bg-[#17181b]">
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/42"
            />
          </div>
        </div>

        <button
          type="button"
          aria-label="运行 Agent"
          disabled={!prompt.trim() || busy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#111214] transition hover:bg-white/88 disabled:cursor-not-allowed disabled:bg-white/18 disabled:text-white/34"
          onClick={onRun}
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
        </button>
      </div>

      {error ? <p className="mt-2 px-1 text-[12px] text-red-300/90">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          onFilesChange(
            mergeImageFiles(files, Array.from(event.target.files ?? [])),
          );
          event.target.value = "";
        }}
      />
    </div>
  );
}
