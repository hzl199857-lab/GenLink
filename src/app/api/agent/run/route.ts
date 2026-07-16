import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

import { AGENT_RUNTIME_RESPONSE_FORMAT } from "@/lib/agent-response-format";
import { buildAgentCanvasRulePack, type AgentCanvasRulePack } from "@/lib/agent-canvas-rule-pack";
import { isAgentTextProvider } from "@/lib/agent-provider-options";
import {
  getAgentVisionImageIndexByAttachmentId,
  getAgentVisionImages,
  getAgentVisionVideos,
} from "@/lib/agent-vision-images";
import { materializeAgentWorkflowOutput } from "@/lib/agent-workflow-output";
import { stripReferenceMentionTokens } from "@/lib/prompt-mentions";
import type { CanvasRuntimeSnapshot } from "@/lib/canvas/runtime-snapshot";
import { generateText, VibeApiError, type GenerateTextResult, type ImageApiProvider } from "@/lib/vibe";
import type {
  AgentExecutionPlan,
  AgentProvider,
  AgentRunMeta,
  AgentTaskAttachment,
  AgentTaskContext,
  CanvasAgentAction,
  CanvasAgentToolCall,
  CanvasAgentToolName,
  CanvasAgentTraceItem,
} from "@/types/agent";

export const runtime = "nodejs";

const MAX_SELF_REPAIR_ATTEMPTS = 1;
const MAX_RULE_READ_STEPS = 5;
const MAX_RULE_READ_CHARS = 40_000;
const RULE_READ_ROOT = path.join(process.cwd(), "rules", "planf-canvas");
let cachedRulePack: AgentCanvasRulePack | undefined;

type CanvasRuntimeStatus = CanvasRuntimeSnapshot["nodes"][number]["status"];

type AgentRunRequestBody = {
  message?: unknown;
  context?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

type AgentRuntimeState = {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
  actions: CanvasAgentAction[];
  trace: CanvasAgentTraceItem[];
  promptPreview: string;
  finalResponse?: string;
};

type AgentRunResult = {
  summary: string;
  plan: AgentExecutionPlan;
  actions: CanvasAgentAction[];
  trace: CanvasAgentTraceItem[];
  requiresPlanConfirmation: boolean;
  meta: AgentRunMeta;
};

type AgentSelfRepairContext = {
  attempt: number;
  diagnostic: string;
  previousRawOutput: string;
};

type AgentRuntimeModelStep =
  | {
      type: "read_rule_file";
      reason: string | null;
      filePath: string;
      summary: null;
      workflow: null;
    }
  | {
      type: "workflow";
      reason: string | null;
      filePath: null;
      summary: string;
      workflow: unknown;
    }
  | {
      type: "chat";
      reason: string | null;
      filePath: null;
      summary: string;
      workflow: null;
    };

function createRuntimeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseAttachment(value: unknown): AgentTaskAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.previewUrl !== "string"
  ) {
    return null;
  }

  if (record.kind === "video") {
    if (
      typeof record.videoUrl !== "string" ||
      !/^https?:\/\//i.test(record.videoUrl.trim())
    ) {
      return null;
    }

    return {
      id: record.id,
      kind: "video",
      name: record.name,
      mimeType: record.mimeType,
      mediaUrl: typeof record.mediaUrl === "string" ? record.mediaUrl : record.videoUrl,
      videoUrl: record.videoUrl,
      previewUrl: record.previewUrl,
      thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : undefined,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
      durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : undefined,
      status: record.status === "ready" ? "ready" : "attached",
      sourceNodeId: typeof record.sourceNodeId === "string" ? record.sourceNodeId : undefined,
    };
  }

  if (record.kind !== "image" || typeof record.imageUrl !== "string") {
    return null;
  }

  return {
    id: record.id,
    kind: "image",
    name: record.name,
    mimeType: record.mimeType,
    mediaUrl: typeof record.mediaUrl === "string" ? record.mediaUrl : record.imageUrl,
    imageUrl: record.imageUrl,
    hostedImageUrl: typeof record.hostedImageUrl === "string" ? record.hostedImageUrl : undefined,
    originalImageUrl: typeof record.originalImageUrl === "string" ? record.originalImageUrl : undefined,
    previewUrl: record.previewUrl,
    thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : undefined,
    semanticImageUrl: typeof record.semanticImageUrl === "string" ? record.semanticImageUrl : undefined,
    width: typeof record.width === "number" ? record.width : undefined,
    height: typeof record.height === "number" ? record.height : undefined,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
    status: record.status === "ready" ? "ready" : "attached",
    sourceNodeId: typeof record.sourceNodeId === "string" ? record.sourceNodeId : undefined,
  };
}

