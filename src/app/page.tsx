'use client';

import React, { useEffect, useState } from 'react';
import { GenLinkHero } from '@/components/hero/GenLinkHero';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { ProjectLibrary } from '@/components/project/ProjectLibrary';

type Mode = 'hero' | 'library' | 'canvas';

const FADE_MS = 500;

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('hero');
  const [heroLeaving, setHeroLeaving] = useState(false);
  const [appVisible, setAppVisible] = useState(false);

  useEffect(() => {
    if (mode === 'hero') {
      setAppVisible(false);
      return;
    }
    setAppVisible(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAppVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const enterApp = () => {
    if (heroLeaving) return;
    setHeroLeaving(true);
    setTimeout(() => {
      setMode('library');
      setHeroLeaving(false);
    }, FADE_MS);
  };

  const backToHero = () => {
    setMode('hero');
  };

  return (
    <main className="fixed inset-0 h-full w-full overflow-hidden bg-gl-app text-gl-text-primary">
      {mode === 'hero' && (
        <GenLinkHero onEnter={enterApp} isLeaving={heroLeaving} />
      )}

      {mode !== 'hero' && (
        <div
          className="h-full w-full transition-opacity ease-out"
          style={{
            opacity: appVisible ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
        >
          {mode === 'library' ? (
            <ProjectLibrary
              onOpenProject={() => setMode('canvas')}
              onBackToHero={backToHero}
            />
          ) : (
            <InfiniteCanvas onBackToLibrary={() => setMode('library')} />
          )}
        </div>
      )}
    </main>
  );
}
