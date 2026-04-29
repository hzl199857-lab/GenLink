import React from 'react';
import { clsx } from 'clsx';

export interface NodeShellProps {
  children: React.ReactNode;
  state?: 'default' | 'hover' | 'selected' | 'loading' | 'error';
  className?: string;
  minWidth?: number;
}

export function NodeShell({
  children,
  state = 'default',
  className,
  minWidth = 280,
}: NodeShellProps) {
  return (
    <div
      style={{ minWidth }}
      className={clsx(
        "node-connectable-card relative rounded-gl-xl bg-gl-panel border border-gl-stroke-subtle backdrop-blur-sm shadow-gl-card transition-all duration-150 ease-out",
        {
          "hover:shadow-gl-cardHover hover:bg-gl-panel-hover": state === 'default',
          "shadow-gl-cardHover bg-gl-panel-hover": state === 'hover',
          "border-gl-stroke-medium shadow-gl-glow": state === 'selected',
          "animate-pulse": state === 'loading',
          "border-b border-b-gl-error": state === 'error',
        },
        className
      )}
    >
      {children}
    </div>
  );
}
