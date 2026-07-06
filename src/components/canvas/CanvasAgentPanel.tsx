'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import {
  Check,
  ChevronRight,
  Clock3,
  Copy,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { buildAgentTaskContext, getReferencedAgentAttachmentIds } from '@/lib/agent-task-context';
import { buildCanvasRuntimeSnapshot } from '@/lib/canvas/runtime-snapshot';
import UniqueLoading from '@/components/ui/grid-loading';
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
} from '@/lib/image-generation-options';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_IMAGE_QUALITY,
  DEFAULT_AGENT_RUNNING_HUB_CHANNEL,
  getImageModelDefault,
  resolveAgentImageGenerationPreference,
} from '@/lib/agent-image-preference';
import { stripReferenceMentionTokens } from '@/lib/prompt-mentions';
import {
  getApiProviderLabel,
  readStoredApiKey,
  readStoredSelectedApiProvider,
  type ApiProvider,
} from '@/store/canvas-store';
import {
  attachExistingSourceReferencesToImageActions,
  restoreReferenceMentionLabelsInActions,
} from '@/lib/agent-actions';
import { fetchAgentApi } from '@/lib/agent-api-fetch';
import {
  type AgentImageAttachmentUploadKind,
  type AgentImageDerivativeOptions,
  createHostedAgentImageAttachment,
  dataUrlToImageBlob,
} from '@/lib/agent-attachment-upload';
import {
  buildAgentEcomPlannerPromptDisplayBlocks,
  ECOM_PLANNER_PRESET_ID,
  ECOM_PLANNER_PROMPT_TEMPLATE,
  getAgentEcomPlannerAttachmentRole,
  getAgentEcomPlannerProductAttachments,
  getAgentEcomPlannerSubmitBlockReason,
  hasAgentEcomPlannerProductImage,
  type AgentEcomPlannerAttachmentRole,
  type AgentEcomPlannerOption,
} from '@/lib/agent-ecom-planner';
import { AGENT_MODEL_OPTIONS } from '@/lib/agent-model-options';
import {
  AGENT_TEXT_PROVIDER_OPTIONS,
  AGENT_TEXT_PROVIDERS,
  isAgentTextProvider,
} from '@/lib/agent-provider-options';
import {
  formatEcomPlannerOptionErrorText,
  formatAgentChatErrorText,
  sanitizeAgentChatText,
  shouldShowAgentInternalText,
} from '@/lib/agent-chat-display';
import { getAgentCanvasNodeChips } from '@/lib/agent-canvas-node-chips';
import {
  AGENT_PANEL_DEFAULT_WIDTH,
  AGENT_PANEL_FLOATING_INSET,
  AGENT_PANEL_WIDTH_STORAGE_KEY,
  clampAgentPanelWidth,
  resolveStoredAgentPanelWidth,
} from '@/lib/agent-panel-layout';
import {
  getAgentPlanfPresetPanelOpenState,
  getAgentReferenceUploadNudgeRequestForPlanfPanel,
  shouldShowAgentReferenceUploadNudge,
} from '@/lib/agent-reference-upload-nudge';
import {
  getPlanfEcomImageSummary,
  getPlanfEcomPlanStatusLabel,
  getPlanfEcomSlotKey,
} from '@/lib/agent-plan-display';
import { hasBlockingAgentDecision } from '@/lib/agent-submit-state';
import { applyImageGenerationActionOptionsToMaterializedNodes } from '@/lib/agent-node-preferences';
import { decideAgentPhaseRoute } from '@/lib/openclaw/agent-phase-policy';
import type {
  CanvasEdge,
  CanvasNode,
} from '@/types/canvas';
import type {
  AgentExecutionPlan,
  AgentImageGenerationPreference,
  AgentPanelMessage,
  AgentProvider,
  AgentEcomPlannerSharedContext,
  AgentEcomPlannerPromptImageSlot,
  AgentRunMeta,
  AgentTaskAttachment,
  AgentTaskContext,
  CanvasAgentAction,
  CanvasAgentToolName,
  CanvasAgentTraceItem,
} from '@/types/agent';

import { PromptMentionInput } from '../nodes/PromptMentionInput';
import {
  ReferenceImageHoverPreviewPortal,
  useReferenceImageHoverPreview,
} from '../nodes/ReferenceImageHoverPreview';

const SHOW_AGENT_TRACE_IN_CHAT = false;
const SHOW_PLANF_ECOM_RUNTIME_IN_CHAT = false;

type AgentRunPanelResult = {
  summary: string;
  plan: AgentExecutionPlan;
  actions: CanvasAgentAction[];
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  nodeIdMap?: Record<string, string>;
  trace: CanvasAgentTraceItem[];
  meta: AgentRunMeta;
};

type PlanfEcomAnchor = {
  nodeId: string;
  outputUrl: string;
};

type PlanfAgentRouteMode = 'auto' | 'default' | 'detail-page' | 'ugc' | 'stylist';

type PlanfEcomPresetId =
  | 'full-set-8'
  | 'detail-page-pack'
  | 'amazon-adapter'
  | 'ugc-lifestyle'
  | 'editorial-stylist'
  | typeof ECOM_PLANNER_PRESET_ID;

const PLANF_ECOM_PRESETS: Array<{
  id: PlanfEcomPresetId;
  label: string;
  prompt: string;
  routeMode: Exclude<PlanfAgentRouteMode, 'auto'>;
}> = [
  {
    id: 'full-set-8',
    label: '主图 8 图套装',
    prompt: '帮我做一套电商主图（8图标准），产品是：',
    routeMode: 'default',
  },
  {
    id: 'detail-page-pack',
    label: '详情页 5 图',
    prompt: '帮我做一组详情页强化图（卖点×3 + 细节 + 场景 = 5张），产品是：',
    routeMode: 'detail-page',
  },
  {
    id: 'amazon-adapter',
    label: '亚马逊适配',
    prompt: '帮我做一套亚马逊主图集（英文文案 + 欧美模特 + A+ 排版），产品是：',
    routeMode: 'default',
  },
  {
    id: 'ugc-lifestyle',
    label: '生活化上身',
    prompt: '帮我做一组 UGC 生活化上身图（素人 + iPhone 美学 + 5张差异化构图），产品是：',
    routeMode: 'ugc',
  },
  {
    id: 'editorial-stylist',
    label: '造型大片',
    prompt: '帮我做一组高转化模特图（5 Archetype + Muse Profile + Editorial 大片），产品是：',
    routeMode: 'stylist',
  },
  {
    id: ECOM_PLANNER_PRESET_ID,
    label: '套图企划',
    prompt: ECOM_PLANNER_PROMPT_TEMPLATE,
    routeMode: 'default',
  },
];

