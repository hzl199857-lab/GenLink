"use client";

import Image from "next/image";
import { ArrowUp, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentPanelSelect } from "@/components/agent/AgentPanelSelect";
import {
  API_PROVIDERS,
  getImageModelLabel,
  IMAGE_MODEL_OPTIONS_BY_PROVIDER,
  IMAGE_SIZE_OPTIONS,
} from "@/lib/image-generation-options";
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_IMAGE_QUALITY,
  DEFAULT_AGENT_RUNNING_HUB_CHANNEL,
  getImageModelDefault,
  resolveAgentImageGenerationPreference,
} from "@/lib/agent-image-preference";
import { AGENT_MODEL_OPTIONS, type AgentModelId } from "@/lib/agent-model-options";
import { AGENT_TEXT_PROVIDER_OPTIONS } from "@/lib/agent-provider-options";
import {
  getApiProviderLabel,
  readStoredSelectedApiProvider,
} from "@/store/canvas-store";
import type {
  AgentImageGenerationPreference,
  AgentProvider,
} from "@/types/agent";

export interface HeroAgentComposerProps {
  prompt: string;
  provider: AgentProvider;
  model: AgentModelId;
  imagePreference: AgentImageGenerationPreference;
  files: File[];
  busy: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onProviderChange: (value: AgentProvider) => void;
  onModelChange: (value: AgentModelId) => void;
  onImagePreferenceChange: (value: AgentImageGenerationPreference) => void;
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
  provider,
  model,
  imagePreference,
  files,
  busy,
  error,
  onPromptChange,
  onProviderChange,
  onModelChange,
  onImagePreferenceChange,
  onFilesChange,
  onRun,
}: HeroAgentComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );
  const autoImageProvider = readStoredSelectedApiProvider("image");
  const resolvedImagePreference = useMemo(
    () =>
      resolveAgentImageGenerationPreference({
        preference: {
          aspectRatio: DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
          quality: DEFAULT_AGENT_IMAGE_QUALITY,
          runningHubChannel: DEFAULT_AGENT_RUNNING_HUB_CHANNEL,
          ...imagePreference,
        },
        autoProvider: autoImageProvider,
      }),
    [autoImageProvider, imagePreference],
  );
  const activeImageModels =
    IMAGE_MODEL_OPTIONS_BY_PROVIDER[resolvedImagePreference.provider];
  const aspectRatioControlsDisabled = imagePreference.mode === "auto";

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previews]);

  return (
    <div className="relative w-full rounded-[16px] border border-[#363636] bg-[#212121] px-3 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.22)] sm:px-4 sm:py-4">
      {previews.length ? (
        <div className="mb-2 flex min-h-14 gap-2 overflow-x-auto pb-1">
          {previews.map(({ file, url }) => (
            <div
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-[6px] bg-black/30"
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

      {agentSettingsOpen ? (
        <div className="absolute left-3 top-[calc(100%+8px)] z-30 w-[calc(100%-1.5rem)] rounded-xl border border-[#363636] bg-[#212121] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.48)] sm:bottom-12 sm:top-auto sm:w-[500px]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-medium text-white/70">Agent 模型</div>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 outline-none transition hover:bg-white/10 hover:text-white"
              aria-label="关闭 Agent 模型设置"
              onClick={() => setAgentSettingsOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AgentPanelSelect
              label="Provider"
              value={provider}
              options={AGENT_TEXT_PROVIDER_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={onProviderChange}
            />
            <AgentPanelSelect
              label="Model"
              value={model}
              options={AGENT_MODEL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={onModelChange}
            />
          </div>
        </div>
      ) : null}

      {modelSettingsOpen ? (
        <div className="absolute left-3 top-[calc(100%+8px)] z-30 flex max-h-[min(420px,calc(100vh-2rem))] w-[calc(100%-1.5rem)] flex-col overflow-visible rounded-xl border border-[#363636] bg-[#212121] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.48)] sm:bottom-12 sm:top-auto sm:w-[560px]">
          <div className="min-h-0 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium text-white/78">生成偏好</div>
              <button
                type="button"
                className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/72 outline-none transition hover:bg-white/[0.12]"
                onClick={() =>
                  onImagePreferenceChange({
                    ...imagePreference,
                    mode: imagePreference.mode === "auto" ? "manual" : "auto",
                  })
                }
              >
                {imagePreference.mode === "auto" ? "自动" : "手动"}
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-black/45 p-1 text-xs font-medium">
              <button type="button" className="h-8 rounded-md bg-white/[0.14] text-white">
                图片
              </button>
              <button type="button" className="h-8 cursor-not-allowed rounded-md text-white/32" disabled>
                视频
              </button>
            </div>
            <div
              className={[
                "mb-3 grid grid-cols-3 gap-1.5 transition-opacity",
                aspectRatioControlsDisabled ? "opacity-35" : "opacity-100",
              ].join(" ")}
            >
              {["auto", "1:1", "16:9", "9:16", "4:3", "3:4"].map((ratio) => {
                const selected = resolvedImagePreference.aspectRatio === ratio;

                return (
                  <button
                    key={ratio}
                    type="button"
                    className={[
                      "h-8 rounded-md px-2 text-xs outline-none transition",
                      aspectRatioControlsDisabled
                        ? "cursor-not-allowed"
                        : "hover:bg-white/[0.09]",
                      selected
                        ? "bg-[#19d3ff] text-[#061019] shadow-[0_0_0_1px_rgba(25,211,255,0.18)]"
                        : "bg-white/[0.05] text-white/54",
                    ].join(" ")}
                    disabled={aspectRatioControlsDisabled}
                    onClick={() =>
                      onImagePreferenceChange({
                        ...imagePreference,
                        mode: "manual",
                        aspectRatio: ratio,
                      })
                    }
                  >
                    {ratio}
                  </button>
                );
              })}
            </div>
            <div className="mb-3 flex gap-1.5">
              {IMAGE_SIZE_OPTIONS.map((option) => {
                const selected = resolvedImagePreference.quality === option;

                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      "h-8 rounded-md px-3 text-xs font-medium outline-none transition hover:bg-white/[0.09]",
                      selected
                        ? "bg-[#19d3ff] text-[#061019] shadow-[0_0_0_1px_rgba(25,211,255,0.18)]"
                        : "bg-white/[0.05] text-white/54",
                    ].join(" ")}
                    onClick={() =>
                      onImagePreferenceChange({
                        ...imagePreference,
                        quality: option,
                      })
                    }
                  >
                    {option.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <AgentPanelSelect
              label="Provider"
              value={resolvedImagePreference.provider}
              options={API_PROVIDERS.map((option) => ({
                value: option,
                label: getApiProviderLabel(option),
              }))}
              onChange={(nextProvider) =>
                onImagePreferenceChange({
                  ...imagePreference,
                  provider: nextProvider,
                  model: getImageModelDefault(nextProvider),
                })
              }
            />
            <AgentPanelSelect
              label="Model"
              value={resolvedImagePreference.model}
              options={activeImageModels.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onChange={(nextModel) =>
                onImagePreferenceChange({
                  ...imagePreference,
                  provider: resolvedImagePreference.provider,
                  model: nextModel,
                })
              }
            />
          </div>
        </div>
      ) : null}

      <textarea
        value={prompt}
        rows={2}
        placeholder="描述你想在画布上完成什么"
        className="block min-h-[64px] w-full resize-none bg-transparent px-1 py-1 text-[14px] leading-6 text-white outline-none placeholder:text-[#777982]"
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

      <div className="mt-2 flex min-h-8 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            title="上传图片"
            aria-label="上传图片"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={16} strokeWidth={1.7} />
          </button>

          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-xs font-medium text-white/72 outline-none transition hover:bg-white/[0.1] focus-visible:outline-none"
            aria-label="Agent 模型设置"
            aria-expanded={agentSettingsOpen}
            onClick={() => {
              setAgentSettingsOpen((current) => !current);
              setModelSettingsOpen(false);
            }}
          >
            <Sparkles size={13} />
            Agent
          </button>
          <button
            type="button"
            className={[
              "flex h-8 min-w-[46px] items-center justify-center rounded-full px-3 text-xs font-medium outline-none transition hover:bg-white/[0.08] hover:text-white/70 focus-visible:outline-none",
              modelSettingsOpen ? "bg-white/[0.08] text-[#19d3ff]" : "text-white/38",
            ].join(" ")}
            aria-label="模型设置"
            aria-expanded={modelSettingsOpen}
            title={`${getImageModelLabel(resolvedImagePreference.model)} / ${resolvedImagePreference.aspectRatio} / ${resolvedImagePreference.quality}`}
            onClick={() => {
              setModelSettingsOpen((current) => !current);
              setAgentSettingsOpen(false);
            }}
          >
            模型
          </button>
        </div>

        <button
          type="button"
          aria-label="运行 Agent"
          disabled={!prompt.trim() || busy}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#a5a5a5] text-[#202124] transition hover:bg-[#b8b8b8] disabled:cursor-not-allowed disabled:bg-white/18 disabled:text-white/30"
          onClick={onRun}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
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
