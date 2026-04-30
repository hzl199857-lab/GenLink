'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

export interface ApiSettingsPanelProps {
  open: boolean;
  initialTextApiKey?: string;
  onClose?: () => void;
  onSave?: (values: { textApiKey: string }) => void;
}

export function ApiSettingsPanel({
  open,
  initialTextApiKey = '',
  onClose,
  onSave,
}: ApiSettingsPanelProps) {
  const [textApiKey, setTextApiKey] = useState(initialTextApiKey);
  const [textRevealed, setTextRevealed] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  const [lastTextApiKey, setLastTextApiKey] = useState(initialTextApiKey);

  if (open !== lastOpen || initialTextApiKey !== lastTextApiKey) {
    setLastOpen(open);
    setLastTextApiKey(initialTextApiKey);
    setTextApiKey(initialTextApiKey);

    if (!open) {
      setTextRevealed(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-gl-lg border border-gl-stroke-soft bg-gl-panel/95 shadow-gl-card backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gl-stroke-subtle px-5 py-4">
          <div>
            <div className="text-[15px] font-medium text-gl-text-primary">API 璁剧疆</div>
            <div className="mt-1 text-[12px] text-gl-text-tertiary">鏂囨湰妯″瀷浣跨敤鐙珛鐨� API Key銆�</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-gl-md text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
            title="鍏抽棴"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          <label className="mb-2 block text-[12px] text-gl-text-secondary">
            Text API Key
          </label>
          <div className="flex items-center gap-2 rounded-gl-md border border-gl-stroke-soft bg-black/10 px-3">
            <input
              type={textRevealed ? 'text' : 'password'}
              value={textApiKey}
              onChange={(e) => setTextApiKey(e.target.value)}
              placeholder="璇疯緭鍏ユ枃鏈ā鍨� API Key"
              className="h-11 w-full bg-transparent text-[13px] text-gl-text-primary outline-none placeholder:text-gl-text-muted"
            />
            <button
              type="button"
              onClick={() => setTextRevealed((value) => !value)}
              className="flex h-8 w-8 items-center justify-center rounded-gl-md text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
              title={textRevealed ? '闅愯棌' : '鏄剧ず'}
            >
              {textRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gl-text-muted">
            浠呬繚瀛樺湪褰撳墠娴忚鍣ㄦ湰鍦帮紝骞舵寜璇锋眰鍙戦€佸埌浣犵殑鏈嶅姟绔矾鐢便€�
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gl-stroke-subtle px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-gl-md border border-gl-stroke-soft px-3 py-2 text-[12px] text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
          >
            鍙栨秷
          </button>
          <button
            type="button"
            onClick={() =>
              onSave?.({
                textApiKey: textApiKey.trim(),
              })
            }
            className="rounded-gl-md bg-white px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-gray-200"
          >
            淇濆瓨
          </button>
        </div>
      </div>
    </div>
  );
}
