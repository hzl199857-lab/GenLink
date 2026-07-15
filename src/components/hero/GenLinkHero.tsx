"use client";

import dynamic from "next/dynamic";

import {
  HeroAgentComposer,
  type HeroAgentComposerProps,
} from "@/components/hero/HeroAgentComposer";
import {
  HeroRecentProjects,
  type HeroRecentProjectsProps,
} from "@/components/hero/HeroRecentProjects";

const CanvasRevealEffect = dynamic(
  () =>
    import("@/components/ui/CanvasRevealEffect").then(
      (module) => module.CanvasRevealEffect,
    ),
  { ssr: false },
);

interface GenLinkHeroProps {
  composer: HeroAgentComposerProps;
  recentProjects?: HeroRecentProjectsProps;
  isLeaving?: boolean;
}

const HERO_PARTICLE_COLORS = [
  [255, 255, 255],
  [255, 255, 255],
];

export function GenLinkHero({
  composer,
  recentProjects,
  isLeaving = false,
}: GenLinkHeroProps) {
  return (
    <div
      className="relative h-full w-full overflow-y-auto bg-black text-white transition-opacity duration-500 ease-out"
      style={{ opacity: isLeaving ? 0 : 1 }}
    >
      <div className="pointer-events-none fixed inset-0 z-0">
        <CanvasRevealEffect
          animationSpeed={3}
          startTimeOffsetMs={1300}
          containerClassName="bg-black"
          colors={HERO_PARTICLE_COLORS}
          dotSize={6}
          reverse={false}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.98)_0%,_rgba(0,0,0,0.56)_48%,_rgba(0,0,0,0.16)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[960px] flex-col items-center px-4 pb-10 pt-14 sm:px-7 sm:pt-16 lg:justify-center lg:py-12">
        <div className="w-full">
          <header className="text-center">
            <h1 className="flex justify-center" aria-label="GenLink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/genlink-hero-logo.png"
                alt="GenLink"
                className="h-auto w-[250px] select-none sm:w-[390px] lg:w-[470px]"
                draggable={false}
              />
            </h1>
            <p className="mx-auto mt-3 max-w-[34rem] text-[13px] font-light leading-5 text-white/48 sm:text-[14px]">
              <span className="block">无需任何设计技能，</span>
              <span className="block">几秒钟内即可将你的想法转化为高质量的视觉内容</span>
            </p>
          </header>

          <div className="mx-auto mt-7 w-full max-w-[900px] sm:mt-8">
            <HeroAgentComposer {...composer} />
            {recentProjects ? <HeroRecentProjects {...recentProjects} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
