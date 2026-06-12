'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GenLinkHero } from '@/components/hero/GenLinkHero';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { ProjectLibrary } from '@/components/project/ProjectLibrary';
import UniqueLoading from '@/components/ui/grid-loading';
import {
  shouldKeepEntryLoaderVisible,
  shouldShowProjectLibraryEntryLoader,
} from '@/lib/project-open-transition';
import { getStoredProjectRecordCount } from '@/lib/project-storage';

type Mode = 'hero' | 'library' | 'canvas';

const FADE_MS = 500;
const ENTRY_LOADER_MIN_MS = 650;
const ENTRY_LOADER_EXIT_MS = 420;
const ENTRY_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('hero');
  const [heroLeaving, setHeroLeaving] = useState(false);
  const [appVisible, setAppVisible] = useState(false);
  const [entryLoader, setEntryLoader] = useState<null | 'library' | 'canvas'>(null);
  const [entryLoaderLeaving, setEntryLoaderLeaving] = useState(false);
  const [knownProjectCount, setKnownProjectCount] = useState<number | null>(null);
  const entryLoaderStartedAtRef = useRef<number | null>(null);
  const entryLoaderTimerRef = useRef<number | null>(null);

  const clearEntryLoaderTimer = useCallback(() => {
    if (entryLoaderTimerRef.current !== null) {
      window.clearTimeout(entryLoaderTimerRef.current);
      entryLoaderTimerRef.current = null;
    }
  }, []);

  const showEntryLoader = useCallback((target: 'library' | 'canvas') => {
    clearEntryLoaderTimer();
    entryLoaderStartedAtRef.current = performance.now();
    setEntryLoaderLeaving(false);
    setEntryLoader(target);
  }, [clearEntryLoaderTimer]);

  const hideEntryLoader = useCallback((target?: 'library' | 'canvas') => {
    setEntryLoader((current) => {
      if (!current || (target && current !== target)) {
        return current;
      }

      clearEntryLoaderTimer();

      const startedAt = entryLoaderStartedAtRef.current ?? performance.now();
      const visibleForMs = performance.now() - startedAt;
      const waitMs = shouldKeepEntryLoaderVisible({
        visibleForMs,
        minVisibleMs: ENTRY_LOADER_MIN_MS,
      })
        ? ENTRY_LOADER_MIN_MS - visibleForMs
        : 0;

      entryLoaderTimerRef.current = window.setTimeout(() => {
        setEntryLoaderLeaving(true);
        entryLoaderTimerRef.current = window.setTimeout(() => {
          entryLoaderStartedAtRef.current = null;
          entryLoaderTimerRef.current = null;
          setEntryLoader(null);
          setEntryLoaderLeaving(false);
        }, ENTRY_LOADER_EXIT_MS);
      }, waitMs);

      return current;
    });
  }, [clearEntryLoaderTimer]);

  useEffect(() => {
    if (mode === 'hero') return;

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAppVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  useEffect(() => clearEntryLoaderTimer, [clearEntryLoaderTimer]);

  const showAppMode = (nextMode: Exclude<Mode, 'hero'>) => {
    setAppVisible(false);
    setMode(nextMode);
  };

  const showCanvasAfterProjectOpen = () => {
    showEntryLoader('canvas');
    showAppMode('canvas');
  };

  const enterApp = () => {
    if (heroLeaving) return;
    setHeroLeaving(true);

    void getStoredProjectRecordCount()
      .then((projectCount) => {
        setKnownProjectCount(projectCount);
        if (shouldShowProjectLibraryEntryLoader(projectCount)) {
          showEntryLoader('library');
        }
      })
      .catch(() => {
        showEntryLoader('library');
      });

    window.setTimeout(() => {
      showAppMode('library');
      setHeroLeaving(false);
    }, FADE_MS);
  };

  const backToHero = () => {
    setAppVisible(false);
    clearEntryLoaderTimer();
    setEntryLoader(null);
    setEntryLoaderLeaving(false);
    entryLoaderStartedAtRef.current = null;
    setMode('hero');
  };

  return (
    <main className="fixed inset-0 h-full w-full overflow-hidden bg-gl-app text-gl-text-primary">
      {mode === 'hero' && (
        <GenLinkHero onEnter={enterApp} isLeaving={heroLeaving} />
      )}

      {mode !== 'hero' && (
        <div
          className="h-full w-full will-change-[opacity,transform,filter]"
          style={{
            opacity: appVisible ? 1 : 0,
            transform: appVisible && (!entryLoader || entryLoaderLeaving) ? 'scale(1)' : 'scale(0.992)',
            filter: appVisible && (!entryLoader || entryLoaderLeaving) ? 'blur(0px)' : 'blur(6px)',
            transitionProperty: 'opacity, transform, filter',
            transitionDuration: `${entryLoader ? ENTRY_LOADER_EXIT_MS : FADE_MS}ms`,
            transitionTimingFunction: ENTRY_EASING,
          }}
        >
          {mode === 'library' ? (
            <ProjectLibrary
              onOpenProject={showCanvasAfterProjectOpen}
              onBackToHero={backToHero}
              onProjectsReady={(projectCount) => {
                setKnownProjectCount(projectCount);
                if (!shouldShowProjectLibraryEntryLoader(projectCount)) {
                  hideEntryLoader('library');
                  return;
                }

                hideEntryLoader('library');
              }}
            />
          ) : (
            <InfiniteCanvas
              onBackToLibrary={() => {
                if (shouldShowProjectLibraryEntryLoader(knownProjectCount)) {
                  showEntryLoader('library');
                }

                showAppMode('library');
              }}
              onCanvasReady={() => {
                hideEntryLoader('canvas');
              }}
            />
          )}
        </div>
      )}

      {entryLoader ? (
        <div
          className="fixed inset-0 z-[180] flex flex-col items-center justify-center bg-[#08090b] text-white will-change-[opacity,transform,filter]"
          style={{
            opacity: entryLoaderLeaving ? 0 : 1,
            transform: entryLoaderLeaving ? 'scale(1.018)' : 'scale(1)',
            filter: entryLoaderLeaving ? 'blur(8px)' : 'blur(0px)',
            transitionProperty: 'opacity, transform, filter',
            transitionDuration: `${ENTRY_LOADER_EXIT_MS}ms`,
            transitionTimingFunction: ENTRY_EASING,
          }}
        >
          <UniqueLoading variant="squares" size="lg" />
          <div
            className="mt-6 text-[12px] font-medium text-white/58"
            style={{
              opacity: entryLoaderLeaving ? 0 : 1,
              transform: entryLoaderLeaving ? 'translateY(-3px)' : 'translateY(0)',
              transitionProperty: 'opacity, transform',
              transitionDuration: `${Math.round(ENTRY_LOADER_EXIT_MS * 0.72)}ms`,
              transitionTimingFunction: ENTRY_EASING,
            }}
          >
            {entryLoader === 'library'
              ? knownProjectCount === null
                ? '正在检查项目库'
                : '正在加载项目库'
              : '正在进入画布'}
          </div>
        </div>
      ) : null}
    </main>
  );
}
