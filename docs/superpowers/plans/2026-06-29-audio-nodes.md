# Audio Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add uploaded audio resource nodes and RunningHub-placeholder audio generation nodes to the GenLink canvas.

**Architecture:** Extend the existing canvas node model with `audio` and `audio_generation`, reuse the current media upload and reference-media patterns, and add focused audio UI components for waveform playback and prompt controls. The audio generation node stores RunningHub fields but keeps run disabled until real API integration.

**Tech Stack:** Next.js 16, React 19, TypeScript, ReactFlow, Zustand, Tailwind, lucide-react, Web Audio API.

---

## File Structure

- Modify `src/types/canvas.ts`: add audio node types and data interfaces.
- Modify `src/store/canvas-store.ts`: add node defaults, normalization, reference helpers, and connection reference behavior.
- Create `src/components/nodes/AudioWaveformPlayer.tsx`: reusable audio playback and waveform renderer.
- Create `src/components/nodes/UploadedAudioNode.tsx`: uploaded audio resource node.
- Create `src/components/nodes/AudioGenerationPromptBar.tsx`: RunningHub placeholder prompt toolbar.
- Create `src/components/nodes/AudioGenerationNode.tsx`: generation node shell and result card.
- Modify `src/components/nodes/ReferenceMediaStrip.tsx`: add audio thumbnail support.
- Modify `src/components/canvas/AddNodeMenu.tsx`: keep existing `audio` menu item but ensure label semantics remain generation-oriented.
- Modify `src/components/canvas/InfiniteCanvas.tsx`: register nodes, route add/upload/drop/connection flows, estimate bounds, and wire adapters.
- Add or modify focused tests where practical:
  - `src/components/canvas/AddNodeMenu.test.ts`
  - `src/lib/agent-actions.test.ts` only if type fallout requires updates
  - New store/helper tests if audio reference logic can be isolated without heavy component setup.

## Task 1: Add Audio Types

**Files:**
- Modify: `src/types/canvas.ts`

- [ ] **Step 1: Extend `NodeType`**

Add `audio_generation` and `audio`:

```ts
export type NodeType =
  | "text"
  | "storyboard_script"
  | "storyboard_grid"
  | "image_generation"
  | "video_generation"
  | "audio_generation"
  | "video_upscale"
  | "video"
  | "audio"
  | "ai_text_result"
  | "image"
  | "uploaded_image"
  | "panorama-360";
```

- [ ] **Step 2: Add audio data interfaces after `VideoGenerationNodeData`**

```ts
export type AudioGenerationTaskType =
  | "general"
  | "voiceover"
  | "music"
  | "sound-effect";

export interface AudioGenerationNodeData {
  title?: string;
  prompt?: string;
  provider?: "runninghub";
  runningHubWorkflowId?: string;
  taskType?: AudioGenerationTaskType;
  duration?: number;
  style?: string;
  voice?: string;
  referenceAudio?: VideoGenerationMediaReference[];
  audioUrl?: string;
  hostedAudioUrl?: string;
  generatedOutputFileName?: string;
  generatedModel?: string;
  generatedAt?: string;
  durationSeconds?: number;
  mimeType?: string;
  sizeBytes?: number;
  status?: "idle" | "generating" | "error";
  errorMessage?: string;
}

export interface AudioNodeData {
  title?: string;
  audioUrl: string;
  hostedAudioUrl?: string;
  previewUrl?: string;
  fileName?: string;
  outputFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  status?: "idle" | "generating" | "error";
  statusMessage?: string;
  errorMessage?: string;
}
```

- [ ] **Step 3: Add audio variants to unions**

Add:

```ts
| { type: "audio_generation"; data: AudioGenerationNodeData }
| { type: "audio"; data: AudioNodeData }
```

to `CanvasNodeData`, and:

```ts
| BaseCanvasNode<"audio_generation", AudioGenerationNodeData>
| BaseCanvasNode<"audio", AudioNodeData>
```

to `CanvasNode`.

- [ ] **Step 4: Update output history type only if TypeScript requires it**

