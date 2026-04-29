'use client';

import React from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Pilcrow, Copy } from 'lucide-react';

export interface TextNodeFloatingToolbarProps {
  nodeId?: string;
  visible: boolean;
  onPickBgColor?: () => void;
  onSetHeading?: (level: 1 | 2 | 3 | 0) => void;
  onCopyContent?: () => void;
}

function HeadingButton({ level, onClick }: { level: 1 | 2 | 3; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
      title={`Heading ${level}`}
    >
      <span className="text-[11px] font-medium leading-none">
        H<sub className="text-[8px]">{level}</sub>
      </span>
    </button>
  );
}

export function TextNodeFloatingToolbar({
  nodeId,
  visible,
  onPickBgColor,
  onSetHeading,
  onCopyContent,
}: TextNodeFloatingToolbarProps) {
  if (!visible) return null;

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={visible}
      position={Position.Top}
      offset={16}
      align="center"
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="bg-gl-panel/95 backdrop-blur-md border border-gl-stroke-soft rounded-gl-pill shadow-gl-toolbar px-2 py-1.5 flex items-center gap-1"
      >
        <button
          onClick={onPickBgColor}
          className="w-7 h-7 flex items-center justify-center rounded-gl-pill hover:bg-gl-panel-hover transition-colors"
          title="Background color"
        >
          <span className="block w-4 h-4 rounded-full bg-white" />
        </button>

        <div className="w-px h-4 bg-gl-stroke-soft mx-1" />

        <HeadingButton level={1} onClick={() => onSetHeading?.(1)} />
        <HeadingButton level={2} onClick={() => onSetHeading?.(2)} />
        <HeadingButton level={3} onClick={() => onSetHeading?.(3)} />
        <button
          onClick={() => onSetHeading?.(0)}
          className="w-7 h-7 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          title="Body text"
        >
          <Pilcrow size={13} />
        </button>

        <div className="w-px h-4 bg-gl-stroke-soft mx-1" />

        <button
          onClick={onCopyContent}
          className="w-7 h-7 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          title="Copy content"
        >
          <Copy size={13} />
        </button>
      </div>
    </NodeToolbar>
  );
}
