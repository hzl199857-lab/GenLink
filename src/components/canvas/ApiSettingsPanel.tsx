'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

import type {
  ApiModelKind,
  ApiProvider,
  StoredApiSettings,
} from '@/store/canvas-store';

export interface ApiSettingsPanelProps {
  open: boolean;
  initialSettings: StoredApiSettings;
  onClose?: () => void;
  onSave?: (values: StoredApiSettings) => void;
}

type ProviderDraft = {
  selectedProvider: ApiProvider;
  expandedProvider: ApiProvider | null;
  apiKeys: Record<ApiProvider, string>;
};

const MODEL_TABS: Array<{ key: ApiModelKind; label: string }> = [
  { key: 'text', label: '文本模型' },
  { key: 'image', label: '图像模型' },
];

const PROVIDERS: Array<{
  key: ApiProvider;
  label: string;
  url: string;
  apiKeyLabel: string;
}> = [
  {
    key: 'comfly',
    label: 'Comfly',
    url: 'https://ai.comfly.chat',
    apiKeyLabel: 'Comfly API Key',
  },
  {
    key: 'vibe',
    label: 'VibeAPI',
    url: 'https://www.vibeapi.cn',
    apiKeyLabel: 'VibeAPI Key',
  },
  {
    key: 'zhenzhen',
    label: '真真 AI 工坊',
    url: 'https://ai.t8star.cn',
    apiKeyLabel: '真真 AI 工坊 API Key',
  },
];

function createDraftFromSettings(settings: StoredApiSettings) {
  return {
    text: {
      selectedProvider: settings.textProvider,
      expandedProvider: null,
      apiKeys: { ...settings.textApiKeys },
    },
    image: {
      selectedProvider: settings.imageProvider,
      expandedProvider: null,
      apiKeys: { ...settings.imageApiKeys },
    },
  } satisfies Record<ApiModelKind, ProviderDraft>;
}