Do not add audio history in this task. If `ProjectOutputHistoryItem` exhaustiveness fails, adjust only the narrow type causing the error.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`

Expected: errors in files that have not yet been updated to handle new union members. Keep the output as guidance for later tasks.

## Task 2: Store Defaults and Normalization

**Files:**
- Modify: `src/store/canvas-store.ts`

- [ ] **Step 1: Import new types**

Add `AudioGenerationNodeData` and `AudioNodeData` to the import from `@/types/canvas`.

- [ ] **Step 2: Add default data creators near video creators**

```ts
function createAudioGenerationNodeData(): AudioGenerationNodeData {
  return {
    title: "Audio",
    prompt: "",
    provider: "runninghub",
    runningHubWorkflowId: "",
    taskType: "general",
    duration: 10,
    style: "",
    voice: "",
    referenceAudio: [],
    status: "idle",
  };
}

function createAudioNodeData(): AudioNodeData {
  return {
    title: "Audio",
    audioUrl: "",
    status: "idle",
  };
}
```

- [ ] **Step 3: Add createNode cases**

Add `audio_generation` and `audio` cases to `createNode`:

```ts
case "audio_generation":
  return {
    id: crypto.randomUUID(),
    type,
    position,
    data: createAudioGenerationNodeData(),
  };
case "audio":
  return {
    id: crypto.randomUUID(),
    type,
    position,
    data: createAudioNodeData(),
  };
```

- [ ] **Step 4: Add normalization helpers**

Add helpers following existing normalize functions:

```ts
function normalizeAudioNodeData(data: unknown): AudioNodeData {
  const defaults = createAudioNodeData();
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : "",
    hostedAudioUrl: typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
    previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
    fileName: typeof record.fileName === "string" ? record.fileName : undefined,
    outputFileName: typeof record.outputFileName === "string" ? record.outputFileName : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    status: record.status === "generating" || record.status === "error" ? record.status : "idle",
    statusMessage: typeof record.statusMessage === "string" ? record.statusMessage : undefined,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

function normalizeAudioGenerationNodeData(data: unknown): AudioGenerationNodeData {
  const defaults = createAudioGenerationNodeData();
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const taskType = record.taskType === "voiceover" ||
    record.taskType === "music" ||
    record.taskType === "sound-effect"
    ? record.taskType
    : "general";

  return {
    ...defaults,
    ...record,
    title: typeof record.title === "string" ? record.title : defaults.title,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    provider: "runninghub",
    runningHubWorkflowId: typeof record.runningHubWorkflowId === "string" ? record.runningHubWorkflowId : "",
    taskType,
    duration: typeof record.duration === "number" ? record.duration : defaults.duration,
    style: typeof record.style === "string" ? record.style : "",
    voice: typeof record.voice === "string" ? record.voice : "",
    referenceAudio: Array.isArray(record.referenceAudio)
      ? record.referenceAudio as VideoGenerationMediaReference[]
      : [],
    audioUrl: typeof record.audioUrl === "string" ? record.audioUrl : undefined,
    hostedAudioUrl: typeof record.hostedAudioUrl === "string" ? record.hostedAudioUrl : undefined,
    generatedOutputFileName: typeof record.generatedOutputFileName === "string" ? record.generatedOutputFileName : undefined,
    generatedModel: typeof record.generatedModel === "string" ? record.generatedModel : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    status: record.status === "generating" || record.status === "error" ? record.status : "idle",
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}
```

- [ ] **Step 5: Wire normalization into loaded node normalization**

Find `normalizeLoadedCanvasNodes` or equivalent switch and add:

```ts
if (node.type === "audio") {
  return { ...node, data: normalizeAudioNodeData(node.data) };
}

if (node.type === "audio_generation") {
  return { ...node, data: normalizeAudioGenerationNodeData(node.data) };
}
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`

Expected: fewer errors, mostly canvas/UI missing cases.

## Task 3: Build Audio Waveform Player

**Files:**
- Create: `src/components/nodes/AudioWaveformPlayer.tsx`

- [ ] **Step 1: Create component file**

Use this implementation as the initial component:

```tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

type WaveformCacheEntry = {
  peaks: number[];
};

const waveformCache = new Map<string, Promise<WaveformCacheEntry>>();

function formatAudioTime(value?: number): string {
  if (!Number.isFinite(value) || !value || value < 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function decodeWaveform(src: string, bars: number): Promise<WaveformCacheEntry> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error('Audio waveform request failed');
  }

  const arrayBuffer = await response.arrayBuffer();
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / bars));
    const peaks = Array.from({ length: bars }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let peak = 0;

      for (let cursor = start; cursor < end; cursor += 1) {
        peak = Math.max(peak, Math.abs(channel[cursor] ?? 0));
      }

      return peak;
    });
    const maxPeak = Math.max(...peaks, 0.01);

    return {
      peaks: peaks.map((peak) => Math.max(0.08, peak / maxPeak)),
    };
  } finally {
    void audioContext.close();
  }
}

