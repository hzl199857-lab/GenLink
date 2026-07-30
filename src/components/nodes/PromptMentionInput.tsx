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
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';
import {
  createReferenceMentionToken,
  parseReferenceMentions,
  REFERENCE_MENTION_TOKEN_PREFIX,
} from '@/lib/prompt-mentions';
import { getBrowserImageDisplayUrl } from '@/lib/image-display-url';

export type PromptMentionImage = {
  id: string;
  imageUrl: string;
  previewUrl?: string;
  alt: string;
};

export type PromptMentionVideo = {
  id: string;
  videoUrl: string;
  previewUrl?: string;
  alt: string;
  fileName?: string;
};

type MentionOption = {
  id: string;
  type: 'image' | 'video';
  label: string;
  detail?: string;
  previewUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  alt: string;
};

type MentionTrigger = {
  textNode: Text;
  startOffset: number;
  endOffset: number;
  query: string;
  viewportLeft: number;
  viewportTop: number;
  viewportBottom: number | null;
  agentViewportLeft: number;
  agentViewportBottom: number;
};

const DEFAULT_MENTION_MENU_WIDTH = 260;
const DEFAULT_MENTION_MENU_MAX_HEIGHT = 260;
const DEFAULT_MENTION_MENU_MARGIN = 8;
const AGENT_MENTION_MENU_WIDTH = 408;
const AGENT_MENTION_MENU_SIDE_MARGIN = 16;
const AGENT_MENTION_MENU_LEFT_OFFSET = 92;
const AGENT_MENTION_MENU_GAP = 10;

