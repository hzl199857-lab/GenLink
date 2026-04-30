'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

export interface ApiSettingsPanelProps {
  open: boolean;
  initialTextApiKey?: string;
  initialImageApiKey?: string;
  onClose?: () => void;
  onSave?: (values: { textApiKey: string; imageApiKey: string }) => void;
}

export function ApiSettingsPanel({
  open,
  initialTextApiKey = '',
  initialImageApiKey = '',
  onClose,
  onSave,
}: ApiSettingsPanelProps) {
  const [textApiKey, setTextApiKey] = useState(initialTextApiKey);
  const [imageApiKey, setImageApiKey] = useState(initialImageApiKey);
  const [textRevealed, setTextRevealed] = useState(false);
  const [imageRevealed, setImageRevealed] = useState(false);

  if (!open) return null;

  const inputClassName =
    'h-11 w-full bg-transparent text-[13px] text-gl-text-primary outline-none placeholder:text-gl-text-muted';
  const iconButtonClassName =
    'flex h-8 w-8 items-center justify-center rounded-gl-md text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary';
  const handleClose = () => {
    setTextApiKey(initialTextApiKey);
    setImageApiKey(initialImageApiKey);
    setTextRevealed(false);
    setImageRevealed(false);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[460px] rounded-gl-lg border border-gl-stroke-soft bg-gl-panel/95 shadow-gl-card backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gl-stroke-subtle px-5 py-4">
          <div>
            <div className="text-[15px] font-medium text-gl-text-primary">API 设置</div>
            <div className="mt-1 text-[12px] text-gl-text-tertiary">
              分别设置文本生成和图像生成所使用的 Vibe API Key
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={iconButtonClassName}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <label className="mb-2 block text-[12px] text-gl-text-secondary">
              文本 API Key
            </label>
            <div className="flex items-center gap-2 rounded-gl-md border border-gl-stroke-soft bg-black/10 px-3">
              <input
                type={textRevealed ? 'text' : 'password'}
                value={textApiKey}
                onChange={(e) => setTextApiKey(e.target.value)}
                placeholder="请输入文本生成使用的 API Key"
                className={inputClassName}
              />
              <button
                type="button"
                onClick={() => setTextRevealed((value) => !value)}
                className={iconButtonClassName}
                title={textRevealed ? '隐藏' : '显示'}
              >
                {textRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] text-gl-text-secondary">
              图像 API Key
            </label>
            <div className="flex items-center gap-2 rounded-gl-md border border-gl-stroke-soft bg-black/10 px-3">
              <input
                type={imageRevealed ? 'text' : 'password'}
                value={imageApiKey}
                onChange={(e) => setImageApiKey(e.target.value)}
                placeholder="请输入图像生成使用的 API Key"
                className={inputClassName}
              />
              <button
                type="button"
                onClick={() => setImageRevealed((value) => !value)}
                className={iconButtonClassName}
                title={imageRevealed ? '隐藏' : '显示'}
              >
                {imageRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-gl-text-muted">
            这些 Key 仅保存在当前浏览器的本地存储中。项目本身不再内置 Vibe Key，发给别人时不会自动携带可用凭证。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gl-stroke-subtle px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-gl-md border border-gl-stroke-soft px-3 py-2 text-[12px] text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave?.({
                textApiKey: textApiKey.trim(),
                imageApiKey: imageApiKey.trim(),
              });
              setTextRevealed(false);
              setImageRevealed(false);
            }}
            className="rounded-gl-md bg-white px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-gray-200"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