type PlanfEcomPlanApiResponse =
  | {
      ok: true;
      summary: string;
      protocol: {
        name: 'creative-doc';
        type: 'ecom-image-plan' | 'ecom-detail-page-plan';
      };
      plan: Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>['plan'];
      values: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

type AgentEcomPlannerApiResponse =
  | {
      ok: true;
      planner: {
        productName: string;
        platform: string;
        taskType: string;
        productImageCount: number;
        benchmarkImageCount: number;
        options: Extract<AgentPanelMessage, { type: 'ecom_planner_options' }>['options'];
        sharedPlannerContext?: AgentEcomPlannerSharedContext;
      };
      model?: string;
    }
  | {
      ok: false;
      error: string;
    };

type AgentEcomPlannerApiPlanner = Extract<AgentEcomPlannerApiResponse, { ok: true }>['planner'];

type AgentEcomPlannerPromptMarkdownApiResponse =
  | {
      ok: true;
      prompt: {
        optionId: 'A' | 'B' | 'C';
        title: string;
        productName: string;
        platform: string;
        taskType: string;
        markdown: string;
        promptBlockCount: number;
        imageSlots: AgentEcomPlannerPromptImageSlot[];
      };
      model?: string;
    }
  | {
      ok: false;
      error: string;
    };

type AgentEcomPlannerPromptMarkdownApiPrompt = Extract<
  AgentEcomPlannerPromptMarkdownApiResponse,
  { ok: true }
>['prompt'];

type AgentEcomPlannerPromptStreamEvent =
  | {
      type: 'start' | 'slots' | 'slot_start' | 'slot_done' | 'done';
      current?: number;
      total?: number;
      slotTitle?: string;
      message: string;
      prompt?: AgentEcomPlannerPromptMarkdownApiPrompt;
      model?: string;
    }
  | {
      type: 'error';
      message: string;
    };

const ECOM_PLANNER_OPTION_IDS = ['A', 'B', 'C'] as const;

type PlanfEcomWorkflowApiResponse =
  | {
      ok: true;
      summary: string;
      workflow: {
        intent: {
          type: 'ecom-image';
          styleMode: string;
          request: string;
          platform?: string;
          aspectRatio?: string;
        };
      };
      actions: CanvasAgentAction[];
      nodes?: CanvasNode[];
      edges?: CanvasEdge[];
      nodeIdMap?: Record<string, string>;
      edgeIdMap?: Record<string, string>;
      mcp?: {
        toolName: CanvasAgentToolName;
        auditId?: string;
        message?: string;
        createdNodeIds?: string[];
        createdEdgeIds?: string[];
        nodeIdMap?: Record<string, string>;
        edgeIdMap?: Record<string, string>;
      };
    }
  | {
      ok: false;
      error: string;
      stage?: 'parse_request' | 'generate_workflow' | 'materialize_canvas';
      retryable?: boolean;
    };

type PlanfEcomWorkflowRequestError = Error & {
  stage?: 'parse_request' | 'generate_workflow' | 'materialize_canvas';
  retryable?: boolean;
};

type OpenClawPlanfEcomStartResponse =
  | {
      ok: true;
      session: Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>['session'];
    }
  | {
      ok: false;
      error: string;
    };

type CanvasAgentPanelProps = {
  open: boolean;
  projectId?: string;
  projectName: string;
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  onClose: () => void;
  onLayoutChange?: (layout: { open: boolean; width: number }) => void;
  onCreateSourceNodes?: (attachments: AgentTaskAttachment[]) => Record<string, string>;
  pendingReferenceAttachment?: AgentTaskAttachment | null;
  onPendingReferenceAttachmentConsumed?: (result: 'added' | 'duplicate') => void;
  onQuickReferenceSelect?: (
    onSelect: (attachment: AgentTaskAttachment) => 'added' | 'duplicate',
  ) => void;
  onConfirmPlan?: (payload: {
    actions: CanvasAgentAction[];
    nodes?: CanvasNode[];
    edges?: CanvasEdge[];
    nodeIdMap?: Record<string, string>;
    attachments: AgentTaskAttachment[];
    plan: AgentExecutionPlan;
  }) => {
    ok: boolean;
    imageGenerationNodeId?: string;
    imageGenerationNodeIds?: string[];
    groupId?: string;
    groupName?: string;
    nodeIdMap?: Record<string, string>;
  };
  onConfirmGeneration?: (payload: { nodeId?: string; nodeIds?: string[]; groupId?: string }) => boolean;
  onFocusNode?: (nodeId: string) => void;
};

type AgentBusyMode = 'thinking' | 'mcp';

function createPanelId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatAgentThreadTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (sameDay) {
    return `今天 ${time}`;
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${time}`;
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-') + ` ${time}`;
}

function getTraceToolLabel(name: CanvasAgentToolName): string {
  switch (name) {
    case 'read_canvas_summary':
      return '\u8bfb\u53d6\u753b\u5e03\u6458\u8981';
    case 'read_rule_file':
      return '\u8bfb\u53d6\u89c4\u5219\u6587\u4ef6';
    case 'create_text_node':
      return '\u521b\u5efa\u6587\u672c\u8282\u70b9';
    case 'create_uploaded_image_node':
      return '\u521b\u5efa\u4e0a\u4f20\u56fe\u7247\u8282\u70b9';
    case 'create_image_generation_node':
      return '\u521b\u5efa\u56fe\u50cf\u751f\u6210\u8282\u70b9';
    case 'connect_nodes':
      return '\u8fde\u63a5\u8282\u70b9';
    case 'set_image_generation_options':
      return '\u8bbe\u7f6e\u751f\u6210\u53c2\u6570';
    case 'run_image_generation':
      return '\u89e6\u53d1\u56fe\u50cf\u751f\u6210';
    case 'genlink_canvas_get_snapshot':
      return 'MCP \u8bfb\u53d6\u753b\u5e03\u5feb\u7167';
    case 'genlink_canvas_get_node':
      return 'MCP \u8bfb\u53d6\u753b\u5e03\u8282\u70b9';
    case 'genlink_canvas_create_workflow':
      return 'MCP \u521b\u5efa\u753b\u5e03\u5de5\u4f5c\u6d41';
    case 'genlink_canvas_create_node':
      return 'MCP \u521b\u5efa\u753b\u5e03\u8282\u70b9';
    case 'genlink_canvas_connect_nodes':
      return 'MCP \u8fde\u63a5\u753b\u5e03\u8282\u70b9';
    case 'genlink_canvas_update_node_params':
      return 'MCP \u66f4\u65b0\u8282\u70b9\u53c2\u6570';
    case 'genlink_canvas_run_node':
      return 'MCP \u89e6\u53d1\u8282\u70b9\u751f\u6210';
    case 'genlink_canvas_get_job_status':
      return 'MCP \u8bfb\u53d6\u751f\u6210\u72b6\u6001';
  }
}

function getTraceRiskLabel(risk: 'read' | 'write' | 'generate'): string {
  switch (risk) {
    case 'read':
      return '读取';
    case 'write':
      return '写入';
    case 'generate':
      return '生成';
  }
}

function getTraceResultMeta(result: Extract<CanvasAgentTraceItem, { type: 'tool_result' }>['result']): string {
  const counts = [
    result.createdNodeIds?.length ? `${result.createdNodeIds.length} 节点` : undefined,
    result.createdEdgeIds?.length ? `${result.createdEdgeIds.length} 连线` : undefined,
    result.updatedNodeIds?.length ? `${result.updatedNodeIds.length} 更新` : undefined,
  ].filter(Boolean);

  return counts.join(' / ');
}

function renderAgentTrace(trace?: CanvasAgentTraceItem[]) {
  if (!trace?.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-2 text-xs font-semibold text-white/78">Agent 过程</div>
      <div className="space-y-2">
        {trace.map((item) => {
          if (item.type === 'thinking') {
            return (
              <div key={item.id} className="grid grid-cols-[72px_1fr] gap-2 text-[11px] leading-5">
                <div className="text-[#19d3ff]">思考</div>
                <div className="text-white/56">{item.content}</div>
              </div>
            );
          }

          if (item.type === 'tool_call') {
            return (
              <div key={item.id} className="grid grid-cols-[72px_1fr] gap-2 text-[11px] leading-5">
                <div className="text-[#c9ff1a]">调用工具</div>
                <div className="min-w-0 text-white/56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white/72">{getTraceToolLabel(item.call.name)}</span>
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/48">
                      {getTraceRiskLabel(item.call.risk)}
                    </span>
                    {item.call.requiresConfirmation ? (
                      <span className="rounded bg-[#ffc36a]/12 px-1.5 py-0.5 text-[10px] text-[#ffc36a]">
                        需确认
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'tool_result') {
            const meta = getTraceResultMeta(item.result);

            return (
              <div key={item.id} className="grid grid-cols-[72px_1fr] gap-2 text-[11px] leading-5">
                <div className={item.result.ok ? 'text-[#7dffb2]' : 'text-[#ffb4a8]'}>结果</div>
                <div className="min-w-0 text-white/56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white/72">{getTraceToolLabel(item.result.toolName)}</span>
                    {meta ? (
                      <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/48">{meta}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-white/44">{item.result.message}</div>
                  {item.result.error ? (
                    <div className="mt-1 text-[#ffb4a8]">{item.result.error}</div>
                  ) : null}
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} className="grid grid-cols-[72px_1fr] gap-2 text-[11px] leading-5">
              <div className="text-white/38">最终回复</div>
              <div className="text-white/56">{item.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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

function createImageDerivativeDataUrl(
  dataUrl: string,
  options: AgentImageDerivativeOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;

      if (!sourceWidth || !sourceHeight) {
        reject(new Error('图片尺寸无效'));
        return;
      }

      const scale = Math.min(1, options.maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('无法创建图片预处理画布'));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(options.mimeType, options.quality));
    };
    image.onerror = () => reject(new Error('图片预处理失败'));
    image.src = dataUrl;
  });
}

async function uploadAgentImageDataUrl(
  dataUrl: string,
  fileName?: string,
  kind: AgentImageAttachmentUploadKind = 'original',
): Promise<string> {
  const folderByKind: Record<AgentImageAttachmentUploadKind, string> = {
    original: 'references',
    preview: 'references/previews',
    semantic: 'references/semantic',
  };
  const folder = folderByKind[kind];
  const blob = await dataUrlToImageBlob(dataUrl);
  const contentType = blob.type || 'image/png';
  const targetResponse = await fetch('/api/image-hosting/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      folder,
      contentType,
    }),
  });
  const targetJson = await readJsonResponse<
    | {
        ok: true;
        result: {
          uploadUrl: string;
          imageUrl: string;
          headers: Record<string, string>;
        };
      }
    | { ok: false; error: string }
  >(targetResponse, '创建图片上传地址失败');

  if (targetResponse.ok && targetJson.ok) {
    const uploadResponse = await fetch(targetJson.result.uploadUrl, {
      method: 'PUT',
      headers: targetJson.result.headers,
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`图片上传到 OSS 失败（${uploadResponse.status}）`);
    }

    return targetJson.result.imageUrl;
  }

  const response = await fetch('/api/image-hosting/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataUrl,
      fileName,
      folder,
      forceOss: true,
    }),
  });
  const json = await readJsonResponse<
    | { ok: true; result: { imageUrl: string } }
    | { ok: false; error: string }
  >(response, '上传参考图失败');

  if (!response.ok || !json.ok) {
    throw new Error('error' in json ? json.error : 'Failed to upload reference image');
  }

  return json.result.imageUrl;
}

function getAttachmentLabel(attachment: AgentTaskAttachment, index: number): string {
  return attachment.name || `图片${index + 1}`;
}

function AgentReferenceImageIcon() {
  return (
    <span className="relative block h-7 w-7">
      <svg
        viewBox="0 0 18 18"
        className="h-7 w-7"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.25 3.25h7.5a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1h-2.4"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 14.7 8.9 9.9l4.15 2.4-3.85 2.4Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.25 6.15v4.6a1 1 0 0 0 1 1h1.55"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function AgentAvatarMark() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-[#d8dadd]">
      <UniqueLoading variant="squares" size="agent-sm" />
    </div>
  );
}

function resolveAgentTextRunConfig(preferredProvider: AgentProvider): {
  provider: AgentProvider;
  apiKey: string;
} {
  const candidates: AgentProvider[] = [
    preferredProvider,
    readStoredSelectedApiProvider('text'),
    readStoredSelectedApiProvider('image'),
    ...AGENT_TEXT_PROVIDERS,
  ].filter((provider, index, providers) => (
    isAgentTextProvider(provider) && providers.indexOf(provider) === index
  ));

  for (const candidate of candidates) {
    const textKey = readStoredApiKey('text', candidate);

    if (textKey) {
      return { provider: candidate, apiKey: textKey };
    }

    const imageKey = readStoredApiKey('image', candidate);

    if (imageKey) {
      return { provider: candidate, apiKey: imageKey };
    }
  }

  return {
    provider: isAgentTextProvider(preferredProvider) ? preferredProvider : 'vibe',
    apiKey: '',
  };
}

function getVisiblePlanfEcomFields(
  session: Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>['session'],
) {
  const hiddenKnownFieldIds = new Set([
    'productName',
    'productAsset',
    'category',
    'platform',
    'sellingPoints',
    'imageSet',
    'styleMode',
    'mainColor',
  ]);

  return session.fields.filter((field) => {
    if (!hiddenKnownFieldIds.has(field.id)) {
      return true;
    }

    if (field.id === 'productName') {
      return field.type === 'text' && !field.value.trim();
    }

    if (field.id === 'productAsset') {
      return session.referenceImageCount <= 0;
    }

    if (field.id === 'platform') {
      return session.preset !== 'amazon-adapter';
    }

    if (field.id === 'sellingPoints') {
      return !('source' in field) || field.source !== 'user_explicit';
    }

    return false;
  });
}

function getVisiblePlanfEcomSessionFields(
  message: Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>,
) {
  return getVisiblePlanfEcomFields(message.session);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldUsePlanfEcomWorkflow(
  message: string,
  attachments: AgentTaskAttachment[],
  routeMode: PlanfAgentRouteMode,
): boolean {
  return false;

  if (routeMode !== 'auto') {
    return true;
  }

  if (attachments.length > 0) {
    return false;
  }

  return /电商|商品|产品图|主图|详情页|卖点图|淘宝|天猫|京东|亚马逊|小红书|种草|UGC/i.test(message);
}

function createPlanfEcomPanelResult(
  message: string,
  response: Extract<PlanfEcomWorkflowApiResponse, { ok: true }>,
): AgentRunPanelResult {
  const imageAction = response.actions.find((action) => action.type === 'create_image_generation_node');
  const promptPreview = imageAction?.type === 'create_image_generation_node'
    ? imageAction.prompt
    : message;
  const styleModeLabel = response.workflow.intent.styleMode || 'default';

  return {
    summary: response.summary,
    plan: {
      stageLabel: 'GenLink',
      title: '\u0047\u0065\u006e\u004c\u0069\u006e\u006b \u7535\u5546\u56fe\u5de5\u4f5c\u6d41',
      brief: [
        { label: '\u4efb\u52a1', value: '\u7535\u5546\u56fe' },
        { label: '\u6a21\u5f0f', value: styleModeLabel },
        { label: '\u6765\u6e90', value: '\u0047\u0065\u006e\u004c\u0069\u006e\u006b \u89c4\u5219\u5e93' },
      ],
      steps: [
        '\u8bfb\u53d6 GenLink \u7535\u5546\u56fe\u89c4\u5219\u5e93\u3002',
        '\u751f\u6210 GenLink \u753b\u5e03\u5de5\u4f5c\u6d41\u3002',
        '后端校验 workflow-json，并物化为 GenLink 画布节点。',
        '\u81ea\u52a8\u521b\u5efa\u6587\u672c\u8282\u70b9\u3001\u56fe\u50cf\u751f\u6210\u8282\u70b9\u548c\u8fde\u7ebf\u3002',
        '\u753b\u5e03\u8282\u70b9\u521b\u5efa\u540e\uff0c\u7b49\u5f85\u7528\u6237\u786e\u8ba4\u751f\u6210\u3002',
      ],
      promptPreview,
      confirmationLabel: '\u786e\u8ba4\u751f\u6210',
    },
    actions: response.actions,
    nodes: response.nodes,
    edges: response.edges,
    nodeIdMap: response.nodeIdMap ?? response.mcp?.nodeIdMap,
    trace: [
      {
        id: createPanelId('agent-trace'),
        type: 'thinking',
        content: '\u547d\u4e2d GenLink \u7535\u5546\u56fe\u89c4\u5219\uff0c\u5df2\u751f\u6210\u753b\u5e03\u5de5\u4f5c\u6d41\u3002',
      },
      {
        id: createPanelId('agent-trace'),
        type: 'tool_result',
        result: {
          id: createPanelId('agent-tool-result'),
          toolCallId: createPanelId('agent-tool-call'),
          toolName: response.mcp?.toolName ?? 'create_image_generation_node',
          ok: true,
          message: response.mcp?.message ?? 'GenLink \u5de5\u4f5c\u6d41\u5df2\u8f6c\u6362\u4e3a\u753b\u5e03\u521b\u5efa\u52a8\u4f5c\u3002',
          createdNodeIds: response.mcp?.createdNodeIds,
          createdEdgeIds: response.mcp?.createdEdgeIds,
          data: {
            workflow: response.workflow,
            auditId: response.mcp?.auditId,
            nodeIdMap: response.mcp?.nodeIdMap ?? response.nodeIdMap,
            edgeIdMap: response.mcp?.edgeIdMap ?? response.edgeIdMap,
          },
        },
      },
    ],
    meta: {
      usedModel: true,
      usedFallback: false,
      model: 'planf-ecom',
    },
  };
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return await response.json() as T;
  }

  const text = await response.text().catch(() => '');
  const snippet = text.trim().slice(0, 160);

  throw new Error(snippet ? `${fallback}：服务返回了非 JSON 响应（${snippet}）` : `${fallback}：服务返回了非 JSON 响应`);
}

function throwPlanfWorkflowError(json: Extract<PlanfEcomWorkflowApiResponse, { ok: false }>): never {
  const error = new Error(json.error) as PlanfEcomWorkflowRequestError;
  error.stage = json.stage;
  error.retryable = json.retryable;
  throw error;
}

function getPlanfWorkflowRetryStage(error: unknown): Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>['retryStage'] {
  const stage = (error as PlanfEcomWorkflowRequestError | undefined)?.stage;

  if (stage === 'generate_workflow') {
    return 'create_workflow';
  }

  if (stage === 'materialize_canvas') {
    return 'materialize_canvas';
  }

  return undefined;
}

function isPlanfWorkflowRetryable(error: unknown): boolean {
  return Boolean((error as PlanfEcomWorkflowRequestError | undefined)?.retryable);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function requestPlanfEcomWorkflow(
  message: string,
  routeMode: PlanfAgentRouteMode,
  packageMode: PlanfEcomPresetId | null,
): Promise<AgentRunPanelResult> {
  const response = await fetch('/api/planf/ecom-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request: message,
      styleMode: routeMode === 'auto' ? undefined : routeMode,
      packageMode: packageMode ?? undefined,
    }),
  });
  const json = await readJsonResponse<PlanfEcomWorkflowApiResponse>(response, 'GenLink 工作流请求失败');

  if (!response.ok || !json.ok) {
    if (!json.ok) {
      throwPlanfWorkflowError(json);
    }
    throw new Error('GenLink 工作流请求失败');
  }

  return createPlanfEcomPanelResult(message, json);
}

async function requestOpenClawPlanfEcomStart(params: {
  message: string;
  preset: PlanfEcomPresetId;
  referenceImageCount: number;
  provider: AgentProvider;
  model: string;
}): Promise<Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>['session']> {
  const textRunConfig = resolveAgentTextRunConfig(params.provider);
  const response = await fetch('/api/openclaw/planf/ecom/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request: params.message,
      preset: params.preset,
      referenceImageCount: params.referenceImageCount,
      provider: textRunConfig.provider,
      model: params.model,
      apiKey: textRunConfig.apiKey,
    }),
  });
  const json = await readJsonResponse<OpenClawPlanfEcomStartResponse>(
    response,
    'GenLink 电商会话启动失败',
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? 'GenLink 电商会话启动失败' : json.error);
  }

  return json.session;
}

async function requestAgentEcomPlannerOptions(params: {
  message: string;
  attachments: AgentTaskAttachment[];
  optionId?: 'A' | 'B' | 'C';
  sharedPlannerContext?: AgentEcomPlannerSharedContext;
  provider: AgentProvider;
  model: string;
}): Promise<AgentEcomPlannerApiPlanner> {
  const textRunConfig = resolveAgentTextRunConfig(params.provider);
  const clientRequestId = createPanelId(`ecom-planner-${params.optionId ?? 'all'}`);
  const response = await fetchAgentApi(
    '/api/openclaw/planf/ecom/planner',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientRequestId,
        request: params.message,
        optionId: params.optionId,
        sharedPlannerContext: params.sharedPlannerContext,
        attachments: params.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          imageUrl: attachment.imageUrl,
          previewUrl: attachment.previewUrl,
          plannerImageDataUrl: attachment.plannerImageDataUrl,
          ecomPlannerRole: getAgentEcomPlannerAttachmentRole(attachment),
        })),
        provider: textRunConfig.provider,
        model: params.model,
        apiKey: textRunConfig.apiKey,
      }),
    },
    '套图企划生成失败',
  );
  const json = await readJsonResponse<AgentEcomPlannerApiResponse>(
    response,
    '套图企划生成失败',
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? '套图企划生成失败' : json.error);
  }

  return json.planner;
}

async function requestAgentEcomPlannerPromptMarkdown(params: {
  request: string;
  plannerMessage: Extract<AgentPanelMessage, { type: 'ecom_planner_options' }>;
  option: AgentEcomPlannerOption;
  provider: AgentProvider;
  model: string;
  onProgress?: (event: AgentEcomPlannerPromptStreamEvent) => void;
}): Promise<AgentEcomPlannerPromptMarkdownApiPrompt> {
  const textRunConfig = resolveAgentTextRunConfig(params.provider);
  const optionSummary = params.option.uiSummary
    ? [
        params.option.uiSummary.coreDifference,
        params.option.uiSummary.visualKeyword,
        params.option.uiSummary.sellingPointFocus,
        params.option.uiSummary.scenarioMood,
        params.option.uiSummary.bestFor,
      ].filter(Boolean).join(' / ')
    : [
        params.option.positioning,
        params.option.visualDirection,
        params.option.sellingPointStrategy,
      ].filter(Boolean).join(' / ');
  const response = await fetchAgentApi(
    '/api/openclaw/planf/ecom/planner/prompts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({
        request: params.request,
        productName: params.plannerMessage.productName,
        platform: params.plannerMessage.platform,
        taskType: params.plannerMessage.taskType,
        optionId: params.option.id,
        optionTitle: params.option.title,
        optionJson: params.option.rawOptionJson,
        optionSummary,
        attachments: params.plannerMessage.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          imageUrl: attachment.imageUrl,
          previewUrl: attachment.previewUrl,
          plannerImageDataUrl: attachment.plannerImageDataUrl,
          ecomPlannerRole: getAgentEcomPlannerAttachmentRole(attachment),
        })),
        provider: textRunConfig.provider,
        model: params.model,
        apiKey: textRunConfig.apiKey,
      }),
    },
    '套图企划生图提示词生成失败',
  );

  if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
    if (!response.ok || !response.body) {
      throw new Error('套图企划生图提示词生成失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let donePrompt: AgentEcomPlannerPromptMarkdownApiPrompt | undefined;
    const handleStreamLine = (line: string) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      const event = JSON.parse(trimmed) as AgentEcomPlannerPromptStreamEvent;
      params.onProgress?.(event);

      if (event.type === 'error') {
        throw new Error(event.message);
      }

      if (event.type === 'done' && event.prompt) {
        donePrompt = event.prompt;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        handleStreamLine(line);
      }

      if (done) {
        break;
      }
    }

    handleStreamLine(buffer);

    if (!donePrompt) {
      throw new Error('套图企划生图提示词生成未返回最终结果');
    }

    return donePrompt;
  }

  const json = await readJsonResponse<AgentEcomPlannerPromptMarkdownApiResponse>(
    response,
    '套图企划生图提示词生成失败',
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? '套图企划生图提示词生成失败' : json.error);
  }

  return json.prompt;
}

function mergeAgentEcomPlannerOptions(
  currentOptions: AgentEcomPlannerOption[],
  nextOptions: AgentEcomPlannerOption[],
): AgentEcomPlannerOption[] {
  const byId = new Map<AgentEcomPlannerOption['id'], AgentEcomPlannerOption>();

  for (const option of currentOptions) {
    byId.set(option.id, option);
  }

  for (const option of nextOptions) {
    byId.set(option.id, option);
  }

  return ECOM_PLANNER_OPTION_IDS
    .map((optionId) => byId.get(optionId))
    .filter((option): option is AgentEcomPlannerOption => Boolean(option));
}

function parsePlannerDetailValue(content: string): unknown {
  const trimmed = content.trim();

  if (!trimmed) {
    return '';
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function stringifyPlannerDetailValue(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyPlannerDetailValue(item, depth + 1)).filter(Boolean).join('；');
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return Object.entries(record)
      .map(([key, nestedValue]) => {
        const rendered = depth > 1 && nestedValue && typeof nestedValue === 'object'
          ? JSON.stringify(nestedValue)
          : stringifyPlannerDetailValue(nestedValue, depth + 1);

        return rendered ? `${key}：${rendered}` : '';
      })
      .filter(Boolean)
      .join('；');
  }

  return '';
}

function truncatePlannerDetail(value: string, maxLength = 420): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function cleanPlannerSummaryValue(value: string, maxLength = 92): string {
  return truncatePlannerDetail(
    value
      .replace(/[{}"]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    maxLength,
  );
}

function getPlannerDetailSection(
  option: AgentEcomPlannerOption,
  title: string,
): string {
  const section = option.detailSections?.find((item) => item.title === title);

  return section
    ? truncatePlannerDetail(stringifyPlannerDetailValue(parsePlannerDetailValue(section.content)))
    : '';
}

function buildPlannerSummaryRows(option: AgentEcomPlannerOption): Array<{ label: string; value: string }> {
  const summary = option.uiSummary;

  return [
    { label: '核心方向', value: summary?.coreDifference || option.positioning },
    { label: '视觉关键词', value: summary?.visualKeyword || option.visualDirection },
    { label: '卖点重点', value: summary?.sellingPointFocus || option.sellingPointStrategy },
    { label: '场景氛围', value: summary?.scenarioMood || getPlannerDetailSection(option, '版式语言与排版哲学') },
    { label: '适合选择', value: summary?.bestFor || '适合需要该视觉方向的电商套图。' },
  ]
    .map((row) => ({ ...row, value: cleanPlannerSummaryValue(row.value) }))
    .filter((row) => Boolean(row.value));
}

function attachReferencesToImageActions(
  actions: CanvasAgentAction[],
  attachments: AgentTaskAttachment[],
): CanvasAgentAction[] {
  const sourceNodeIds = attachments
    .map((attachment) => attachment.sourceNodeId?.trim())
    .filter((nodeId): nodeId is string => Boolean(nodeId));

  return attachExistingSourceReferencesToImageActions(actions, sourceNodeIds);
}

function getImageGenerationOutputUrl(node?: CanvasNode): string | undefined {
  if (!node || node.type !== 'image_generation') {
    return undefined;
  }

  const directUrl = node.data.generatedHostedImageUrl?.trim() || node.data.generatedImageUrl?.trim();

  if (directUrl) {
    return directUrl;
  }

  const completedResult = [...(node.data.generationResults ?? [])]
    .reverse()
    .find((result) => (
      result.status === 'completed' &&
      (result.hostedImageUrl?.trim() || result.imageUrl?.trim())
    ));

  return completedResult?.hostedImageUrl?.trim() || completedResult?.imageUrl?.trim();
}

function getPlanfAnchorFromExecutionMessage(
  message: Extract<AgentPanelMessage, { type: 'execution_plan' }>,
  nodes: CanvasNode[],
): PlanfEcomAnchor | undefined {
  const nodeId = message.imageGenerationNodeId || message.imageGenerationNodeIds?.[0];

  if (!nodeId) {
    return undefined;
  }

  const outputUrl = getImageGenerationOutputUrl(nodes.find((node) => node.id === nodeId));

  return outputUrl ? { nodeId, outputUrl } : undefined;
}

function getPlanfFanoutRemainingCount(
  planfEcom?: Extract<AgentPanelMessage, { type: 'execution_plan' }>['planfEcom'],
): number {
  if (!planfEcom) {
    return 0;
  }

  if (planfEcom.values.imageSet === 'main') {
    return 0;
  }

  const totalByPreset: Record<PlanfEcomPresetId, number> = {
    'full-set-8': 8,
    'detail-page-pack': 5,
    'amazon-adapter': 6,
    'ugc-lifestyle': 5,
    'editorial-stylist': 5,
    [ECOM_PLANNER_PRESET_ID]: 0,
  };
  const total = planfEcom.values.imageSet === 'detail'
    ? 5
    : totalByPreset[planfEcom.session.preset as PlanfEcomPresetId] ?? 8;

  return Math.max(0, total - 1);
}

function getPlanfSessionValues(session: Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>['session']) {
  const productNameField = session.fields.find((field) => field.id === 'productName');
  const categoryField = session.fields.find((field) => field.id === 'category');
  const platformField = session.fields.find((field) => field.id === 'platform');
  const sellingPointsField = session.fields.find((field) => field.id === 'sellingPoints');
  const imageSetField = session.fields.find((field) => field.id === 'imageSet');
  const styleModeField = session.fields.find((field) => field.id === 'styleMode');
  const styleLayerField = session.fields.find((field) => (
    field.id === 'styleLayer' ||
    field.id === 'styleDirection' ||
    field.id === 'visualStyle'
  ));

  return {
    productName: productNameField?.type === 'text' ? productNameField.value : '',
    category: categoryField?.type === 'select' ? categoryField.value : undefined,
    platform: platformField?.type === 'select' ? platformField.value : undefined,
    sellingPoints: sellingPointsField?.type === 'multi-select' ? sellingPointsField.value : [],
    sellingPointsText: sellingPointsField?.type === 'text' ? sellingPointsField.value : undefined,
    imageSet: imageSetField?.type === 'select' ? imageSetField.value : undefined,
    styleMode: styleModeField?.type === 'select' ? styleModeField.value : undefined,
    styleLayer: styleLayerField && 'value' in styleLayerField
      ? Array.isArray(styleLayerField.value)
        ? styleLayerField.value.join('、')
        : styleLayerField.value
      : undefined,
  };
}

function getPlanfEcomPreferredAspectRatio(input: {
  values: Record<string, unknown>;
  plan: Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>['plan'];
}): string | undefined {
  const styleMode = String(input.values.styleMode || input.plan.meta.styleMode || '').toLowerCase();
  const platform = String(input.values.platform || input.plan.meta.platform || '').toLowerCase();
  const imageSet = String(input.values.imageSet || input.plan.meta.imageSet || '').toLowerCase();

  if (imageSet === 'main') {
    return '1:1';
  }

  if (
    styleMode === 'ugc' &&
    (
      platform === 'rednote' ||
      platform === 'xiaohongshu' ||
      platform.includes('小红书') ||
      platform.includes('rednote')
    )
  ) {
    return '3:4';
  }

  return '1:1';
}

function resolveAgentActionAspectRatio(params: {
  actionAspectRatio?: string;
  fallbackAspectRatio?: string;
  preference: Required<AgentImageGenerationPreference>;
}): string | undefined {
  if (params.preference.mode === 'manual' && params.preference.aspectRatio !== 'auto') {
    return params.preference.aspectRatio;
  }

  return params.actionAspectRatio && params.actionAspectRatio !== 'auto'
    ? params.actionAspectRatio
    : params.fallbackAspectRatio;
}

async function requestOpenClawPlanfEcomConfirm(
  session: Extract<AgentPanelMessage, { type: 'planf_ecom_session' }>['session'],
  provider: AgentProvider,
  model: string,
  projectId?: string,
): Promise<Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>> {
  const textRunConfig = resolveAgentTextRunConfig(provider);
  const response = await fetch('/api/openclaw/planf/ecom/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session,
      values: getPlanfSessionValues(session),
      projectId: projectId || 'local-dev-project',
      canvasId: 'default',
      provider: textRunConfig.provider,
      model,
      apiKey: textRunConfig.apiKey,
    }),
  });
  const json = await readJsonResponse<PlanfEcomPlanApiResponse>(
    response,
    'GenLink 电商编排确认失败',
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? 'GenLink 电商编排确认失败' : json.error);
  }

  return {
    id: createPanelId('planf-ecom-plan'),
    role: 'agent',
    type: 'planf_ecom_plan',
    summary: json.summary,
    session,
    values: json.values,
    plan: json.plan,
    attachments: [],
    status: 'waiting_confirmation',
    createdAt: new Date().toISOString(),
  };
}

async function requestOpenClawPlanfEcomCreateWorkflow(
  planMessage: Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>,
  provider: AgentProvider,
  model: string,
  projectId?: string,
  anchor?: PlanfEcomAnchor,
): Promise<AgentRunPanelResult> {
  const textRunConfig = resolveAgentTextRunConfig(provider);
  const response = await fetch('/api/openclaw/planf/ecom/create-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: planMessage.session,
      values: planMessage.values,
      plan: planMessage.plan,
      references: planMessage.attachments.flatMap((attachment) => (
        attachment.sourceNodeId
          ? [{
              attachmentId: attachment.id,
              name: attachment.name,
              sourceNodeId: attachment.sourceNodeId,
            }]
          : []
      )),
      anchor,
      projectId: projectId || 'local-dev-project',
      canvasId: 'default',
      provider: textRunConfig.provider,
      model,
      apiKey: textRunConfig.apiKey,
    }),
  });
  const json = await readJsonResponse<PlanfEcomWorkflowApiResponse>(response, 'GenLink 电商工作流创建失败');

  if (!response.ok || !json.ok) {
    if (!json.ok) {
      throwPlanfWorkflowError(json);
    }
    throw new Error('GenLink 电商工作流创建失败');
  }

  return createPlanfEcomPanelResult(planMessage.session.request, json);
}

async function requestOpenClawPlanfEcomFanoutWorkflow(
  planfEcom: NonNullable<Extract<AgentPanelMessage, { type: 'execution_plan' }>['planfEcom']>,
  anchor: PlanfEcomAnchor,
  provider: AgentProvider,
  model: string,
  projectId?: string,
): Promise<AgentRunPanelResult> {
  const textRunConfig = resolveAgentTextRunConfig(provider);
  const response = await fetch('/api/openclaw/planf/ecom/create-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: planfEcom.session,
      values: planfEcom.values,
      plan: planfEcom.plan,
      references: [],
      anchor,
      projectId: projectId || 'local-dev-project',
      canvasId: 'default',
      provider: textRunConfig.provider,
      model,
      apiKey: textRunConfig.apiKey,
    }),
  });
  const json = await readJsonResponse<PlanfEcomWorkflowApiResponse>(response, 'GenLink 电商扇出工作流创建失败');

  if (!response.ok || !json.ok) {
    if (!json.ok) {
      throwPlanfWorkflowError(json);
    }
    throw new Error('GenLink 电商扇出工作流创建失败');
  }

  return createPlanfEcomPanelResult(planfEcom.session.request, json);
}

async function requestOpenClawPlanfEcomReplan(
  planMessage: Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>,
  adjustment: {
    optionLabel: string;
    instruction: string;
  },
  provider: AgentProvider,
  model: string,
  projectId?: string,
): Promise<Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>> {
  const textRunConfig = resolveAgentTextRunConfig(provider);
  const response = await fetch('/api/openclaw/planf/ecom/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: planMessage.session,
      values: {
        ...planMessage.values,
        styleLayer: `${adjustment.optionLabel}：${adjustment.instruction}`,
      },
      projectId: projectId || 'local-dev-project',
      canvasId: 'default',
      provider: textRunConfig.provider,
      model,
      apiKey: textRunConfig.apiKey,
    }),
  });
  const json = await readJsonResponse<PlanfEcomPlanApiResponse>(
    response,
    'GenLink 电商编排调整失败',
  );

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? 'GenLink 电商编排调整失败' : json.error);
  }

  return {
    id: createPanelId('planf-ecom-plan'),
    role: 'agent',
    type: 'planf_ecom_plan',
    summary: json.summary,
    session: planMessage.session,
    values: json.values,
    plan: json.plan,
    attachments: planMessage.attachments.map((attachment) => ({ ...attachment })),
    status: 'waiting_confirmation',
    createdAt: new Date().toISOString(),
  };
}

async function requestAgentRun(params: {
  message: string;
  context: AgentTaskContext;
  provider: AgentProvider;
  model: string;
}): Promise<AgentRunPanelResult> {
  const textRunConfig = resolveAgentTextRunConfig(params.provider);
  const response = await fetchAgentApi(
    '/api/agent/run',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: params.message,
        context: params.context,
        provider: textRunConfig.provider,
        model: params.model,
        apiKey: textRunConfig.apiKey,
      }),
    },
    'Agent 请求失败',
  );
  const json = await readJsonResponse<
    | {
        ok: true;
        result: AgentRunPanelResult;
      }
    | {
        ok: false;
        error: string;
      }
  >(response, 'Agent 请求失败');

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? 'Agent 请求失败' : json.error);
  }

  return json.result;
}

function getAgentResultText(message: Extract<AgentPanelMessage, { type: 'execution_plan' }>) {
  if (message.status === 'error') {
    return '\u8282\u70b9\u521b\u5efa\u5931\u8d25\uff0c\u8bf7\u8c03\u6574\u9700\u6c42\u540e\u91cd\u8bd5\u3002';
  }

  if (message.status === 'generation_error') {
    return '\u751f\u6210\u5df2\u7ed3\u675f\uff0c\u4f46\u6709\u4efb\u52a1\u5931\u8d25\u3002\u8bf7\u67e5\u770b\u753b\u5e03\u8282\u70b9\u72b6\u6001\u3002';
  }

  if (message.status === 'executed') {
    return '\u5df2\u521b\u5efa\uff0c\u653e\u5230\u753b\u5e03\u4e0a\u4e86\u3002\u751f\u6210\u5b8c\u6210\u540e\u53ef\u4ee5\u76f4\u63a5\u770b\u5230\u6548\u679c\u3002';
  }

  if (message.status === 'generating') {
    return '\u5df2\u5f00\u59cb\u751f\u6210\uff0c\u7ed3\u679c\u4f1a\u56de\u5230\u753b\u5e03\u8282\u70b9\u91cc\u3002';
  }

  if (message.status === 'waiting_generation_confirmation') {
    return '\u5df2\u653e\u5230\u753b\u5e03\u4e0a\u3002';
  }

  return '\u7f16\u6392\u5df2\u751f\u6210\uff0c\u7b49\u5f85\u521b\u5efa\u5230\u753b\u5e03\u3002';
}

function getMessageAttachments(
  attachmentIds: string[] | undefined,
  attachments: AgentTaskAttachment[],
  snapshotAttachments?: AgentTaskAttachment[],
): AgentTaskAttachment[] {
  if (snapshotAttachments?.length) {
    return snapshotAttachments;
  }

  if (!attachmentIds?.length) {
    return [];
  }

  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));

  return attachmentIds.flatMap((attachmentId) => {
    const attachment = attachmentById.get(attachmentId);

    return attachment ? [attachment] : [];
  });
}

function resolveAutoImageProvider(): ApiProvider {
  const providerWithKey = API_PROVIDERS.find((candidate) => Boolean(readStoredApiKey('image', candidate)));

  return providerWithKey ?? readStoredSelectedApiProvider('image');
}

type AgentPanelSelectOption<TValue extends string> = {
  value: TValue;
  label: string;
};

function AgentPanelSelect<TValue extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: TValue;
  options: AgentPanelSelectOption<TValue>[];
  disabled?: boolean;
  onChange: (value: TValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.08em] text-white/36">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg bg-white/[0.055] px-3 text-left text-xs font-medium text-white/82 outline-none transition',
          disabled
            ? 'cursor-not-allowed opacity-55'
            : 'hover:bg-white/[0.085] focus:bg-white/[0.085] focus:ring-1 focus:ring-white/12',
        ].join(' ')}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <ChevronRight size={14} className="shrink-0 text-white/34" />
      </button>
      {open && !disabled ? (
        <div
          role="listbox"
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-full min-w-[152px] overflow-hidden rounded-xl border border-white/10 bg-[#101217] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.48)]"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  'flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs transition',
                  selected
                    ? 'bg-white/[0.12] font-semibold text-white'
                    : 'text-white/62 hover:bg-white/[0.075] hover:text-white/86',
                ].join(' ')}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <ChevronRight size={13} className={selected ? 'text-white/52' : 'text-white/24'} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveActivePlanfPresetId(
  draftValue: string,
  selectedPresetId: PlanfEcomPresetId | null,
): PlanfEcomPresetId | null {
  if (!selectedPresetId) {
    return null;
  }

  const preset = PLANF_ECOM_PRESETS.find((candidate) => candidate.id === selectedPresetId);

  if (!preset) {
    return null;
  }

  return draftValue.trim().startsWith(preset.prompt) ? selectedPresetId : null;
}

function isPlanfPresetPromptDraft(draftValue: string): boolean {
  const trimmedDraft = draftValue.trim();

  return PLANF_ECOM_PRESETS.some((preset) => trimmedDraft === preset.prompt.trim());
}

export const CanvasAgentPanel = memo(function CanvasAgentPanel({
  open,
  projectId,
  projectName,
  nodeCount,
  edgeCount,
  groupCount,
  nodes = [],
  edges = [],
  onClose,
  onLayoutChange,
  onCreateSourceNodes,
  pendingReferenceAttachment,
  onPendingReferenceAttachmentConsumed,
  onQuickReferenceSelect,
  onConfirmPlan,
  onConfirmGeneration,
  onFocusNode,
}: CanvasAgentPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingAttachmentRoleRef = useRef<AgentEcomPlannerAttachmentRole>('product');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachmentsRef = useRef<AgentTaskAttachment[]>([]);
  const planfPresetOpenBeforeOverlayRef = useRef(false);
  const resizeDragRef = useRef<{
    startClientX: number;
    startWidth: number;
  } | null>(null);
  const referenceImagePreview = useReferenceImageHoverPreview();
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return AGENT_PANEL_DEFAULT_WIDTH;
    }

    return resolveStoredAgentPanelWidth(
      window.localStorage.getItem(AGENT_PANEL_WIDTH_STORAGE_KEY),
      window.innerWidth,
    );
  });
  const [panelResizing, setPanelResizing] = useState(false);
  const [attachments, setAttachments] = useState<AgentTaskAttachment[]>([]);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState<AgentProvider>('vibe');
  const [model, setModel] = useState<string>(AGENT_MODEL_OPTIONS[0].id);
  const [messages, setMessages] = useState<AgentPanelMessage[]>([]);
  const [busyMode, setBusyMode] = useState<AgentBusyMode | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyThreads, setHistoryThreads] = useState(() => listAgentThreads(projectId, projectName));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planfPresetOpen, setPlanfPresetOpen] = useState(false);
  const [selectedPlanfPresetId, setSelectedPlanfPresetId] = useState<PlanfEcomPresetId | null>(null);
  const [planfRouteMode, setPlanfRouteMode] = useState<PlanfAgentRouteMode>('auto');
  const [generationPreferenceOpen, setGenerationPreferenceOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [isInputDragActive, setIsInputDragActive] = useState(false);
  const [referenceUploadNudgeRequested, setReferenceUploadNudgeRequested] = useState(false);
  const [imagePreference, setImagePreference] = useState<AgentImageGenerationPreference>({
    mode: 'auto',
    aspectRatio: DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    quality: DEFAULT_AGENT_IMAGE_QUALITY,
    runningHubChannel: DEFAULT_AGENT_RUNNING_HUB_CHANNEL,
  });
  const [expandedPlanSlotKeys, setExpandedPlanSlotKeys] = useState<Set<string>>(() => new Set());

  const resolvedImagePreference = useMemo((): Required<AgentImageGenerationPreference> => {
    return resolveAgentImageGenerationPreference({
      preference: imagePreference,
      autoProvider: resolveAutoImageProvider(),
    });
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
  const ecomPlannerActive = selectedPlanfPresetId === ECOM_PLANNER_PRESET_ID;
  const hasEcomPlannerProductImage = hasAgentEcomPlannerProductImage(attachments);
  const showReferenceUploadNudge = ecomPlannerActive
    ? !hasEcomPlannerProductImage
    : shouldShowAgentReferenceUploadNudge({
        requested: referenceUploadNudgeRequested,
        attachmentCount: attachments.length,
      });
  const hasUserDecisionPending = hasBlockingAgentDecision(messages);
  const busy = busyMode !== null;
  const activeEcomPlannerPromptStatus = [...messages].reverse().find((message) => (
    message.type === 'ecom_planner_options' &&
    message.status === 'submitted' &&
    Boolean(message.promptCurrentStatus)
  ));

  useEffect(() => {
    onLayoutChange?.({ open, width: panelWidth });
  }, [onLayoutChange, open, panelWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      setPanelWidth((current) => {
        const nextWidth = clampAgentPanelWidth(current, window.innerWidth);

        if (nextWidth !== current) {
          window.localStorage.setItem(AGENT_PANEL_WIDTH_STORAGE_KEY, String(nextWidth));
        }

        return nextWidth;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const handlePanelResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    resizeDragRef.current = {
      startClientX: event.clientX,
      startWidth: panelWidth,
    };
    setPanelResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = resizeDragRef.current;

      if (!dragState) {
        return;
      }

      const nextWidth = clampAgentPanelWidth(
        dragState.startWidth + dragState.startClientX - moveEvent.clientX,
        window.innerWidth,
      );

      setPanelWidth(nextWidth);
      window.localStorage.setItem(AGENT_PANEL_WIDTH_STORAGE_KEY, String(nextWidth));
    };

    const stopDragging = () => {
      resizeDragRef.current = null;
      setPanelResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, [panelWidth]);

  const handleNewThread = useCallback(() => {
    setMessages([]);
    setThreadId(undefined);
    setHistoryOpen(false);
  }, []);

  const setPlanfPresetPanelOpen = useCallback((nextOpen: boolean) => {
    setPlanfPresetOpen(nextOpen);

    if (nextOpen) {
      const nextPanelState = getAgentPlanfPresetPanelOpenState({
        attachmentCount: attachmentsRef.current.length,
        currentSelectedPresetId: selectedPlanfPresetId,
        presets: PLANF_ECOM_PRESETS,
      });

      setSelectedPlanfPresetId(nextPanelState.selectedPresetId);
      setPlanfRouteMode(nextPanelState.routeMode ?? 'auto');
      setDraft(nextPanelState.draft);
      setReferenceUploadNudgeRequested(nextPanelState.referenceUploadNudgeRequested);
      return;
    }

    setSelectedPlanfPresetId(null);
    setPlanfRouteMode('auto');
    setReferenceUploadNudgeRequested(
      getAgentReferenceUploadNudgeRequestForPlanfPanel({
        panelOpen: nextOpen,
        attachmentCount: attachmentsRef.current.length,
      }),
    );

    setDraft((currentDraft) => (isPlanfPresetPromptDraft(currentDraft) ? '' : currentDraft));
  }, [selectedPlanfPresetId]);

  const handleOpenHistory = useCallback(() => {
    setHistoryThreads(listAgentThreads(projectId, projectName));
    setHistoryOpen((current) => !current);
  }, [projectId, projectName]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        historyPopoverRef.current?.contains(target) ||
        historyButtonRef.current?.contains(target)
      ) {
        return;
      }

      setHistoryOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [historyOpen]);

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

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        block: 'end',
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [busyMode, messages, open]);

  const handleUploadClick = useCallback((role: AgentEcomPlannerAttachmentRole = 'product') => {
    pendingAttachmentRoleRef.current = role;
    inputRef.current?.click();
  }, []);

  const addImageFiles = useCallback((nextFiles: File[], role: AgentEcomPlannerAttachmentRole = 'product') => {
    const files = nextFiles.filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      return;
    }

    void Promise.all(files.map((file) =>
      createHostedAgentImageAttachment(file, {
        createAttachmentId: () => createPanelId('agent-attachment'),
        createPreviewUrl: (sourceFile) => URL.createObjectURL(sourceFile),
        releasePreviewUrl: (url) => {
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
          }
        },
        readImageDataUrl: readImageFileAsDataUrl,
        readImageDimensions,
        createDerivativeDataUrl: createImageDerivativeDataUrl,
        uploadImageDataUrl: uploadAgentImageDataUrl,
      }),
    )).then((nextAttachments) => {
      const taggedAttachments = nextAttachments.map((attachment) => ({
        ...attachment,
        ecomPlannerRole: role,
      }));

      setAttachments((current) => [...current, ...taggedAttachments]);
      setReferenceUploadNudgeRequested(false);
    }).catch((error) => {
      setMessages((current) => [
        ...current,
        {
          id: createPanelId('agent-message'),
          role: 'agent',
          type: 'text',
          content: error instanceof Error ? error.message : '参考图上传失败，请稍后重试。',
          variant: 'retryable_error',
          createdAt: new Date().toISOString(),
        },
      ]);
    });
  }, [setMessages]);

  const handleFilesSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(Array.from(event.target.files ?? []), pendingAttachmentRoleRef.current);
    pendingAttachmentRoleRef.current = 'product';

    event.target.value = '';
  }, [addImageFiles]);

  const handleInputDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsInputDragActive(true);
  }, []);

  const handleInputDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsInputDragActive(true);
  }, []);

  const handleInputDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setIsInputDragActive(false);
  }, []);

  const handleInputDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));

    if (!files.length) {
      setIsInputDragActive(false);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsInputDragActive(false);
    addImageFiles(files, 'product');
  }, [addImageFiles]);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);

      if (removed?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }, []);

  const handleQuickReferenceClick = useCallback(() => {
    onQuickReferenceSelect?.((attachment) => {
      let result: 'added' | 'duplicate' = 'added';

      setAttachments((current) => {
        const duplicate = current.some((item) => (
          (attachment.sourceNodeId && item.sourceNodeId === attachment.sourceNodeId) ||
          item.imageUrl === attachment.imageUrl ||
          item.previewUrl === attachment.previewUrl
        ));

        if (duplicate) {
          result = 'duplicate';
          return current;
        }

        return [...current, attachment];
      });

      if (result === 'added') {
        setReferenceUploadNudgeRequested(false);
      }

      return result;
    });
  }, [onQuickReferenceSelect]);

  useEffect(() => {
    if (!pendingReferenceAttachment) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const duplicate = attachmentsRef.current.some((item) => (
        (pendingReferenceAttachment.sourceNodeId && item.sourceNodeId === pendingReferenceAttachment.sourceNodeId) ||
        item.imageUrl === pendingReferenceAttachment.imageUrl ||
        item.previewUrl === pendingReferenceAttachment.previewUrl
      ));
      const result: 'added' | 'duplicate' = duplicate ? 'duplicate' : 'added';

      if (result === 'added') {
        setAttachments((current) => [...current, pendingReferenceAttachment]);
        setReferenceUploadNudgeRequested(false);
      }

      onPendingReferenceAttachmentConsumed?.(result);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [onPendingReferenceAttachmentConsumed, pendingReferenceAttachment]);

  const runAgent = useCallback(async (params: {
    prompt: string;
    taskAttachments: AgentTaskAttachment[];
    selectedAttachments: AgentTaskAttachment[];
    userMessageCreatedAt: string;
    selectedPlanfPresetId: PlanfEcomPresetId | null;
    planfRouteMode: PlanfAgentRouteMode;
  }) => {
    const context = buildAgentTaskContext({
      project: {
        id: projectId,
        name: projectName,
      },
      message: params.prompt,
      attachments: params.taskAttachments,
      canvasSnapshot: {
        nodes,
        edges,
        groupCount,
      },
      canvasRuntimeSnapshot: buildCanvasRuntimeSnapshot({
        nodes,
        edges,
        groupCount,
      }),
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
    const runEcomPlannerStaged = async () => {
      setBusyMode('mcp');

      const messageId = createPanelId('ecom-planner-options');
      const productImageCount = params.selectedAttachments.filter((attachment) => (
        getAgentEcomPlannerAttachmentRole(attachment) === 'product'
      )).length;
      const benchmarkImageCount = params.selectedAttachments.filter((attachment) => (
        getAgentEcomPlannerAttachmentRole(attachment) === 'benchmark'
      )).length;
      const optionErrors: string[] = [];
      let sharedPlannerContext: AgentEcomPlannerSharedContext | undefined;

      setMessages((current) => [
        ...current,
        {
          id: messageId,
          role: 'agent',
          type: 'ecom_planner_options',
          summary: '正在按套图企划规则逐套生成方案：先生成 A，再生成 B，最后生成 C。',
          userRequest: params.prompt,
          productName: '套图企划',
          platform: '平台识别中',
          taskType: '任务识别中',
          productImageCount,
          benchmarkImageCount,
          options: [],
          attachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
          status: 'generating',
          createdAt: new Date().toISOString(),
        },
      ]);

      for (const optionId of ECOM_PLANNER_OPTION_IDS) {
        try {
          const planner = await requestAgentEcomPlannerOptions({
            message: params.prompt,
            attachments: params.selectedAttachments,
            optionId,
            sharedPlannerContext,
            provider,
            model,
          });
          sharedPlannerContext = planner.sharedPlannerContext ?? sharedPlannerContext;

          setMessages((current) => current.map((message) => {
            if (message.id !== messageId || message.type !== 'ecom_planner_options') {
              return message;
            }

            const nextOptions = mergeAgentEcomPlannerOptions(message.options, planner.options);

            return {
              ...message,
              summary: `已生成 ${nextOptions.length}/3 套方案。${nextOptions.length < 3 ? '正在继续生成下一套。' : '请选择一套继续生成生图提示词。'}`,
              productName: planner.productName || message.productName,
              platform: planner.platform || message.platform,
              taskType: planner.taskType || message.taskType,
              productImageCount: planner.productImageCount,
              benchmarkImageCount: planner.benchmarkImageCount,
              options: nextOptions,
              sharedPlannerContext,
              errorMessage: optionErrors.length ? optionErrors.join('\n') : undefined,
            };
          }));
        } catch (error) {
          const errorText = formatEcomPlannerOptionErrorText(
            error instanceof Error ? error.message : undefined,
            `方案 ${optionId} 生成失败。`,
          );

          optionErrors.push(`方案 ${optionId}：${errorText}`);
          console.warn('[canvas-agent] ecom planner option failed', optionId, errorText);

          setMessages((current) => current.map((message) => (
            message.id === messageId && message.type === 'ecom_planner_options'
              ? {
                  ...message,
                  summary: `方案 ${optionId} 生成失败，正在继续尝试其他方案。`,
                  errorMessage: optionErrors.join('\n'),
                }
              : message
          )));
        }
      }

      setMessages((current) => current.map((message) => {
        if (message.id !== messageId || message.type !== 'ecom_planner_options') {
          return message;
        }

        const hasOptions = message.options.length > 0;

        return {
          ...message,
          summary: hasOptions
            ? `已生成 ${message.options.length}/3 套方案。${optionErrors.length ? '部分方案失败，可先选择已生成方案继续。' : '请选择一套继续生成生图提示词。'}`
            : '套图企划生成失败，请稍后重试。',
          status: hasOptions ? 'waiting' as const : 'error' as const,
          errorMessage: optionErrors.length ? optionErrors.join('\n') : undefined,
        };
      }));
    };

    try {
      if (params.selectedPlanfPresetId === ECOM_PLANNER_PRESET_ID) {
        await runEcomPlannerStaged();
        return;
      }

      const routeDecision = decideAgentPhaseRoute({
        message: params.prompt,
        attachmentCount: params.selectedAttachments.length,
        routeMode: params.planfRouteMode,
        selectedPresetId: params.selectedPlanfPresetId,
        presetPrompts: PLANF_ECOM_PRESETS,
      });

      if (routeDecision.route === 'ecom-start' && routeDecision.preset) {
        if (routeDecision.preset === ECOM_PLANNER_PRESET_ID) {
          await runEcomPlannerStaged();
          return;
        }

        let session: Awaited<ReturnType<typeof requestOpenClawPlanfEcomStart>>;

        try {
          session = await requestOpenClawPlanfEcomStart({
            message: params.prompt,
            preset: routeDecision.preset,
            referenceImageCount: params.selectedAttachments.length,
            provider,
            model,
          });
        } catch (error) {
          const errorText = formatAgentChatErrorText(
            error instanceof Error ? error.message : undefined,
            'GenLink 规则运行超时，请稍后重试，或切换文本模型后再试。',
          );
          console.error('[canvas-agent] ecom start failed', errorText);

          setMessages((current) => [
            ...current,
            {
              id: createPanelId('planf-runtime-error'),
              role: 'agent',
              type: 'text',
              variant: 'retryable_error',
              content: '出现了点小问题，建议重试一次',
              retryLabel: '重新生成',
              retryPrompt: params.prompt,
              retryTaskAttachments: params.taskAttachments.map((attachment) => ({ ...attachment })),
              retrySelectedAttachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
              retryUserMessageCreatedAt: params.userMessageCreatedAt,
              retrySelectedPlanfPresetId: params.selectedPlanfPresetId,
              retryPlanfRouteMode: params.planfRouteMode,
              createdAt: new Date().toISOString(),
            },
          ]);
          return;
        }

        if (getVisiblePlanfEcomFields(session).length === 0) {
          setBusyMode('mcp');

          try {
            const planMessage = await requestOpenClawPlanfEcomConfirm(session, provider, model, projectId);

            setMessages((current) => [
              ...current,
              {
                ...planMessage,
                attachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
              },
            ]);
          } catch (error) {
            const errorText = formatAgentChatErrorText(
              error instanceof Error ? error.message : undefined,
              'GenLink 电商编排确认失败，请稍后重试。',
            );
            console.error('[canvas-agent] ecom auto confirm failed', errorText);

            setMessages((current) => [
              ...current,
              {
                id: createPanelId('planf-auto-confirm-error'),
                role: 'agent',
                type: 'text',
                variant: 'retryable_error',
                content: '出现了点小问题，建议重试一次',
                retryLabel: '重新生成',
                retryPrompt: params.prompt,
                retryTaskAttachments: params.taskAttachments.map((attachment) => ({ ...attachment })),
                retrySelectedAttachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
                retryUserMessageCreatedAt: params.userMessageCreatedAt,
                retrySelectedPlanfPresetId: params.selectedPlanfPresetId,
                retryPlanfRouteMode: params.planfRouteMode,
                createdAt: new Date().toISOString(),
              },
            ]);
          }

          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: createPanelId('planf-ecom-session'),
            role: 'agent',
            type: 'planf_ecom_session',
            session,
            attachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
            status: 'collecting',
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      result = await requestAgentRun({
        message: params.prompt,
        context: requestContext,
        provider,
        model,
      });
    } catch (error) {
      const errorText = formatAgentChatErrorText(
        error instanceof Error ? error.message : undefined,
        'Agent 请求失败',
      );
      console.error('[canvas-agent] run failed', errorText);

      setMessages((current) => [
        ...current,
        {
          id: createPanelId('agent-run-error'),
          role: 'agent',
          type: 'text',
          variant: 'retryable_error',
          content: errorText,
          retryLabel: '重新生成',
          retryPrompt: params.prompt,
          retryTaskAttachments: params.taskAttachments.map((attachment) => ({ ...attachment })),
          retrySelectedAttachments: params.selectedAttachments.map((attachment) => ({ ...attachment })),
          retryUserMessageCreatedAt: params.userMessageCreatedAt,
          retrySelectedPlanfPresetId: params.selectedPlanfPresetId,
          retryPlanfRouteMode: params.planfRouteMode,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    if (result.actions.length === 0) {
      setMessages((current) => [
        ...current,
        {
          id: createPanelId('agent-text-reply'),
          role: 'agent',
          type: 'text',
          content: result.summary,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    const mentionRestoredActions = restoreReferenceMentionLabelsInActions(
      result.actions,
      params.prompt,
      params.selectedAttachments,
    );
    const preferenceActions = mentionRestoredActions.map((action) => (
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
              aspectRatio: resolveAgentActionAspectRatio({
                actionAspectRatio: action.options?.aspectRatio,
                preference: resolvedImagePreference,
              }),
              quality: resolvedImagePreference.quality,
            },
          }
        : action
    ));
    const executionActions = attachReferencesToImageActions(preferenceActions, params.selectedAttachments);
    const attachmentsForExecution = params.selectedAttachments.map((attachment) => ({ ...attachment }));
    const executionResult = onConfirmPlan?.({
      actions: executionActions,
      nodeIdMap: result.nodeIdMap,
      attachments: attachmentsForExecution,
      plan: result.plan,
    }) ?? { ok: false };

    setMessages((current) => [
      ...current,
      {
        id: createPanelId('agent-plan'),
        role: 'agent',
        type: 'execution_plan',
        summary: result.summary,
        userPrompt: params.prompt,
        plan: result.plan,
        actions: executionActions,
        attachments: attachmentsForExecution,
        trace: result.trace,
        meta: result.meta,
        nodeIdMap: executionResult.nodeIdMap,
        imageGenerationNodeId: executionResult.imageGenerationNodeId,
        imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
        groupId: executionResult.groupId,
        groupName: executionResult.groupName,
        status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [
    edgeCount,
    edges,
    groupCount,
    messages,
    model,
    nodeCount,
    nodes,
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

    const submittedPlanfPresetId = selectedPlanfPresetId;
    const submittedPlanfRouteMode = planfRouteMode;
    const submittedEcomPlannerActive = submittedPlanfPresetId === ECOM_PLANNER_PRESET_ID;

    const plannerSubmitBlockReason = getAgentEcomPlannerSubmitBlockReason({
      active: submittedEcomPlannerActive,
      attachments,
    });

    if (plannerSubmitBlockReason) {
      setMessages((current) => [
        ...current,
        {
          id: createPanelId('ecom-planner-product-required'),
          role: 'agent',
          type: 'text',
          content: plannerSubmitBlockReason,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    setBusyMode('thinking');
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

    if (!submittedEcomPlannerActive && taskAttachments.length > 1 && referencedAttachmentIds.length === 0) {
      setMessages((current) => [
        ...current,
        {
          id: createPanelId('agent-message'),
          role: 'user',
          type: 'text',
          content: trimmedDraft,
          attachmentIds: taskAttachments.map((attachment) => attachment.id),
          attachments: taskAttachments.map((attachment) => ({ ...attachment })),
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
      setDraft('');
      setAttachments([]);
      setBusyMode(null);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: createPanelId('agent-message'),
        role: 'user',
        type: 'text',
        content: trimmedDraft,
        attachmentIds: selectedAttachments.map((attachment) => attachment.id),
        attachments: selectedAttachments.map((attachment) => ({ ...attachment })),
        createdAt: now,
      },
    ]);
    setDraft('');
    setSelectedPlanfPresetId(null);
    setPlanfRouteMode('auto');
    setAttachments([]);
    void runAgent({
      prompt: trimmedDraft,
      taskAttachments,
      selectedAttachments,
      userMessageCreatedAt: now,
      selectedPlanfPresetId: submittedPlanfPresetId,
      planfRouteMode: submittedPlanfRouteMode,
    }).finally(() => {
      setBusyMode(null);
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
    selectedPlanfPresetId,
    planfRouteMode,
  ]);

  const handleRetryAgentMessage = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const retryMessage = messages.find((message): message is Extract<AgentPanelMessage, { type: 'text'; role: 'agent' }> => (
      message.id === messageId &&
      message.type === 'text' &&
      message.role === 'agent' &&
      message.variant === 'retryable_error' &&
      Boolean(message.retryPrompt)
    ));

    if (!retryMessage?.retryPrompt) {
      return;
    }

    const taskAttachments = retryMessage.retryTaskAttachments?.map((attachment) => ({ ...attachment })) ?? [];
    const selectedAttachments = retryMessage.retrySelectedAttachments?.map((attachment) => ({ ...attachment })) ?? taskAttachments;
    const userMessageCreatedAt = retryMessage.retryUserMessageCreatedAt ?? new Date().toISOString();

    setMessages((current) => current.filter((message) => message.id !== messageId));
    setBusyMode('thinking');
    void runAgent({
      prompt: retryMessage.retryPrompt,
      taskAttachments,
      selectedAttachments,
      userMessageCreatedAt,
      selectedPlanfPresetId: retryMessage.retrySelectedPlanfPresetId ?? null,
      planfRouteMode: retryMessage.retryPlanfRouteMode ?? 'auto',
    }).finally(() => {
      setBusyMode(null);
    });
  }, [busy, messages, runAgent]);

  const updatePlanfEcomSessionField = useCallback((
    messageId: string,
    fieldId: string,
    nextValue: string | string[],
  ) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || message.type !== 'planf_ecom_session') {
        return message;
      }

      return {
        ...message,
        session: {
          ...message.session,
          fields: message.session.fields.map((field) => {
            if (field.id !== fieldId) {
              return field;
            }

            if (field.type === 'multi-select') {
              return {
                ...field,
                value: Array.isArray(nextValue) ? nextValue : field.value,
              };
            }

            return {
              ...field,
              value: typeof nextValue === 'string' ? nextValue : field.value,
            };
          }),
        },
      };
    }));
  }, []);

  const handleConfirmPlanfEcomSession = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const sessionMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'planf_ecom_session' }> => (
      message.id === messageId && message.type === 'planf_ecom_session'
    ));

    if (!sessionMessage || sessionMessage.status !== 'collecting') {
      return;
    }

    setBusyMode('mcp');
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'planf_ecom_session'
        ? { ...message, status: 'submitted' as const }
        : message
    )));
    void requestOpenClawPlanfEcomConfirm(sessionMessage.session, provider, model, projectId)
      .then((result) => {
        setMessages((current) => [
          ...current,
          {
            ...result,
            attachments: sessionMessage.attachments.map((attachment) => ({ ...attachment })),
          },
        ]);
      })
      .catch((error) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'planf_ecom_session'
            ? {
                ...message,
                status: 'error' as const,
                errorMessage: error instanceof Error ? error.message : 'GenLink 电商编排确认失败',
              }
            : message
        )));
      })
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, projectId, provider]);

  const handleSelectEcomPlannerOption = useCallback((
    messageId: string,
    optionId: 'A' | 'B' | 'C',
  ) => {
    if (busy) {
      return;
    }

    const plannerMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'ecom_planner_options' }> => (
      message.id === messageId && message.type === 'ecom_planner_options'
    ));
    const selectedOption = plannerMessage?.options.find((option) => option.id === optionId);

    if (!plannerMessage || !selectedOption || plannerMessage.status !== 'waiting') {
      return;
    }

    setBusyMode('mcp');
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'ecom_planner_options'
        ? {
            ...message,
            status: 'submitted' as const,
            selectedOptionId: optionId,
            summary: `已选择方案 ${optionId}，正在按规则第 5 步分段生成生图提示词。`,
            promptCurrentStatus: '准备读取规则并解析图位。',
            promptProgressCurrent: 0,
            promptProgressTotal: undefined,
            errorMessage: undefined,
          }
        : message
    )));

    if (!selectedOption.rawOptionJson) {
      setMessages((current) => current.map((message) => (
        message.id === messageId && message.type === 'ecom_planner_options'
          ? {
              ...message,
              status: 'error' as const,
              errorMessage: `方案 ${optionId} 缺少完整 JSON，无法按规则第 5 步生成 Markdown 提示词，请重新生成方案。`,
            }
          : message
      )));
      setBusyMode(null);
      return;
    }

    void requestAgentEcomPlannerPromptMarkdown({
      request: plannerMessage.userRequest ?? '',
      plannerMessage,
      option: selectedOption,
      provider,
      model,
      onProgress: (event) => {
        setMessages((current) => current.map((message) => {
          if (message.id !== messageId || message.type !== 'ecom_planner_options') {
            return message;
          }

          return {
            ...message,
            summary: event.message || message.summary,
            promptCurrentStatus: event.message || message.promptCurrentStatus,
            promptProgressCurrent: event.type !== 'error' && typeof event.current === 'number'
              ? event.current
              : message.promptProgressCurrent,
            promptProgressTotal: event.type !== 'error' && typeof event.total === 'number' && event.total > 0
              ? event.total
              : message.promptProgressTotal,
          };
        }));
      },
    })
      .then((promptResult) => {
        setMessages((current) => [
          ...current.map((message) => (
            message.id === messageId && message.type === 'ecom_planner_options'
              ? {
                  ...message,
                  status: 'completed' as const,
                  summary: `已选择方案 ${optionId}，已按规则第 5 步生成 ${promptResult.promptBlockCount} 个图位提示词。`,
                  promptCurrentStatus: `全部完成，已生成 ${promptResult.promptBlockCount} 个图位提示词。`,
                  promptProgressCurrent: promptResult.promptBlockCount,
                  promptProgressTotal: promptResult.promptBlockCount,
                }
              : message
          )),
          {
            id: createPanelId('ecom-planner-prompt'),
            role: 'agent',
            type: 'ecom_planner_prompt_markdown',
            optionId: promptResult.optionId,
            title: promptResult.title,
            productName: promptResult.productName,
            platform: promptResult.platform,
            taskType: promptResult.taskType,
            markdown: promptResult.markdown,
            promptBlockCount: promptResult.promptBlockCount,
            imageSlots: promptResult.imageSlots,
            attachments: plannerMessage.attachments.map((attachment) => ({ ...attachment })),
            status: 'waiting_confirmation',
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((error) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'ecom_planner_options'
            ? {
                ...message,
                status: 'error' as const,
                promptCurrentStatus: error instanceof Error ? error.message : '套图企划生图提示词生成失败',
                errorMessage: error instanceof Error ? error.message : '套图企划生图提示词生成失败',
              }
            : message
        )));
      })
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, provider]);

  const handleRetryEcomPlannerOptions = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const plannerMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'ecom_planner_options' }> => (
      message.id === messageId && message.type === 'ecom_planner_options'
    ));

    if (!plannerMessage?.userRequest) {
      return;
    }

    const retryRequest = plannerMessage.userRequest;
    const retryAttachments = plannerMessage.attachments.map((attachment) => ({ ...attachment }));
    const productImageCount = retryAttachments.filter((attachment) => (
      getAgentEcomPlannerAttachmentRole(attachment) === 'product'
    )).length;
    const benchmarkImageCount = retryAttachments.filter((attachment) => (
      getAgentEcomPlannerAttachmentRole(attachment) === 'benchmark'
    )).length;
    const optionErrors: string[] = [];
    let sharedPlannerContext: AgentEcomPlannerSharedContext | undefined;

    setBusyMode('mcp');
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'ecom_planner_options'
        ? {
            ...message,
            summary: '正在重新按套图企划规则生成 3 套方案。',
            productImageCount,
            benchmarkImageCount,
            options: [],
            selectedOptionId: undefined,
            promptCurrentStatus: undefined,
            promptProgressCurrent: undefined,
            promptProgressTotal: undefined,
            status: 'generating' as const,
            errorMessage: undefined,
          }
        : message
    )));

    void (async () => {
      for (const optionId of ECOM_PLANNER_OPTION_IDS) {
        try {
          const planner = await requestAgentEcomPlannerOptions({
            message: retryRequest,
            attachments: retryAttachments,
            optionId,
            sharedPlannerContext,
            provider,
            model,
          });
          sharedPlannerContext = planner.sharedPlannerContext ?? sharedPlannerContext;

          setMessages((current) => current.map((message) => {
            if (message.id !== messageId || message.type !== 'ecom_planner_options') {
              return message;
            }

            const nextOptions = mergeAgentEcomPlannerOptions(message.options, planner.options);

            return {
              ...message,
              summary: `已重新生成 ${nextOptions.length}/3 套方案。${nextOptions.length < 3 ? '正在继续生成下一套。' : '请选择一套继续生成生图提示词。'}`,
              productName: planner.productName || message.productName,
              platform: planner.platform || message.platform,
              taskType: planner.taskType || message.taskType,
              productImageCount: planner.productImageCount,
              benchmarkImageCount: planner.benchmarkImageCount,
              options: nextOptions,
              sharedPlannerContext,
              errorMessage: optionErrors.length ? optionErrors.join('\n') : undefined,
            };
          }));
        } catch (error) {
          const errorText = formatEcomPlannerOptionErrorText(
            error instanceof Error ? error.message : undefined,
            `方案 ${optionId} 生成失败。`,
          );

          optionErrors.push(`方案 ${optionId}：${errorText}`);
          setMessages((current) => current.map((message) => (
            message.id === messageId && message.type === 'ecom_planner_options'
              ? {
                  ...message,
                  summary: `方案 ${optionId} 重新生成失败，正在继续尝试其他方案。`,
                  errorMessage: optionErrors.join('\n'),
                }
              : message
          )));
        }
      }

      setMessages((current) => current.map((message) => {
        if (message.id !== messageId || message.type !== 'ecom_planner_options') {
          return message;
        }

        const hasOptions = message.options.length > 0;

        return {
          ...message,
          summary: hasOptions
            ? `已重新生成 ${message.options.length}/3 套方案。${optionErrors.length ? '部分方案失败，可先选择已生成方案继续。' : '请选择一套继续生成生图提示词。'}`
            : '套图企划生成失败，请稍后重试。',
          status: hasOptions ? 'waiting' as const : 'error' as const,
          errorMessage: optionErrors.length ? optionErrors.join('\n') : undefined,
        };
      }));
    })()
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, provider]);

  const handleConfirmEcomPlannerPrompt = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const promptMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'ecom_planner_prompt_markdown' }> => (
      message.id === messageId && message.type === 'ecom_planner_prompt_markdown'
    ));

    if (!promptMessage || promptMessage.status !== 'waiting_confirmation') {
      return;
    }

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'ecom_planner_prompt_markdown'
        ? { ...message, status: 'submitted' as const, errorMessage: undefined }
        : message
    )));

    const imageActions: CanvasAgentAction[] = promptMessage.imageSlots.map((slot) => ({
      type: 'create_image_generation_node',
      clientActionId: createPanelId(`ecom-planner-image-${slot.index}`),
      prompt: slot.prompt,
      options: {
        provider: resolvedImagePreference.provider,
        model: resolvedImagePreference.model,
        runningHubChannel: resolvedImagePreference.provider === 'runninghub'
          ? resolvedImagePreference.runningHubChannel
          : undefined,
        aspectRatio: resolveAgentActionAspectRatio({
          actionAspectRatio: slot.ratio,
          preference: resolvedImagePreference,
        }),
        quality: resolvedImagePreference.quality,
      },
    }));
    const productAttachments = getAgentEcomPlannerProductAttachments(promptMessage.attachments);
    const executionActions = attachReferencesToImageActions(imageActions, productAttachments);
    const attachmentsForExecution = productAttachments.map((attachment) => ({ ...attachment }));
    const plan: AgentExecutionPlan = {
      stageLabel: '套图企划',
      title: `${promptMessage.productName} · 方案 ${promptMessage.optionId} 生图节点`,
      brief: [
        { label: '来源', value: '套图企划 Step 5' },
        { label: '平台', value: promptMessage.platform },
        { label: '任务', value: promptMessage.taskType },
        { label: '图位', value: `${promptMessage.imageSlots.length} 张` },
      ],
      steps: promptMessage.imageSlots.map((slot) => `${slot.index}. ${slot.slot}：${slot.intent}`),
      promptPreview: promptMessage.imageSlots[0]?.prompt,
      confirmationLabel: '确认生成',
    };
    const executionResult = onConfirmPlan?.({
      actions: executionActions,
      attachments: attachmentsForExecution,
      plan,
    }) ?? { ok: false };

    setMessages((current) => [
      ...current.map((message) => (
        message.id === messageId && message.type === 'ecom_planner_prompt_markdown'
          ? { ...message, status: executionResult.ok ? 'completed' as const : 'error' as const }
          : message
      )),
      {
        id: createPanelId('agent-plan'),
        role: 'agent',
        type: 'execution_plan',
        summary: `已创建方案 ${promptMessage.optionId} 的 ${promptMessage.imageSlots.length} 个图像生成节点，等待确认生成。`,
        userPrompt: promptMessage.title,
        plan,
        actions: executionActions,
        attachments: attachmentsForExecution,
        trace: [
          {
            id: createPanelId('agent-trace'),
            type: 'thinking',
            content: '套图企划 Step 5 图位 prompt 已转换为画布图片生成节点。',
          },
        ],
        meta: {
          usedModel: true,
          usedFallback: false,
          model: 'ecommerce-image-planner',
        },
        nodeIdMap: executionResult.nodeIdMap,
        imageGenerationNodeId: executionResult.imageGenerationNodeId,
        imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
        groupId: executionResult.groupId,
        groupName: executionResult.groupName,
        status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [busy, messages, onConfirmPlan, resolvedImagePreference]);

  const handleConfirmPlanfEcomPlan = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const planMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }> => (
      message.id === messageId && message.type === 'planf_ecom_plan'
    ));

    if (!planMessage || (
      planMessage.status !== 'waiting_confirmation' &&
      !(planMessage.status === 'error' && planMessage.retryable)
    )) {
      return;
    }

    setBusyMode('mcp');
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'planf_ecom_plan'
        ? {
            ...message,
            status: 'submitted' as const,
            errorMessage: undefined,
            retryStage: undefined,
            retryable: undefined,
          }
        : message
    )));
    void requestOpenClawPlanfEcomCreateWorkflow(planMessage, provider, model, projectId)
      .then((result) => {
        const planAspectRatio = getPlanfEcomPreferredAspectRatio({
          values: planMessage.values,
          plan: planMessage.plan,
        });
        const mentionRestoredActions = restoreReferenceMentionLabelsInActions(
          result.actions,
          planMessage.session.request,
          planMessage.attachments,
        );
        const preferenceActions = mentionRestoredActions.map((action) => (
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
                  aspectRatio: resolveAgentActionAspectRatio({
                    actionAspectRatio: action.options?.aspectRatio,
                    fallbackAspectRatio: planAspectRatio,
                    preference: resolvedImagePreference,
                  }),
                  quality: resolvedImagePreference.quality,
                },
              }
            : action
        ));
        const executionActions = attachReferencesToImageActions(
          preferenceActions,
          planMessage.attachments,
        );
        const preferenceNodes = applyImageGenerationActionOptionsToMaterializedNodes({
          nodes: result.nodes,
          actions: executionActions,
          nodeIdMap: result.nodeIdMap,
        });
        const attachmentsForExecution = planMessage.attachments.map((attachment) => ({ ...attachment }));
        const executionResult = onConfirmPlan?.({
          actions: executionActions,
          nodes: preferenceNodes,
          edges: result.edges,
          nodeIdMap: result.nodeIdMap,
          attachments: attachmentsForExecution,
          plan: result.plan,
        }) ?? { ok: false };

        setMessages((current) => [
          ...current.map((message) => (
            message.id === messageId && message.type === 'planf_ecom_plan'
              ? { ...message, status: executionResult.ok ? 'completed' as const : 'error' as const }
              : message
          )),
          {
            id: createPanelId('agent-plan'),
            role: 'agent',
            type: 'execution_plan',
            summary: result.summary,
            userPrompt: planMessage.session.request,
            plan: result.plan,
            actions: executionActions,
            nodes: preferenceNodes,
            edges: result.edges,
            attachments: attachmentsForExecution,
            trace: result.trace,
            meta: result.meta,
            nodeIdMap: executionResult.nodeIdMap,
            imageGenerationNodeId: executionResult.imageGenerationNodeId,
            imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
            groupId: executionResult.groupId,
            groupName: executionResult.groupName,
            planfEcom: planMessage.plan.meta.anchorMode === 'white-bg-first'
              ? {
                  phase: 'white-bg-anchor' as const,
                  session: planMessage.session,
                  values: planMessage.values,
                  plan: planMessage.plan,
                }
              : undefined,
            status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((error) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'planf_ecom_plan'
              ? {
                  ...message,
                  status: 'error' as const,
                  errorMessage: error instanceof Error ? error.message : 'GenLink 电商工作流创建失败',
                  retryStage: getPlanfWorkflowRetryStage(error),
                  retryable: isPlanfWorkflowRetryable(error),
                }
              : message
        )));
      })
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, onConfirmPlan, projectId, provider, resolvedImagePreference]);

  const handleStartPlanfEcomPlanAdjustment = useCallback((
    messageId: string,
    option: Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>['plan']['options'][number],
  ) => {
    if (option.id === 'A') {
      return;
    }
    const adjustmentOption: Extract<
      Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }>['adjustmentOption'],
      { id: 'B' | 'C' | 'D' }
    > = {
      id: option.id,
      label: option.label,
    };

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'planf_ecom_plan'
        ? {
            ...message,
            status: 'adjusting' as const,
            adjustmentOption,
            adjustmentDraft: '',
            errorMessage: undefined,
          }
        : message
    )));
  }, []);

  const handleUpdatePlanfEcomPlanAdjustment = useCallback((messageId: string, value: string) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'planf_ecom_plan'
        ? { ...message, adjustmentDraft: value }
        : message
    )));
  }, []);

  const handleApplyPlanfEcomPlanAdjustment = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const planMessage = messages.find((
      message,
    ): message is Extract<AgentPanelMessage, { type: 'planf_ecom_plan' }> => (
      message.id === messageId && message.type === 'planf_ecom_plan'
    ));

    const instruction = planMessage?.adjustmentDraft?.trim();

    if (!planMessage || !planMessage.adjustmentOption || !instruction) {
      return;
    }

    setBusyMode('mcp');
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'planf_ecom_plan'
        ? { ...message, status: 'submitted' as const, errorMessage: undefined }
        : message
    )));
    void requestOpenClawPlanfEcomReplan(
      planMessage,
      {
        optionLabel: planMessage.adjustmentOption.label,
        instruction,
      },
      provider,
      model,
      projectId,
    )
      .then((result) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'planf_ecom_plan'
            ? result
            : message
        )));
      })
      .catch((error) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'planf_ecom_plan'
            ? {
                ...message,
                status: 'error' as const,
                errorMessage: error instanceof Error ? error.message : 'GenLink 电商编排调整失败',
              }
            : message
        )));
      })
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, projectId, provider]);

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
    setBusyMode('thinking');
    void runAgent({
      prompt: selectionMessage.prompt,
      taskAttachments: selectionMessage.attachments,
      selectedAttachments: [selectedAttachment],
      userMessageCreatedAt: new Date().toISOString(),
      selectedPlanfPresetId: null,
      planfRouteMode: 'auto',
    }).finally(() => {
      setBusyMode(null);
    });
  }, [busy, messages, runAgent]);

  const handleConfirmPlan = useCallback((messageId: string) => {
    const planMessage = messages.find((message) => (
      message.id === messageId &&
      message.type === 'execution_plan' &&
      message.status === 'waiting_confirmation'
    ));

    if (!planMessage || planMessage.type !== 'execution_plan') {
      return;
    }

    const executionResult = onConfirmPlan?.({
      actions: planMessage.actions,
      nodes: planMessage.nodes,
      edges: planMessage.edges,
      attachments: planMessage.attachments,
      plan: planMessage.plan,
    }) ?? { ok: true };

    setMessages((current) => current.map((message) => (
      message.id === messageId && message.type === 'execution_plan'
        ? {
            ...message,
            imageGenerationNodeId: executionResult.imageGenerationNodeId,
            imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
            groupId: executionResult.groupId,
            groupName: executionResult.groupName,
            status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
          }
        : message
    )));
  }, [messages, onConfirmPlan]);

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

  const handleConfirmPlanfEcomAnchorFanout = useCallback((messageId: string) => {
    if (busy) {
      return;
    }

    const anchorMessage = messages.find((message): message is Extract<AgentPanelMessage, { type: 'execution_plan' }> => (
      message.id === messageId &&
      message.type === 'execution_plan' &&
      message.status === 'executed' &&
      message.planfEcom?.phase === 'white-bg-anchor'
    ));

    const planfEcom = anchorMessage?.planfEcom;

    if (!planfEcom) {
      return;
    }

    const anchor = getPlanfAnchorFromExecutionMessage(anchorMessage, nodes);

    if (!anchor) {
      return;
    }

    setBusyMode('mcp');
    void requestOpenClawPlanfEcomFanoutWorkflow(planfEcom, anchor, provider, model, projectId)
      .then((result) => {
        const planAspectRatio = getPlanfEcomPreferredAspectRatio({
          values: planfEcom.values,
          plan: planfEcom.plan,
        });
        const mentionRestoredActions = restoreReferenceMentionLabelsInActions(
          result.actions,
          planfEcom.session.request,
          anchorMessage.attachments,
        );
        const preferenceActions = mentionRestoredActions.map((action) => (
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
                  aspectRatio: resolveAgentActionAspectRatio({
                    actionAspectRatio: action.options?.aspectRatio,
                    fallbackAspectRatio: planAspectRatio,
                    preference: resolvedImagePreference,
                  }),
                  quality: resolvedImagePreference.quality,
                },
              }
            : action
        ));
        const preferenceNodes = applyImageGenerationActionOptionsToMaterializedNodes({
          nodes: result.nodes,
          actions: preferenceActions,
          nodeIdMap: result.nodeIdMap,
        });
        const attachmentsForExecution = anchorMessage.attachments.map((attachment) => ({ ...attachment }));
        const executionResult = onConfirmPlan?.({
          actions: preferenceActions,
          nodes: preferenceNodes,
          edges: result.edges,
          nodeIdMap: result.nodeIdMap,
          attachments: attachmentsForExecution,
          plan: result.plan,
        }) ?? { ok: false };

        setMessages((current) => [
          ...current,
          {
            id: createPanelId('agent-plan'),
            role: 'agent',
            type: 'execution_plan',
            summary: result.summary,
            userPrompt: anchorMessage.userPrompt ?? planfEcom.session.request,
            plan: result.plan,
            actions: preferenceActions,
            nodes: preferenceNodes,
            edges: result.edges,
            attachments: attachmentsForExecution,
            trace: result.trace,
            meta: result.meta,
            nodeIdMap: executionResult.nodeIdMap,
            imageGenerationNodeId: executionResult.imageGenerationNodeId,
            imageGenerationNodeIds: executionResult.imageGenerationNodeIds,
            groupId: executionResult.groupId,
            groupName: executionResult.groupName,
            planfEcom: {
              phase: 'fanout' as const,
              session: planfEcom.session,
              values: planfEcom.values,
              plan: planfEcom.plan,
              anchorNodeId: anchor.nodeId,
              anchorOutputUrl: anchor.outputUrl,
            },
            status: executionResult.ok ? 'waiting_generation_confirmation' : 'error',
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((error) => {
        setMessages((current) => current.map((message) => (
          message.id === messageId && message.type === 'execution_plan'
            ? {
                ...message,
                status: 'error' as const,
                meta: {
                  ...(message.meta ?? { usedModel: true, usedFallback: false }),
                  fallbackReason: error instanceof Error ? error.message : 'GenLink 电商扇出工作流创建失败',
                },
              }
            : message
        )));
      })
      .finally(() => {
        setBusyMode(null);
      });
  }, [busy, messages, model, nodes, onConfirmPlan, projectId, provider, resolvedImagePreference]);

  const activeImageModels = IMAGE_MODEL_OPTIONS_BY_PROVIDER[resolvedImagePreference.provider];
  const showAgentSuggestions = messages.length === 0 && !busy;
  const aspectRatioControlsDisabled = imagePreference.mode === 'auto';

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync generation message status from external canvas node updates
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
    <div
      className={[
        'nodrag nopan pointer-events-none fixed inset-0 z-40 overflow-hidden',
        panelResizing ? 'select-none' : '',
      ].join(' ')}
      aria-hidden={!open}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <aside
        className={[
          'pointer-events-auto absolute flex flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#11141b] text-white shadow-[-18px_18px_70px_rgba(0,0,0,0.42)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]',
        ].join(' ')}
        style={{
          width: panelWidth,
          top: AGENT_PANEL_FLOATING_INSET,
          right: AGENT_PANEL_FLOATING_INSET,
          bottom: AGENT_PANEL_FLOATING_INSET,
        }}
      >
      <button
        type="button"
        aria-label="\u62d6\u52a8\u8c03\u6574 Agent \u9762\u677f\u5bbd\u5ea6"
        className={[
          'absolute left-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 outline-none transition',
          open ? 'pointer-events-auto' : 'pointer-events-none',
          panelResizing ? 'bg-[#c9ff1a]/12' : 'hover:bg-white/[0.06]',
        ].join(' ')}
        onPointerDown={handlePanelResizePointerDown}
      />
      <div className="relative flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center text-[#d8dadd]">
            <UniqueLoading variant="squares" size="agent-sm" />
          </div>
          <div>
            <div className="text-sm font-medium">GenLink Agent</div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button
            ref={historyButtonRef}
            type="button"
            className={[
              'flex h-8 w-8 items-center justify-center transition hover:text-white',
              historyOpen ? 'text-white' : 'text-[#aeb4c2]',
            ].join(' ')}
            aria-label="历史会话"
            title="历史会话"
            onClick={handleOpenHistory}
          >
            <Clock3 size={18} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-[#aeb4c2] transition hover:text-white"
            aria-label="新建对话"
            title="新建对话"
            onClick={handleNewThread}
          >
            <MessageSquarePlus size={18} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-[#aeb4c2] transition hover:text-white"
            aria-label="退出 Agent 面板"
            title="退出 Agent 面板"
            onClick={onClose}
          >
            <ChevronRight size={22} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div
          ref={historyPopoverRef}
          className="absolute right-16 top-[58px] z-30 flex w-[286px] flex-col overflow-hidden rounded-[18px] border border-white/[0.09] bg-[#232323] text-white shadow-[0_18px_52px_rgba(0,0,0,0.42)]"
        >
          <div className="px-4 pb-1.5 pt-3 text-[12px] font-medium leading-5 text-white/22">过去7天</div>
          <div className="hidden">
            <div className="text-sm font-semibold text-white/92">历史会话</div>
            <button
              type="button"
              className="hidden"
              aria-label="关闭历史会话"
              title="关闭历史会话"
              onClick={() => setHistoryOpen(false)}
            >
              <X size={17} strokeWidth={1.8} />
            </button>
          </div>
          {historyThreads.length ? (
            <div className="scrollbar-hide max-h-[210px] overflow-y-auto px-2 pb-2">
              {historyThreads.map((thread) => (
                <div
                  key={thread.id}
                  className="group relative"
                >
                  <button
                    type="button"
                    className={[
                      'block w-full min-w-0 rounded-lg px-2.5 py-2 text-left transition',
                      thread.id === threadId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.055]',
                    ].join(' ')}
                    onClick={() => {
                      setMessages(restoreAgentThreadMessages(thread.messages));
                      setThreadId(thread.id);
                      setHistoryOpen(false);
                    }}
                  >
                    <div className="truncate pr-7 text-[13px] font-semibold leading-5 text-white/72">{thread.title}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-white/28">{formatAgentThreadTime(thread.updatedAt)}</div>
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/24 opacity-0 transition hover:bg-white/[0.08] hover:text-white/72 group-hover:opacity-100"
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
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 pb-5 pt-1 text-xs leading-5 text-white/38">
              当前项目还没有 Agent 历史会话。
            </div>
          )}
        </div>
      ) : null}

      <div className="scrollbar-hide flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((message) => {
            if (message.type === 'text') {
              const messageAttachments = getMessageAttachments(
                message.role === 'user' ? message.attachmentIds : undefined,
                attachments,
                message.role === 'user' ? message.attachments : undefined,
              );
              const messageBubble = (
                <div
                  className={[
                    'rounded-lg px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'ml-10 bg-white text-[#11141b]'
                      : 'mr-10 whitespace-pre-line bg-white/[0.04] text-white/76',
                  ].join(' ')}
                >
                  <div>{stripReferenceMentionTokens(message.content, messageAttachments)}</div>
                  {message.role === 'agent' && message.variant === 'retryable_error' ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-[#19d3ff]/35 bg-[#19d3ff]/12 px-3 text-xs font-semibold text-[#7eeaff] transition hover:bg-[#19d3ff]/18 disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleRetryAgentMessage(message.id)}
                    >
                      <Sparkles size={13} />
                      {message.retryLabel ?? '重新生成'}
                    </button>
                  ) : null}
                  {message.role === 'user' && messageAttachments.length ? (
                    <div className="mt-2 space-y-2">
                      {messageAttachments.map((attachment, index) => (
                        <div
                          key={`${message.id}-${attachment.id}`}
                          className="flex items-center gap-2 rounded-md bg-[#f1f2f5] p-2 text-[#11141b]"
                        >
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-black/5">
                            {attachment.previewUrl || attachment.imageUrl ? (
                              <NextImage
                                src={attachment.previewUrl || attachment.imageUrl}
                                alt={attachment.name || `图片${index + 1}`}
                                fill
                                sizes="48px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-black/35">
                                图片
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-[#2a2d34]">{`图片${index + 1}`}</div>
                            <div className="mt-1 inline-flex rounded-full bg-[#17b36a]/12 px-2 py-0.5 text-[11px] font-medium text-[#0c8d50]">
                              已添加到画布
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );

              if (message.role === 'agent') {
                return (
                  <div key={message.id} className="flex items-start gap-3 rounded-lg bg-transparent px-1 py-2">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1">{messageBubble}</div>
                  </div>
                );
              }

              return (
                <div key={message.id}>{messageBubble}</div>
              );
            }

            if (message.type === 'attachment_selection') {
              return (
                <div key={message.id} className="flex items-start gap-3 rounded-lg bg-transparent px-1 py-2">
                  <AgentAvatarMark />
                  <div className="min-w-0 flex-1 rounded-lg bg-[#171b24] p-3">
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
                </div>
              );
            }

            if (message.type === 'planf_ecom_session') {
              const visibleFields = getVisiblePlanfEcomSessionFields(message);

              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1 rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
                      {SHOW_PLANF_ECOM_RUNTIME_IN_CHAT ? (
                        <>
                          <div className="mb-3 inline-flex rounded bg-[#10151f] px-2 py-1 text-[11px] font-medium text-[#7dffb2]">
                            {message.session.stateHeader}
                          </div>
                          <div className="mb-3 rounded-lg border border-[#7dffb2]/20 bg-[#7dffb2]/[0.06] p-3 text-[11px] leading-5">
                            <div className="mb-1 font-semibold text-[#7dffb2]">{message.session.protocol.name}</div>
                            <div className="text-white/58">{message.session.protocol.trigger}</div>
                            <div className="mt-1 text-white/44">{message.session.protocol.responsePath}</div>
                          </div>
                        </>
                      ) : null}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
                            <ImagePlus size={15} />
                            电商图信息确认
                          </div>
                          <div className="mt-3 text-[16px] font-semibold text-white">
                            {visibleFields.length ? `还需要确认 ${visibleFields.length} 项` : '信息已足够'}
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#75e2b8]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#75e2b8]" />
                          {message.status === 'collecting' ? '待确认' : message.status === 'submitted' ? '已提交' : '需重试'}
                        </div>
                      </div>
                      <div className="mt-4 text-sm leading-6 text-white/78">
                        {sanitizeAgentChatText(message.session.message)}
                      </div>

                      {SHOW_PLANF_ECOM_RUNTIME_IN_CHAT ? (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/78">
                            <Loader2 size={13} className={message.status === 'collecting' ? 'animate-spin text-[#19d3ff]' : 'text-white/42'} />
                            GenLink triage
                          </div>
                          <div className="space-y-2">
                            {message.session.thinkingSteps.map((step, index) => (
                              <div key={`${step.label}-${index}`} className="grid grid-cols-[72px_1fr] gap-2 text-[11px] leading-5">
                                <div className="text-[#7dffb2]">{step.label}</div>
                                <div className="text-white/56">{step.detail}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 overflow-hidden rounded-[18px] bg-[#2a2b2e]">
                        {visibleFields.length ? (
                          visibleFields.map((field, index) => (
                            <div key={field.id} className="border-b border-white/[0.05] p-3 last:border-b-0">
                              <div className="mb-3 flex items-center gap-3 text-[14px] font-semibold leading-5 text-white/92">
                                <span className="shrink-0 text-white">{index + 1}.</span>
                                <span className="min-w-0 flex-1 truncate">{field.label}</span>
                                <ChevronRight size={16} className="shrink-0 text-white/36" />
                              </div>

                              {field.type === 'text' ? (
                                <input
                                  className="h-9 w-full rounded-lg border border-white/10 bg-[#1f2023] px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[#19d3ff]/70"
                                  value={field.value}
                                  placeholder={field.placeholder}
                                  disabled={message.status !== 'collecting'}
                                  onChange={(event) => updatePlanfEcomSessionField(message.id, field.id, event.target.value)}
                                />
                              ) : null}

                              {field.type === 'upload' ? (
                                <div className="rounded-lg border border-dashed border-white/12 bg-[#1f2023] p-3 text-xs leading-5 text-white/52">
                                  <div>{field.hint}</div>
                                  <div className="mt-2 inline-flex rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/62">
                                    当前参考图：{message.attachments.length} 张
                                  </div>
                                </div>
                              ) : null}

                              {field.type === 'select' ? (
                                <div className="flex flex-wrap gap-2">
                                  {field.options.map((option) => {
                                    const selected = field.value === option.value;

                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        disabled={message.status !== 'collecting'}
                                        className={[
                                          'h-8 rounded-full border px-3 text-xs transition',
                                          selected
                                            ? 'border-[#19d3ff]/70 bg-[#19d3ff]/10 text-white'
                                            : 'border-white/10 bg-[#1f2023] text-white/56 hover:bg-white/[0.08] hover:text-white/80',
                                        ].join(' ')}
                                        onClick={() => updatePlanfEcomSessionField(message.id, field.id, option.value)}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                              {'hint' in field && field.hint ? (
                                <div className="mt-2 text-[11px] leading-5 text-white/38">{field.hint}</div>
                              ) : null}

                              {field.type === 'multi-select' ? (
                                <div className="flex flex-wrap gap-2">
                                  {field.options.map((option) => {
                                    const selected = field.value.includes(option.value);

                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        disabled={message.status !== 'collecting'}
                                        className={[
                                          'h-8 rounded-full border px-3 text-xs transition',
                                          selected
                                            ? 'border-[#19d3ff]/70 bg-[#19d3ff]/10 text-white'
                                            : 'border-white/10 bg-[#1f2023] text-white/56 hover:bg-white/[0.08] hover:text-white/80',
                                        ].join(' ')}
                                        onClick={() => {
                                          const nextValue = selected
                                            ? field.value.filter((item) => item !== option.value)
                                            : field.value.length < field.maxSelected
                                              ? [...field.value, option.value]
                                              : field.value;

                                          updatePlanfEcomSessionField(message.id, field.id, nextValue);
                                        }}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-sm leading-6 text-white/68">
                            已从输入内容和参考图中识别到必要信息，可直接提交进入编排。
                          </div>
                        )}
                      </div>

                      {message.status === 'error' ? (
                        <div className="mt-4 text-xs text-[#ffb4a8]">
                          {formatAgentChatErrorText(message.errorMessage, '信息确认失败，请调整后重试。')}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={busy || message.status !== 'collecting'}
                        className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-3 text-[13px] font-semibold text-[#061019] transition hover:bg-[#6ee7ff] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => handleConfirmPlanfEcomSession(message.id)}
                      >
                        <Sparkles size={15} />
                        确认提交
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === 'ecom_planner_options') {
              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1 rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
                            <Sparkles size={15} />
                            套图企划
                          </div>
                          <div className="mt-3 text-[16px] font-semibold text-white">
                            {message.productName} · 3 套方向
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#75e2b8]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#75e2b8]" />
                          {message.status === 'waiting'
                            ? '待选择'
                            : message.status === 'generating'
                              ? '生成中'
                              : message.status === 'submitted'
                                ? '生成 Prompt'
                                : message.status === 'completed'
                                  ? '已选择'
                                  : '出错'}
                        </div>
                      </div>

                      <div className="mt-2 text-xs leading-5 text-white/54">
                        {message.summary}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-white/50">
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">{message.platform}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">{message.taskType}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">产品图 {message.productImageCount}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">对标图 {message.benchmarkImageCount}</span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {message.options.map((option) => {
                          const optionKey = `${message.id}:${option.id}`;
                          const expanded = expandedPlanSlotKeys.has(optionKey);
                          const selected = message.selectedOptionId === option.id;
                          const summaryRows = buildPlannerSummaryRows(option);

                          return (
                            <div
                              key={option.id}
                              className={[
                                'rounded-xl border p-3',
                                selected
                                  ? 'border-[#19d3ff]/45 bg-[#123744]/45'
                                  : 'border-white/10 bg-white/[0.035]',
                              ].join(' ')}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#19d3ff] text-xs font-bold text-[#061019]">
                                  {option.id}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold leading-5 text-white">
                                    {option.title}
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-white/58">
                                    {option.positioning}
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-white/46">
                                    {option.visualDirection}
                                  </div>
                                </div>
                              </div>

                              {expanded ? (
                                <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/18 p-3 text-xs leading-5 text-white/62">
                                  <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                                    {summaryRows.map((row) => (
                                      <div
                                        key={row.label}
                                        className="grid grid-cols-[82px_minmax(0,1fr)] border-b border-white/[0.06] last:border-b-0"
                                      >
                                        <div className="bg-white/[0.035] px-3 py-2 font-semibold text-white/68">
                                          {row.label}
                                        </div>
                                        <div className="min-w-0 break-words px-3 py-2 text-white/62">
                                          {row.value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/62 transition hover:bg-white/[0.08] hover:text-white/82"
                                  onClick={() => {
                                    setExpandedPlanSlotKeys((current) => {
                                      const next = new Set(current);
                                      if (next.has(optionKey)) {
                                        next.delete(optionKey);
                                      } else {
                                        next.add(optionKey);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  {expanded ? '收起详情' : '查看详情'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || message.status !== 'waiting'}
                                  className="h-8 rounded-lg bg-[#19d3ff] px-3 text-xs font-semibold text-[#061019] transition hover:bg-[#6ee7ff] disabled:cursor-not-allowed disabled:opacity-45"
                                  onClick={() => handleSelectEcomPlannerOption(message.id, option.id)}
                                >
                                  选这套生成生图提示词
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {message.status === 'generating'
                          ? ECOM_PLANNER_OPTION_IDS.filter((optionId) => (
                              !message.options.some((option) => option.id === optionId)
                            )).map((optionId) => (
                              <div
                                key={`${message.id}:${optionId}:loading`}
                                className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-xs font-bold text-white/42">
                                    {optionId}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="h-3 w-32 rounded-full bg-white/[0.08]" />
                                    <div className="mt-2 h-2.5 w-full max-w-[260px] rounded-full bg-white/[0.055]" />
                                  </div>
                                  <Loader2 size={15} className="animate-spin text-[#19d3ff]" />
                                </div>
                              </div>
                            ))
                          : null}
                      </div>

                      {message.errorMessage ? (
                        <div className="mt-3 space-y-3">
                          <div className="text-xs leading-5 text-[#ffb4a8]">
                            {formatAgentChatErrorText(message.errorMessage, '套图企划生成失败，请稍后重试。')}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            className="flex h-8 items-center gap-2 rounded-lg border border-[#19d3ff]/35 bg-[#19d3ff]/12 px-3 text-xs font-semibold text-[#7eeaff] transition hover:bg-[#19d3ff]/18 disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => handleRetryEcomPlannerOptions(message.id)}
                          >
                            <Sparkles size={13} />
                            重新生成方案
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === 'ecom_planner_prompt_markdown') {
              const statusLabel = message.status === 'waiting_confirmation'
                ? '待创建'
                : message.status === 'submitted'
                  ? '创建中'
                  : message.status === 'completed'
                    ? '已创建'
                    : '出错';
              const promptDisplayBlocks = buildAgentEcomPlannerPromptDisplayBlocks(message.imageSlots);

              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1 rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
                            <Sparkles size={15} />
                            套图企划 · 生图提示词
                          </div>
                          <div className="mt-3 text-[16px] font-semibold leading-6 text-white">
                            方案 {message.optionId} · {message.productName} 图位编排
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#75e2b8]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#75e2b8]" />
                          {statusLabel}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-white/50">
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">{message.productName}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">{message.platform}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">{message.taskType}</span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1">
                          {message.promptBlockCount} 段 prompt
                        </span>
                      </div>

                      <div className="mt-4 space-y-5">
                        {promptDisplayBlocks.map((block) => (
                          <section key={`${message.id}:${block.index}`} className="min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <h4 className="min-w-0 text-[15px] font-semibold leading-6 text-white">
                                {block.heading}
                              </h4>
                              <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white/58">
                                {block.ratio}
                              </span>
                            </div>
                            <div className="overflow-hidden rounded-xl bg-[#ebebec] text-[#16181d]">
                              <div className="flex h-8 items-center justify-between border-b border-black/[0.06] px-3 text-[11px] text-black/48">
                                <span>文本</span>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition hover:bg-black/[0.06] hover:text-black/72"
                                  title="复制提示词"
                                  aria-label={`复制 ${block.heading} 提示词`}
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(block.prompt);
                                  }}
                                >
                                  <Copy size={13} />
                                </button>
                              </div>
                              <pre className="max-h-56 overflow-auto px-3 py-3 text-[12px] leading-6">
                                <code className="whitespace-pre font-mono">{block.prompt}</code>
                              </pre>
                            </div>
                          </section>
                        ))}
                      </div>

                      {message.errorMessage ? (
                        <div className="mt-3 text-xs leading-5 text-[#ffb4a8]">
                          {formatAgentChatErrorText(message.errorMessage, '套图企划生图提示词生成失败，请稍后重试。')}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={busy || message.status !== 'waiting_confirmation'}
                        className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-4 text-sm font-semibold text-[#061019] transition hover:bg-[#6ee7ff] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => handleConfirmEcomPlannerPrompt(message.id)}
                      >
                        <Sparkles size={15} />
                        创建到画布
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === 'planf_ecom_plan') {
              const protocolLabel = `creative-doc / ${message.plan.type}`;
              const summaryText = sanitizeAgentChatText(message.summary);
              const checkpointPrompt = sanitizeAgentChatText(message.plan.checkpointPrompt);
              const imageSummary = getPlanfEcomImageSummary({
                preference: resolvedImagePreference,
                taskCount: message.plan.imageSlots.length,
              });

              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1 rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
                      {shouldShowAgentInternalText(protocolLabel) ? (
                        <div className="mb-3 inline-flex rounded bg-[#10151f] px-2 py-1 text-[11px] font-medium text-[#7dffb2]">
                          {protocolLabel}
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
                            <ImagePlus size={15} />
                            图片生成
                          </div>
                          <div className="mt-3 text-[16px] font-semibold text-white">
                            生成 {message.plan.imageSlots.length} 张图片
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#75e2b8]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#75e2b8]" />
                          {getPlanfEcomPlanStatusLabel(message.status)}
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-semibold leading-6 text-white">{message.plan.title}</div>
                      {summaryText ? (
                        <div className="mt-1 text-xs leading-5 text-white/54">{summaryText}</div>
                      ) : null}

                      {message.plan.meta.extraConstraints ? (
                        <div className="mt-3 rounded-md border border-white/10 bg-black/18 p-2 text-[11px] leading-5 text-white/48">
                          {message.plan.meta.extraConstraints}
                        </div>
                      ) : null}

                      <div className="mt-4 overflow-hidden rounded-[18px] bg-[#2a2b2e]">
                        {message.plan.imageSlots.map((slot, slotIndex) => {
                          const slotKey = getPlanfEcomSlotKey({
                            messageId: message.id,
                            slotId: slot.index,
                            slotIndex,
                          });
                          const expanded = expandedPlanSlotKeys.has(slotKey);

                          return (
                            <button
                              key={slotKey}
                              type="button"
                              aria-expanded={expanded}
                              className={`flex min-h-11 w-full gap-3 border-b border-white/[0.05] px-4 py-2.5 text-left text-[14px] font-semibold leading-5 text-white/92 last:border-b-0 hover:bg-white/[0.035] ${expanded ? 'items-start' : 'items-center'}`}
                              onClick={() => {
                                setExpandedPlanSlotKeys((current) => {
                                  const next = new Set(current);
                                  if (next.has(slotKey)) {
                                    next.delete(slotKey);
                                  } else {
                                    next.add(slotKey);
                                  }
                                  return next;
                                });
                              }}
                            >
                              <span className="shrink-0 text-white">{slot.index}.</span>
                              <span className={`min-w-0 flex-1 ${expanded ? 'whitespace-normal break-words' : 'truncate'}`}>
                                {slot.slot}：{slot.intent}
                              </span>
                              <ChevronRight
                                size={16}
                                className={`mt-0.5 shrink-0 text-white/42 transition-transform ${expanded ? 'rotate-90' : ''}`}
                              />
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] font-semibold text-white/82">
                        <span className="inline-flex items-center gap-1.5">
                          <Sparkles size={14} className="text-white/46" />
                          {imageSummary.modelLabel}
                        </span>
                        <span className="h-3 w-px bg-white/12" />
                        <span>{imageSummary.aspectRatio}</span>
                        <span className="h-3 w-px bg-white/12" />
                        <span>{imageSummary.quality}</span>
                        <span className="h-3 w-px bg-white/12" />
                        <span>{imageSummary.taskLabel}</span>
                        {message.attachments[0]?.previewUrl ? (
                          <div className="relative ml-auto h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-[#35363a]">
                            <NextImage
                              src={message.attachments[0].previewUrl}
                              alt={message.attachments[0].name || '参考图'}
                              fill
                              sizes="32px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        ) : null}
                      </div>

                      {checkpointPrompt ? (
                        <div className="mt-4 text-xs font-medium text-white/62">{checkpointPrompt}</div>
                      ) : null}
                      {message.plan.meta.anchorMode === 'white-bg-first' ? (
                        <div className="mt-2 rounded-md border border-[#ffc36a]/20 bg-[#ffc36a]/10 p-2 text-[11px] leading-5 text-[#ffd89b]">
                          当前没有产品参考图。按规则本轮只创建 #1 主锚白底图；主锚生成完成并确认后，下一轮再扇出其余图片。
                        </div>
                      ) : null}
                      <div
                        className={[
                          'mt-3 flex gap-2',
                          message.plan.options.length > 2 ? 'flex-col items-start' : 'flex-wrap',
                        ].join(' ')}
                      >
                        {message.plan.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            disabled={busy || message.status !== 'waiting_confirmation'}
                            className={[
                              'h-9 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
                              option.id === 'A'
                                ? 'border-[#19d3ff] bg-[#19d3ff] text-[#061019] hover:bg-[#6ee7ff]'
                                : 'border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08] hover:text-white/82',
                            ].join(' ')}
                            onClick={() => {
                              if (option.id === 'A') {
                                handleConfirmPlanfEcomPlan(message.id);
                              } else {
                                handleStartPlanfEcomPlanAdjustment(message.id, option);
                              }
                            }}
                          >
                            {option.id}. {option.id === 'A' && message.plan.meta.anchorMode === 'white-bg-first'
                              ? '确认编排，先创建主锚白底'
                              : option.label}
                          </button>
                        ))}
                      </div>

                      {message.status === 'adjusting' ? (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 text-xs font-semibold text-white/72">
                            {message.adjustmentOption?.label}
                          </div>
                          <textarea
                            className="min-h-20 w-full resize-none rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm leading-5 text-white outline-none transition focus:border-[#19d3ff]/70"
                            value={message.adjustmentDraft ?? ''}
                            placeholder="写下你要怎么调整，例如：只保留 1/3/5/8；第 4 张卖点图改成防水防尘；整体换成更科技感的蓝白风。"
                            onChange={(event) => handleUpdatePlanfEcomPlanAdjustment(message.id, event.target.value)}
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              className="h-8 rounded-lg bg-[#19d3ff] px-3 text-xs font-semibold text-[#061019] transition hover:bg-[#6ee7ff]"
                              onClick={() => handleApplyPlanfEcomPlanAdjustment(message.id)}
                            >
                              重新生成编排
                            </button>
                            <button
                              type="button"
                              className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/58 transition hover:bg-white/[0.08] hover:text-white/82"
                              onClick={() => {
                                setMessages((current) => current.map((item) => (
                                  item.id === message.id && item.type === 'planf_ecom_plan'
                                    ? {
                                        ...item,
                                        status: 'waiting_confirmation' as const,
                                        adjustmentOption: undefined,
                                        adjustmentDraft: undefined,
                                      }
                                    : item
                                )));
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {message.status === 'error' ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs leading-5 text-[#ffb4a8]">
                            {formatAgentChatErrorText(message.errorMessage, '创建画布节点失败，请稍后重试。')}
                          </div>
                          {message.retryable && message.retryStage ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="flex h-8 items-center gap-2 rounded-lg border border-[#19d3ff]/35 bg-[#19d3ff]/12 px-3 text-xs font-semibold text-[#7eeaff] transition hover:bg-[#19d3ff]/18 disabled:cursor-not-allowed disabled:opacity-45"
                              onClick={() => handleConfirmPlanfEcomPlan(message.id)}
                            >
                              <Sparkles size={13} />
                              {message.retryStage === 'materialize_canvas' ? '重新创建画布节点' : '重新生成工作流'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === 'execution_plan') {
              const nodeChips = getAgentCanvasNodeChips(message);
              const fanoutAnchor = message.status === 'executed' && message.planfEcom?.phase === 'white-bg-anchor'
                ? getPlanfAnchorFromExecutionMessage(message, nodes)
                : undefined;
              const fanoutRemainingCount = getPlanfFanoutRemainingCount(message.planfEcom);

              return (
                <div key={message.id} className="rounded-lg bg-transparent px-1 py-2">
                  <div className="mb-3 flex items-start gap-3">
                    <AgentAvatarMark />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-6 text-white/90">
                        {getAgentResultText(message)}
                      </div>

                      {nodeChips.length ? (
                        <div className="mt-3">
                          <div className="mb-2 text-[11px] text-white/34">画布节点（{nodeChips.length}）</div>
                          <div className="flex flex-wrap gap-2">
                            {nodeChips.map((chip) => (
                              <button
                                key={chip.id}
                                type="button"
                                disabled={!chip.nodeId}
                                title={chip.nodeId ? '定位到画布节点' : undefined}
                                className={[
                                  'flex max-w-full items-center gap-1.5 rounded-md border border-[#19d3ff]/15 bg-[#14212b] px-2.5 py-1.5 text-left text-xs text-white/82 outline-none transition',
                                  chip.nodeId
                                    ? 'cursor-pointer hover:border-[#19d3ff]/45 hover:bg-[#193043] focus-visible:border-[#19d3ff]/70 focus-visible:ring-1 focus-visible:ring-[#19d3ff]/35'
                                    : 'cursor-default opacity-80',
                                ].join(' ')}
                                onClick={() => {
                                  if (chip.nodeId) {
                                    onFocusNode?.(chip.nodeId);
                                  }
                                }}
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#19d3ff]" />
                                <span className="truncate font-medium">{chip.title}</span>
                                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/62">
                                  {chip.typeLabel}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {SHOW_AGENT_TRACE_IN_CHAT ? renderAgentTrace(message.trace) : null}

                      {message.status === 'waiting_confirmation' ? (
                        <button
                          type="button"
                          className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-4 text-sm font-semibold text-[#061019] transition hover:bg-[#6ee7ff]"
                          onClick={() => handleConfirmPlan(message.id)}
                        >
                          <Sparkles size={15} />
                          创建到画布
                        </button>
                      ) : null}

                      {message.status === 'waiting_generation_confirmation' ? (
                        <button
                          type="button"
                          className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-4 text-sm font-semibold text-[#061019] transition hover:bg-[#6ee7ff]"
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
                        <>
                          <div className="mt-4 flex h-8 items-center gap-2 text-xs text-[#19d3ff]">
                            <Check size={14} />
                            生成已完成
                          </div>
                          {fanoutAnchor ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="mt-2 flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-4 text-sm font-semibold text-[#061019] transition hover:bg-[#6ee7ff] disabled:cursor-not-allowed disabled:opacity-45"
                              onClick={() => handleConfirmPlanfEcomAnchorFanout(message.id)}
                            >
                              <Sparkles size={15} />
                              确认主锚并扇出其余 {fanoutRemainingCount} 图
                            </button>
                          ) : null}
                        </>
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
          {busy ? (
            <div className="flex items-start gap-3 rounded-lg bg-transparent px-1 py-2">
              <AgentAvatarMark />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#19d3ff]">
                  <span className="agent-busy-shimmer">
                    {activeEcomPlannerPromptStatus ? '正在生成生图提示词' : busyMode === 'mcp' ? '正在准备画布节点' : '正在思考中...'}
                  </span>
                  <span className="text-[11px] font-normal text-white/38">请稍等</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-white/45">
                  {activeEcomPlannerPromptStatus?.type === 'ecom_planner_options'
                    ? activeEcomPlannerPromptStatus.promptCurrentStatus
                    : busyMode === 'mcp'
                    ? '正在校验编排，并转换成画布动作。'
                    : '正在理解需求，读取规则，并准备下一步响应。'}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-white/62">
                  <span className="agent-busy-wave" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="agent-busy-shimmer">
                    {activeEcomPlannerPromptStatus?.type === 'ecom_planner_options' &&
                    activeEcomPlannerPromptStatus.promptProgressTotal
                      ? `进度 ${activeEcomPlannerPromptStatus.promptProgressCurrent ?? 0}/${activeEcomPlannerPromptStatus.promptProgressTotal}`
                      : busyMode === 'mcp' ? '正在创建节点...' : '正在生成回复...'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
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
                <AgentPanelSelect
                  label="Provider"
                  value={provider}
                  options={AGENT_TEXT_PROVIDER_OPTIONS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={setProvider}
                />
                <AgentPanelSelect
                  label="Model"
                  value={model}
                  options={AGENT_MODEL_OPTIONS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={setModel}
                />
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
                  aspectRatioControlsDisabled ? 'opacity-35' : 'opacity-100',
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
                        aspectRatioControlsDisabled
                          ? 'cursor-not-allowed'
                          : 'hover:bg-white/[0.09]',
                        selected
                          ? 'bg-[#19d3ff] text-[#061019] shadow-[0_0_0_1px_rgba(25,211,255,0.18)]'
                          : 'bg-white/[0.05] text-white/54',
                      ].join(' ')}
                      disabled={aspectRatioControlsDisabled}
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
                  'mb-3 flex gap-1.5',
                ].join(' ')}
              >
                {IMAGE_SIZE_OPTIONS.map((option) => {
                  const selected = resolvedImagePreference.quality === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      className={[
                        'h-8 rounded-md px-3 text-xs font-medium transition hover:bg-white/[0.09]',
                        selected
                          ? 'bg-[#19d3ff] text-[#061019] shadow-[0_0_0_1px_rgba(25,211,255,0.18)]'
                          : 'bg-white/[0.05] text-white/54',
                      ].join(' ')}
                      onClick={() => {
                        setImagePreference((current) => ({
                          ...current,
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
                  'grid grid-cols-2 gap-2',
                ].join(' ')}
              >
                <AgentPanelSelect
                  label="Provider"
                  value={resolvedImagePreference.provider}
                  options={API_PROVIDERS.map((option) => ({
                    value: option,
                    label: getApiProviderLabel(option),
                  }))}
                  onChange={(nextProvider) => {
                    setImagePreference((current) => ({
                      ...current,
                      provider: nextProvider,
                      model: getImageModelDefault(nextProvider),
                    }));
                  }}
                />
                <AgentPanelSelect
                  label="Model"
                  value={resolvedImagePreference.model}
                  options={activeImageModels.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={(nextModel) => {
                    setImagePreference((current) => ({
                      ...current,
                      provider: resolvedImagePreference.provider,
                      model: nextModel,
                    }));
                  }}
                />
              </div>
            </div>
          ) : null}

          {planfPresetOpen ? (
            <div className="mb-8 rounded-xl border border-white/10 bg-[#15171c] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.24)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-[12px] text-white/44">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#19d3ff]" />
                  <span className="font-medium text-white/82">电商套图</span>
                  <span>· 选个方向</span>
                </div>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-white/38 transition hover:bg-white/[0.08] hover:text-white/72"
                  aria-label="关闭电商套图方向"
                  onClick={() => setPlanfPresetPanelOpen(false)}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PLANF_ECOM_PRESETS.map((preset) => {
                  const selected = selectedPlanfPresetId === preset.id;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={[
                        'h-7 rounded-md border px-2.5 text-xs font-medium transition',
                        selected
                          ? 'border-[#18c8e8] bg-[#123744] text-white shadow-[0_0_0_1px_rgba(24,200,232,0.28)]'
                          : 'border-transparent bg-white/[0.06] text-white/64 hover:bg-white/[0.1] hover:text-white',
                      ].join(' ')}
                      onClick={() => {
                        setSelectedPlanfPresetId(preset.id);
                        setPlanfRouteMode(preset.routeMode);
                        setDraft(preset.prompt);
                        setReferenceUploadNudgeRequested(
                          getAgentReferenceUploadNudgeRequestForPlanfPanel({
                            panelOpen: true,
                            attachmentCount: attachmentsRef.current.length,
                          }),
                        );
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showAgentSuggestions && !planfPresetOpen ? (
            <div className="mb-4">
              <div className="mb-2 text-xl font-semibold">你好，我是你的 Agent 助手</div>
              <div className="text-sm text-white/55">告诉我你希望在画布上完成什么。</div>
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

          <div
            className="relative flex min-h-[124px] flex-col gap-3 rounded-xl"
            onDragEnter={handleInputDragEnter}
            onDragOver={handleInputDragOver}
            onDragLeave={handleInputDragLeave}
            onDrop={handleInputDrop}
          >
            <div className="relative flex min-h-10 items-center gap-2">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.055] text-white/58 transition hover:bg-white/[0.1] hover:text-white"
                aria-label="快捷选择画布参考图"
                title="快捷选择画布参考图"
                onClick={handleQuickReferenceClick}
              >
                <AgentReferenceImageIcon />
              </button>

              {attachments.length ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-1">
                  {attachments.map((attachment, index) => {
                    const plannerRole = getAgentEcomPlannerAttachmentRole(attachment);

                    return (
                    <div
                      key={attachment.id}
                      className="group/reference-thumb relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/14 bg-white/[0.04] shadow-[0_8px_18px_rgba(0,0,0,0.26)]"
                      onPointerEnter={(event) =>
                        referenceImagePreview.showPreview(
                          {
                            id: attachment.id,
                            imageUrl: attachment.imageUrl,
                            previewUrl: attachment.previewUrl,
                            alt: getAttachmentLabel(attachment, index),
                            width: attachment.width,
                            height: attachment.height,
                          },
                          event.currentTarget,
                        )
                      }
                      onPointerLeave={referenceImagePreview.hidePreview}
                    >
                      <NextImage
                        src={attachment.previewUrl}
                        alt={getAttachmentLabel(attachment, index)}
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                      <span className="absolute bottom-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold leading-none text-white">
                        {ecomPlannerActive ? (plannerRole === 'benchmark' ? '对标' : '产品') : index + 1}
                      </span>
                      <button
                        type="button"
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/72 text-white group-hover/reference-thumb:flex"
                        aria-label="移除图片"
                        onPointerEnter={referenceImagePreview.hidePreview}
                        onClick={() => handleRemoveAttachment(attachment.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    );
                  })}
                </div>
              ) : null}

              {ecomPlannerActive ? (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      className={[
                        'flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.055] px-3 text-xs font-semibold text-white/72 transition hover:bg-white/[0.09] hover:text-white',
                        showReferenceUploadNudge ? 'agent-reference-upload-nudge' : '',
                      ].join(' ')}
                      aria-label="上传产品图"
                      title="上传产品图"
                      onClick={() => handleUploadClick('product')}
                    >
                      <ImagePlus size={16} />
                      产品图
                    </button>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.055] px-3 text-xs font-semibold text-white/72 transition hover:bg-white/[0.09] hover:text-white"
                      aria-label="上传竞品对标图"
                      title="上传竞品对标图：参考风格、光影、版式，不复制竞品产品"
                      onClick={() => handleUploadClick('benchmark')}
                    >
                      <ImagePlus size={16} />
                      对标图（可选）
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={[
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-white/42 transition hover:bg-white/[0.07] hover:text-white/66',
                    showReferenceUploadNudge ? 'agent-reference-upload-nudge' : '',
                  ].join(' ')}
                  aria-label="上传图片"
                  title="添加参考图"
                  onClick={() => handleUploadClick('product')}
                >
                  {showReferenceUploadNudge ? (
                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#c9ff1a] px-2 py-1 text-[11px] font-semibold leading-none text-[#182000] shadow-[0_8px_22px_rgba(0,0,0,0.32)]">
                      建议上传图片
                    </span>
                  ) : null}
                  <ImagePlus size={16} />
                </button>
              )}
            </div>
            <PromptMentionInput
              value={draft}
              connectedImages={mentionImages}
              placeholder="描述你希望在画布上完成什么，可以用 @ 引用上传图片。"
              className="prompt-mention-input agent-mention-input scrollbar-hide min-h-[64px] max-h-32 flex-1 overflow-y-auto px-1 py-1 text-sm leading-6 text-white outline-none"
              mentionMenuVariant="agent"
              onChange={setDraft}
            />
            {isInputDragActive ? (
              <div className="pointer-events-none absolute -inset-3 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#20d873] bg-[#07110c]/82 text-[#22e17b] shadow-[0_0_0_1px_rgba(32,216,115,0.16),0_18px_44px_rgba(0,0,0,0.38)]">
                <ImagePlus size={28} strokeWidth={1.8} />
                <div className="mt-2 text-sm font-medium">拖放图片到此处</div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-xs font-medium text-white/72 transition hover:bg-white/[0.1]"
                aria-label="Agent 模型设置"
                aria-expanded={settingsOpen}
                onClick={() => {
                  const nextOpen = !settingsOpen;
                  if (nextOpen) {
                    planfPresetOpenBeforeOverlayRef.current = planfPresetOpen;
                  }
                  setSettingsOpen(nextOpen);
                  setPlanfPresetOpen(nextOpen ? false : planfPresetOpenBeforeOverlayRef.current);
                  setGenerationPreferenceOpen(false);
                }}
              >
                <Sparkles size={13} />
                Agent
              </button>
              <button
                type="button"
                className={[
                  'flex h-8 min-w-[46px] items-center justify-center rounded-full px-3 text-xs font-medium transition hover:bg-white/[0.08] hover:text-white/70',
                  planfRouteMode === 'auto' && !planfPresetOpen
                    ? 'text-white/38'
                    : 'bg-white/[0.08] text-[#19d3ff]',
                ].join(' ')}
                aria-label="打开电商套图方向"
                aria-expanded={planfPresetOpen}
                title="电商套图方向"
                onClick={() => {
                  setPlanfPresetPanelOpen(!planfPresetOpen);
                  setSettingsOpen(false);
                  setGenerationPreferenceOpen(false);
                }}
              >
                电商
              </button>
              <button
                type="button"
                className={[
                  'flex h-8 min-w-[46px] items-center justify-center rounded-full px-3 text-xs font-medium transition hover:bg-white/[0.08] hover:text-white/70',
                  generationPreferenceOpen ? 'bg-white/[0.08] text-[#19d3ff]' : 'text-white/38',
                ].join(' ')}
                aria-label="模型设置"
                aria-expanded={generationPreferenceOpen}
                title={`${getImageModelLabel(resolvedImagePreference.model)} / ${resolvedImagePreference.aspectRatio} / ${resolvedImagePreference.quality}`}
                onClick={() => {
                  const nextOpen = !generationPreferenceOpen;
                  if (nextOpen) {
                    planfPresetOpenBeforeOverlayRef.current = planfPresetOpen;
                  }
                  setGenerationPreferenceOpen(nextOpen);
                  setPlanfPresetOpen(nextOpen ? false : planfPresetOpenBeforeOverlayRef.current);
                  setSettingsOpen(false);
                }}
              >
                模型
              </button>
            </div>

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#11141b] transition hover:bg-white/90 disabled:cursor-default disabled:bg-white/30"
              aria-label="发送给 Agent"
              disabled={!draft.trim() || busy || hasUserDecisionPending}
              onClick={handleSubmit}
            >
              <Send size={16} />
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
      <ReferenceImageHoverPreviewPortal preview={referenceImagePreview.preview} />
      </aside>
    </div>
  );
});
