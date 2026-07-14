'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { MidjourneyGenerationSettings } from '@/types/canvas';

const STYLIZE_PRESETS = [50, 100, 250, 750] as const;
const WEIRD_PRESETS = [0, 100, 500] as const;
const CHAOS_PRESETS = [0, 15, 35] as const;
const QUALITY_OPTIONS = [1, 2] as const;

export interface MidjourneySettingsPanelProps {
  value: Required<MidjourneyGenerationSettings>;
  onChange: (next: Required<MidjourneyGenerationSettings>) => void;
}

function PresetButtons({
  options,
  selected,
  onSelect,
}: {
  options: readonly number[];
  selected: number;
  onSelect: (next: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={[
            'h-8 min-w-12 rounded-[8px] border px-2.5 text-[12px] font-medium transition-colors',
            option === selected
              ? 'border-white/20 bg-white/[0.12] text-gl-text-primary'
              : 'border-white/[0.08] bg-white/[0.04] text-gl-text-muted hover:bg-white/[0.08] hover:text-gl-text-primary',
          ].join(' ')}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function MidjourneySettingsPanel({
  value,
  onChange,
}: MidjourneySettingsPanelProps) {
  const [draftSettings, setDraftSettings] = useState(value);
  const draftSettingsRef = useRef(value);
  const isSliderDraggingRef = useRef(false);

  useEffect(() => {
    if (isSliderDraggingRef.current) {
      return;
    }

    draftSettingsRef.current = value;
    setDraftSettings(value);
  }, [value]);

  const updateDraftSettings = (next: Required<MidjourneyGenerationSettings>) => {
    draftSettingsRef.current = next;
    setDraftSettings(next);
  };

  const commitSettings = (next: Required<MidjourneyGenerationSettings>) => {
    updateDraftSettings(next);
    onChange(next);
  };

  const handleSliderChange = (
    setting: 'stylize' | 'weird' | 'chaos',
    nextValue: number,
  ) => {
    const next: Required<MidjourneyGenerationSettings> = {
      ...draftSettingsRef.current,
      [setting]: nextValue,
    };

    updateDraftSettings(next);
    if (!isSliderDraggingRef.current) {
      onChange(next);
    }
  };

  const handleSliderPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    isSliderDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSliderPointerUp = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (!isSliderDraggingRef.current) {
      return;
    }

    isSliderDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange(draftSettingsRef.current);
  };

  return (
    <div
      className="nodrag nopan nowheel absolute bottom-full left-0 mb-2 w-[360px] rounded-[8px] border border-white/10 bg-[#121417] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.42)] notranslate"
      translate="no"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold text-gl-text-primary">Midjourney V8.1</div>
          <div className="mt-0.5 text-[11px] text-gl-text-muted">调整生成风格，选择后自动应用</div>
        </div>
        <span className="rounded-[6px] bg-white/[0.06] px-2 py-1 text-[11px] text-gl-text-tertiary">
          高级设置
        </span>
      </div>

      <div className="space-y-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[13px] font-medium text-gl-text-secondary">风格化</label>
            <span className="text-[12px] tabular-nums text-gl-text-primary">{draftSettings.stylize}</span>
          </div>
          <PresetButtons
            options={STYLIZE_PRESETS}
            selected={draftSettings.stylize}
            onSelect={(stylize) => commitSettings({ ...draftSettingsRef.current, stylize })}
          />
          <input
            aria-label="风格化"
            type="range"
            min={0}
            max={1000}
            step={10}
            value={draftSettings.stylize}
            onPointerDown={handleSliderPointerDown}
            onPointerUp={handleSliderPointerUp}
            onPointerCancel={handleSliderPointerUp}
            onChange={(event) => handleSliderChange('stylize', Number(event.target.value))}
            className="nodrag nopan nowheel mt-2 h-1.5 w-full cursor-pointer accent-white"
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[13px] font-medium text-gl-text-secondary">奇异度</label>
            <span className="text-[12px] tabular-nums text-gl-text-primary">{draftSettings.weird}</span>
          </div>
          <PresetButtons
            options={WEIRD_PRESETS}
            selected={draftSettings.weird}
            onSelect={(weird) => commitSettings({ ...draftSettingsRef.current, weird })}
          />
          <input
            aria-label="奇异度"
            type="range"
            min={0}
            max={3000}
            step={50}
            value={draftSettings.weird}
            onPointerDown={handleSliderPointerDown}
            onPointerUp={handleSliderPointerUp}
            onPointerCancel={handleSliderPointerUp}
            onChange={(event) => handleSliderChange('weird', Number(event.target.value))}
            className="nodrag nopan nowheel mt-2 h-1.5 w-full cursor-pointer accent-white"
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[13px] font-medium text-gl-text-secondary">混乱度</label>
            <span className="text-[12px] tabular-nums text-gl-text-primary">{draftSettings.chaos}</span>
          </div>
          <PresetButtons
            options={CHAOS_PRESETS}
            selected={draftSettings.chaos}
            onSelect={(chaos) => commitSettings({ ...draftSettingsRef.current, chaos })}
          />
          <input
            aria-label="混乱度"
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftSettings.chaos}
            onPointerDown={handleSliderPointerDown}
            onPointerUp={handleSliderPointerUp}
            onPointerCancel={handleSliderPointerUp}
            onChange={(event) => handleSliderChange('chaos', Number(event.target.value))}
            className="nodrag nopan nowheel mt-2 h-1.5 w-full cursor-pointer accent-white"
          />
        </section>

        <section>
          <div className="mb-2 text-[13px] font-medium text-gl-text-secondary">生成质量</div>
          <div className="grid grid-cols-2 gap-1 rounded-[8px] bg-white/[0.06] p-1">
            {QUALITY_OPTIONS.map((quality) => (
              <button
                key={quality}
                type="button"
                onClick={() => commitSettings({ ...draftSettingsRef.current, quality })}
                className={[
                  'h-9 rounded-[6px] text-[13px] font-medium transition-colors',
                  quality === draftSettings.quality
                    ? 'bg-white/[0.12] text-gl-text-primary'
                    : 'text-gl-text-muted hover:bg-white/[0.06] hover:text-gl-text-primary',
                ].join(' ')}
              >
                {quality === 1 ? '标准 · 1' : '精细 · 2'}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