function getWaveform(src: string, bars: number): Promise<WaveformCacheEntry> {
  const key = `${src}:${bars}`;
  const cached = waveformCache.get(key);

  if (cached) {
    return cached;
  }

  const promise = decodeWaveform(src, bars);
  waveformCache.set(key, promise);
  return promise;
}

export interface AudioWaveformPlayerProps {
  src: string;
  title?: string;
  durationSeconds?: number;
  compact?: boolean;
  onLoadedMetadata?: (durationSeconds: number) => void;
  onError?: () => void;
}

export function AudioWaveformPlayer({
  src,
  title,
  durationSeconds,
  compact = false,
  onLoadedMetadata,
  onError,
}: AudioWaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const bars = compact ? 48 : 72;

  useEffect(() => {
    let cancelled = false;
    setWaveformFailed(false);
    setPeaks([]);

    void getWaveform(src, bars)
      .then((entry) => {
        if (!cancelled) {
          setPeaks(entry.peaks);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWaveformFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bars, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleLoadedMetadata = () => {
      const nextDuration = audio.duration;
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
        onLoadedMetadata?.(nextDuration);
      }
    };
    const handleEnded = () => setPlaying(false);
    const handleError = () => {
      setPlaying(false);
      onError?.();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [onError, onLoadedMetadata, src]);

  const progress = useMemo(() => {
    if (!duration || duration <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, currentTime / duration));
  }, [currentTime, duration]);

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const rect = waveformRef.current?.getBoundingClientRect();

    if (!audio || !rect || !duration) {
      return;
    }

    const nextProgress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = nextProgress * duration;
    setCurrentTime(audio.currentTime);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    void audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
      onError?.();
    });
  };

  return (
    <div className="nodrag nopan flex h-full w-full flex-col justify-center gap-3 px-5 py-4 text-white">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div
        ref={waveformRef}
        className="relative flex h-14 cursor-pointer items-center gap-[3px] overflow-hidden rounded-[10px] px-1"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            seekFromPointer(event);
          }
        }}
        aria-label={title || 'Audio waveform'}
      >
        {peaks.length > 0 ? (
          peaks.map((peak, index) => {
            const active = index / peaks.length <= progress;
            return (
              <span
                key={`${index}-${peak}`}
                className={active ? 'bg-white' : 'bg-white/18'}
                style={{
                  width: `${100 / peaks.length}%`,
                  height: `${Math.max(7, peak * 48)}px`,
                  borderRadius: '999px',
                }}
              />
            );
          })
        ) : (
          <span className="h-px w-full border-t border-dashed border-white/22" />
        )}
        <span
          className="pointer-events-none absolute top-1/2 h-[64px] w-[2px] -translate-y-1/2 rounded-full bg-[#39bdf8] shadow-[0_0_14px_rgba(57,189,248,0.7)]"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-center gap-4 text-[12px] font-medium text-white/70">
        <span className="w-11 text-right">{formatAudioTime(currentTime)}</span>
        <button
          type="button"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          onClick={togglePlayback}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#17191d] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition hover:scale-105"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <span className="w-11">{formatAudioTime(duration)}</span>
      </div>
      {waveformFailed ? (
        <div className="text-center text-[11px] font-medium text-white/38">
          Waveform unavailable
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add WebKit AudioContext typing if needed**

If TypeScript errors on `window.webkitAudioContext`, add a local declaration near the top:

```ts
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
```

and update constructor access:

```ts
const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
if (!AudioContextCtor) {
  throw new Error('Web Audio API unavailable');
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`

Expected: component-specific errors fixed before moving on.

## Task 4: Build Uploaded Audio Node

**Files:**
- Create: `src/components/nodes/UploadedAudioNode.tsx`

- [ ] **Step 1: Create uploaded audio component**

```tsx
'use client';

import React from 'react';
import { Position } from 'reactflow';
import { Copy, Download, Upload, Volume2 } from 'lucide-react';
import type { AudioNodeData } from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { Tooltip } from '@/components/ui/Tooltip';

export interface UploadedAudioNodeProps {
  data: AudioNodeData;
  selected?: boolean;
  accessoriesVisible?: boolean;
  onReplace?: (file: File) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onLoadedMetadata?: (durationSeconds: number) => void;
  onDownload?: () => void;
  onCopyLink?: () => void;
}

export const UPLOADED_AUDIO_CARD_WIDTH = 420;
export const UPLOADED_AUDIO_CARD_HEIGHT = 172;

function getNodeDisplayTitle(data: AudioNodeData): string | undefined {
  return data.title || data.fileName;
}

function AudioIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-black/65 text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition hover:bg-white hover:text-[#17191d]"
      >
        {children}
      </button>
      <Tooltip label={label} side="top" />
    </div>
  );
}

export function UploadedAudioNode({
  data,
  selected = false,
  accessoriesVisible = selected,
  onReplace,
  onTitleChange,
  onSelectNode,
  onLoadedMetadata,
  onDownload,
  onCopyLink,
}: UploadedAudioNodeProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const displayTitle = getNodeDisplayTitle(data);
  const audioUrl = data.hostedAudioUrl?.trim() || data.audioUrl.trim();
  const showAccessories = accessoriesVisible;
  const isUploading = data.status === 'generating';
  const isError = data.status === 'error';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onReplace?.(file);
      event.target.value = '';
    }
  };

  return (
    <div className="relative group node-connectable-root" style={{ width: UPLOADED_AUDIO_CARD_WIDTH }}>
      <div className="node-visible-title -mt-2 mb-1.5 ml-1 flex items-center gap-1.5 select-none text-gl-text-tertiary nodrag nopan">
        <Volume2 size={24} />
        <EditableNodeTitle
          value={displayTitle}
          fallbackValue="Audio"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border bg-[#181a1d] shadow-gl-card cursor-grab transition-all duration-150',
          isUploading
            ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
            : '',
          selected
            ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
            : 'border-gl-stroke-subtle shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ width: UPLOADED_AUDIO_CARD_WIDTH, height: UPLOADED_AUDIO_CARD_HEIGHT }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
        }}
      >
        {audioUrl ? (
          <AudioWaveformPlayer
            src={audioUrl}
            title={displayTitle}
            durationSeconds={data.durationSeconds}
            onLoadedMetadata={onLoadedMetadata}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gl-text-muted">
            <Volume2 size={34} />
          </div>
        )}

        <div className={[
          'nodrag nopan absolute right-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100',
          showAccessories ? '' : 'pointer-events-none group-hover:opacity-0',
        ].join(' ')}>
          <AudioIconButton
            label="Replace audio"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <Upload size={15} />
          </AudioIconButton>
          <AudioIconButton
            label="Download audio"
            onClick={(event) => {
              event.stopPropagation();
              onDownload?.();
            }}
          >
            <Download size={15} />
          </AudioIconButton>
          <AudioIconButton
            label="Copy audio link"
            onClick={(event) => {
              event.stopPropagation();
              onCopyLink?.();
            }}
          >
            <Copy size={15} />
          </AudioIconButton>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {isUploading ? (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-[8px] bg-black/70 px-2.5 py-1.5 text-center text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {data.statusMessage || 'Uploading...'}
          </div>
        ) : null}

        {isError ? (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-[8px] bg-red-600/85 px-2.5 py-1.5 text-center text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {data.errorMessage || 'Upload failed'}
          </div>
        ) : null}
      </div>

      <CardSideHandle
        type="target"
        position={Position.Left}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={UPLOADED_AUDIO_CARD_WIDTH}
      />
      <CardSideHandle
        type="source"
        position={Position.Right}
        visible={showAccessories}
        cardTopOffset={18}
        cardWidth={UPLOADED_AUDIO_CARD_WIDTH}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

Expected: no errors from the new component.

## Task 5: Extend Reference Media Strip for Audio

**Files:**
- Modify: `src/components/nodes/ReferenceMediaStrip.tsx`

- [ ] **Step 1: Add icon imports and audio type**

Change import:

```ts
import { Music2, Play, X } from 'lucide-react';
```

Add type:

```ts
export type ReferenceMediaStripAudio = {
  id: string;
  audioUrl: string;
  alt?: string;
  fileName?: string;
  durationSeconds?: number;
  uploadStatus?: 'uploading' | 'uploaded' | 'error';
  uploadError?: string;
};
```

- [ ] **Step 2: Add `connectedAudio` prop**

Update props:

```ts
connectedAudio?: ReferenceMediaStripAudio[];
```

Default it in the function parameters:

```ts
connectedAudio = [],
```

- [ ] **Step 3: Include audio in `referenceMedia`**

Use:

```ts
const referenceMedia = [
  ...connectedImages.map((image) => ({ type: 'image' as const, item: image })),
  ...connectedVideos.map((video) => ({ type: 'video' as const, item: video })),
  ...connectedAudio.map((audio) => ({ type: 'audio' as const, item: audio })),
];
```

- [ ] **Step 4: Render audio thumbnails**

In the thumbnail render branch, add audio branch after video:

```tsx
) : reference.type === 'video' ? (
  <>
    <ReferenceVideoThumbnail
      videoUrl={reference.item.videoUrl}
      previewUrl={reference.item.previewUrl}
      alt={reference.item.alt || `Connected video ${index + 1}`}
    />
    <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
      <Play size={15} fill="currentColor" strokeWidth={0} />
    </span>
  </>
) : (
  <span className="flex h-full w-full items-center justify-center bg-[#202328] text-gl-text-secondary">
    <Music2 size={18} />
  </span>
)}
```

- [ ] **Step 5: Guard preview calls**

Only call image/video preview hooks for image/video:

```ts
onPointerEnter={(event) => {
  if (reference.type === 'video') {
    videoPreview.showPreview(reference.item, event.currentTarget);
    return;
  }
  if (reference.type === 'image') {
    imagePreview.showPreview(reference.item, event.currentTarget);
  }
}}
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`

Expected: any callsites missing `connectedAudio` remain valid because the prop is optional.

## Task 6: Build Audio Generation Prompt Bar

**Files:**
- Create: `src/components/nodes/AudioGenerationPromptBar.tsx`

- [ ] **Step 1: Create prompt bar component**

Implement a compact prompt bar modeled after `VideoGenerationPromptBar`, with props:

```ts
export interface AudioGenerationPromptBarProps {
  visible: boolean;
  prompt: string;
  runningHubWorkflowId?: string;
  taskType?: AudioGenerationTaskType;
  duration?: number;
  style?: string;
  voice?: string;
  referenceAudio?: ReferenceMediaStripAudio[];
  onPromptChange?: (next: string) => void;
  onPatch?: (next: Partial<AudioGenerationNodeData>) => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onPointerDownWithin?: () => void;
  onFocusWithinChange?: (focused: boolean) => void;
}
```

Use `NodeToolbar`, `PromptMentionInput`, `PromptBarRunControls`, and `ReferenceMediaStrip`.

- [ ] **Step 2: Keep run disabled**

Render `PromptBarRunControls` with disabled semantics if supported. If it does not support disabled, use a local disabled button styled like the existing run button and a tooltip:

```tsx
<button
  type="button"
  disabled
  title="RunningHub audio workflow is not connected yet"
  className="flex h-10 items-center gap-2 rounded-gl-pill bg-white/10 px-4 text-[14px] font-semibold text-gl-text-muted opacity-60"
