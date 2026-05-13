'use client';

import React from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Pilcrow, Copy } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface TextNodeFloatingToolbarProps {
  nodeId?: string;
  visible: boolean;
  onPickBgColor?: () => void;
  onSetHeading?: (level: 1 | 2 | 3 | 0) => void;
  onCopyContent?: () => void;
}

function HeadingButton({ level, onClick }: { level: 1 | 2 | 3; onClick?: () => void }) {
  return (
    <div className="group/tooltip relative">
      <button
        onClick={onClick}
        aria-label={`标题 ${level}`}
        className="w-9 h-9 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
      >
        <span className="text-[12px] font-medium leading-none">
          H<sub className="text-[9px]">{level}</sub>
        </span>
      </button>
      <Tooltip label={`标题 ${level}`} side="top" />
    </div>
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
        data-canvas-menu-ignore="true"
        onPointerDown={(e) => e.stopPropagation()}
        className="bg-gl-panel/95 backdrop-blur-md border border-gl-stroke-soft rounded-gl-pill shadow-gl-toolbar px-3 py-2 flex items-center gap-1.5"
      >
        <div className="group/tooltip relative">
          <button
            onClick={onPickBgColor}
            aria-label="背景颜色"
            className="w-9 h-9 flex items-center justify-center rounded-gl-pill hover:bg-gl-panel-hover transition-colors"
          >
            <span className="block w-5 h-5 rounded-full bg-white" />
          </button>
          <Tooltip label="背景颜色" side="top" />
        </div>

        <div className="w-px h-5 bg-gl-stroke-soft mx-1" />

        <HeadingButton level={1} onClick={() => onSetHeading?.(1)} />
        <HeadingButton level={2} onClick={() => onSetHeading?.(2)} />
        <HeadingButton level={3} onClick={() => onSetHeading?.(3)} />
        <div className="group/tooltip relative">
          <button
            onClick={() => onSetHeading?.(0)}
            aria-label="正文"
            className="w-9 h-9 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          >
            <Pilcrow size={15} />
          </button>
          <Tooltip label="正文" side="top" />
        </div>

        <div className="w-px h-5 bg-gl-stroke-soft mx-1" />

        <div className="group relative">
          <button
            onClick={onCopyContent}
            aria-label="复制内容"
            className="w-9 h-9 flex items-center justify-center rounded-gl-sm text-gl-text-secondary hover:text-gl-text-primary hover:bg-gl-panel-hover transition-colors"
          >
            <Copy size={15} />
          </button>
          <Tooltip label="复制内容" side="top" />
        </div>
      </div>
    </NodeToolbar>
  );
}
