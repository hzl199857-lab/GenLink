'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';

export interface EditableNodeTitleProps {
  value?: string;
  fallbackValue: string;
  className?: string;
  inputClassName?: string;
  editRequestId?: number;
  onCommit?: (nextTitle: string | undefined) => void;
}

function normalizeTitle(value: string): string | undefined {
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

export function getEditableNodeTitleInputClassName(inputClassName?: string) {
  return [inputClassName, 'pointer-events-auto'].filter(Boolean).join(' ');
}

export function EditableNodeTitle({
  value,
  fallbackValue,
  className,
  inputClassName,
  editRequestId,
  onCommit,
}: EditableNodeTitleProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastEditRequestIdRef = useRef<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.trim() || fallbackValue);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [editing, fallbackValue, value]);

  useEffect(() => {
    if (editRequestId === undefined || editRequestId === lastEditRequestIdRef.current) {
      return;
    }

    lastEditRequestIdRef.current = editRequestId;
    setDraft(value?.trim() || fallbackValue);
    setEditing(true);
  }, [editRequestId, fallbackValue, value]);

  const commit = () => {
    const normalized = normalizeTitle(draft);
    const nextTitle =
      normalized && normalized !== fallbackValue ? normalized : undefined;
    onCommit?.(nextTitle);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value?.trim() || fallbackValue);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        className={getEditableNodeTitleInputClassName(inputClassName)}
        style={{ width: `${Math.max((draft || fallbackValue).length + 1, 6)}ch` }}
      />
    );
  }

  return (
    <span className="group/tooltip relative inline-flex">
      <span
        className={className}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraft(value?.trim() || fallbackValue);
          setEditing(true);
        }}
      >
        {value?.trim() || fallbackValue}
      </span>
      <Tooltip label="双击重命名" side="top" />
    </span>
  );
}