export interface PromptMentionInputProps {
  value: string;
  connectedImages?: PromptMentionImage[];
  connectedVideos?: PromptMentionVideo[];
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  mentionMenuVariant?: 'default' | 'agent';
  focusRequestId?: number;
  onChange?: (next: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onCompositionStateChange?: (composing: boolean) => void;
}

function getMentionLabel(image: PromptMentionImage, index: number): string {
  return `\u56fe\u7247${index + 1}`;
}

function getVideoMentionLabel(_video: PromptMentionVideo, index: number): string {
  return `\u89c6\u9891${index + 1}`;
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
  const caretLeft = rect.left || editorRect.left;
  const caretTop = rect.top || editorRect.top;
  const caretBottom = rect.bottom || editorRect.top + 28;
  const maxViewportLeft = Math.max(
    DEFAULT_MENTION_MENU_MARGIN,
    window.innerWidth - DEFAULT_MENTION_MENU_WIDTH - DEFAULT_MENTION_MENU_MARGIN,
  );
  const belowTop = caretBottom + 6;
  const maxBelowTop = window.innerHeight -
    DEFAULT_MENTION_MENU_MAX_HEIGHT -
    DEFAULT_MENTION_MENU_MARGIN;
  const shouldFlipAbove =
    belowTop > maxBelowTop &&
    caretTop > DEFAULT_MENTION_MENU_MAX_HEIGHT + DEFAULT_MENTION_MENU_MARGIN;
  const agentMenuWidth = Math.min(
    AGENT_MENTION_MENU_WIDTH,
    window.innerWidth - AGENT_MENTION_MENU_SIDE_MARGIN * 2,
  );
  const maxAgentViewportLeft = Math.max(
    AGENT_MENTION_MENU_SIDE_MARGIN,
    window.innerWidth - agentMenuWidth - AGENT_MENTION_MENU_SIDE_MARGIN,
  );

  return {
    textNode,
    startOffset,
    endOffset: range.startOffset,
    query,
    viewportLeft: Math.min(
      maxViewportLeft,
      Math.max(DEFAULT_MENTION_MENU_MARGIN, caretLeft),
    ),
    viewportTop: Math.max(DEFAULT_MENTION_MENU_MARGIN, belowTop),
    viewportBottom: shouldFlipAbove
      ? Math.max(
        DEFAULT_MENTION_MENU_MARGIN,
        window.innerHeight - caretTop + 6,
      )
      : null,
    agentViewportLeft: Math.min(
      maxAgentViewportLeft,
      Math.max(
        AGENT_MENTION_MENU_SIDE_MARGIN,
        editorRect.left - AGENT_MENTION_MENU_LEFT_OFFSET,
      ),
    ),
    agentViewportBottom: Math.min(
      window.innerHeight - DEFAULT_MENTION_MENU_MARGIN,
      Math.max(
        DEFAULT_MENTION_MENU_MARGIN,
        window.innerHeight - editorRect.top + AGENT_MENTION_MENU_GAP,
      ),
    ),
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

function setCaretAtEnd(editor: HTMLDivElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const PromptMentionInput = memo(function PromptMentionInput({
  value,
  connectedImages = [],
  connectedVideos = [],
  placeholder,
  className,
  style,
  mentionMenuVariant = 'default',
  focusRequestId,
  onChange,
  onFocus,
  onBlur,
  onCompositionStateChange,
}: PromptMentionInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedValueRef = useRef<string | null>(null);
  const lastFocusRequestIdRef = useRef<number | undefined>(undefined);
  const composingRef = useRef(false);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const agentMenu = mentionMenuVariant === 'agent';

  const mentionOptions = useMemo<MentionOption[]>(
    () => [
      ...connectedImages.map((image, index) => ({
        id: image.id,
        type: 'image' as const,
        label: getMentionLabel(image, index),
        previewUrl: image.previewUrl,
        imageUrl: image.imageUrl,
        alt: image.alt,
      })),
      ...connectedVideos.map((video, index) => ({
        id: video.id,
        type: 'video' as const,
        label: getVideoMentionLabel(video, index),
        detail: video.fileName || video.alt,
        previewUrl: video.previewUrl,
        videoUrl: video.videoUrl,
        alt: video.alt,
      })),
    ],
    [connectedImages, connectedVideos],
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
      option.label.toLowerCase().includes(query) ||
      option.detail?.toLowerCase().includes(query),
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
    if (!focusRequestId || lastFocusRequestIdRef.current === focusRequestId) {
      return;
    }

    lastFocusRequestIdRef.current = focusRequestId;

    const frameId = window.requestAnimationFrame(() => {
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      editor.focus();
      setCaretAtEnd(editor);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusRequestId]);

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

  const mentionMenu = trigger ? (
    <div
      data-ref-mention-menu="true"
      className={[
        'v2-mention-menu nodrag nopan',
        agentMenu ? 'agent-mention-menu' : '',
      ].join(' ')}
      style={agentMenu ? {
        left: trigger.agentViewportLeft,
        bottom: trigger.agentViewportBottom,
        position: 'fixed',
        zIndex: 1000,
      } : {
        left: trigger.viewportLeft,
        top: trigger.viewportBottom === null ? trigger.viewportTop : undefined,
        bottom: trigger.viewportBottom ?? undefined,
        position: 'fixed',
        zIndex: 1000,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {agentMenu ? (
        <div className="agent-mention-menu-title">可能@的内容</div>
      ) : null}
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
                {option.type === 'video' ? (
                  <>
                    {option.previewUrl ? (
                      <NextImage
                        src={getBrowserImageDisplayUrl(option.previewUrl)}
                        alt={option.alt || option.label}
                        fill
                        unoptimized
                        sizes="34px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-black/40 text-white/80">
                        <Play size={14} fill="currentColor" strokeWidth={0} />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white">
                      <Play size={12} fill="currentColor" strokeWidth={0} />
                    </span>
                  </>
                ) : (
                  <NextImage
                    src={getBrowserImageDisplayUrl(option.previewUrl || option.imageUrl || '')}
                    alt={option.alt || option.label}
                    fill
                    unoptimized
                    sizes="34px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate">{option.label}</span>
                {option.detail ? (
                  <span className="truncate text-[11px] leading-4 text-gl-text-muted">
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })
      ) : (
        <div className="px-3 py-2 text-[12px] text-gl-text-muted">
          No references
        </div>
      )}
    </div>
  ) : null;

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

      {mentionMenu && typeof document !== 'undefined'
        ? createPortal(mentionMenu, document.body)
        : null}
    </div>
  );
});
