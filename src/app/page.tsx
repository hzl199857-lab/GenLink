'use client';

import React from 'react';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';

export default function HomePage() {
  return (
    <main className="fixed inset-0 w-full h-full bg-gl-app overflow-hidden text-gl-text-primary">
      <InfiniteCanvas />
    </main>
  );
}
