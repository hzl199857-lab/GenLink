"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AgentPanelSelectOption<TValue extends string> = {
  value: TValue;
  label: string;
};

export function AgentPanelSelect<TValue extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: TValue;
  options: AgentPanelSelectOption<TValue>[];
  disabled?: boolean;
  onChange: (value: TValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.08em] text-white/36">
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg bg-white/[0.055] px-3 text-left text-xs font-medium text-white/82 outline-none transition focus-visible:outline-none",
          disabled
            ? "cursor-not-allowed opacity-55"
            : "hover:bg-white/[0.085] focus:bg-white/[0.085]",
        ].join(" ")}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <ChevronRight size={14} className="shrink-0 text-white/34" />
      </button>
      {open && !disabled ? (
        <div
          role="listbox"
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-full min-w-[152px] overflow-hidden rounded-xl border border-[#2f3239] bg-[#101217] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.48)]"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs outline-none transition focus-visible:bg-white/[0.1]",
                  selected
                    ? "bg-white/[0.12] font-semibold text-white"
                    : "text-white/62 hover:bg-white/[0.075] hover:text-white/86",
                ].join(" ")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <ChevronRight
                  size={13}
                  className={selected ? "text-white/52" : "text-white/24"}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
