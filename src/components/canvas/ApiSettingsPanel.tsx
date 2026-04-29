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
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textApiKey, setTextApiKey] = useState(initialTextApiKey);
  const [imageApiKey, setImageApiKey] = useState(initialImageApiKey);
  const [textRevealed, setTextRevealed] = useState(false);
  const [imageRevealed, setImageRevealed] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  const [lastTextApiKey, setLastTextApiKey] = useState(initialTextApiKey);
  const [lastImageApiKey, setLastImageApiKey] = useState(initialImageApiKey);

  if (
    open !== lastOpen ||
    initialTextApiKey !== lastTextApiKey ||
    initialImageApiKey !== lastImageApiKey
  ) {
    setLastOpen(open);
    setLastTextApiKey(initialTextApiKey);
    setLastImageApiKey(initialImageApiKey);
    setTextApiKey(initialTextApiKey);
    setImageApiKey(initialImageApiKey);

    if (!open) {
      setActiveTab('text');
      setTextRevealed(false);
      setImageRevealed(false);
    }
  }

  if (!open) return null;

  const isTextTab = activeTab === 'text';

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
            <div className="text-[15px] font-medium text-gl-text-primary">API 设置</div>
            <div className="mt-1 text-[12px] text-gl-text-tertiary">文本模型与图像模型分别使用独立的 API Key。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-gl-md text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex rounded-gl-pill border border-gl-stroke-soft bg-black/10 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={[
                'rounded-gl-pill px-3 py-1.5 text-[12px] transition-colors',
                isTextTab
                  ? 'bg-white text-black'
                  : 'text-gl-text-secondary hover:text-gl-text-primary',
              ].join(' ')}
            >
              文本模型
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={[
                'rounded-gl-pill px-3 py-1.5 text-[12px] transition-colors',
                !isTextTab
                  ? 'bg-white text-black'
                  : 'text-gl-text-secondary hover:text-gl-text-primary',
              ].join(' ')}
            >
              图像模型
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          <label className="mb-2 block text-[12px] text-gl-text-secondary">
            {isTextTab ? 'Text API Key' : 'Image API Key'}
          </label>
          <div className="flex items-center gap-2 rounded-gl-md border border-gl-stroke-soft bg-black/10 px-3">
            <input
              type={isTextTab ? (textRevealed ? 'text' : 'password') : imageRevealed ? 'text' : 'password'}
              value={isTextTab ? textApiKey : imageApiKey}
              onChange={(e) =>
                isTextTab ? setTextApiKey(e.target.value) : setImageApiKey(e.target.value)
              }
              placeholder={isTextTab ? '请输入文本模型 API Key' : '请输入图像模型 API Key'}
              className="h-11 w-full bg-transparent text-[13px] text-gl-text-primary outline-none placeholder:text-gl-text-muted"
            />
            <button
              type="button"
              onClick={() =>
                isTextTab
                  ? setTextRevealed((value) => !value)
                  : setImageRevealed((value) => !value)
              }
              className="flex h-8 w-8 items-center justify-center rounded-gl-md text-gl-text-tertiary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
              title={isTextTab ? (textRevealed ? '隐藏' : '显示') : imageRevealed ? '隐藏' : '显示'}
            >
              {isTextTab ? (
                textRevealed ? <EyeOff size={15} /> : <Eye size={15} />
              ) : imageRevealed ? (
                <EyeOff size={15} />
              ) : (
                <Eye size={15} />
              )}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gl-text-muted">
            仅保存在当前浏览器本地，并按模型类型分别随请求发送到你的服务端路由。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gl-stroke-subtle px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-gl-md border border-gl-stroke-soft px-3 py-2 text-[12px] text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() =>
              onSave?.({
                textApiKey: textApiKey.trim(),
                imageApiKey: imageApiKey.trim(),
              })
            }
            className="rounded-gl-md bg-white px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-gray-200"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
