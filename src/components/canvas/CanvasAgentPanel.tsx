'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import {
  AtSign,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  History,
  ImagePlus,
  Loader2,
  MessageSquare,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { buildAgentTaskContext, getReferencedAgentAttachmentIds } from '@/lib/agent-task-context';
import {
  deleteAgentThread,
  loadAgentDraft,
  listAgentThreads,
  restoreAgentThreadMessages,
  saveAgentDraft,
  saveAgentThread,
} from '@/lib/agent-history';
import {
  API_PROVIDERS,
  getImageModelLabel,
  IMAGE_MODEL_OPTIONS_BY_PROVIDER,
  IMAGE_SIZE_OPTIONS,
  type RunningHubChannel,
} from '@/lib/image-generation-options';
import { stripReferenceMentionTokens } from '@/lib/prompt-mentions';
import {
  getApiProviderLabel,
  readStoredApiKey,
  readStoredSelectedApiProvider,
  type ApiProvider,
} from '@/store/canvas-store';
import type {
  CanvasNode,
} from '@/types/canvas';
import type {
  AgentExecutionPlan,
  AgentImageGenerationPreference,
  AgentPanelMessage,
  AgentProvider,
  AgentRunMeta,
  AgentTaskAttachment,
  AgentTaskContext,
  CanvasAgentAction,
  CanvasAgentToolName,
  CanvasAgentTraceItem,
} from '@/types/agent';

import { PromptMentionInput } from '../nodes/PromptMentionInput';

const AGENT_PANEL_WIDTH = 520;
const DEFAULT_IMAGE_ASPECT_RATIO = 'auto';
const DEFAULT_IMAGE_QUALITY = '1K';
const DEFAULT_RUNNING_HUB_CHANNEL: RunningHubChannel = 'official';

const AGENT_PROVIDERS: Array<{ id: AgentProvider; label: string }> = [
  { id: 'vibe', label: 'Vibe' },
  { id: 'fucheers', label: 'Fucheers' },
  { id: 'comfly', label: 'Comfly' },
  { id: 'zhenzhen', label: 'Zhenzhen' },
  { id: 'runninghub', label: 'RunningHub' },
  { id: 'grsai', label: 'GRS AI' },
];

const AGENT_MODEL_OPTIONS = [
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'auto', label: '自动' },
] as const;

type AgentRunPanelResult = {
  summary: string;
  plan: AgentExecutionPlan;
  actions: CanvasAgentAction[];
  trace: CanvasAgentTraceItem[];
  meta: AgentRunMeta;
};

type CanvasAgentPanelProps = {
  open: boolean;
  projectId?: string;
  projectName: string;
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  nodes?: CanvasNode[];
  onClose: () => void;
  onCreateSourceNodes?: (attachments: AgentTaskAttachment[]) => Record<string, string>;
  onConfirmPlan?: (payload: {
    actions: CanvasAgentAction[];
    attachments: AgentTaskAttachment[];
    plan: AgentExecutionPlan;
  }) => {
    ok: boolean;
    imageGenerationNodeId?: string;
    imageGenerationNodeIds?: string[];
    groupId?: string;
    groupName?: string;
  };
  onConfirmGeneration?: (payload: { nodeId?: string; nodeIds?: string[]; groupId?: string }) => boolean;
};

function createPanelId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = url;
  });
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) {
        resolve(reader.result);
        return;
      }

      reject(new Error('图片文件无效'));
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function getAttachmentLabel(attachment: AgentTaskAttachment, index: number): string {
  return attachment.name || `图片${index + 1}`;
}

function enhanceLocalAgentPrompt(message: string, attachments: AgentTaskAttachment[]): string {
  const clean = stripReferenceMentionTokens(message, attachments).trim();

  if (attachments.length > 0) {
    return [
      clean || '根据参考图完成图像编辑。',
      '保持原图主体身份、构图、镜头角度、姿态、背景和光照关系稳定。',
      '只修改用户明确要求改变的视觉属性，生成自然、干净、高质量的结果。',
    ].join(' ');
  }

  return [
    clean || '创建一张高质量图像。',
    '主体清晰，构图完整，自然光影，色彩协调，细节丰富，画面干净。',
    '避免文字、水印、畸变、瑕疵和低清晰度输出。',
  ].join(' ');
}

function parseRequestedImageCount(message: string): number {
  const normalized = message
    .replace(/[一]/g, '1')
    .replace(/[二两]/g, '2')
    .replace(/[三]/g, '3')
    .replace(/[四]/g, '4')
    .replace(/[五]/g, '5')
    .replace(/[六]/g, '6')
    .replace(/[七]/g, '7')
    .replace(/[八]/g, '8')
    .replace(/[九]/g, '9')
    .replace(/[十]/g, '10');
  const match = normalized.match(/(\d+)\s*(张|个|组|款|幅)/);
  const count = match ? Number(match[1]) : 1;

  return Number.isFinite(count) && count > 1 ? Math.min(8, Math.floor(count)) : 1;
}

function createBatchPromptVariants(message: string, count: number): string[] {
  const clean = stripReferenceMentionTokens(message, []).trim();
  const dogBreeds = ['金毛幼犬', '柯基幼犬', '萨摩耶幼犬', '法国斗牛犬幼犬', '边境牧羊犬幼犬', '柴犬幼犬', '比熊幼犬', '拉布拉多幼犬'];
  const scenes = ['阳光草地', '温馨客厅', '雪地公园', '城市咖啡店门口', '花园小径', '海边木栈道', '儿童房地毯', '秋日森林'];

  return Array.from({ length: count }, (_, index) => [
    clean || '可爱小狗图像',
    `主体：${dogBreeds[index % dogBreeds.length]}。`,
    `场景：${scenes[index % scenes.length]}，与其他图片明显不同。`,
    '可爱、干净、高质量商业摄影，主体清晰，构图完整，自然光影，细节丰富。',
    '避免文字、水印、畸变、低清晰度和重复构图。',
  ].join(' '));
}

