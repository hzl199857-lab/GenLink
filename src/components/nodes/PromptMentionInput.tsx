'use client';

import React, {
  CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NextImage from 'next/image';
import {
  createReferenceMentionToken,
  parseReferenceMentions,
  REFERENCE_MENTION_TOKEN_PREFIX,
} from '@/lib/prompt-mentions';

export type PromptMentionImage = {
  id: string;
  imageUrl: string;
  previewUrl?: string;
  alt: string;
};

type MentionOption = PromptMentionImage & {
  label: string;
};

type MentionTrigger = {
  textNode: Text;
  startOffset: number;
  endOffset: number;
  query: string;
  left: number;
  top: number;
};

export interface PromptMentionInputProps {
  value: string;
  connectedImages?: PromptMentionImage[];
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onChange?: (next: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onCompositionStateChange?: (composing: boolean) => void;
}

function getMentionLabel(image: PromptMentionImage, index: number): string {
  return `图片${index + 1}`;
}

function createPillElement(nodeId: string, label: string): HTMLSpanElement {
  const pill = document.createElement('span');
  pill.className = 'ref-pill';
  pill.contentEditable = 'false';
  pill.dataset.refNodeId = nodeId;
  pill.dataset.refLabel = label;

  const labelEl = document.createElement('span');
  labelEl.className = 'ref-pill-label';
  labelEl.textContent = `@${label}`;

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.tabIndex = -1;
  deleteButton.className = 'pill-del';
  deleteButton.dataset.refPillDelete = 'true';
  deleteButton.setAttribute('aria-label', 'Remove reference');
  deleteButton.textContent = 'x';

  pill.append(labelEl, deleteButton);

  return pill;
}

function appendSerializedText(editor: HTMLDivElement, value: string) {
  if (!value) {
    return;
  }

  if (!value.includes(REFERENCE_MENTION_TOKEN_PREFIX)) {
    editor.appendChild(document.createTextNode(value));
    return;
  }

  const tokenPattern = /\[\[ref:([^:\]]+):([^\]]*)\]\]/g;
  let cursor = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      editor.appendChild(document.createTextNode(value.slice(cursor, index)));
    }

    const mention = parseReferenceMentions(match[0])[0];

    if (mention) {
      editor.appendChild(createPillElement(mention.nodeId, mention.label));
    } else {
      editor.appendChild(document.createTextNode(match[0]));
    }

    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    editor.appendChild(document.createTextNode(value.slice(cursor)));
  }
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.classList.contains('ref-pill')) {
    const nodeId = node.dataset.refNodeId?.trim();
    const label = node.dataset.refLabel?.trim() || 'reference';

    return nodeId ? createReferenceMentionToken(nodeId, label) : '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  return Array.from(node.childNodes).map(serializeNode).join('');
}

function serializeEditor(editor: HTMLDivElement): string {
  let value = '';

  editor.childNodes.forEach((node) => {
    value += serializeNode(node);
  });

  return value;
}

function getCurrentTrigger(editor: HTMLDivElement): MentionTrigger | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.startContainer)) {
    return null;
  }

  if (range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const textNode = range.startContainer as Text;
  const beforeCaret = textNode.data.slice(0, range.startOffset);
  const match = beforeCaret.match(/@([^\s@]{0,20})$/);

  if (!match) {
    return null;
  }

  const query = match[1] || '';
  const startOffset = range.startOffset - query.length - 1;
  const rect = range.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const left = rect.left
    ? rect.left - editorRect.left
    : 0;
  const top = rect.bottom
    ? rect.bottom - editorRect.top + 6
    : 28;

  return {
    textNode,
    startOffset,
    endOffset: range.startOffset,
    query,
    left: Math.max(0, left),
    top: Math.max(28, top),
  };
}

