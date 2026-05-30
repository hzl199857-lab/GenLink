'use client';

import React from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  controlsVisible?: boolean;
  durationSeconds?: number;
  className?: string;
  videoClassName?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  ariaLabel?: string;
  onLoadedMetadata?: (durationSeconds: number) => void;
  onError?: () => void;
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0.0s';
  }

  return `${seconds.toFixed(1)}s`;
}

export function VideoPlayer({
  src,
  poster,
  videoRef,
  controlsVisible = true,
  durationSeconds = 0,
  className = 'absolute inset-0',
  videoClassName = 'h-full w-full object-cover',
  autoPlay = false,
  muted: initiallyMuted = false,
  loop = false,
  preload = 'metadata',
  ariaLabel,
  onLoadedMetadata,
  onError,
}: VideoPlayerProps) {
  const fallbackVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const resolvedVideoRef = videoRef ?? fallbackVideoRef;
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(durationSeconds);
  const [paused, setPaused] = React.useState(true);
  const [muted, setMuted] = React.useState(initiallyMuted);
  const [controlsHovered, setControlsHovered] = React.useState(false);

  const updatePlaybackState = (video: HTMLVideoElement) => {
    setCurrentTime(video.currentTime || 0);
    setPaused(video.paused);
    setMuted(video.muted || video.volume === 0);

    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    }
  };

  const togglePlayback = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const video = resolvedVideoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const toggleMuted = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const video = resolvedVideoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    updatePlaybackState(video);
  };

  const seekVideo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = resolvedVideoRef.current;
    const nextTime = Number(event.target.value);

    if (!video || !Number.isFinite(nextTime)) {
      return;
    }

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const toggleFullscreen = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const target = frameRef.current;

    if (!target) {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void target.requestFullscreen();
    }
  };

  const rangeMax = Math.max(duration, currentTime, 0);
  const progressPercent = rangeMax > 0 ? Math.min(100, Math.max(0, (currentTime / rangeMax) * 100)) : 0;

  return (
    <div
      ref={frameRef}
      className={className}
      onPointerEnter={() => setControlsHovered(true)}
      onPointerLeave={() => setControlsHovered(false)}
    >
      <video
        ref={resolvedVideoRef}
        crossOrigin="anonymous"
        src={src}
        poster={poster}
        className={videoClassName}
        controls={false}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        preload={preload}
        aria-label={ariaLabel}
        onLoadedMetadata={(event) => {
          updatePlaybackState(event.currentTarget);
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            onLoadedMetadata?.(nextDuration);
          }
        }}
        onDurationChange={(event) => updatePlaybackState(event.currentTarget)}
        onTimeUpdate={(event) => updatePlaybackState(event.currentTarget)}
        onPlay={(event) => updatePlaybackState(event.currentTarget)}
        onPause={(event) => updatePlaybackState(event.currentTarget)}
        onVolumeChange={(event) => updatePlaybackState(event.currentTarget)}
        onPointerDown={(event) => event.stopPropagation()}
        onError={onError}
      />

      {controlsVisible ? (
        <div
          className={[
            'nodrag nopan pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.10)_0%,transparent_34%,rgba(0,0,0,0.50)_100%)] transition-opacity duration-150',
            controlsHovered ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label={muted ? '取消静音' : '静音'}
            className="pointer-events-auto absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-[11px] bg-black/45 text-white shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-black/58"
            onPointerDown={toggleMuted}
          >
            {muted ? <VolumeX size={18} strokeWidth={2.2} /> : <Volume2 size={18} strokeWidth={2.2} />}
          </button>

          <div className="pointer-events-auto absolute inset-x-4 bottom-4 flex items-center gap-4 text-white">
            <button
              type="button"
              aria-label={paused ? '播放' : '暂停'}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition hover:text-white/86"
              onPointerDown={togglePlayback}
            >
              {paused ? <Play size={28} fill="currentColor" strokeWidth={0} /> : <Pause size={28} fill="currentColor" strokeWidth={0} />}
            </button>

            <span className="w-[58px] shrink-0 text-left text-[18px] font-semibold leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.38)]">
              {formatVideoTime(currentTime)}
            </span>

            <input
              type="range"
              min={0}
              max={rangeMax || 0}
              step={0.01}
              value={Math.min(currentTime, rangeMax)}
              aria-label="视频进度"
              className="video-node-progress-slider min-w-0 flex-1"
              style={{ ['--video-progress' as string]: `${progressPercent}%` }}
              onChange={seekVideo}
              onPointerDown={(event) => event.stopPropagation()}
            />

            <span className="w-[58px] shrink-0 text-right text-[18px] font-semibold leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.38)]">
              {formatVideoTime(rangeMax)}
            </span>

            <button
              type="button"
              aria-label="全屏"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition hover:text-white/86"
              onPointerDown={toggleFullscreen}
            >
              <Maximize2 size={24} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