function createCleanFallbackPlan(
  message: string,
  attachments: AgentTaskAttachment[],
  provider: AgentProvider,
  model: string,
): { summary: string; plan: AgentExecutionPlan; actions: CanvasAgentAction[] } {
  const selectedAttachments = attachments.slice(0, Math.max(1, attachments.length));
  const promptPreview = enhanceLocalAgentPrompt(message, selectedAttachments);
  const textActionId = 'text-prompt-1';
  const generationActionId = 'image-generation-1';
  const hasSourceImages = selectedAttachments.length > 0;
  const batchCount = hasSourceImages ? 1 : parseRequestedImageCount(message);
  const isBatch = batchCount > 1;
  const batchPrompts = isBatch ? createBatchPromptVariants(message, batchCount) : [];
  const batchActions: CanvasAgentAction[] = batchPrompts.flatMap((prompt, index) => {
    const number = index + 1;
    const nextTextActionId = `text-prompt-${number}`;
    const nextGenerationActionId = `image-generation-${number}`;

    return [
      {
        type: 'create_text_node',
        clientActionId: nextTextActionId,
        title: `Prompt ${number}`,
        text: prompt,
      },
      {
        type: 'create_image_generation_node',
        clientActionId: nextGenerationActionId,
        prompt,
        options: {
          provider,
          model: model === 'auto' ? undefined : model,
        },
      },
      {
        type: 'connect_nodes',
        sourceRef: { kind: 'created', clientActionId: nextTextActionId },
        targetRef: { kind: 'created', clientActionId: nextGenerationActionId },
      },
    ];
  });

  return {
    summary: isBatch
      ? `本地兜底已准备好 ${batchCount} 组批量文生图链路。`
      : hasSourceImages ? '本地兜底已准备好图片编辑链路。' : '本地兜底已准备好文生图链路。',
    plan: {
      stageLabel: '阶段 1/2',
      title: isBatch ? '批量图像生成组' : hasSourceImages ? '图片编辑链路' : '文生图链路',
      brief: [
        { label: '输入', value: selectedAttachments.map((_, index) => `图片${index + 1}`).join('、') || '无' },
        { label: '任务', value: isBatch ? '批量文生图' : hasSourceImages ? '图生图 / 图片编辑' : '文生图' },
        ...(isBatch ? [{ label: '生成任务', value: `${batchCount} 个` }] : []),
        { label: 'Agent', value: `${provider} / ${model}` },
      ],
      steps: isBatch
        ? [
            `创建 ${batchCount} 个提示词文本节点。`,
            `创建 ${batchCount} 个图像生成节点。`,
            '连接每组提示词节点到图像生成节点。',
            '把整批节点放入同一个分组。',
            '等待用户确认后并发触发整组生成。',
          ]
        : hasSourceImages
        ? [
            '使用上传图片节点作为上游输入。',
            '创建 1 个图像生成节点。',
            '连接源图节点到图像生成节点。',
            '把增强后的 prompt 写入图像生成节点。',
            '等待用户确认后再触发生成。',
          ]
        : [
            '把用户需求改写成图像生成提示词。',
            '创建 1 个提示词文本节点。',
            '创建 1 个图像生成节点。',
            '连接提示词节点到图像生成节点。',
            '等待用户确认后再触发生成。',
          ],
      promptPreview,
      confirmationLabel: '创建到画布',
    },
    actions: hasSourceImages
      ? [
          {
            type: 'create_image_generation_node',
            clientActionId: generationActionId,
            prompt: promptPreview,
            options: {
              provider,
              model: model === 'auto' ? undefined : model,
            },
          },
          ...selectedAttachments.flatMap((attachment) => (
            attachment.sourceNodeId
              ? [{
                  type: 'connect_nodes' as const,
                  sourceRef: { kind: 'existing' as const, nodeId: attachment.sourceNodeId },
                  targetRef: { kind: 'created' as const, clientActionId: generationActionId },
                }]
              : []
          )),
        ]
      : isBatch
        ? batchActions
      : [
          {
            type: 'create_text_node',
            clientActionId: textActionId,
            title: 'Agent Prompt',
            text: promptPreview,
          },
          {
            type: 'create_image_generation_node',
            clientActionId: generationActionId,
            prompt: promptPreview,
            options: {
              provider,
              model: model === 'auto' ? undefined : model,
            },
          },
          {
            type: 'connect_nodes',
            sourceRef: { kind: 'created', clientActionId: textActionId },
            targetRef: { kind: 'created', clientActionId: generationActionId },
          },
        ],
  };
}

function createPanelFallbackResult(
  message: string,
  attachments: AgentTaskAttachment[],
  provider: AgentProvider,
  model: string,
  reason: string,
): AgentRunPanelResult {
  const fallback = createCleanFallbackPlan(message, attachments, provider, model);

  return {
    ...fallback,
    trace: [
      {
        id: createPanelId('agent-trace'),
        type: 'thinking',
        content: '模型请求没有完成，我先用本地规则准备一个可检查的画布链路。',
      },
      ...fallback.actions.map((action): CanvasAgentTraceItem => {
        const toolName: CanvasAgentToolName =
          action.type === 'create_text_node'
            ? 'create_text_node'
            : action.type === 'create_image_generation_node'
              ? 'create_image_generation_node'
              : action.type === 'connect_nodes'
                ? 'connect_nodes'
                : action.type === 'create_uploaded_image_node'
                  ? 'create_uploaded_image_node'
                  : 'run_image_generation';

        return {
          id: createPanelId('agent-trace'),
          type: 'tool_call',
          call: {
            id: createPanelId('agent-tool-call'),
            name: toolName,
            input: action as unknown as Record<string, unknown>,
            risk: toolName === 'run_image_generation' ? 'generate' : 'write',
            requiresConfirmation: toolName === 'run_image_generation',
          },
        };
      }),
    ],
    meta: {
      usedModel: false,
      usedFallback: true,
      fallbackReason: reason,
      model,
    },
  };
}