function parseContext(value: unknown): AgentTaskContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const input = record.input;

  if (!input || typeof input !== "object") {
    return null;
  }

  const inputRecord = input as Record<string, unknown>;
  const rawAttachments = Array.isArray(inputRecord.attachments)
    ? inputRecord.attachments
    : [];
  const attachments = rawAttachments.flatMap((attachment) => {
    const parsed = parseAttachment(attachment);

    return parsed ? [parsed] : [];
  });
  if (attachments.length !== rawAttachments.length) {
    return null;
  }
  const canvasSummary =
    record.canvasSummary && typeof record.canvasSummary === "object"
      ? record.canvasSummary as Record<string, unknown>
      : undefined;
  const canvasRuntimeSnapshot = parseCanvasRuntimeSnapshot(record.canvasRuntimeSnapshot);

  return {
    project: {
      name: record.project && typeof record.project === "object"
        ? String((record.project as Record<string, unknown>).name ?? "Untitled")
        : "Untitled",
      id: record.project &&
        typeof record.project === "object" &&
        typeof (record.project as Record<string, unknown>).id === "string"
        ? (record.project as Record<string, unknown>).id as string
        : undefined,
    },
    input: {
      message: typeof inputRecord.message === "string" ? inputRecord.message : "",
      attachments,
      referencedAttachmentIds: Array.isArray(inputRecord.referencedAttachmentIds)
        ? inputRecord.referencedAttachmentIds.filter((id): id is string => typeof id === "string")
        : [],
    },
    executionTarget: {
      createOnCanvas: true,
      placement: "viewport_center_right",
      confirmationMode: "workflow_auto_apply",
    },
    canvasSummary: canvasSummary
      ? {
          nodeCount: typeof canvasSummary.nodeCount === "number" ? canvasSummary.nodeCount : 0,
          edgeCount: typeof canvasSummary.edgeCount === "number" ? canvasSummary.edgeCount : 0,
          groupCount: typeof canvasSummary.groupCount === "number" ? canvasSummary.groupCount : 0,
          pendingCount: typeof canvasSummary.pendingCount === "number" ? canvasSummary.pendingCount : undefined,
          runningCount: typeof canvasSummary.runningCount === "number" ? canvasSummary.runningCount : undefined,
          finishedCount: typeof canvasSummary.finishedCount === "number" ? canvasSummary.finishedCount : undefined,
          failedCount: typeof canvasSummary.failedCount === "number" ? canvasSummary.failedCount : undefined,
        }
      : undefined,
    canvasRuntimeSnapshot,
  };
}

function parseCanvasRuntimeSnapshot(value: unknown): CanvasRuntimeSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.flatMap((node) => {
        if (!node || typeof node !== "object" || Array.isArray(node)) {
          return [];
        }

        const item = node as Record<string, unknown>;
        const status = item.status;

        if (
          typeof item.id !== "string" ||
          typeof item.type !== "string" ||
          !isCanvasRuntimeStatus(status)
        ) {
          return [];
        }

        return [{
          id: item.id,
          type: item.type as CanvasRuntimeSnapshot["nodes"][number]["type"],
          title: typeof item.title === "string" ? item.title : undefined,
          logicalId: typeof item.logicalId === "string" ? item.logicalId : undefined,
          agentNodeType: typeof item.agentNodeType === "string" ? item.agentNodeType : undefined,
          status,
          outputUrl: typeof item.outputUrl === "string" ? item.outputUrl : undefined,
          errorCode: typeof item.errorCode === "string" ? item.errorCode : undefined,
          errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
          retryable: item.retryable === true,
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
        }];
      })
    : [];
  const summary = record.summary && typeof record.summary === "object" && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};

  return {
    nodes,
    summary: {
      nodeCount: typeof summary.nodeCount === "number" ? summary.nodeCount : nodes.length,
      edgeCount: typeof summary.edgeCount === "number" ? summary.edgeCount : 0,
      groupCount: typeof summary.groupCount === "number" ? summary.groupCount : 0,
      pendingCount: typeof summary.pendingCount === "number" ? summary.pendingCount : nodes.filter((node) => node.status === "pending").length,
      runningCount: typeof summary.runningCount === "number" ? summary.runningCount : nodes.filter((node) => node.status === "running").length,
      finishedCount: typeof summary.finishedCount === "number" ? summary.finishedCount : nodes.filter((node) => node.status === "finished").length,
      failedCount: typeof summary.failedCount === "number" ? summary.failedCount : nodes.filter((node) => node.status === "failed").length,
    },
  };
}