export function ApiSettingsPanel({
  open,
  initialSettings,
  onClose,
  onSave,
}: ApiSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<ApiModelKind>('text');
  const [drafts, setDrafts] = useState(() => createDraftFromSettings(initialSettings));
  const [revealed, setRevealed] = useState<Record<ApiModelKind, Record<ApiProvider, boolean>>>({
    text: { vibe: false, comfly: false, zhenzhen: false },
    image: { vibe: false, comfly: false, zhenzhen: false },
  });

  if (!open) {
    return null;
  }

  const currentDraft = drafts[activeTab];

  const handleProviderUse = (provider: ApiProvider) => {
    setDrafts((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        expandedProvider: provider,
      },
    }));
  };

  const handleApiKeyChange = (provider: ApiProvider, value: string) => {
    setDrafts((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        apiKeys: {
          ...current[activeTab].apiKeys,
          [provider]: value,
        },
      },
    }));
  };

  const handleProviderCancel = () => {
    const expandedProvider = currentDraft.expandedProvider;

    if (!expandedProvider) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        expandedProvider: null,
      },
    }));
    setRevealed((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        [expandedProvider]: false,
      },
    }));
  };

  const handleProviderConfirm = () => {
    const expandedProvider = currentDraft.expandedProvider;

    if (!expandedProvider) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        selectedProvider: expandedProvider,
        expandedProvider: null,
      },
    }));
    setRevealed((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        [expandedProvider]: false,
      },
    }));
  };

  const handleSave = () => {
    onSave?.({
      textProvider: drafts.text.selectedProvider,
      imageProvider: drafts.image.selectedProvider,
      textApiKeys: {
        vibe: drafts.text.apiKeys.vibe.trim(),
        comfly: drafts.text.apiKeys.comfly.trim(),
        zhenzhen: drafts.text.apiKeys.zhenzhen.trim(),
      },
      imageApiKeys: {
        vibe: drafts.image.apiKeys.vibe.trim(),
        comfly: drafts.image.apiKeys.comfly.trim(),
        zhenzhen: drafts.image.apiKeys.zhenzhen.trim(),
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/48 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] origin-center scale-[0.75] overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-[16px] font-semibold tracking-[1px] text-white">模型配置</h2>

          <div className="group/tooltip relative">
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-sm text-[#666666] transition-colors hover:bg-white/5 hover:text-[#cccccc]"
            >
              <X size={18} />
            </button>
            <Tooltip label="关闭" side="left" />
          </div>
        </div>

        <div className="border-b border-[#222222] px-6">
          <div className="flex items-center gap-[30px]">
            {MODEL_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative py-3 text-[14px] transition-colors ${
                    isActive ? 'font-medium text-[#ccff00]' : 'text-[#777777] hover:text-[#aaaaaa]'
                  }`}
                >
                  {tab.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#ccff00]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4 text-[13px] text-[#aaaaaa]">选择 API 服务商</div>

          <div className="space-y-3">
            {PROVIDERS.map((provider) => {
              const isExpanded = currentDraft.expandedProvider === provider.key;
              const isSelected = currentDraft.selectedProvider === provider.key;
              const isRevealed = revealed[activeTab][provider.key];
              const apiKeyValue = currentDraft.apiKeys[provider.key];

              return (
                <div
                  key={`${activeTab}-${provider.key}`}
                  className={`overflow-hidden rounded border transition-colors ${
                    isExpanded
                      ? 'border-[#ccff00] bg-[#141414]'
                      : isSelected
                        ? 'border-[#333333] bg-[#141414]'
                        : 'border-[#222222] bg-[#141414] hover:border-[#333333]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <div className="text-[15px] font-semibold text-white">
                        {provider.label}
                      </div>
                      <div className="mt-1.5 text-[12px] text-[#666666]">{provider.url}</div>
                    </div>

                    {isExpanded ? (
                      <span className="text-[13px] font-medium text-[#ccff00]">填写中</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleProviderUse(provider.key)}
                        className={`min-w-[66px] rounded-sm border px-[18px] py-1.5 text-[13px] transition-colors ${
                          isSelected
                            ? 'border-[#ccff00] text-[#ccff00]'
                            : 'border-[#333333] text-[#888888] hover:border-[#555555] hover:text-white'
                        }`}
                      >
                        使用
                      </button>
                    )}
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-[#222222] px-5 pb-4 pt-4">
                      <label className="mb-2 block text-[12px] text-[#888888]">
                        {provider.apiKeyLabel}
                      </label>

                      <div className="flex items-center rounded border border-[#222222] bg-[#050505] px-3.5 transition-colors focus-within:border-[#333333]">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          value={apiKeyValue}
                          onChange={(event) => handleApiKeyChange(provider.key, event.target.value)}
                          placeholder={`请输入 ${provider.label} 的 API Key`}
                          className="h-10 w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#555555]"
                        />
                        <div className="group/tooltip relative">
                          <button
                            type="button"
                            onClick={() =>
                              setRevealed((current) => ({
                                ...current,
                                [activeTab]: {
                                  ...current[activeTab],
                                  [provider.key]: !current[activeTab][provider.key],
                                },
                              }))
                            }
                            aria-label={isRevealed ? '隐藏' : '显示'}
                            className="ml-2 flex h-7 w-7 items-center justify-center rounded-sm text-[#666666] transition-colors hover:bg-white/5 hover:text-[#cccccc]"
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <Tooltip label={isRevealed ? '隐藏' : '显示'} side="top" />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleProviderCancel}
                          className="rounded-sm border border-[#222222] px-4 py-2 text-[13px] text-[#aaaaaa] transition-colors hover:border-[#444444] hover:text-white"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleProviderConfirm}
                          className="rounded-sm border border-transparent bg-[#ccff00] px-4 py-2 text-[13px] font-semibold text-[#101500] shadow-[0_0_0_1px_rgba(204,255,0,0.18),0_0_18px_rgba(204,255,0,0.18)] transition-colors hover:bg-[#d8ff33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00]"
                        >
                          确定
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] leading-5 text-[#666666]">
            切换服务商时，请先填写对应 API Key 再确认。
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#222222] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-[#222222] px-6 py-2.5 text-[14px] text-[#aaaaaa] transition-colors hover:border-[#444444] hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-sm border border-transparent bg-[#ccff00] px-6 py-2.5 text-[14px] font-semibold text-[#101500] shadow-[0_0_0_1px_rgba(204,255,0,0.18),0_0_18px_rgba(204,255,0,0.18)] transition-colors hover:bg-[#d8ff33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