async function requestAgentRun(params: {
  message: string;
  context: AgentTaskContext;
  provider: AgentProvider;
  model: string;
}): Promise<AgentRunPanelResult> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: params.message,
      context: params.context,
      provider: params.provider,
      model: params.model,
      apiKey: readStoredApiKey('text', params.provider),
    }),
  });
  const json = await response.json() as
    | {
        ok: true;
        result: AgentRunPanelResult;
      }
    | {
        ok: false;
        error: string;
      };

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? 'Agent 请求失败' : json.error);
  }

  return json.result;
}

function getAgentCanvasNodeChips(message: Extract<AgentPanelMessage, { type: 'execution_plan' }>) {
  if (message.groupId) {
    const generationCount = message.imageGenerationNodeIds?.length || 0;

    return [{
      id: `${message.id}-${message.groupId}`,
      title: message.groupName || message.plan.title || '批量生成组',
      typeLabel: generationCount > 0 ? `${generationCount} 个生成任务` : '分组',
    }];
  }

  return message.actions
    .filter((action) => (
      action.type === 'create_text_node' ||
      action.type === 'create_uploaded_image_node' ||
      action.type === 'create_image_generation_node'
    ))
    .map((action, index) => {
      if (action.type === 'create_text_node') {
        return {
          id: `${message.id}-${action.clientActionId}-${index}`,
          title: action.title || message.plan.title || '提示词',
          typeLabel: '文本节点',
        };
      }

      if (action.type === 'create_uploaded_image_node') {
        const attachment = message.attachments.find((item) => item.id === action.attachmentId);

        return {
          id: `${message.id}-${action.clientActionId}-${index}`,
          title: action.title || attachment?.name || '上传图片',
          typeLabel: '图片节点',
        };
      }

      return {
        id: `${message.id}-${action.clientActionId}-${index}`,
        title: message.plan.title || '图像生成',
        typeLabel: '文生图',
      };
    });
}

function getAgentResultText(message: Extract<AgentPanelMessage, { type: 'execution_plan' }>) {
  if (message.status === 'error') {
    return '节点创建失败，请调整需求后重试。';
  }

  if (message.status === 'generation_error') {
    return '生成已结束，但有任务失败。请查看画布节点状态。';
  }

  if (message.status === 'executed') {
    return '已创建，放到画布上了。生成完成后可以直接看到效果。';
  }

  if (message.status === 'generating') {
    return '已开始生成，结果会回到画布节点里。';
  }

  return '搞定，已经放到画布上了。';
}

function resolveAutoImageProvider(): ApiProvider {
  const providerWithKey = API_PROVIDERS.find((candidate) => Boolean(readStoredApiKey('image', candidate)));

  return providerWithKey ?? readStoredSelectedApiProvider('image');
}

function getImageModelDefault(provider: ApiProvider): string {
  const options = IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider];

  return options.find((option) => option.id === 'gpt-image-2')?.id ?? options[0]?.id ?? 'gpt-image-2';
}

