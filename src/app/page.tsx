'use client';

import React, { useState } from 'react';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { ProjectLibrary } from '@/components/project/ProjectLibrary';

export default function HomePage() {
  const [mode, setMode] = useState<'library' | 'canvas'>('library');

  return (
    <main className="fixed inset-0 w-full h-full bg-gl-app overflow-hidden text-gl-text-primary">
      {mode === 'library' ? (
        <ProjectLibrary onOpenProject={() => setMode('canvas')} />
      ) : (
        <InfiniteCanvas onBackToLibrary={() => setMode('library')} />
      )}
    </main>
  );
}
