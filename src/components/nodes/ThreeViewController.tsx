'use client';

import React from 'react';
import { ArrowUp, RotateCcw, X } from 'lucide-react';
import { THREE_VIEW_DEFAULT_ANGLE } from '@/lib/three-view-defaults';

export interface ThreeViewControllerValue {
  rotation: number;
  pitch: number;
  scale: number;
}

export interface ThreeViewControllerProps {
  visible: boolean;
  value: ThreeViewControllerValue;
  imageUrl?: string;
  onChange: (next: ThreeViewControllerValue) => void;
  onGenerate: () => void;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPreviewScale(value: number): number {
  return 0.5 + clamp(value, 0.1, 2);
}

function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`;
}

function formatScale(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-[12px] font-medium">
        <span className="text-[#8E8E8E]">{label}</span>
        <span className="font-mono text-[12px] text-[#EFEFEF]">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="three-view-slider nodrag nopan h-1.5 w-full cursor-pointer appearance-none rounded-full"
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function CubeFaceLabel({
  label,
  transform,
}: {
  label: string;
  transform: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]"
      style={{ transform }}
    >
      {label}
    </div>
  );
}

function CubePreview({
  value,
  imageUrl,
  onChange,
  onReset,
}: {
  value: ThreeViewControllerValue;
  imageUrl?: string;
  onChange: (next: ThreeViewControllerValue) => void;
  onReset: () => void;
}) {
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startValue: ThreeViewControllerValue;
  } | null>(null);
  const faceStyle = imageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(255,255,255,0.03), rgba(0,0,0,0.2)), url("${imageUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/[0.06] bg-[#252525] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
      <div
        className="relative h-[82px] w-[82px] cursor-grab touch-none active:cursor-grabbing"
        style={{ perspective: '720px' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startValue: value,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;

          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }

          event.stopPropagation();
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;

          onChange({
            ...drag.startValue,
            rotation: clamp(drag.startValue.rotation + deltaX * 0.45, -180, 180),
            pitch: clamp(drag.startValue.pitch + deltaY * 0.35, -60, 60),
          });
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          dragRef.current = null;
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
            transform: `scale(${getPreviewScale(value.scale)}) rotateX(${-clamp(value.pitch, -60, 60)}deg) rotateY(${clamp(value.rotation, -180, 180)}deg)`,
          }}
        >
          <div className="absolute inset-0 rounded-[3px] border border-white/16 bg-white/[0.05]" style={{ ...faceStyle, transform: 'translateZ(41px)' }} />
          <div className="absolute inset-0 rounded-[3px] border border-white/10 bg-[#232427]" style={{ transform: 'rotateY(180deg) translateZ(41px)' }} />
          <div className="absolute inset-0 rounded-[3px] border border-white/10 bg-[#1C1D20]" style={{ transform: 'rotateY(90deg) translateZ(41px)' }} />
          <div className="absolute inset-0 rounded-[3px] border border-white/10 bg-[#202124]" style={{ transform: 'rotateY(-90deg) translateZ(41px)' }} />
          <div className="absolute inset-0 rounded-[3px] border border-white/10 bg-[#2D2E31]" style={{ transform: 'rotateX(90deg) translateZ(41px)' }} />
          <div className="absolute inset-0 rounded-[3px] border border-white/10 bg-[#17181A]" style={{ transform: 'rotateX(-90deg) translateZ(41px)' }} />
          <CubeFaceLabel label="后" transform="rotateY(180deg) translateZ(42px)" />
          <CubeFaceLabel label="右" transform="rotateY(90deg) translateZ(42px)" />
          <CubeFaceLabel label="左" transform="rotateY(-90deg) translateZ(42px)" />
          <CubeFaceLabel label="上" transform="rotateX(90deg) translateZ(42px)" />
          <CubeFaceLabel label="下" transform="rotateX(-90deg) translateZ(42px)" />
        </div>
      </div>

      <button
        type="button"
        className="absolute left-3.5 bottom-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onReset}
      >
        <RotateCcw size={13} />
        重置
      </button>
    </div>
  );
}

export function ThreeViewController({
  visible,
  value,
  imageUrl,
  onChange,
  onGenerate,
  onClose,
}: ThreeViewControllerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="nodrag nopan relative h-[325px] w-[650px] rounded-[19px] border border-white/10 bg-[#1B1B1B] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.54)]">
      <div className="flex h-8 items-center justify-between">
        <div className="text-[16px] font-semibold text-white">拖拽方块调整角度</div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/8"
          aria-label="关闭"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>

      <div className="grid h-[calc(100%-40px)] min-h-0 grid-cols-[1.05fr_1fr] gap-6 pt-2">
        <CubePreview
          value={value}
          imageUrl={imageUrl}
          onChange={onChange}
          onReset={() => onChange(THREE_VIEW_DEFAULT_ANGLE)}
        />

        <div className="grid min-h-0 content-start gap-5 pt-1 pr-1">
          <SliderRow
            label="旋转"
            min={-180}
            max={180}
            step={1}
            value={value.rotation}
            displayValue={formatAngle(value.rotation)}
            onChange={(next) => onChange({ ...value, rotation: next })}
          />
          <SliderRow
            label="倾斜"
            min={-60}
            max={60}
            step={1}
            value={value.pitch}
            displayValue={formatAngle(value.pitch)}
            onChange={(next) => onChange({ ...value, pitch: next })}
          />
          <SliderRow
            label="缩放"
            min={0.1}
            max={2}
            step={0.01}
            value={value.scale}
            displayValue={formatScale(value.scale)}
            onChange={(next) => onChange({ ...value, scale: next })}
          />

          <div className="pt-1">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="hidden"
                onPointerDown={(event) => event.stopPropagation()}
              >
                广角镜头
              </button>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="absolute bottom-6 right-6 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black shadow-sm transition-colors hover:bg-gray-200"
                  aria-label="生成"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onGenerate}
                >
                  <ArrowUp size={12} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
