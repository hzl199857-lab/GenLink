'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

import type {
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
  apiKeys: Record<ApiProvider, string>;
  runningHubWorkflowApiKey: string;
};

const PROVIDERS: Array<{
  key: ApiProvider;
  label: string;
  url: string;
  apiKeyLabel: string;
}> = [
  {
    key: 'comfly',
    label: 'Comfly',
    url: 'https://ai.comfly.org',
    apiKeyLabel: 'Comfly API Key',
  },
  {
    key: 'vibe',
    label: 'VibeAPI',
    url: 'https://www.vibeapi.cn',
    apiKeyLabel: 'VibeAPI Key',
  },
  {
    key: 'fucheers',
    label: 'Fucheers API',
    url: 'https://www.fucheers.top',
    apiKeyLabel: 'Fucheers API Key',
  },
  {
    key: 'runninghub',
    label: 'RunningHub',
    url: 'https://www.runninghub.cn',
    apiKeyLabel: 'RunningHub API Key',
  },
  {
    key: 'grsai',
    label: 'Grsai',
    url: 'https://grsai.ai/zh/dashboard/api-keys',
    apiKeyLabel: 'Grsai API Key',
  },
  {
    key: 'zhenzhen',
    label: '真真 AI 工坊',
    url: 'https://ai.t8star.cn',
    apiKeyLabel: '真真 AI 工坊 API Key',
  },
];

const EMPTY_API_KEYS: Record<ApiProvider, string> = {
  vibe: '',
  fucheers: '',
  comfly: '',
  zhenzhen: '',
  runninghub: '',
  grsai: '',
};

function createDraftFromSettings(settings: StoredApiSettings): ProviderDraft {
  const apiKeys = { ...EMPTY_API_KEYS };

  for (const provider of PROVIDERS) {
    apiKeys[provider.key] =
      settings.textApiKeys[provider.key]?.trim() ||
      settings.imageApiKeys[provider.key]?.trim() ||
      '';
  }

  return {
    apiKeys,
    runningHubWorkflowApiKey: settings.runningHubWorkflowApiKey?.trim() || '',
  };
}

function createSettingsFromDraft(
  draft: ProviderDraft,
  previousSettings: StoredApiSettings,
): StoredApiSettings {
  const apiKeys: Record<ApiProvider, string> = {
    vibe: (draft.apiKeys.vibe ?? '').trim(),
    fucheers: (draft.apiKeys.fucheers ?? '').trim(),
    comfly: (draft.apiKeys.comfly ?? '').trim(),
    zhenzhen: (draft.apiKeys.zhenzhen ?? '').trim(),
    runninghub: (draft.apiKeys.runninghub ?? '').trim(),
    grsai: (draft.apiKeys.grsai ?? '').trim(),
  };

  return {
    textProvider: previousSettings.textProvider,
    imageProvider: previousSettings.imageProvider,
    textApiKeys: apiKeys,
    imageApiKeys: apiKeys,
    runningHubWorkflowApiKey: draft.runningHubWorkflowApiKey.trim(),
  };
}

export function ApiSettingsPanel({
  open,
  initialSettings,
  onClose,
  onSave,
}: ApiSettingsPanelProps) {
  const [draft, setDraft] = useState<ProviderDraft>(() =>
    createDraftFromSettings(initialSettings),
  );
  const [revealed, setRevealed] = useState<Record<ApiProvider, boolean>>({
    vibe: false,
    fucheers: false,
    comfly: false,
    zhenzhen: false,
    runninghub: false,
    grsai: false,
  });

  if (!open) {
    return null;
  }

  const handleApiKeyChange = (provider: ApiProvider, value: string) => {
    setDraft((current) => ({
      ...current,
      apiKeys: {
        ...current.apiKeys,
        [provider]: value,
      },
    }));
  };

  const handleRunningHubWorkflowApiKeyChange = (value: string) => {
    setDraft((current) => ({
      ...current,
      runningHubWorkflowApiKey: value,
    }));
  };

  const handleSave = () => {
    onSave?.(createSettingsFromDraft(draft, initialSettings));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/48 px-4"
      onClick={onClose}
    >
      <div
        className="flex h-[min(780px,calc(100vh-48px))] w-full max-w-[980px] origin-center scale-90 overflow-hidden rounded border border-[#1a1a1a] bg-[#050505] shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-[#222222] bg-[#111217] px-3 py-6">
          <div className="px-3 text-[18px] font-semibold tracking-[0.2px] text-white">
            设置
          </div>

          <nav className="mt-7 space-y-1">
            <button
              type="button"
              className="flex h-11 w-full items-center gap-3 rounded-[8px] bg-[#26254b] px-3 text-left text-[15px] font-medium text-white"
            >
              <KeyRound size={16} />
              <span>API Key</span>
            </button>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#050505]">
          <div className="flex items-center justify-between border-b border-[#222222] px-8 py-5">
            <h2 className="text-[18px] font-semibold tracking-[0.2px] text-white">API Key</h2>

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

          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="mb-4 text-[13px] leading-5 text-[#aaaaaa]">
              为每个服务商填写对应 API Key。具体使用哪个服务商和模型，请在文本节点或图像生成节点中选择。
            </div>

            <div className="space-y-3">
              {PROVIDERS.map((provider) => {
                const isRevealed = revealed[provider.key];
                const apiKeyValue = draft.apiKeys[provider.key] ?? '';
                const runningHubWorkflowApiKeyValue =
                  draft.runningHubWorkflowApiKey ?? '';

                return (
                  <div
                    key={provider.key}
                    className="overflow-hidden rounded border border-[#222222] bg-[#141414] transition-colors hover:border-[#333333]"
                  >
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <div className="text-[15px] font-semibold text-white">
                          {provider.label}
                        </div>
                        <div className="mt-1.5 text-[12px] text-[#666666]">{provider.url}</div>
                      </div>

                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm border border-[#333333] px-3 py-1.5 text-[12px] text-[#888888] transition-colors hover:border-[#555555] hover:text-white"
                      >
                        获取 Key
                      </a>
                    </div>

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
                                [provider.key]: !current[provider.key],
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
                    </div>

                    {provider.key === 'runninghub' ? (
                      <div className="border-t border-[#222222] px-5 pb-4 pt-4">
                        <label className="mb-2 block text-[12px] text-[#888888]">
                          RunningHub 工作流 API Key
                        </label>

                        <div className="flex items-center rounded border border-[#222222] bg-[#050505] px-3.5 transition-colors focus-within:border-[#333333]">
                          <input
                            type={isRevealed ? 'text' : 'password'}
                            value={runningHubWorkflowApiKeyValue}
                            onChange={(event) =>
                              handleRunningHubWorkflowApiKeyChange(event.target.value)
                            }
                            placeholder="请输入 RunningHub 工作流 API Key"
                            className="h-10 w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#555555]"
                          />
                          <div className="group/tooltip relative">
                            <button
                              type="button"
                              onClick={() =>
                                setRevealed((current) => ({
                                  ...current,
                                  [provider.key]: !current[provider.key],
                                }))
                              }
                              aria-label={isRevealed ? '闅愯棌' : '鏄剧ず'}
                              className="ml-2 flex h-7 w-7 items-center justify-center rounded-sm text-[#666666] transition-colors hover:bg-white/5 hover:text-[#cccccc]"
                            >
                              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <Tooltip label={isRevealed ? '闅愯棌' : '鏄剧ず'} side="top" />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#222222] px-8 py-4">
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
        </section>
      </div>
    </div>
  );
}