>
  Generate
</button>
```

- [ ] **Step 3: Add parameter controls**

Add simple inputs/selects inside the bar:

- Provider chip: `RunningHub`
- Workflow ID text input
- Task type select
- Duration number input
- Style text input
- Voice text input

All inputs must use `nodrag nopan`.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`

Expected: errors only from not-yet-created audio generation node callsites.

## Task 7: Build Audio Generation Node

**Files:**
- Create: `src/components/nodes/AudioGenerationNode.tsx`

- [ ] **Step 1: Create generation node component**

Use `VideoGenerationNode` as the structure, with:

- `MAX_CARD_EDGE = 540`
- result card default `{ width: 420, height: 172 }`
- `AudioWaveformPlayer` for results
- `AudioGenerationPromptBar` below
- `CardSideHandle` target/source
- `EditableNodeTitle`

Props:

```ts
export interface AudioGenerationNodeProps {
  id?: string;
  data: AudioGenerationNodeData;
  selected?: boolean;
  dragging?: boolean;
  referenceAudio?: ReferenceMediaStripAudio[];
  onChange?: (next: AudioGenerationNodeData) => void;
  onUpload?: () => void;
  onQuickReferenceConnect?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onSelectNode?: () => void;
  onPromptPointerDown?: () => void;
  onPromptFocusWithinChange?: (focused: boolean) => void;
}
```

