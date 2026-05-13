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
        className="w-full max-w-[510px] rounded-[14px] border border-[#23262d] bg-[#121315] shadow-[0_18px_40px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 pb-3 pt-5">
          <h2 className="text-[15px] font-semibold text-white">模型配置</h2>

          <div className="group/tooltip relative">
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#8d96aa] transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={14} />
            </button>
            <Tooltip label="关闭" side="left" />
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-7 border-b border-white/10">
            {MODEL_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative pb-2.5 text-[13px] transition-colors ${
                    isActive ? 'text-[#25e56a]' : 'text-[#8b95aa] hover:text-[#d6deed]'
                  }`}
                >
                  {tab.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#25e56a]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 text-[12px] font-medium text-[#cdd5e3]">选择 API 服务商</div>

          <div className="space-y-2.5">
            {PROVIDERS.map((provider) => {
              const isExpanded = currentDraft.expandedProvider === provider.key;
              const isSelected = currentDraft.selectedProvider === provider.key;
              const isRevealed = revealed[activeTab][provider.key];
              const apiKeyValue = currentDraft.apiKeys[provider.key];

              return (
                <div
                  key={`${activeTab}-${provider.key}`}
                  className={`overflow-hidden rounded-[10px] border transition-colors ${
                    isExpanded
                      ? 'border-[#25e56a] bg-[#121513]'
                      : isSelected
                        ? 'border-[#3a434d] bg-[#15171b]'
                        : 'border-[#30343d] bg-[#141519]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div>
                      <div className="text-[13px] font-semibold text-[#f5f7fb]">
                        {provider.label}
                      </div>
                      <div className="mt-1 text-[11px] text-[#74809a]">{provider.url}</div>
                    </div>

                    {isExpanded ? (
                      <span className="text-[12px] font-medium text-[#25e56a]">填写中</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleProviderUse(provider.key)}
                        className={`min-w-[60px] rounded-[7px] border px-3 py-1.5 text-[12px] transition-colors ${
                          isSelected
                            ? 'border-[#25e56a] text-[#25e56a]'
                            : 'border-[#2a2e36] text-[#c3ccdc] hover:border-[#3a404c] hover:text-white'
                        }`}
                      >
                        使用
                      </button>
                    )}
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-white/10 px-4 pb-3.5 pt-3.5">
                      <label className="mb-2 block text-[11px] text-[#8d97ab]">
                        {provider.apiKeyLabel}
                      </label>

                      <div className="flex items-center rounded-[7px] border border-[#2b3038] bg-[#0f1216] px-3.5">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          value={apiKeyValue}
                          onChange={(event) => handleApiKeyChange(provider.key, event.target.value)}
                          placeholder={`请输入 ${provider.label} 的 API Key`}
                          className="h-9 w-full bg-transparent text-[12px] text-white outline-none placeholder:text-[#5f697d]"
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
                            className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-[#7d879a] transition-colors hover:bg-white/5 hover:text-white"
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
                          className="rounded-[7px] border border-[#2b3038] px-3 py-1.5 text-[12px] text-[#b9c2d3] transition-colors hover:bg-white/5 hover:text-white"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleProviderConfirm}
                          className="rounded-[7px] bg-[#24db66] px-3 py-1.5 text-[12px] font-medium text-[#071109] transition-colors hover:bg-[#42e37c]"
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

          <p className="mt-2.5 text-[11px] leading-5 text-[#77829a]">
            切换服务商时，请先填写对应 API Key 再确认。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#2b3038] px-4 py-2 text-[12px] text-[#c6cfdf] transition-colors hover:bg-white/5 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-[8px] bg-[#24db66] px-5 py-2 text-[12px] font-medium text-[#071109] transition-colors hover:bg-[#42e37c]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
