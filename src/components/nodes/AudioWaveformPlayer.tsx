'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type WaveformCacheEntry = {
  peaks: number[];
  duration: number;
};

type WaveformState = {
  key: string;
  peaks: number[];
  failed: boolean;
};

type PlaybackState = {
  src: string;
  currentTime: number;
  duration: number;
  playing: boolean;
};

const waveformCache = new Map<string, Promise<WaveformCacheEntry>>();

function buildLoadingPeaks(count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index * 0.37) * 0.18;
    const swell = Math.sin(index * 0.11) * 0.22;

    return Math.max(0.2, Math.min(0.78, 0.48 + wave + swell));
  });
}

function formatAudioTime(value?: number): string {
  if (!Number.isFinite(value) || !value || value < 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function shouldNotifyAudioDuration(
  nextDuration: number,
  currentDuration?: number,
): boolean {
  if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
    return false;
  }

  return !Number.isFinite(currentDuration) ||
    !currentDuration ||
    Math.abs(nextDuration - currentDuration) > 0.05;
}

async function decodeWaveform(src: string, bars: number): Promise<WaveformCacheEntry> {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Audio waveform request failed');
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error('Web Audio API unavailable');
  }

  const arrayBuffer = await response.arrayBuffer();
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
      duration: audioBuffer.duration,
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
  const durationSecondsRef = useRef<number | undefined>(durationSeconds);
  const onLoadedMetadataRef = useRef<typeof onLoadedMetadata>(onLoadedMetadata);
  const onErrorRef = useRef<typeof onError>(onError);
  const notifiedDurationRef = useRef<number | undefined>(durationSeconds);
  const bars = compact ? 48 : 72;
  const waveformKey = `${src}:${bars}`;
  const [waveformState, setWaveformState] = useState<WaveformState>({
    key: waveformKey,
    peaks: [],
    failed: false,
  });
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    src,
    currentTime: 0,
    duration: durationSeconds ?? 0,
    playing: false,
  });
  const peaks = waveformState.key === waveformKey ? waveformState.peaks : [];
  const waveformFailed = waveformState.key === waveformKey ? waveformState.failed : false;
  const waveformLoading = !waveformFailed && peaks.length === 0;
  const loadingPeaks = useMemo(() => buildLoadingPeaks(bars), [bars]);
  const currentTime = playbackState.src === src ? playbackState.currentTime : 0;
  const duration = playbackState.src === src ? playbackState.duration : durationSeconds ?? 0;
  const playing = playbackState.src === src ? playbackState.playing : false;
  const canInteract = duration > 0;

  useEffect(() => {
    durationSecondsRef.current = durationSeconds;
  }, [durationSeconds]);

  useEffect(() => {
    notifiedDurationRef.current = durationSeconds;
  }, [durationSeconds, src]);

  useEffect(() => {
    onLoadedMetadataRef.current = onLoadedMetadata;
  }, [onLoadedMetadata]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const notifyLoadedDuration = useCallback((nextDuration: number) => {
    if (!shouldNotifyAudioDuration(nextDuration, notifiedDurationRef.current)) {
      return;
    }

    notifiedDurationRef.current = nextDuration;
    onLoadedMetadataRef.current?.(nextDuration);
  }, []);

  const getKnownDuration = useCallback((audio: HTMLAudioElement, fallback = durationSecondsRef.current ?? 0): number => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return audio.duration;
    }

    if (audio.seekable.length > 0) {
      const seekableEnd = audio.seekable.end(audio.seekable.length - 1);

      if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
        return seekableEnd;
      }
    }

    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getWaveform(src, bars)
      .then((entry) => {
        if (!cancelled) {
          setWaveformState({
            key: waveformKey,
            peaks: entry.peaks,
            failed: false,
          });
          if (Number.isFinite(entry.duration) && entry.duration > 0) {
            setPlaybackState((current) => ({
              src,
              currentTime: current.src === src ? current.currentTime : 0,
              duration: current.src === src
                ? Math.max(current.duration, entry.duration)
                : entry.duration,
              playing: current.src === src ? current.playing : false,
            }));
            notifyLoadedDuration(entry.duration);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWaveformState({
            key: waveformKey,
            peaks: [],
            failed: true,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bars, notifyLoadedDuration, src, waveformKey]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      const audioCurrentTime = audio.currentTime || 0;
      const knownDuration = Math.max(
        getKnownDuration(audio),
        audioCurrentTime,
      );

      setPlaybackState((current) => ({
        src,
        currentTime: audioCurrentTime,
        duration: current.src === src
          ? Math.max(current.duration, knownDuration)
          : knownDuration,
        playing: current.src === src ? current.playing : !audio.paused,
      }));
    };
    const handleLoadedMetadata = () => {
      const nextDuration = getKnownDuration(audio);

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setPlaybackState((current) => ({
          src,
          currentTime: 0,
          duration: nextDuration,
          playing: current.src === src ? current.playing : false,
        }));
        notifyLoadedDuration(nextDuration);
      }
    };
    const handleCanPlay = () => {
      const nextDuration = getKnownDuration(audio);

      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        return;
      }

      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : audio.currentTime || 0,
        duration: current.src === src
          ? Math.max(current.duration, nextDuration)
          : nextDuration,
        playing: current.src === src ? current.playing : !audio.paused,
      }));
      notifyLoadedDuration(nextDuration);
    };
    const handleEnded = () => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : 0,
        duration: current.src === src ? current.duration : durationSecondsRef.current ?? 0,
        playing: false,
      }));
    };
    const handleError = () => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : 0,
        duration: current.src === src ? current.duration : durationSecondsRef.current ?? 0,
        playing: false,
      }));
      onErrorRef.current?.();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.load();

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [getKnownDuration, notifyLoadedDuration, src]);

  const progress = useMemo(() => {
    if (!duration || duration <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, currentTime / duration));
  }, [currentTime, duration]);

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const rect = waveformRef.current?.getBoundingClientRect();

    if (!audio || !rect || !duration || waveformLoading) {
      return;
    }

    const nextProgress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = nextProgress * duration;
    setPlaybackState((current) => ({
      src,
      currentTime: audio.currentTime,
      duration: current.src === src ? current.duration : duration,
      playing: current.src === src ? current.playing : !audio.paused,
    }));
  };

  const handleWaveformPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  };

  const handleWaveformPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (event.buttons === 1) {
      seekFromPointer(event);
    }
  };

  const handleWaveformPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const togglePlayback = () => {
    const audio = audioRef.current;

    if (!audio || !canInteract) {
      return;
    }

    if (playing) {
      audio.pause();
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : audio.currentTime || 0,
        duration: current.src === src ? current.duration : duration,
        playing: false,
      }));
      return;
    }

    void audio.play().then(() => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : audio.currentTime || 0,
        duration: current.src === src ? current.duration : duration,
        playing: true,
      }));
    }).catch(() => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : audio.currentTime || 0,
        duration: current.src === src ? current.duration : duration,
        playing: false,
      }));
      onErrorRef.current?.();
    });
  };

  return (
    <div className="flex h-full w-full flex-col justify-between px-5 pb-7 pt-10 text-white">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div
        ref={waveformRef}
        className={[
          'nodrag nopan relative z-20 grid h-16 items-center gap-[3px] overflow-hidden rounded-[10px] px-1',
          waveformLoading ? 'cursor-wait' : 'cursor-pointer',
        ].join(' ')}
        style={{ gridTemplateColumns: `repeat(${(waveformLoading ? loadingPeaks : peaks).length || 1}, minmax(0, 1fr))` }}
        onPointerDownCapture={handleWaveformPointerDown}
        onPointerMove={handleWaveformPointerMove}
        onPointerUp={handleWaveformPointerEnd}
        onPointerCancel={handleWaveformPointerEnd}
        aria-label={title || 'Audio waveform'}
      >
        {peaks.length > 0 || waveformLoading ? (
          (waveformLoading ? loadingPeaks : peaks).map((peak, index) => (
            <span
              key={`${index}-${peak}`}
              className={[
                'w-full rounded-full',
                waveformLoading ? 'animate-pulse bg-white/20' : 'bg-white',
              ].join(' ')}
              style={{
                height: `${Math.max(7, peak * 54)}px`,
              }}
            />
          ))
        ) : (
          <span className="col-span-full h-px w-full border-t border-dashed border-white/22" />
        )}
        {!waveformLoading ? (
          <span
            className="nodrag nopan absolute top-1/2 z-10 h-[76px] w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
            style={{ left: `${progress * 100}%` }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 h-full w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#39bdf8] shadow-[0_0_14px_rgba(57,189,248,0.7)]" />
          </span>
        ) : null}
      </div>
      <div className="nodrag nopan flex items-center justify-center gap-4 text-[12px] font-medium text-white/70">
        {canInteract ? (
          <span className="w-11 text-right">{formatAudioTime(currentTime)}</span>
        ) : (
          <span className="h-3 w-11 rounded-full bg-white/14" aria-hidden="true" />
        )}
        <button
          type="button"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          onClick={togglePlayback}
          disabled={!canInteract}
          className={[
            'flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#17191d] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition',
            canInteract ? 'hover:scale-105' : 'cursor-wait opacity-55',
          ].join(' ')}
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" className="ml-0.5" />
          )}
        </button>
        {canInteract ? (
          <span className="w-11">{formatAudioTime(duration)}</span>
        ) : (
          <span className="h-3 w-11 rounded-full bg-white/14" aria-hidden="true" />
        )}
      </div>
      {waveformFailed ? (
        <div className="text-center text-[11px] font-medium text-white/38">
          Waveform unavailable
        </div>
      ) : null}
    </div>
  );
}