- [ ] **Step 2: Patch node data safely**

Use:

```ts
const handlePatch = (partial: Partial<AudioGenerationNodeData>) => {
  onChange?.({
    ...data,
    ...partial,
    status: data.status === 'error' ? 'idle' : data.status,
    errorMessage: undefined,
  });
};
```

- [ ] **Step 3: Render placeholder result card**

Empty result:

```tsx
<div className="flex flex-col items-center gap-2 text-gl-text-muted">
  <Volume2 size={48} />
  <span className="text-[12px] font-medium">RunningHub audio output</span>
</div>
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`

Expected: no errors from the new audio generation components.

## Task 8: Wire Canvas Uploads and Node Adapters

**Files:**
- Modify: `src/components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add imports**

Import:

```ts
import { AudioGenerationNode } from '../nodes/AudioGenerationNode';
import {
  UploadedAudioNode,
  UPLOADED_AUDIO_CARD_HEIGHT,
  UPLOADED_AUDIO_CARD_WIDTH,
} from '../nodes/UploadedAudioNode';
```

Add `AudioGenerationNodeData` and `AudioNodeData` to type imports.

- [ ] **Step 2: Add adapter components**

Create `AudioGenerationNodeAdapter` near video generation adapter and `UploadedAudioNodeAdapter` near uploaded video adapter.

The uploaded adapter should:

- handle replace with `readAudioFile` or local helper
- update duration on metadata
- call download/copy handlers

- [ ] **Step 3: Add read/upload audio helpers**

Near video upload helpers, add:

```ts
async function readAudioFile(file: File): Promise<AudioNodeData> {
  const localUrl = URL.createObjectURL(file);
  return {
    title: file.name,
    audioUrl: localUrl,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    status: 'generating',
    statusMessage: 'Uploading...',
  };
}
```

Then upload using `uploadMediaFileToOss(file)` and patch `hostedAudioUrl`, `audioUrl`, `status: "idle"`.

- [ ] **Step 4: Add `addUploadedAudios` callback**

Follow `addUploadedVideos` style:

- Create pending nodes with local object URLs.
- Add nodes.
- Upload each file in background.
- Patch node data on success or error.
- Select imported audio nodes when appropriate.

- [ ] **Step 5: Split audio in upload input**

In global upload branch:

```ts
const audioFiles = files.filter((file) => file.type.startsWith('audio/'));
```

After images and videos, call `addUploadedAudios(audioFiles, audioPosition)`.

- [ ] **Step 6: Split audio in drop handler**

Mirror the upload input branch for drag/drop.

- [ ] **Step 7: Register node types**

Add:

```ts
audio_generation: AudioGenerationNodeAdapter,
audio: UploadedAudioNodeAdapter,
```

to `nodeTypes`.

- [ ] **Step 8: Route add menu audio action**

In `handleAddMenuSelect`, change `audio` action to create `audio_generation`:

```ts
if (action === 'audio' && addMenu) {
  const node = addNodeAtCenter('audio_generation', addMenu.canvas);
  focusCreatedNode(node.id);
}
```

Do the same for empty canvas create action if it exposes audio later.

- [ ] **Step 9: Add bounds estimation**

For `audio`, return width `UPLOADED_AUDIO_CARD_WIDTH` and height including title row. For `audio_generation`, use video generation-like bounds.

- [ ] **Step 10: Run type check**

Run: `npx tsc --noEmit`

Expected: remaining errors point to store reference helpers or exhaustive checks.

## Task 9: Wire Audio References

**Files:**
- Modify: `src/store/canvas-store.ts`
- Modify: `src/components/canvas/InfiniteCanvas.tsx`
- Modify: `src/components/nodes/VideoGenerationNode.tsx`
- Modify: `src/components/nodes/VideoGenerationPromptBar.tsx`

- [ ] **Step 1: Add connected audio payload type**

In store:

```ts
type ConnectedAudioPayload = {
  id: string;
  audioUrl: string;
  hostedAudioUrl?: string;
  fileName?: string;
  alt: string;
  sourceType: "audio" | "audio_generation" | "inline_reference";
  durationSeconds?: number;
  mimeType?: string;
  sizeBytes?: number;
  uploadStatus?: "uploading" | "uploaded" | "error";
  uploadError?: string;
};
```

- [ ] **Step 2: Add dedupe helpers**

```ts
function getConnectedAudioDedupKeys(audio: ConnectedAudioPayload): string[] {
  const hostedAudioUrl = audio.hostedAudioUrl?.trim();
  const audioUrl = audio.audioUrl.trim();

  return [
    audio.id ? `node:${audio.id}` : null,
    hostedAudioUrl ? `url:${hostedAudioUrl}` : null,
    audioUrl ? `url:${audioUrl}` : null,
  ].filter((key): key is string => Boolean(key));
}