export const CanvasAgentPanel = memo(function CanvasAgentPanel({
  open,
  projectId,
  projectName,
  nodeCount,
  edgeCount,
  groupCount,
  nodes = [],
  onClose,
  onCreateSourceNodes,
  onConfirmPlan,
  onConfirmGeneration,
}: CanvasAgentPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<AgentTaskAttachment[]>([]);
  const [attachments, setAttachments] = useState<AgentTaskAttachment[]>([]);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState<AgentProvider>('vibe');
  const [model, setModel] = useState<string>(AGENT_MODEL_OPTIONS[0].id);
  const [messages, setMessages] = useState<AgentPanelMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyThreads, setHistoryThreads] = useState(() => listAgentThreads(projectId, projectName));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generationPreferenceOpen, setGenerationPreferenceOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [imagePreference, setImagePreference] = useState<AgentImageGenerationPreference>({
    mode: 'auto',
    aspectRatio: DEFAULT_IMAGE_ASPECT_RATIO,
    quality: DEFAULT_IMAGE_QUALITY,
    runningHubChannel: DEFAULT_RUNNING_HUB_CHANNEL,
  });

  const resolvedImagePreference = useMemo((): Required<AgentImageGenerationPreference> => {
    const autoProvider = resolveAutoImageProvider();
    const selectedProvider = imagePreference.mode === 'manual'
      ? imagePreference.provider ?? autoProvider
      : autoProvider;
    const modelOptions = IMAGE_MODEL_OPTIONS_BY_PROVIDER[selectedProvider];
    const selectedModel = modelOptions.some((option) => option.id === imagePreference.model)
      ? imagePreference.model as string
      : getImageModelDefault(selectedProvider);

    return {
      mode: imagePreference.mode,
      provider: selectedProvider,
      model: selectedModel,
      runningHubChannel: selectedProvider === 'runninghub'
        ? imagePreference.runningHubChannel ?? DEFAULT_RUNNING_HUB_CHANNEL
        : DEFAULT_RUNNING_HUB_CHANNEL,
      aspectRatio: imagePreference.aspectRatio ?? DEFAULT_IMAGE_ASPECT_RATIO,
      quality: imagePreference.quality ?? DEFAULT_IMAGE_QUALITY,
    };
  }, [imagePreference]);

  const mentionImages = useMemo(
    () => attachments.map((attachment, index) => ({
      id: attachment.id,
      imageUrl: attachment.previewUrl,
      previewUrl: attachment.previewUrl,
      alt: getAttachmentLabel(attachment, index),
    })),
    [attachments],
  );
  const hasUserDecisionPending = messages.some((message) => (
    (message.type === 'attachment_selection' && message.status === 'waiting') ||
    (
      message.type === 'execution_plan' &&
      message.status === 'waiting_generation_confirmation'
    )
  ));

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraft(loadAgentDraft(projectId, projectName));
      setHistoryThreads(listAgentThreads(projectId, projectName));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [projectId, projectName]);

  useEffect(() => {
    saveAgentDraft(projectId, projectName, draft);
  }, [draft, projectId, projectName]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const saved = saveAgentThread({
      threadId,
      projectId,
      projectName,
      messages,
    });

    if (!threadId) {
      window.setTimeout(() => setThreadId(saved.id), 0);
    }

    window.setTimeout(() => setHistoryThreads(listAgentThreads(projectId, projectName)), 0);
  }, [messages, projectId, projectName, threadId]);

  const handleUploadClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));

    if (!files.length) {
      event.target.value = '';
      return;
    }

    void Promise.all(files.map(async (file) => {
      const previewUrl = URL.createObjectURL(file);
      const [imageUrl, dimensions] = await Promise.all([
        readImageFileAsDataUrl(file),
        readImageDimensions(previewUrl),
      ]);

      return {
        id: createPanelId('agent-attachment'),
        kind: 'image' as const,
        name: file.name,
        mimeType: file.type || 'image/*',
        imageUrl,
        previewUrl,
        width: dimensions.width || undefined,
        height: dimensions.height || undefined,
        sizeBytes: file.size,
        status: 'ready' as const,
      };
    })).then((nextAttachments) => {
      setAttachments((current) => [...current, ...nextAttachments]);
    });

    event.target.value = '';
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);

      if (removed?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }, []);

  const runAgent = useCallback(async (params: {
    prompt: string;
    taskAttachments: AgentTaskAttachment[];
    selectedAttachments: AgentTaskAttachment[];
    userMessageCreatedAt: string;
  }) => {
    const context = buildAgentTaskContext({
      project: {
        id: projectId,
        name: projectName,
      },
      message: params.prompt,
      attachments: params.taskAttachments,
      canvasSnapshot: {
        nodes: [],
        edges: [],
        groupCount,
      },
      recentMessages: messages
        .filter((message): message is Extract<AgentPanelMessage, { type: 'text' }> => message.type === 'text')
        .slice(-6)
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
    });
    const requestContext: AgentTaskContext = {
      ...context,
      canvasSummary: {
        nodeCount,
        edgeCount,
        groupCount,
      },
      input: {
        ...context.input,
        attachments: params.selectedAttachments,
        referencedAttachmentIds: params.selectedAttachments.map((attachment) => attachment.id),
      },
    };
    let result: AgentRunPanelResult;

    try {
      result = await requestAgentRun({
        message: params.prompt,
        context: requestContext,
        provider,
        model,
      });
    } catch (error) {
      result = createPanelFallbackResult(
        params.prompt,
        params.selectedAttachments,
        provider,
        model,
        error instanceof Error ? error.message : 'Agent 请求失败',
      );
    }

    const preferenceActions = result.actions.map((action) => (
      action.type === 'create_image_generation_node'
        ? {
            ...action,
            options: {
              ...action.options,
              provider: resolvedImagePreference.provider,
              model: resolvedImagePreference.model,
              runningHubChannel: resolvedImagePreference.provider === 'runninghub'
                ? resolvedImagePreference.runningHubChannel
                : undefined,
              aspectRatio: resolvedImagePreference.aspectRatio,
              quality: resolvedImagePreference.quality,
            },
          }
        : action
    ));
    const executionResult = onConfirmPlan?.({
      actions: preferenceActions,
      attachments: params.selectedAttachments,
      plan: result.plan,
    }) ?? { ok: true };

    setMessages((current) => [
      ...current,
      {
        id: createPanelId('agent-message'),
        role: 'user',
        type: 'text',
        content: params.prompt,
        attachmentIds: params.selectedAttachments.map((attachment) => attachment.id),
        createdAt: params.userMessageCreatedAt,
      },
      {
        id: createPanelId('agent-plan'),
        role: 'agent',
        type: 'execution_plan',
        summary: result.summary,
        plan: result.plan,
        actions: result.actions,
        attachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
        trace: result.trace,
        meta: result.meta,
        imageGenerationNodeId: executionResult.imageGenerationNodeId,
        imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
        groupId: executionResult.groupId,
        groupName: executionResult.groupName,
        status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
        createdAt: new Date().toISOString(),
      },
    ]);
    setPendingPrompt(null);
  }, [
    edgeCount,
    groupCount,
    messages,
    model,
    nodeCount,
    onConfirmPlan,
    projectId,
    projectName,
    provider,
    resolvedImagePreference,
  ]);

  const handleSubmit = useCallback(() => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft || busy || hasUserDecisionPending) {
      return;
    }

    setBusy(true);
    const now = new Date().toISOString();
    const sourceNodeIdsByAttachmentId = attachments.length
      ? onCreateSourceNodes?.(attachments) ?? {}
      : {};
    const taskAttachments = attachments.map((attachment) => ({
      ...attachment,
      sourceNodeId: sourceNodeIdsByAttachmentId[attachment.id] ?? attachment.sourceNodeId,
    }));
    const referencedAttachmentIds = getReferencedAgentAttachmentIds(trimmedDraft, taskAttachments);
    const selectedAttachments = referencedAttachmentIds.length
      ? taskAttachments.filter((attachment) => referencedAttachmentIds.includes(attachment.id))
      : taskAttachments;

    if (Object.keys(sourceNodeIdsByAttachmentId).length > 0) {
      setAttachments(taskAttachments);
    }

    if (taskAttachments.length > 1 && referencedAttachmentIds.length === 0) {
      setMessages((current) => [
        ...current,
        {
          id: createPanelId('agent-message'),
          role: 'user',
          type: 'text',
          content: trimmedDraft,
          attachmentIds: taskAttachments.map((attachment) => attachment.id),
          createdAt: now,
        },
        {
          id: createPanelId('agent-selection'),
          role: 'agent',
          type: 'attachment_selection',
          title: '选择要编辑的图片',
          attachmentIds: taskAttachments.map((attachment) => attachment.id),
          attachments: taskAttachments.map((attachment) => ({ ...attachment })),
          prompt: trimmedDraft,
          provider,
          model,
          reason: '你上传了多张图片，请选择这次任务要使用的图片。',
          status: 'waiting',
          createdAt: new Date().toISOString(),
        },
      ]);
      setPendingPrompt(null);
      setDraft('');
      setBusy(false);
      return;
    }

    setDraft('');
    setPendingPrompt(trimmedDraft);
    void runAgent({
      prompt: trimmedDraft,
      taskAttachments,
      selectedAttachments,
      userMessageCreatedAt: now,
    }).finally(() => {
      setBusy(false);
      setPendingPrompt(null);
    });
  }, [
    attachments,
    busy,
    draft,
    hasUserDecisionPending,
    model,
    onCreateSourceNodes,
    provider,
    runAgent,
  ]);

  const handleSelectAttachmentForPlan = useCallback((messageId: string, attachmentId: string) => {
    if (busy) {
      return;
    }

    const selectionMessage = messages.find((message) => (
      message.id === messageId &&
      message.type === 'attachment_selection' &&
      message.status === 'waiting'
    ));

    if (!selectionMessage || selectionMessage.type !== 'attachment_selection') {
      return;
    }

    const selectedAttachment = selectionMessage.attachments.find((attachment) => attachment.id === attachmentId);

    if (!selectedAttachment) {
      return;
    }

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'attachment_selection'
        ? { ...message, status: 'selected', selectedAttachmentId: attachmentId }
        : message
    )));
    setBusy(true);
    setPendingPrompt(selectionMessage.prompt);
    void runAgent({
      prompt: selectionMessage.prompt,
      taskAttachments: selectionMessage.attachments,
      selectedAttachments: [selectedAttachment],
      userMessageCreatedAt: new Date().toISOString(),
    }).finally(() => {
      setBusy(false);
      setPendingPrompt(null);
    });
  }, [busy, messages, runAgent]);

  const handleConfirmGeneration = useCallback((messageId: string) => {
    const planMessage = messages.find((message) => (
      message.id === messageId &&
      message.type === 'execution_plan' &&
      message.status === 'waiting_generation_confirmation'
    ));

    if (
      !planMessage ||
      planMessage.type !== 'execution_plan' ||
      (!planMessage.imageGenerationNodeId && !planMessage.imageGenerationNodeIds?.length && !planMessage.groupId)
    ) {
      return;
    }

    const started = onConfirmGeneration?.({
      nodeId: planMessage.imageGenerationNodeId,
      nodeIds: planMessage.imageGenerationNodeIds,
      groupId: planMessage.groupId,
    }) ?? false;

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'execution_plan'
        ? { ...message, status: started ? 'generating' : 'error' }
        : message
    )));
  }, [messages, onConfirmGeneration]);

  const visibleAttachments = attachments.slice(0, 3);
  const hiddenAttachmentCount = Math.max(0, attachments.length - visibleAttachments.length);
  const activeImageModels = IMAGE_MODEL_OPTIONS_BY_PROVIDER[resolvedImagePreference.provider];
  const showAgentSuggestions = messages.length === 0 && !busy;
  const imagePreferenceControlsDisabled = imagePreference.mode === 'auto';

  useEffect(() => {
    setMessages((current) => {
      let changed = false;
      const nextMessages = current.map((message) => {
        if (message.type !== 'execution_plan' || message.status !== 'generating') {
          return message;
        }

        const trackedNodeIds = message.imageGenerationNodeIds?.length
          ? message.imageGenerationNodeIds
          : message.imageGenerationNodeId
            ? [message.imageGenerationNodeId]
            : [];

        if (trackedNodeIds.length === 0) {
          return message;
        }

        const trackedNodes = trackedNodeIds
          .map((nodeId) => nodes.find((node) => node.id === nodeId && node.type === 'image_generation'))
          .filter((node): node is Extract<CanvasNode, { type: 'image_generation' }> => Boolean(node));

        if (trackedNodes.length === 0 || trackedNodes.length !== trackedNodeIds.length) {
          return message;
        }

        const stillGenerating = trackedNodes.some((node) => node.data.status === 'generating');

        if (stillGenerating) {
          return message;
        }

        const hasError = trackedNodes.some((node) => node.data.status === 'error');
        changed = true;

        return {
          ...message,
          status: hasError ? 'generation_error' as const : 'executed' as const,
        };
      });

      return changed ? nextMessages : current;
    });
  }, [nodes]);

  return (
    <aside
      className={[
        'fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-white/10 bg-[#11141b] text-white shadow-[-24px_0_60px_rgba(0,0,0,0.35)] transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
      style={{ width: AGENT_PANEL_WIDTH }}
      aria-hidden={!open}
    >
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#11141b]">
            <Bot size={17} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-sm font-medium">Canvas Agent</div>
            <div className="text-[11px] text-white/45">画布工具操作员</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="历史会话"
            onClick={() => {
              setHistoryThreads(listAgentThreads(projectId, projectName));
              setHistoryOpen((current) => !current);
            }}
          >
            <History size={16} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭 Agent 面板"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="max-h-72 overflow-y-auto border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-white/70">
              <Clock3 size={14} />
              历史会话
            </div>
            <button
              type="button"
              className="h-7 rounded-md bg-white/[0.04] px-2 text-xs text-white/62 transition hover:bg-white/[0.08]"
              onClick={() => {
                setMessages([]);
                setThreadId(undefined);
                setHistoryOpen(false);
              }}
            >
              新建
            </button>
          </div>
          {historyThreads.length ? (
            <div className="space-y-2">
              {historyThreads.map((thread) => (
                <div
                  key={thread.id}
                  className={[
                    'group flex items-center gap-2 rounded-md transition',
                    thread.id === threadId ? 'bg-white/[0.08]' : 'bg-white/[0.035] hover:bg-white/[0.06]',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                    onClick={() => {
                      setMessages(restoreAgentThreadMessages(thread.messages));
                      setThreadId(thread.id);
                      setHistoryOpen(false);
                    }}
                  >
                    <div className="truncate text-xs font-medium text-white/78">{thread.title}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-white/38">
                      <span>{thread.messages.length} 条消息</span>
                      <span>{new Date(thread.updatedAt).toLocaleString()}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/34 opacity-0 transition hover:bg-white/[0.08] hover:text-white/76 group-hover:opacity-100"
                    aria-label="删除历史会话"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteAgentThread(thread.id);
                      setHistoryThreads(listAgentThreads(projectId, projectName));

                      if (thread.id === threadId) {
                        setMessages([]);
                        setThreadId(undefined);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-white/12 px-3 py-4 text-xs text-white/42">
              当前项目还没有 Agent 历史会话。
            </div>
          )}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((message) => {
            if (message.type === 'text') {
              return (
                <div
                  key={message.id}
                  className={[
                    'rounded-lg px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'ml-10 bg-white text-[#11141b]'
                      : 'mr-10 bg-white/[0.04] text-white/76',
                  ].join(' ')}
                >
                  {stripReferenceMentionTokens(message.content, attachments)}
                </div>
              );
            }

            if (message.type === 'attachment_selection') {
              return (
                <div key={message.id} className="rounded-lg bg-[#171b24] p-3">
                  <div className="text-sm font-semibold">{message.title}</div>
                  {message.reason ? (
                    <div className="mt-1 text-xs leading-5 text-white/50">{message.reason}</div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {message.attachments.map((attachment, index) => {
                      const selected = message.selectedAttachmentId === attachment.id;

                      return (
                        <button
                          key={attachment.id}
                          type="button"
                          className={[
                            'overflow-hidden rounded-md bg-white/[0.04] text-left transition',
                            selected ? 'bg-white/[0.12]' : 'hover:bg-white/[0.08]',
                          ].join(' ')}
                          disabled={message.status !== 'waiting'}
                          onClick={() => handleSelectAttachmentForPlan(message.id, attachment.id)}
                        >
                          <div className="relative aspect-square">
                            {attachment.previewUrl ? (
                              <NextImage
                                src={attachment.previewUrl}
                                alt={attachment.name || `图片${index + 1}`}
                                fill
                                sizes="140px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-white/[0.04] text-[11px] text-white/35">
                                节点
                              </div>
                            )}
                            {selected ? (
                              <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#11141b]">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : null}
                          </div>
                          <div className="truncate px-2 py-1.5 text-[11px] text-white/62">{`图片${index + 1}`}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (message.type === 'execution_plan') {
              const nodeChips = getAgentCanvasNodeChips(message);

              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9ff4a]/15 text-[#c9ff4a] shadow-[0_0_18px_rgba(201,255,74,0.3)]">
                      <Bot size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-6 text-white/90">
                        {getAgentResultText(message)}
                      </div>

                      {nodeChips.length ? (
                        <div className="mt-3">
                          <div className="mb-2 text-[11px] text-white/34">画布节点（{nodeChips.length}）</div>
                          <div className="flex flex-wrap gap-2">
                            {nodeChips.map((chip) => (
                              <div
                                key={chip.id}
                                className="flex max-w-full items-center gap-1.5 rounded-md bg-[#25412b] px-2.5 py-1.5 text-xs text-[#dfffd2]"
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9ff4a]" />
                                <span className="truncate font-medium">{chip.title}</span>
                                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/62">
                                  {chip.typeLabel}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.status === 'waiting_generation_confirmation' ? (
                        <button
                          type="button"
                          className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#c9ff1a] px-4 text-sm font-semibold text-[#11141b] transition hover:bg-[#d6ff48]"
                          onClick={() => handleConfirmGeneration(message.id)}
                        >
                          <Sparkles size={15} />
                          确认生成
                        </button>
                      ) : null}

                      {message.status === 'generating' ? (
                        <div className="mt-4 flex h-8 items-center gap-2 text-xs text-white/50">
                          <Loader2 size={14} className="animate-spin" />
                          生成已开始
                        </div>
                      ) : null}

                      {message.status === 'executed' ? (
                        <div className="mt-4 flex h-8 items-center gap-2 text-xs text-[#c9ff4a]">
                          <Check size={14} />
                          生成已完成
                        </div>
                      ) : null}

                      {message.status === 'generation_error' ? (
                        <div className="mt-4 flex h-8 items-center gap-2 text-xs text-[#ffb4a8]">
                          生成已结束，部分任务失败
                        </div>
                      ) : null}

                      {message.status === 'error' ? (
                        <div className="mt-3 text-xs leading-5 text-[#ffb4a8]">
                          没能完成这次画布操作，请调整需求后重试。
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}
          {pendingPrompt ? (
            <div className="rounded-lg px-3 py-2 text-sm leading-6 ml-10 bg-white text-[#11141b]">
              {stripReferenceMentionTokens(pendingPrompt, attachments)}
            </div>
          ) : null}
          {busy ? (
            <div className="flex items-start gap-3 rounded-lg bg-transparent px-1 py-2">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9ff4a]/15 text-[#c9ff4a] shadow-[0_0_18px_rgba(201,255,74,0.3)]">
                <Bot size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#c9ff1a]">
                  正在思考中......
                  <span className="text-[11px] font-normal text-white/38">请稍候</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-white/45">
                  正在理解需求，并准备画布节点。
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-white/62">
                  <span className="h-2 w-2 rounded-full bg-[#c9ff1a] shadow-[0_0_10px_rgba(201,255,26,0.85)]" />
                  正在生成回复...
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <div className="relative rounded-[18px] bg-[#191b20] p-4 shadow-[0_14px_48px_rgba(0,0,0,0.24)]">
          {settingsOpen ? (
            <div className="absolute bottom-16 left-4 right-4 z-10 rounded-xl bg-[#11141b] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-medium text-white/70">Agent 模型</div>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white"
                  aria-label="关闭模型设置"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="relative">
                  <span className="mb-1 block text-[11px] text-white/42">渠道</span>
                  <select
                    className="h-9 w-full appearance-none rounded-md bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:bg-white/[0.07]"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as AgentProvider)}
                  >
                    {AGENT_PROVIDERS.map((option) => (
                      <option key={option.id} value={option.id} className="bg-[#11141b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute bottom-2.5 right-2 text-white/42" />
                </label>
                <label className="relative">
                  <span className="mb-1 block text-[11px] text-white/42">模型</span>
                  <select
                    className="h-9 w-full appearance-none rounded-md bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:bg-white/[0.07]"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  >
                    {AGENT_MODEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id} className="bg-[#11141b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute bottom-2.5 right-2 text-white/42" />
                </label>
              </div>
            </div>
          ) : null}

          {generationPreferenceOpen ? (
            <div className="absolute bottom-16 left-3 right-3 z-10 rounded-xl bg-[#11141b] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-medium text-white/78">生成偏好</div>
                <button
                  type="button"
                  className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/72 transition hover:bg-white/[0.12]"
                  onClick={() => {
                    setImagePreference((current) => ({
                      ...current,
                      mode: current.mode === 'auto' ? 'manual' : 'auto',
                    }));
                  }}
                >
                  {imagePreference.mode === 'auto' ? '自动' : '手动'}
                </button>
              </div>
              <div className="mb-3 grid grid-cols-2 rounded-lg bg-black/45 p-1 text-xs font-medium">
                <button type="button" className="h-8 rounded-md bg-white/[0.14] text-white">
                  图片
                </button>
                <button type="button" className="h-8 cursor-not-allowed rounded-md text-white/32" disabled>
                  视频
                </button>
              </div>
              <div
                className={[
                  'mb-3 grid grid-cols-3 gap-1.5 transition-opacity',
                  imagePreferenceControlsDisabled ? 'opacity-35' : 'opacity-100',
                ].join(' ')}
              >
                {['auto', '1:1', '16:9', '9:16', '4:3', '3:4'].map((ratio) => {
                  const selected = resolvedImagePreference.aspectRatio === ratio;

                  return (
                    <button
                      key={ratio}
                      type="button"
                      className={[
                        'h-8 rounded-md px-2 text-xs transition',
                        imagePreferenceControlsDisabled
                          ? 'cursor-not-allowed'
                          : 'hover:bg-white/[0.09]',
                        selected ? 'bg-[#9dff51] text-[#11141b]' : 'bg-white/[0.05] text-white/54',
                      ].join(' ')}
                      disabled={imagePreferenceControlsDisabled}
                      onClick={() => {
                        setImagePreference((current) => ({
                          ...current,
                          mode: 'manual',
                          aspectRatio: ratio,
                        }));
                      }}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
              <div
                className={[
                  'mb-3 flex gap-1.5 transition-opacity',
                  imagePreferenceControlsDisabled ? 'opacity-35' : 'opacity-100',
                ].join(' ')}
              >
                {IMAGE_SIZE_OPTIONS.map((option) => {
                  const selected = resolvedImagePreference.quality === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      className={[
                        'h-8 rounded-md px-3 text-xs font-medium transition',
                        imagePreferenceControlsDisabled
                          ? 'cursor-not-allowed'
                          : 'hover:bg-white/[0.09]',
                        selected ? 'bg-[#9dff51] text-[#11141b]' : 'bg-white/[0.05] text-white/54',
                      ].join(' ')}
                      disabled={imagePreferenceControlsDisabled}
                      onClick={() => {
                        setImagePreference((current) => ({
                          ...current,
                          mode: 'manual',
                          quality: option,
                        }));
                      }}
                    >
                      {option.toLowerCase()}
                    </button>
                  );
                })}
              </div>
              <div
                className={[
                  'grid grid-cols-2 gap-2 transition-opacity',
                  imagePreferenceControlsDisabled ? 'opacity-35' : 'opacity-100',
                ].join(' ')}
              >
                <label className="relative">
                  <span className="mb-1 block text-[11px] text-white/42">图片渠道</span>
                  <select
                    className={[
                      'h-9 w-full appearance-none rounded-md bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:bg-white/[0.07]',
                      imagePreferenceControlsDisabled ? 'cursor-not-allowed' : '',
                    ].join(' ')}
                    value={resolvedImagePreference.provider}
                    disabled={imagePreferenceControlsDisabled}
                    onChange={(event) => {
                      const nextProvider = event.target.value as ApiProvider;

                      setImagePreference((current) => ({
                        ...current,
                        mode: 'manual',
                        provider: nextProvider,
                        model: getImageModelDefault(nextProvider),
                      }));
                    }}
                  >
                    {API_PROVIDERS.map((option) => (
                      <option key={option} value={option} className="bg-[#11141b]">
                        {getApiProviderLabel(option)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute bottom-2.5 right-2 text-white/42" />
                </label>
                <label className="relative">
                  <span className="mb-1 block text-[11px] text-white/42">图片模型</span>
                  <select
                    className={[
                      'h-9 w-full appearance-none rounded-md bg-white/[0.04] px-3 text-xs text-white outline-none transition focus:bg-white/[0.07]',
                      imagePreferenceControlsDisabled ? 'cursor-not-allowed' : '',
                    ].join(' ')}
                    value={resolvedImagePreference.model}
                    disabled={imagePreferenceControlsDisabled}
                    onChange={(event) => {
                      setImagePreference((current) => ({
                        ...current,
                        mode: 'manual',
                        provider: resolvedImagePreference.provider,
                        model: event.target.value,
                      }));
                    }}
                  >
                    {activeImageModels.map((option) => (
                      <option key={option.id} value={option.id} className="bg-[#11141b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute bottom-2.5 right-2 text-white/42" />
                </label>
              </div>
            </div>
          ) : null}

          {showAgentSuggestions ? (
            <div className="mb-4">
              <div className="mb-2 text-xl font-semibold">Hi ZerinnAi!</div>
              <div className="text-sm text-white/55">告诉 Agent 你希望它在画布上完成什么。</div>
              <div className="mt-4 grid gap-2">
                {['创建一张可爱小狗的图片', '分析画面风格', '基于上传图片生成变体'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-md bg-white/[0.04] px-3 text-left text-xs text-white/72 transition hover:bg-white/[0.07]"
                    onClick={() => setDraft(label)}
                  >
                    <Sparkles size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-[72px] gap-3">
            <div className="flex shrink-0 items-start">
              {attachments.length ? (
                <div className="flex items-start gap-1.5">
                  {visibleAttachments.map((attachment, index) => (
                    <div key={attachment.id} className="group relative h-14 w-14 overflow-hidden rounded-lg bg-white/[0.04]">
                      <NextImage
                        src={attachment.previewUrl}
                        alt={getAttachmentLabel(attachment, index)}
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/72 text-white group-hover:flex"
                        aria-label="移除图片"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {hiddenAttachmentCount > 0 ? (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/[0.04] text-xs font-medium text-white/58">
                      +{hiddenAttachmentCount}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="mt-5 flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/52 transition hover:bg-white/[0.14] hover:text-white"
                    aria-label="上传图片"
                    onClick={handleUploadClick}
                  >
                    <ImagePlus size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/[0.035] text-white/42 transition hover:bg-white/[0.07] hover:text-white/66"
                  aria-label="上传图片"
                  onClick={handleUploadClick}
                >
                  <ImagePlus size={18} />
                </button>
              )}
            </div>

            <PromptMentionInput
              value={draft}
              connectedImages={mentionImages}
              placeholder="描述你希望 Agent 在画布上完成什么，可以用 @ 引用上传图片。"
              className="agent-mention-input min-h-[64px] max-h-32 flex-1 overflow-y-auto px-1 py-1 text-sm leading-6 text-white outline-none"
              onChange={setDraft}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-xs font-medium text-white/72 transition hover:bg-white/[0.1]"
                aria-label="Agent 模型设置"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setSettingsOpen((current) => !current);
                  setGenerationPreferenceOpen(false);
                }}
              >
                <Sparkles size={13} />
                Agent
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-white/38 transition hover:bg-white/[0.08] hover:text-white/70" aria-label="引用图片">
                <AtSign size={16} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-white/38 transition hover:bg-white/[0.08] hover:text-white/70" aria-label="Ask 模式">
                <MessageSquare size={15} />
              </button>
              <button
                type="button"
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/[0.08] hover:text-white/70',
                  generationPreferenceOpen ? 'bg-white/[0.08] text-[#9dff51]' : 'text-white/38',
                ].join(' ')}
                aria-label="生成偏好"
                aria-expanded={generationPreferenceOpen}
                title={`${getImageModelLabel(resolvedImagePreference.model)} / ${resolvedImagePreference.aspectRatio} / ${resolvedImagePreference.quality}`}
                onClick={() => {
                  setGenerationPreferenceOpen((current) => !current);
                  setSettingsOpen(false);
                }}
              >
                <SlidersHorizontal size={15} />
              </button>
              <div className="hidden truncate text-[11px] text-white/34 sm:block">
                {attachments.length} 张图片 / {nodeCount} 个节点 / {edgeCount} 条连线
              </div>
            </div>

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#11141b] transition hover:bg-white/90 disabled:cursor-default disabled:bg-white/30"
              aria-label="发送给 Agent"
              disabled={!draft.trim() || busy || hasUserDecisionPending}
              onClick={handleSubmit}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFilesSelected}
      />
    </aside>
  );
});
