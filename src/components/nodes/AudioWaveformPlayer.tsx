'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type WaveformCacheEntry = {
  peaks: number[];
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
  const currentTime = playbackState.src === src ? playbackState.currentTime : 0;
  const duration = playbackState.src === src ? playbackState.duration : durationSeconds ?? 0;
  const playing = playbackState.src === src ? playbackState.playing : false;

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
  }, [bars, src, waveformKey]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      setPlaybackState((current) => ({
        src,
        currentTime: audio.currentTime || 0,
        duration: current.src === src ? current.duration : durationSeconds ?? 0,
        playing: current.src === src ? current.playing : !audio.paused,
      }));
    };
    const handleLoadedMetadata = () => {
      const nextDuration = audio.duration;

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setPlaybackState((current) => ({
          src,
          currentTime: 0,
          duration: nextDuration,
          playing: current.src === src ? current.playing : false,
        }));
        onLoadedMetadata?.(nextDuration);
      }
    };
    const handleEnded = () => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : 0,
        duration: current.src === src ? current.duration : durationSeconds ?? 0,
        playing: false,
      }));
    };
    const handleError = () => {
      setPlaybackState((current) => ({
        src,
        currentTime: current.src === src ? current.currentTime : 0,
        duration: current.src === src ? current.duration : durationSeconds ?? 0,
        playing: false,
      }));
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
  }, [durationSeconds, onError, onLoadedMetadata, src]);

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
    setPlaybackState((current) => ({
      src,
      currentTime: audio.currentTime,
      duration: current.src === src ? current.duration : duration,
      playing: current.src === src ? current.playing : !audio.paused,
    }));
  };

  const togglePlayback = () => {
    const audio = audioRef.current;

    if (!audio) {
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
      onError?.();
    });
  };

  return (
    <div className="nodrag nopan flex h-full w-full flex-col px-5 pb-4 pt-9 text-white">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div
        ref={waveformRef}
        className="relative grid h-14 cursor-pointer items-center gap-[3px] overflow-hidden rounded-[10px] px-1"
        style={peaks.length > 0 ? { gridTemplateColumns: `repeat(${peaks.length}, minmax(0, 1fr))` } : undefined}
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
          peaks.map((peak, index) => (
            <span
              key={`${index}-${peak}`}
              className="w-full bg-white"
              style={{
                height: `${Math.max(7, peak * 48)}px`,
                borderRadius: '999px',
              }}
            />
          ))
        ) : (
          <span className="col-span-full h-px w-full border-t border-dashed border-white/22" />
        )}
        <span
          className="absolute top-1/2 z-10 h-[70px] w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        >
          <span className="absolute left-1/2 top-1/2 h-full w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#39bdf8] shadow-[0_0_14px_rgba(57,189,248,0.7)]" />
        </span>
      </div>
      <div className="mt-5 flex items-center justify-center gap-4 text-[12px] font-medium text-white/70">
        <span className="w-11 text-right">{formatAudioTime(currentTime)}</span>
        <button
          type="button"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          onClick={togglePlayback}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#17191d] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition hover:scale-105"
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" className="ml-0.5" />
          )}
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