function dedupeConnectedAudio(audioItems: ConnectedAudioPayload[]): ConnectedAudioPayload[] {
  const seen = new Set<string>();
  const deduped: ConnectedAudioPayload[] = [];

  for (const audio of audioItems) {
    const keys = getConnectedAudioDedupKeys(audio);
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    keys.forEach((key) => seen.add(key));
    deduped.push(audio);
  }

  return deduped;
}
```

- [ ] **Step 3: Add source conversion**

Add helper to convert `audio` and `audio_generation` nodes to `ConnectedAudioPayload`.

- [ ] **Step 4: Add store methods**

Add methods:

- `getConnectedAudioForVideoGenerationNode(videoGenerationNodeId: string): ConnectedAudioPayload[]`
- `getConnectedAudioForAudioGenerationNode(audioGenerationNodeId: string): ConnectedAudioPayload[]`
- `addReferenceAudioToAudioGenerationNode(audioGenerationNodeId: string, media: VideoGenerationMediaReference[]): void`

- [ ] **Step 5: Update edge add behavior**

When adding an edge into `video_generation` or `audio_generation`, if source node is `audio` or `audio_generation` with URL, append a reference audio item to the target node.

- [ ] **Step 6: Update video generation UI props**

Add `connectedAudio` to `VideoGenerationPromptBarProps` and pass it into `ReferenceMediaStrip`.

- [ ] **Step 7: Update video generation adapter**

In `VideoGenerationNodeAdapter`, read connected audio from store and pass it into `VideoGenerationNode` and prompt bar.

- [ ] **Step 8: Run type check**

Run: `npx tsc --noEmit`

Expected: no audio-reference type errors.

## Task 10: Final Verification

**Files:**
- Potentially modify tests identified by type/lint output.

- [ ] **Step 1: Run TypeScript**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS or only pre-existing warnings. Fix errors introduced by this feature.

- [ ] **Step 3: Run focused tests**

Run existing relevant tests:

```bash
npm test -- --runInBand src/components/canvas/AddNodeMenu.test.ts
```

If the repo has no `npm test` script, skip and record that no test script exists.

- [ ] **Step 4: Manual browser verification**

Start dev server:

```bash
npm run dev
```

Verify:

- Add menu audio creates audio generation node.
- Toolbar upload with an audio file creates uploaded audio node.
- Drag/drop audio creates uploaded audio node.
- Uploaded audio plays and seeks.
- Replace updates the same node.
- Audio generation run is disabled with RunningHub placeholder.
- Audio node connects to video generation as reference audio.
- Audio node connects to audio generation as reference audio.
- Project saves and reloads with both node types.

- [ ] **Step 5: Commit implementation**

```bash
git add src docs/superpowers/plans/2026-06-29-audio-nodes.md
git commit -m "feat: add audio canvas nodes"
```