function isCanvasRuntimeStatus(value: unknown): value is CanvasRuntimeStatus {
  return value === "pending" || value === "running" || value === "finished" || value === "failed";
}

function extractJsonObject(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

function parseStringRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRuntimeModelStep(content: string): AgentRuntimeModelStep {
  const jsonText = extractJsonObject(content);

  if (!jsonText) {
    throw new Error("模型没有返回 GenLink runtime JSON；请切换支持结构化 JSON 输出的模型或 Provider。");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("模型返回的 GenLink runtime JSON 无法解析；请切换支持结构化 JSON 输出的模型或 Provider。");
  }

  const record = parseStringRecord(parsed);

  if (!record || typeof record.type !== "string") {
    throw new Error("模型返回的 GenLink runtime JSON 缺少 type。");
  }

  if (record.type === "read_rule_file") {
    if (typeof record.filePath !== "string" || !record.filePath.trim()) {
      throw new Error("read_rule_file requires filePath");
    }

    return {
      type: "read_rule_file",
      reason: typeof record.reason === "string" ? record.reason : null,
      filePath: record.filePath,
      summary: null,
      workflow: null,
    };
  }

  if (record.type === "workflow") {
    if (typeof record.summary !== "string" || !record.summary.trim()) {
      throw new Error("workflow response requires summary");
    }

    if (!parseStringRecord(record.workflow)) {
      throw new Error("workflow response requires workflow object");
    }

    return {
      type: "workflow",
      reason: typeof record.reason === "string" ? record.reason : null,
      filePath: null,
      summary: record.summary,
      workflow: record.workflow,
    };
  }

  if (record.type === "chat") {
    if (typeof record.summary !== "string" || !record.summary.trim()) {
      throw new Error("chat response requires summary");
    }

    return {
      type: "chat",
      reason: typeof record.reason === "string" ? record.reason : null,
      filePath: null,
      summary: record.summary,
      workflow: null,
    };
  }

  throw new Error(`Unsupported GenLink runtime step type: ${record.type}`);
}

function normalizeRuleFilePath(filePath: string): { absolutePath: string; relativePath: string } {
  const normalizedInput = filePath.replace(/\\/g, "/").replace(/^rules\/planf-canvas\//, "");
  const absolutePath = path.resolve(RULE_READ_ROOT, normalizedInput);
  const relativePath = path.relative(RULE_READ_ROOT, absolutePath).replace(/\\/g, "/");

  if (relativePath.startsWith("../") || path.isAbsolute(relativePath) || relativePath === "") {
    throw new Error("read_rule_file path must stay inside rules/planf-canvas");
  }

  if (!/\.(?:md|yaml|yml|json|txt)$/i.test(relativePath)) {
    throw new Error("read_rule_file only supports md/yaml/yml/json/txt files");
  }

  return {
    absolutePath,
    relativePath: `rules/planf-canvas/${relativePath}`,
  };
}

function readRuleFileForAgent(filePath: string): { relativePath: string; content: string; truncated: boolean } {
  const normalized = normalizeRuleFilePath(filePath);

  if (!existsSync(normalized.absolutePath)) {
    throw new Error(`read_rule_file not found: ${normalized.relativePath}`);
  }

  const content = readFileSync(normalized.absolutePath, "utf8");

  return {
    relativePath: normalized.relativePath,
    content: content.length > MAX_RULE_READ_CHARS ? content.slice(0, MAX_RULE_READ_CHARS) : content,
    truncated: content.length > MAX_RULE_READ_CHARS,
  };
}

function getSelectedAttachments(context: AgentTaskContext): AgentTaskAttachment[] {
  const referencedIds = new Set(context.input.referencedAttachmentIds);

  return referencedIds.size > 0
    ? context.input.attachments.filter((attachment) => referencedIds.has(attachment.id))
    : context.input.attachments;
}

function getCleanUserPrompt(message: string, attachments: AgentTaskAttachment[]): string {
  return stripReferenceMentionTokens(message, attachments).trim();
}

function enhancePromptLocally(message: string, attachments: AgentTaskAttachment[]): string {
  const clean = getCleanUserPrompt(message, attachments);

  if (attachments.length > 0) {
    return [
      clean || "根据参考图完成图像编辑",
      "保持原图主体身份、构图、镜头角度和光照关系稳定。",
      "只修改用户明确要求改变的部分，避免改变背景、脸部、姿态和画面比例。",
      "生成自然真实、边缘过渡干净、颜色一致、无明显修图痕迹的高质量结果。",
    ].join(" ");
  }

  return [
    clean || "创建一张高质量创意图像",
    "主体清晰，构图完整，细节丰富。",
    "自然光影，色彩协调，画面干净，有明确视觉焦点。",
    "高质量图像生成风格，避免文字、水印、畸变和低清晰度。",
  ].join(" ");
}

function getToolRisk(name: CanvasAgentToolName): CanvasAgentToolCall["risk"] {
  return name === "read_canvas_summary" ||
    name === "read_rule_file" ||
    name === "genlink_canvas_get_snapshot" ||
    name === "genlink_canvas_get_node" ||
    name === "genlink_canvas_get_job_status"
    ? "read"
    : name === "run_image_generation" ||
        name === "genlink_canvas_run_node"
      ? "generate"
      : "write";
}

function createToolCall(name: CanvasAgentToolName, input: Record<string, unknown>): CanvasAgentToolCall {
  return {
    id: createRuntimeId("tool-call"),
    name,
    input,
    risk: getToolRisk(name),
    requiresConfirmation: name === "run_image_generation",
  };
}

function createRuntimeState(params: {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
}): AgentRuntimeState {
  const selectedAttachments = getSelectedAttachments(params.context);

  return {
    message: params.message,
    context: {
      ...params.context,
      input: {
        ...params.context.input,
        attachments: selectedAttachments,
        referencedAttachmentIds: selectedAttachments.map((attachment) => attachment.id),
      },
    },
    provider: params.provider,
    model: params.model,
    actions: [],
    trace: [],
    promptPreview: enhancePromptLocally(params.message, selectedAttachments),
  };
}

function createAgentResultFromState(state: AgentRuntimeState, meta: AgentRunMeta): AgentRunResult {
  const selectedAttachments = state.context.input.attachments;
  const hasSourceImages = selectedAttachments.length > 0;
  const imageGenerationCount = state.actions.filter((action) => action.type === "create_image_generation_node").length;
  const isBatchGeneration = imageGenerationCount > 1;
  const toolLabels = hasSourceImages
    ? []
    : state.trace.flatMap((item) => (
        item.type === "tool_call" ? [getToolDisplayName(item.call.name)] : []
      ));

  return {
    summary: state.finalResponse ??
      (isBatchGeneration
        ? hasSourceImages
          ? `我会基于上传图片创建 ${imageGenerationCount} 个图生图结果，并放入同一个批量生成分组。`
          : `我会创建 ${imageGenerationCount} 组文生图链路，并放入同一个批量生成分组。`
        : hasSourceImages
        ? "我会使用上传图片作为上游素材，创建图像生成节点并写入编辑 prompt。"
        : "我会创建提示词节点和图像生成节点，并把它们连接成文生图链路。"),
    plan: {
      stageLabel: "阶段 1/2",
      title: isBatchGeneration ? "批量图像生成组" : hasSourceImages ? "图片编辑链路" : "文生图链路",
      brief: [
        {
          label: "任务类型",
          value: isBatchGeneration ? (hasSourceImages ? "批量图生图 / 图片编辑" : "批量文生图") : hasSourceImages ? "图生图 / 图片编辑" : "文生图",
        },
        ...(isBatchGeneration
          ? [{
              label: "生成任务",
              value: `${imageGenerationCount} 个`,
            }]
          : []),
        {
          label: "输入素材",
          value: hasSourceImages ? selectedAttachments.map((_, index) => `图片${index + 1}`).join("、") : "无",
        },
        {
          label: "Agent 模型",
          value: meta.usedModel ? `${state.provider ?? "auto"} / ${meta.model ?? "auto"}` : "未使用模型",
        },
      ],
      steps: toolLabels.length > 0
        ? toolLabels
        : isBatchGeneration
          ? hasSourceImages
            ? ["读取画布摘要", "放置上传图片", `创建 ${imageGenerationCount} 个图像生成节点`, "连接参考图到每个生成节点", "放入批量生成分组", "等待确认后并发生成"]
            : ["读取画布摘要", `创建 ${imageGenerationCount} 个提示词节点`, `创建 ${imageGenerationCount} 个图像生成节点`, "连接每组节点", "放入批量生成分组", "等待确认后并发生成"]
        : hasSourceImages
          ? ["读取画布摘要", "放置上传图片", "创建图像生成节点", "连接图片到生成节点", "等待确认生成"]
          : ["读取画布摘要", "创建提示词节点", "创建图像生成节点", "连接节点", "等待确认生成"],
      promptPreview: state.promptPreview,
      confirmationLabel: "确认生成",
    },
    actions: state.actions,
    trace: state.trace,
    requiresPlanConfirmation: false,
    meta,
  };
}

function getToolDisplayName(name: CanvasAgentToolName): string {
  switch (name) {
    case "read_canvas_summary":
      return "读取画布摘要";
    case "read_rule_file":
      return "读取规则文件";
    case "create_text_node":
      return "创建提示词文本节点";
    case "create_uploaded_image_node":
      return "创建上传图片节点";
    case "create_image_generation_node":
      return "创建图像生成节点";
    case "connect_nodes":
      return "连接节点";
    case "set_image_generation_options":
      return "设置图像生成参数";
    case "run_image_generation":
      return "等待用户确认后触发生成";
    case "genlink_canvas_get_snapshot":
      return "MCP 读取画布快照";
    case "genlink_canvas_get_node":
      return "MCP 读取画布节点";
    case "genlink_canvas_create_workflow":
      return "MCP 创建画布工作流";
    case "genlink_canvas_create_node":
      return "MCP 创建画布节点";
    case "genlink_canvas_connect_nodes":
      return "MCP 连接画布节点";
    case "genlink_canvas_update_node_params":
      return "MCP 更新节点参数";
    case "genlink_canvas_run_node":
      return "MCP 触发节点生成";
    case "genlink_canvas_get_job_status":
      return "MCP 读取生成状态";
  }
}

function getCachedAgentCanvasRulePack(): AgentCanvasRulePack {
  cachedRulePack ??= buildAgentCanvasRulePack();

  return cachedRulePack;
}

function createAgentSystemPrompt(): string {
  const rulePack = getCachedAgentCanvasRulePack();

  return [
    "You are GenLink Canvas Agent, an intelligent operator for GenLink Infinite Canvas.",
    "Return exactly one JSON object that matches the enforced response_format schema. Do not use markdown.",
    "This runtime supports exactly three step types:",
    "1. type:\"read_rule_file\" asks the backend to read one rule or skill file under rules/planf-canvas. Set filePath to a relative path such as skills/ecom-image/SKILL.md, and set summary:null, workflow:null.",
    "2. type:\"workflow\" is the final answer. It must contain summary and a canonical GenLink Canvas workflow-json payload under workflow. Set filePath:null.",
    "3. type:\"chat\" is the final answer for greetings, status questions, clarifying questions, or any message that does not ask to create, edit, connect, run, or inspect canvas content. It must contain summary, set filePath:null and workflow:null, and must not create canvas nodes.",
    "The startup Rule Pack is already loaded below. Do not read AGENTS.md, BOOTSTRAP.md, TOOLS.md, canvas-capabilities.yaml, self-check.md, or engineer files again unless the user task explicitly requires inspecting them.",
    "Use read_rule_file only when a task-specific skill/reference file is needed. The maximum read budget is 5 files.",
    "During self-repair, return type:\"workflow\" directly unless the diagnostic explicitly proves that a missing rule file caused the failure.",
    rulePack.prompt,
    "The workflow root must be {name,nodes,edges,autoRun}.",
    "Every node must include id, type, subType, from:\"agent\", agentNodeType, title, content, aspectRatio, duration, sourceNodeId, editAction.",
    "Use type rh-image for image generation/editing and rh-text only for necessary text nodes. This Agent entry currently materializes image workflows; do not output rh-video nodes here.",
    "Use subType text-image for from-scratch image generation. Use subType image-image plus editAction:\"redraw\" for uploaded-image or existing-canvas-image edits.",
    "Never write toolsType, modelCode, resolution, videoWithAudio, negativePrompt, seed, cameraMovement, motionScore, qualitySuffix, upscale, position, or status.",
    "Never call or imply external image/video generation APIs. You only create a canvas workflow; generation still waits for user confirmation.",
    "Do not say the image has been generated. Say the workflow/node has been created or prepared.",
    "Canvas runtime snapshot and selected attachment sourceNodeId values are the source of truth. Never invent node ids.",
    "If an image-image task has selected attachments with sourceNodeId, every generation node must have an incoming edge from the real sourceNodeId and sourceNodeId must repeat that same real id.",
    "If the user asks for multiple images, create one rh-image node per requested result. Do not exceed 8 images.",
    "When uploaded attachments include visual inputs, inspect those images directly. Use the visual content to identify product material, color, structure, composition, and scene constraints.",
    "When uploaded attachments are present, put the rewritten prompt directly in each rh-image node content. Do not create extra explanation nodes by default.",
    "Canvas runtime snapshot is the source of truth. Treat status=failed as failed even if previous text implied success. Do not use failed nodes as finished references.",
    "When referencing existing canvas images, only use nodes with status=finished and a non-empty outputUrl.",
    "Always rewrite the user request into a high quality Chinese image prompt in node.content. Do not copy the user prompt verbatim.",
    "For multi-image requests, every node.content must be a complete standalone concrete prompt, not an abstract variation note.",
    "When the user asks for variants such as different clothing, actions, cities, styles, colors, angles, scenes, props, expressions, or interactions, infer the user's intent and expand the relevant parts into concrete visual choices. These dimensions are examples, not a fixed checklist.",
    "Do not leave generic phrases such as different clothing, different action, different city, different color, different angle, or different scene as the only variation. Use imagination while preserving the user's subject, constraints, and requested visual direction.",
    "For image editing prompts, preserve subject identity, composition, lighting, pose, background unless the user asks to change them.",
    "If the user only says hello or asks a conversational question, return type:\"chat\" and reply in Chinese in summary.",
    "Response example:",
    JSON.stringify({
      type: "workflow",
      reason: null,
      filePath: null,
      summary: "已创建图片工作流，等待用户确认生成。",
      workflow: {
        name: "图片工作流",
        autoRun: true,
        nodes: [{
          id: "node_1",
          type: "rh-image",
          subType: "text-image",
          from: "agent",
          agentNodeType: "illustration",
          title: "图片节点",
          content: "完整中文提示词",
          aspectRatio: "1:1",
          duration: null,
          sourceNodeId: null,
          editAction: null,
        }],
        edges: [],
      },
    }),
  ].join("\n");
}

function createAgentUserPrompt(
  state: AgentRuntimeState,
  selfRepair?: AgentSelfRepairContext,
): string {
  const visionImageIndexByAttachmentId = getAgentVisionImageIndexByAttachmentId(
    state.context.input.attachments,
  );

  return JSON.stringify({
    userMessage: state.message,
    cleanUserMessage: getCleanUserPrompt(state.message, state.context.input.attachments),
    canvasSummary: state.context.canvasSummary ?? {
      nodeCount: 0,
      edgeCount: 0,
      groupCount: 0,
    },
    canvasRuntimeSnapshot: state.context.canvasRuntimeSnapshot
      ? {
          summary: state.context.canvasRuntimeSnapshot.summary,
          nodes: state.context.canvasRuntimeSnapshot.nodes.map((node) => ({
            id: node.id,
            logicalId: node.logicalId,
            type: node.type,
            title: node.title,
            agentNodeType: node.agentNodeType,
            status: node.status,
            outputUrl: node.status === "finished" ? node.outputUrl : undefined,
            errorCode: node.errorCode,
            errorMessage: node.status === "failed" ? node.errorMessage : undefined,
            retryable: node.retryable,
            updatedAt: node.updatedAt,
          })),
        }
      : undefined,
    generationPreference: {
      provider: state.provider,
      model: state.model,
    },
    attachments: state.context.input.attachments.map((attachment, index) => ({
      attachmentId: attachment.id,
      kind: attachment.kind,
      label: `${attachment.kind === "video" ? "视频" : "图片"}${index + 1}`,
      fileName: attachment.name,
      width: attachment.width,
      height: attachment.height,
      durationSeconds: attachment.kind === "video" ? attachment.durationSeconds : undefined,
      visualInputIndex: visionImageIndexByAttachmentId.get(attachment.id),
      sourceNodeId: attachment.sourceNodeId,
    })),
    selfRepair: selfRepair
      ? {
          attempt: selfRepair.attempt,
          mode: "full_rewrite_only",
          diagnostic: selfRepair.diagnostic,
          previousRawOutput: selfRepair.previousRawOutput,
          instructions: [
            "The previous output failed GenLink engineer validation.",
            "Do not patch or partially edit the previous JSON.",
            "Fully rewrite one complete new JSON object matching the response_format schema.",
            "Keep the original user task and canvas/attachment facts unchanged.",
            "Fix the diagnostic cause directly; do not remove required references to avoid the failure.",
            "If the task uses selected sourceNodeId values, keep real incoming edges and matching sourceNodeId fields.",
          ],
        }
      : undefined,
    toolTranscript: state.trace.map((item) => {
      if (item.type === "thinking") {
        return {
          type: "thinking",
          content: item.content,
        };
      }

      if (item.type === "tool_call") {
        return {
          type: "tool_call",
          name: item.call.name,
          input: item.call.input,
        };
      }

      if (item.type === "tool_result") {
        return {
          type: "tool_result",
          name: item.result.toolName,
          ok: item.result.ok,
          message: item.result.message,
          data: item.result.data,
        };
      }

      return item;
    }),
  });
}

async function generateAgentWorkflowCandidate(params: {
  state: AgentRuntimeState;
  provider?: AgentProvider;
  model?: string;
  apiKey?: string;
  selfRepair?: AgentSelfRepairContext;
}): Promise<GenerateTextResult> {
  return generateText({
    prompt: createAgentUserPrompt(params.state, params.selfRepair),
    systemPrompt: createAgentSystemPrompt(),
    provider: params.provider as ImageApiProvider | undefined,
    model: params.model === "auto" ? undefined : params.model,
    apiKey: params.apiKey,
    images: getAgentVisionImages(params.state.context.input.attachments).map((image) => ({
      url: image.url,
    })),
    videos: getAgentVisionVideos(params.state.context.input.attachments).map((video) => ({
      url: video.url,
    })),
    temperature: params.selfRepair ? 0.1 : 0.2,
    maxTokens: 4000,
    responseFormat: AGENT_RUNTIME_RESPONSE_FORMAT,
  });
}

async function runAgentLoop(params: {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
  apiKey?: string;
}): Promise<AgentRunResult> {
  const state = createRuntimeState(params);
  const allowedExistingSourceIds = state.context.input.attachments
    .map((attachment) => attachment.sourceNodeId?.trim())
    .filter((nodeId): nodeId is string => Boolean(nodeId));
  let response: GenerateTextResult | undefined;
  let materialized: ReturnType<typeof materializeAgentWorkflowOutput> | undefined;
  let repairContext: AgentSelfRepairContext | undefined;

  for (let attempt = 0; attempt <= MAX_SELF_REPAIR_ATTEMPTS; attempt += 1) {
    let diagnostic: string | undefined;

    for (let readCount = 0; readCount <= MAX_RULE_READ_STEPS; readCount += 1) {
      response = await generateAgentWorkflowCandidate({
        state,
        provider: params.provider,
        model: params.model,
        apiKey: params.apiKey,
        selfRepair: repairContext,
      });

      try {
        const step = parseRuntimeModelStep(response.content);

        if (step.type === "read_rule_file") {
          if (readCount >= MAX_RULE_READ_STEPS) {
            diagnostic = `read_rule_file budget exceeded: maximum ${MAX_RULE_READ_STEPS} files before final workflow`;
            break;
          }

          const call = createToolCall("read_rule_file", {
            filePath: step.filePath,
            reason: step.reason,
          });
          state.trace.push({
            id: createRuntimeId("trace"),
            type: "tool_call",
            call,
          });

          try {
            const file = readRuleFileForAgent(step.filePath);
            state.trace.push({
              id: createRuntimeId("trace"),
              type: "tool_result",
              result: {
                id: createRuntimeId("tool-result"),
                toolCallId: call.id,
                toolName: call.name,
                ok: true,
                message: "rule file loaded",
                data: file,
              },
            });
          } catch (error) {
            state.trace.push({
              id: createRuntimeId("trace"),
              type: "tool_result",
              result: {
                id: createRuntimeId("tool-result"),
                toolCallId: call.id,
                toolName: call.name,
                ok: false,
                message: "rule file read failed",
                error: error instanceof Error ? error.message : "read_rule_file failed",
              },
            });
          }

          continue;
        }

        if (step.type === "chat") {
          state.finalResponse = step.summary;
          state.trace.push({
            id: createRuntimeId("trace"),
            type: "final",
            content: step.summary,
          });

          return createAgentResultFromState(state, {
            usedModel: true,
            usedFallback: false,
            model: response.model,
            modelRawOutput: response.content,
          });
        }

        materialized = materializeAgentWorkflowOutput({
          output: {
            summary: step.summary,
            workflow: step.workflow,
          },
          provider: params.provider,
          model: params.model === "auto" ? undefined : params.model,
          allowedExistingSourceIds,
        });

        if (attempt > 0) {
          state.trace.push({
            id: createRuntimeId("trace"),
            type: "thinking",
            content: `Self-Repair PASS: 第 ${attempt} 次重写后的 workflow-json 已通过 GenLink engineer validation。`,
          });
        }

        break;
      } catch (error) {
        diagnostic = error instanceof Error ? error.message : "Agent workflow validation failed";
        break;
      }
    }

    if (materialized) {
      break;
    }

    diagnostic ??= "Agent workflow validation failed";

    if (attempt >= MAX_SELF_REPAIR_ATTEMPTS) {
      throw new Error(`Agent workflow self-repair failed: ${diagnostic}`);
    }

    state.trace.push({
      id: createRuntimeId("trace"),
      type: "thinking",
      content: [
        "Self-Repair Diagnostic:",
        diagnostic,
        "Action: re-inject diagnostic and ask the model to fully rewrite the workflow JSON. Backend will not patch fields or add edges.",
      ].join("\n"),
    });
    repairContext = {
      attempt: attempt + 1,
      diagnostic,
      previousRawOutput: response?.content ?? "",
    };
  }

  if (!response || !materialized) {
    throw new Error("Agent workflow self-repair failed: model did not produce a valid workflow JSON");
  }

  const call = createToolCall("genlink_canvas_create_workflow", {
    workflow: materialized.workflow,
  });

  state.actions = materialized.actions;
  state.promptPreview = materialized.promptPreview ?? state.promptPreview;
  state.finalResponse = materialized.summary;
  state.trace.push({
    id: createRuntimeId("trace"),
    type: "tool_call",
    call,
  });
  state.trace.push({
    id: createRuntimeId("trace"),
    type: "tool_result",
    result: {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "workflow-json 已通过 GenLink engineer validation 并转换为画布 actions。",
      createdNodeIds: materialized.workflow.nodes.map((node) => node.id),
      createdEdgeIds: materialized.workflow.edges.map((edge) => edge.id),
      data: {
        workflowName: materialized.workflow.name,
      },
    },
  });
  state.trace.push({
    id: createRuntimeId("trace"),
    type: "final",
    content: materialized.summary,
  });

  return createAgentResultFromState(state, {
    usedModel: true,
    usedFallback: false,
    model: response.model,
    modelRawOutput: response.content,
  });
}

export async function POST(request: Request) {
  const access = await requireAuth(request);
  if (!access.ok) return access.response;
  try {
    const body = (await request.json()) as AgentRunRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const context = parseContext(body.context);

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message is required" },
        { status: 400 },
      );
    }

    if (!context) {
      return NextResponse.json(
        { ok: false, error: "AgentTaskContext is required" },
        { status: 400 },
      );
    }

    const provider = isAgentTextProvider(body.provider) ? body.provider : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const hasVideoAttachments = context.input.attachments.some(
      (attachment) => attachment.kind === "video",
    );

    if (hasVideoAttachments && (!provider || !model?.startsWith("gemini-"))) {
      return NextResponse.json(
        { ok: false, error: "视频理解仅支持 Comfly 或 Zhenzhen 的 Gemini 模型" },
        { status: 400 },
      );
    }

    try {
      const result = await runAgentLoop({
        message,
        context,
        provider,
        model,
        apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      });

      return NextResponse.json({
        ok: true,
        result,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "模型调用失败；请切换支持结构化 JSON 输出的模型或 Provider。",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof VibeApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
