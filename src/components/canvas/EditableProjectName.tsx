'use client';

import React, { useEffect, useRef, useState } from 'react';

type EditableProjectNameProps = {
  value: string;
  busy?: boolean;
  writeBlocked?: boolean;
  onCommit?: (value: string) => void | Promise<void>;
  onEditStart?: () => void;
};

export function EditableProjectName({
  value,
  busy = false,
  writeBlocked = false,
  onCommit,
  onEditStart,
}: EditableProjectNameProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const displayValue = value.trim() || '未命名工作区';

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancel = () => {
    setDraft(displayValue);
    setEditing(false);
  };

  const commit = () => {
    const nextValue = draft.trim();
    setEditing(false);

    if (!nextValue || nextValue === displayValue) {
      setDraft(displayValue);
      return;
    }

    void onCommit?.(nextValue);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={busy || writeBlocked}
        aria-label="项目名称"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        className="h-8 min-w-[60px] max-w-[220px] border-0 bg-transparent px-2 text-[13px] font-medium text-white outline-none selection:bg-[#2f6fed]"
        style={{ width: `${Math.min(Math.max(draft.length + 1, 5), 22)}ch` }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={busy || writeBlocked}
      title={displayValue}
      className="max-w-[220px] truncate rounded-[7px] px-2 py-1.5 text-left text-[13px] font-medium text-white/92 transition hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none"
      onClick={() => {
        onEditStart?.();
        setDraft(displayValue);
        setEditing(true);
      }}
    >
      {displayValue}
    </button>
  );
}
