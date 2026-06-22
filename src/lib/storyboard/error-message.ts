import type { ImageApiProvider } from '@/lib/vibe';

type StoryboardTextProvider = Exclude<ImageApiProvider, 'runninghub'>;

const DEFAULT_STORYBOARD_GENERATION_TIMEOUT_MS = 180_000;
const SLOW_RELAY_STORYBOARD_GENERATION_TIMEOUT_MS = 300_000;

const PROVIDER_LABELS: Partial<Record<StoryboardTextProvider, string>> = {
  vibe: 'VibeAPI',
  fucheers: 'Fucheers API',
  comfly: 'Comfly',
  zhenzhen: '贞贞的AI工坊',
  grsai: 'Grsai',
};

export interface StoryboardGenerationErrorContext {
  message: string;
  status?: number;
  provider?: StoryboardTextProvider;
  model?: string;
}

function getProviderLabel(provider?: StoryboardTextProvider): string {
  return provider ? PROVIDER_LABELS[provider] ?? provider : '当前供应商';
}

function getProviderModelLabel({
  provider,
  model,
}: Pick<StoryboardGenerationErrorContext, 'provider' | 'model'>): string {
  return [getProviderLabel(provider), model?.trim()].filter(Boolean).join(' / ');
}

function isTimeoutError({
  message,
  status,
}: Pick<StoryboardGenerationErrorContext, 'message' | 'status'>): boolean {
  return status === 504 || /timeout|timed out|aborted/i.test(message);
}

export function getStoryboardGenerationTimeoutMs(
  provider?: StoryboardTextProvider,
): number {
  return provider === 'comfly' || provider === 'zhenzhen'
    ? SLOW_RELAY_STORYBOARD_GENERATION_TIMEOUT_MS
    : DEFAULT_STORYBOARD_GENERATION_TIMEOUT_MS;
}

export function getStoryboardGenerationErrorMessage(
  context: StoryboardGenerationErrorContext,
): string {
  const providerModel = getProviderModelLabel(context);

  if (isTimeoutError(context)) {
    return [
      `${providerModel} 响应超时。`,
      '分镜脚本会生成较长的结构化表格，这个供应商/模型本次没有在等待时间内返回结果。',
      '建议换用 gemini-3-flash、gemini-3.1-pro 或 gpt-5.4，或减少分镜数量或参考图后重试。',
    ].join('');
  }

  return `分镜生成失败：${context.message}${providerModel ? `（${providerModel}）` : ''}`;
}
