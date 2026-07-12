'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GenLinkHero } from '@/components/hero/GenLinkHero';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { ProjectLibrary } from '@/components/project/ProjectLibrary';
import UniqueLoading from '@/components/ui/grid-loading';
import { authClient } from '@/lib/auth-client';
import { getHomeEntryDecision } from '@/lib/auth-entry';
import {
  shouldKeepEntryLoaderVisible,
  shouldShowProjectLibraryEntryLoader,
} from '@/lib/project-open-transition';
import {
  clearUpdateRefreshRestoreState,
  readUpdateRefreshRestoreState,
  writeUpdateRefreshAppMode,
  type UpdateRefreshRestoreState,
} from '@/lib/update-refresh-restore';
import { useCanvasStore } from '@/store/canvas-store';
import {
  deactivatePromptLibraryStore,
  hydratePromptLibraryForUser,
} from '@/store/prompt-library-store';

type Mode = 'hero' | 'library' | 'canvas';

const FADE_MS = 500;
const ENTRY_LOADER_MIN_MS = 650;
const ENTRY_LOADER_EXIT_MS = 420;
const ENTRY_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [initialRefreshRestore, setInitialRefreshRestore] =
    useState<UpdateRefreshRestoreState | null>(null);
  const [mode, setMode] = useState<Mode>('hero');
  const [heroLeaving] = useState(false);
  const [appVisible, setAppVisible] = useState(false);
  const [entryLoader, setEntryLoader] = useState<null | 'library' | 'canvas'>(
    null,
  );
  const [entryLoaderLeaving, setEntryLoaderLeaving] = useState(false);
  const [knownProjectCount, setKnownProjectCount] = useState<number | null>(null);
  const [refreshRestoreLoading, setRefreshRestoreLoading] = useState(false);
  const [pendingRefreshRestore, setPendingRefreshRestore] =
    useState<UpdateRefreshRestoreState | null>(
      null,
    );
  const entryLoaderStartedAtRef = useRef<number | null>(null);
  const entryLoaderTimerRef = useRef<number | null>(null);
  const handledAppEntryRef = useRef(false);
  const refreshRestoreStartedRef = useRef(false);

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
    if (session.isPending) {
      return;
    }

    if (!userId) {
      useCanvasStore.getState().setActiveUserId(null);
      deactivatePromptLibraryStore();
      const timer = window.setTimeout(() => {
        setInitialRefreshRestore(null);
        setPendingRefreshRestore(null);
        setReadyUserId(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    clearEntryLoaderTimer();
    useCanvasStore.getState().setActiveUserId(userId);

    void (async () => {
      try {
        await hydratePromptLibraryForUser(userId);
      } catch {
        deactivatePromptLibraryStore();
      }

      if (cancelled) {
        return;
      }

      const restoreState = readUpdateRefreshRestoreState(userId);
      setInitialRefreshRestore(restoreState);
      setMode(restoreState ? 'library' : 'hero');
      setAppVisible(false);
      setKnownProjectCount(null);
      setEntryLoader(restoreState ? 'canvas' : null);
      setEntryLoaderLeaving(false);
      setRefreshRestoreLoading(Boolean(restoreState));
      setPendingRefreshRestore(
        restoreState?.mode === 'canvas' ? restoreState : null,
      );
      entryLoaderStartedAtRef.current = restoreState ? performance.now() : null;
      handledAppEntryRef.current = false;
      refreshRestoreStartedRef.current = false;
      setReadyUserId(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [clearEntryLoaderTimer, session.isPending, userId]);

  useEffect(() => {
    if (!userId || readyUserId !== userId) return;
    if (mode === 'hero') return;
    if (refreshRestoreLoading) return;

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAppVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [mode, readyUserId, refreshRestoreLoading, userId]);

  useEffect(() => clearEntryLoaderTimer, [clearEntryLoaderTimer]);

  useEffect(() => {
    if (!userId || readyUserId !== userId) return;
    writeUpdateRefreshAppMode(userId, mode);
  }, [mode, readyUserId, userId]);

  useEffect(() => {
    if (searchParams.get('app') !== 'library') {
      handledAppEntryRef.current = false;
    }
  }, [searchParams]);

  const showAppMode = useCallback((nextMode: Exclude<Mode, 'hero'>) => {
    setAppVisible(false);
    setMode(nextMode);
  }, []);

  useEffect(() => {
    if (session.isPending || !userId || readyUserId !== userId || refreshRestoreStartedRef.current) return;

    const restoreState = initialRefreshRestore ?? readUpdateRefreshRestoreState(userId);
    if (!restoreState) return;

    refreshRestoreStartedRef.current = true;
    handledAppEntryRef.current = true;

    const timer = window.setTimeout(() => {
      setRefreshRestoreLoading(true);
      setEntryLoaderLeaving(false);
      setEntryLoader('canvas');

      if (restoreState.mode === 'canvas' && restoreState.projectId) {
        setPendingRefreshRestore(restoreState);
      } else {
        setPendingRefreshRestore(null);
        clearUpdateRefreshRestoreState(userId);
      }

      setAppVisible(false);
      showAppMode('library');
      router.replace('/');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    initialRefreshRestore,
    router,
    session.data?.user,
    session.isPending,
    showAppMode,
    readyUserId,
    userId,
  ]);

  useEffect(() => {
    if (session.isPending || readyUserId !== userId || handledAppEntryRef.current) return;

    const decision = getHomeEntryDecision({
      appParam: searchParams.get('app'),
      isAuthenticated: Boolean(session.data?.user),
    });

    if (decision.action === 'redirect-login') {
      handledAppEntryRef.current = true;
      router.replace('/login');
      return;
    }

    if (decision.action !== 'open-library') {
      return;
    }

    handledAppEntryRef.current = true;

    const timer = window.setTimeout(() => {
      if (mode !== 'library') {
        showEntryLoader('library');
        showAppMode('library');
      }
      router.replace('/');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    mode,
    router,
    searchParams,
    session.data?.user,
    session.isPending,
    showAppMode,
    showEntryLoader,
    readyUserId,
    userId,
  ]);

  const showCanvasAfterProjectOpen = () => {
    if (refreshRestoreLoading) {
      showAppMode('canvas');
      return;
    }

    showEntryLoader('canvas');
    showAppMode('canvas');
  };

  const enterApp = () => {
    if (session.data?.user) {
      router.push('/?app=library');
      return;
    }

    router.push('/login');
  };

  const backToHero = () => {
    handledAppEntryRef.current = searchParams.get('app') === 'library';
    setAppVisible(false);
    clearEntryLoaderTimer();
    setEntryLoader(null);
    setEntryLoaderLeaving(false);
    entryLoaderStartedAtRef.current = null;
    setMode('hero');
    router.replace('/');
  };

  if (session.isPending || readyUserId !== userId) {
    return (
      <main className="fixed inset-0 flex h-full w-full items-center justify-center bg-[#08090b] text-white">
        <UniqueLoading variant="squares" size="lg" />
      </main>
    );
  }

  return (
    <main className="fixed inset-0 h-full w-full overflow-hidden bg-gl-app text-gl-text-primary">
      {mode === 'hero' && (
        <GenLinkHero onEnter={enterApp} isLeaving={heroLeaving} />
      )}

      {mode !== 'hero' && (
        <div
          key={`workspace:${userId}`}
          className="h-full w-full will-change-[opacity,transform,filter]"
          style={{
            opacity: refreshRestoreLoading ? 0 : appVisible ? 1 : 0,
            transform: refreshRestoreLoading
              ? 'scale(1)'
              : appVisible && (!entryLoader || entryLoaderLeaving) ? 'scale(1)' : 'scale(0.992)',
            filter: refreshRestoreLoading
              ? 'blur(0px)'
              : appVisible && (!entryLoader || entryLoaderLeaving) ? 'blur(0px)' : 'blur(6px)',
            transitionProperty: 'opacity, transform, filter',
            transitionDuration: `${refreshRestoreLoading ? 0 : entryLoader ? ENTRY_LOADER_EXIT_MS : FADE_MS}ms`,
            transitionTimingFunction: ENTRY_EASING,
          }}
        >
          {mode === 'library' ? (
            <ProjectLibrary
              userId={userId!}
              onOpenProject={showCanvasAfterProjectOpen}
              onBackToHero={backToHero}
              restoreProjectId={
                pendingRefreshRestore?.mode === 'canvas'
                  ? pendingRefreshRestore.projectId
                  : undefined
              }
              onRestoreProjectOpened={() => {
                setPendingRefreshRestore(null);
              }}
              onRestoreProjectMissing={() => {
                setRefreshRestoreLoading(false);
                setEntryLoader(null);
                setEntryLoaderLeaving(false);
                setAppVisible(true);
                setPendingRefreshRestore(null);
                clearUpdateRefreshRestoreState(userId!);
              }}
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
              userId={userId!}
              onBackToLibrary={() => {
                if (shouldShowProjectLibraryEntryLoader(knownProjectCount)) {
                  showEntryLoader('library');
                }

                showAppMode('library');
              }}
              onCanvasReady={() => {
                if (refreshRestoreLoading) {
                  setEntryLoaderLeaving(true);
                  window.setTimeout(() => {
                    setRefreshRestoreLoading(false);
                    setEntryLoader(null);
                    setEntryLoaderLeaving(false);
                    setAppVisible(true);
                  }, ENTRY_LOADER_EXIT_MS);
                  return;
                }

                hideEntryLoader('canvas');
              }}
            />
          )}
        </div>
      )}

      {entryLoader || refreshRestoreLoading ? (
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
            {refreshRestoreLoading
              ? '正在更新'
              : entryLoader === 'library'
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

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
