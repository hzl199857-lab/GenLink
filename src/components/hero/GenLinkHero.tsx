'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { ShinyButton } from '@/components/ui/ShinyButton';

const CanvasRevealEffect = dynamic(
  () =>
    import('@/components/ui/CanvasRevealEffect').then((m) => m.CanvasRevealEffect),
  { ssr: false },
);

interface GenLinkHeroProps {
  onEnter: () => void;
  isLeaving?: boolean;
}

const HERO_PARTICLE_COLORS = [
  [255, 255, 255],
  [255, 255, 255],
];

export function GenLinkHero({ onEnter, isLeaving = false }: GenLinkHeroProps) {
  return (
    <div
      className="relative flex min-h-screen w-full flex-col bg-black transition-opacity duration-500 ease-out"
      style={{ opacity: isLeaving ? 0 : 1 }}
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0">
          <CanvasRevealEffect
            animationSpeed={3}
            startTimeOffsetMs={1300}
            containerClassName="bg-black"
            colors={HERO_PARTICLE_COLORS}
            dotSize={6}
            reverse={false}
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="mt-[120px] w-full max-w-3xl sm:mt-[140px]">
            <div className="text-center">
              <h1 className="flex justify-center" aria-label="GenLink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/genlink-hero-logo.png"
                  alt="GenLink"
                  className="h-auto w-[280px] select-none sm:w-[440px] lg:w-[600px]"
                  draggable={false}
                  suppressHydrationWarning
                />
              </h1>
              <p className="mx-auto mt-6 max-w-[34rem] text-[1rem] font-light leading-relaxed text-white/55 sm:mt-8 sm:text-[1.05rem]">
                Turn your ideas into high-quality visuals in seconds,
                <br className="hidden sm:block" />
                {' '}no design skills needed.
              </p>
              <div className="mt-9 flex justify-center">
                <ShinyButton onClick={onEnter}>
                  Generate image <span aria-hidden="true">→</span>
                </ShinyButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
