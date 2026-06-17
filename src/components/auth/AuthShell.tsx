"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { AuthNav } from "@/components/auth/AuthNav";
import { cn } from "@/lib/utils";

const CanvasRevealEffect = dynamic(
  () =>
    import("@/components/ui/CanvasRevealEffect").then((m) => m.CanvasRevealEffect),
  { ssr: false },
);

const AUTH_PARTICLE_COLORS = [
  [255, 255, 255],
  [255, 255, 255],
];

interface AuthShellProps {
  children: ReactNode;
  className?: string;
}

export function AuthShell({ children, className }: AuthShellProps) {
  return (
    <main className={cn("relative min-h-screen overflow-hidden bg-black text-white", className)}>
      <div className="absolute inset-0 z-0">
        <CanvasRevealEffect
          animationSpeed={3}
          startTimeOffsetMs={1300}
          containerClassName="bg-black"
          colors={AUTH_PARTICLE_COLORS}
          dotSize={6}
          reverse={false}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <AuthNav />

        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
