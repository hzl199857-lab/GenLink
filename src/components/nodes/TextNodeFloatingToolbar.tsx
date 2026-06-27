'use client';

import React from 'react';
import { NodeToolbar, Position } from 'reactflow';
import { Copy, Pilcrow } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface TextNodeFloatingToolbarProps {
  nodeId?: string;
  visible: boolean;
  backgroundColor?: string;
  onBackgroundColorChange?: (backgroundColor: string | undefined) => void;
  onSetHeading?: (level: 1 | 2 | 3 | 0) => void;
  onCopyContent?: () => void;
}

const BACKGROUND_COLORS = [
  { label: 'Red', value: '#3d2629' },
  { label: 'Orange', value: '#3d2d1f' },
  { label: 'Yellow', value: '#38341e' },
  { label: 'Green', value: '#253a29' },
  { label: 'Teal', value: '#20363c' },
  { label: 'Blue', value: '#233149' },
  { label: 'Purple', value: '#34263b' },
] as const;

function HeadingButton({
  level,
  onClick,
}: {
  level: 1 | 2 | 3;
  onClick?: () => void;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Heading ${level}`}
        className="flex h-9 w-9 items-center justify-center rounded-gl-sm text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
      >
        <span className="text-[12px] font-medium leading-none">
          H<sub className="text-[9px]">{level}</sub>
        </span>
      </button>
      <Tooltip label={`H${level}`} side="top" />
    </div>
  );
}

export function TextNodeFloatingToolbar({
  nodeId,
  visible,
  backgroundColor,
  onBackgroundColorChange,
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
        onPointerDown={(event) => event.stopPropagation()}
        className="flex items-center gap-1.5 rounded-gl-pill border border-gl-stroke-soft bg-gl-panel/95 px-3 py-2 shadow-gl-toolbar backdrop-blur-md"
      >
        <TextBackgroundColorButton
          value={backgroundColor}
          onChange={onBackgroundColorChange}
        />

        <div className="mx-1 h-5 w-px bg-gl-stroke-soft" />

        <HeadingButton level={1} onClick={() => onSetHeading?.(1)} />
        <HeadingButton level={2} onClick={() => onSetHeading?.(2)} />
        <HeadingButton level={3} onClick={() => onSetHeading?.(3)} />
        <div className="group/tooltip relative">
          <button
            type="button"
            onClick={() => onSetHeading?.(0)}
            aria-label="正文"
            className="flex h-9 w-9 items-center justify-center rounded-gl-sm text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
          >
            <Pilcrow size={15} />
          </button>
          <Tooltip label="正文" side="top" />
        </div>

        <div className="mx-1 h-5 w-px bg-gl-stroke-soft" />

        <div className="group/tooltip relative">
          <button
            type="button"
            onClick={onCopyContent}
            aria-label="复制内容"
            className="flex h-9 w-9 items-center justify-center rounded-gl-sm text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
          >
            <Copy size={15} />
          </button>
          <Tooltip label="Copy" side="top" />
        </div>
      </div>
    </NodeToolbar>
  );
}

function TextBackgroundColorButton({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (backgroundColor: string | undefined) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const activeColor = BACKGROUND_COLORS.find((color) => color.value === value);
  const swatchColor = activeColor?.value ?? '#ffffff';

  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label="背景色"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-gl-pill transition-colors hover:bg-gl-panel-hover"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span
          className="block h-5 w-5 rounded-full border border-white/70 shadow-[0_2px_8px_rgba(0,0,0,0.28)]"
          style={{ backgroundColor: swatchColor }}
        />
      </button>
      <Tooltip label="背景色" side="top" />

      {open ? (
        <div
          role="menu"
          aria-label="文字背景色"
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 grid -translate-x-1/2 place-items-center gap-3 rounded-[18px] border border-white/10 bg-gl-panel/95 px-3 py-3 shadow-gl-toolbar backdrop-blur-md"
          style={{
            width: 156,
            gridTemplateColumns: 'repeat(4, 24px)',
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <TextBackgroundColorMenuItem
            label="默认"
            color="#ffffff"
            selected={!activeColor}
            onClick={() => {
              onChange?.(undefined);
              setOpen(false);
            }}
          />
          {BACKGROUND_COLORS.map((color) => (
            <TextBackgroundColorMenuItem
              key={color.value}
              label={color.label}
              color={color.value}
              selected={color.value === value}
              onClick={() => {
                onChange?.(color.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextBackgroundColorMenuItem({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-label={label}
      aria-checked={selected}
      className="relative flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ backgroundColor: color }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {selected ? (
        <span className="h-2 w-2 rounded-full bg-[#1c1c1e] shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" />
      ) : null}
    </button>
  );
}