function setCaretAfter(node: Node) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const PromptMentionInput = memo(function PromptMentionInput({
  value,
  connectedImages = [],
  placeholder,
  className,
  style,
  onChange,
  onFocus,
  onBlur,
  onCompositionStateChange,
}: PromptMentionInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedValueRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const mentionOptions = useMemo<MentionOption[]>(
    () =>
      connectedImages.map((image, index) => ({
        ...image,
        label: getMentionLabel(image, index),
      })),
    [connectedImages],
  );

  const filteredOptions = useMemo(() => {
    if (!trigger) {
      return [];
    }

    const query = trigger.query.trim().toLowerCase();

    if (!query) {
      return mentionOptions;
    }

    return mentionOptions.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [mentionOptions, trigger]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;

    if (!editor || composingRef.current) {
      return;
    }

    const next = serializeEditor(editor);
    lastRenderedValueRef.current = next;
    onChange?.(next);
  }, [onChange]);

  const closeMenu = useCallback(() => {
    setTrigger(null);
    setActiveIndex(0);
  }, []);

  const refreshTrigger = useCallback(() => {
    const editor = editorRef.current;

    if (!editor || composingRef.current) {
      closeMenu();
      return;
    }

    const nextTrigger = getCurrentTrigger(editor);
    setTrigger(nextTrigger);
    setActiveIndex(0);
  }, [closeMenu]);

  const insertMention = useCallback((option: MentionOption) => {
    const editor = editorRef.current;

    if (!editor || !trigger) {
      return;
    }

    const range = document.createRange();
    range.setStart(trigger.textNode, trigger.startOffset);
    range.setEnd(trigger.textNode, trigger.endOffset);
    range.deleteContents();

    const pill = createPillElement(option.id, option.label);
    const trailingSpace = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();

    fragment.append(pill, trailingSpace);
    range.insertNode(fragment);
    setCaretAfter(trailingSpace);
    closeMenu();
    emitChange();
    editor.focus();
  }, [closeMenu, emitChange, trigger]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || lastRenderedValueRef.current === value) {
      return;
    }

    editor.replaceChildren();
    appendSerializedText(editor, value);
    lastRenderedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (activeIndex < filteredOptions.length) {
      return;
    }

    setActiveIndex(0);
  }, [activeIndex, filteredOptions.length]);

  useEffect(() => {
    if (!trigger) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.closest('[data-ref-mention-menu="true"]') || editorRef.current?.contains(target))
      ) {
        return;
      }

      closeMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [closeMenu, trigger]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!trigger || filteredOptions.length === 0) {
      if (event.key === 'Escape') {
        closeMenu();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filteredOptions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        (index - 1 + filteredOptions.length) % filteredOptions.length,
      );
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertMention(filteredOptions[activeIndex] || filteredOptions[0]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === 'Tab' ||
      event.key === 'Escape'
    ) {
      return;
    }

    refreshTrigger();
  };

  return (
    <div className="relative h-full w-full">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={className}
        style={style}
        onFocus={onFocus}
        onBlur={() => {
          closeMenu();
          emitChange();
          onBlur?.();
        }}
        onInput={() => {
          emitChange();
          refreshTrigger();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onMouseUp={refreshTrigger}
        onClick={(event) => {
          const target = event.target;

          if (!(target instanceof HTMLElement)) {
            return;
          }

          const deleteButton = target.closest('[data-ref-pill-delete="true"]');

          if (!deleteButton) {
            return;
          }

          event.preventDefault();
          const pill = deleteButton.closest('.ref-pill');

          if (pill) {
            const nextNode = document.createTextNode('');
            pill.replaceWith(nextNode);
            setCaretAfter(nextNode);
            emitChange();
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          closeMenu();
          onCompositionStateChange?.(true);
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          emitChange();
          refreshTrigger();
          onCompositionStateChange?.(false);
        }}
        onWheel={(event) => {
          event.stopPropagation();
          event.currentTarget.scrollTop += event.deltaY;
        }}
        onWheelCapture={(event) => event.stopPropagation()}
      />

      {trigger ? (
        <div
          data-ref-mention-menu="true"
          className="v2-mention-menu nodrag nopan"
          style={{
            left: trigger.left,
            top: trigger.top,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const active = index === activeIndex;

              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    'at-mention-item',
                    active ? 'at-mention-item-active' : '',
                  ].join(' ')}
                  onPointerEnter={() => setActiveIndex(index)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    insertMention(option);
                  }}
                >
                  <span className="ref-thumb-wrap">
                    <NextImage
                      src={option.previewUrl || option.imageUrl}
                      alt={option.alt || option.label}
                      fill
                      unoptimized
                      sizes="34px"
                      className="object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {option.label}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-[12px] text-gl-text-muted">
              No reference images
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
