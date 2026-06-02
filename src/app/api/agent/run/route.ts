import { NextResponse } from "next/server";

import { stripReferenceMentionTokens } from "@/lib/prompt-mentions";
import { generateText, VibeApiError, type ImageApiProvider } from "@/lib/vibe";
import type {
  AgentExecutionPlan,
  AgentProvider,
  AgentRunMeta,
  AgentTaskAttachment,
  AgentTaskContext,
  CanvasAgentAction,
  CanvasAgentToolCall,
  CanvasAgentToolName,
  CanvasAgentToolResult,
  CanvasAgentTraceItem,
} from "@/types/agent";

export const runtime = "nodejs";

const MAX_TOOL_STEPS = 20;

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
  virtualNodes: Map<string, { id: string; type: "text" | "uploaded_image" | "image_generation"; title?: string }>;
  attachmentsById: Map<string, AgentTaskAttachment>;
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

type ModelStep =
  | {
      type: "tool_call";
      thinking?: string;
      tool: {
        name: CanvasAgentToolName;
        input: Record<string, unknown>;
      };
    }
  | {
      type: "final";
      message: string;
    };

function createRuntimeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return (
    value === "vibe" ||
    value === "fucheers" ||
    value === "comfly" ||
    value === "zhenzhen" ||
    value === "runninghub" ||
    value === "grsai"
  );
}

function parseAttachment(value: unknown): AgentTaskAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    record.kind !== "image" ||
    typeof record.name !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.imageUrl !== "string" ||
    typeof record.previewUrl !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    kind: "image",
    name: record.name,
    mimeType: record.mimeType,
    imageUrl: record.imageUrl,
    previewUrl: record.previewUrl,
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
  const canvasSummary =
    record.canvasSummary && typeof record.canvasSummary === "object"
      ? record.canvasSummary as Record<string, unknown>
      : undefined;

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
      confirmationMode: "execution_plan_required",
    },
    canvasSummary: canvasSummary
      ? {
          nodeCount: typeof canvasSummary.nodeCount === "number" ? canvasSummary.nodeCount : 0,
          edgeCount: typeof canvasSummary.edgeCount === "number" ? canvasSummary.edgeCount : 0,
          groupCount: typeof canvasSummary.groupCount === "number" ? canvasSummary.groupCount : 0,
        }
      : undefined,
  };
}

function parseStringRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function isToolName(value: unknown): value is CanvasAgentToolName {
  return (
    value === "read_canvas_summary" ||
    value === "create_text_node" ||
    value === "create_uploaded_image_node" ||
    value === "create_image_generation_node" ||
    value === "connect_nodes" ||
    value === "set_image_generation_options" ||
    value === "run_image_generation"
  );
}

function parseModelStep(value: string): ModelStep | null {
  const jsonText = extractJsonObject(value);

  if (!jsonText) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  const record = parseStringRecord(parsed);

  if (!record || typeof record.type !== "string") {
    return null;
  }

  if (record.type === "final" && typeof record.message === "string") {
    return {
      type: "final",
      message: record.message,
    };
  }

  const tool = parseStringRecord(record.tool);

  if (record.type !== "tool_call" || !tool || !isToolName(tool.name)) {
    return null;
  }

  return {
    type: "tool_call",
    thinking: typeof record.thinking === "string" ? record.thinking : undefined,
    tool: {
      name: tool.name,
      input: parseStringRecord(tool.input) ?? {},
    },
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

function parseRequestedImageCount(message: string): number {
  const normalized = message
    .replace(/[一]/g, "1")
    .replace(/[二两]/g, "2")
    .replace(/[三]/g, "3")
    .replace(/[四]/g, "4")
    .replace(/[五]/g, "5")
    .replace(/[六]/g, "6")
    .replace(/[七]/g, "7")
    .replace(/[八]/g, "8")
    .replace(/[九]/g, "9")
    .replace(/[十]/g, "10");
  const match = normalized.match(/(\d+)\s*(张|个|组|款|幅)/);
  const count = match ? Number(match[1]) : 1;

  if (!Number.isFinite(count) || count < 2) {
    return 1;
  }

  return Math.min(8, Math.floor(count));
}

function createBatchPromptVariants(message: string, count: number): string[] {
  const clean = getCleanUserPrompt(message, []);
  const dogBreeds = ["金毛幼犬", "柯基幼犬", "萨摩耶幼犬", "法国斗牛犬幼犬", "边境牧羊犬幼犬", "柴犬幼犬", "比熊幼犬", "拉布拉多幼犬"];
  const scenes = ["阳光草地", "温馨客厅", "雪地公园", "城市咖啡店门口", "花园小径", "海边木栈道", "儿童房地毯", "秋日森林"];

  return Array.from({ length: count }, (_, index) => [
    clean || "可爱小狗图像",
    `画面主体：${dogBreeds[index % dogBreeds.length]}。`,
    `场景：${scenes[index % scenes.length]}，与其他图片明显不同。`,
    "风格：可爱、干净、高质量商业摄影，主体清晰，构图完整，自然光影，细节丰富。",
    "避免文字、水印、畸变、低清晰度和重复构图。",
  ].join(" "));
}

function getToolRisk(name: CanvasAgentToolName): CanvasAgentToolCall["risk"] {
  return name === "read_canvas_summary" ? "read" : name === "run_image_generation" ? "generate" : "write";
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

function getStringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasVirtualNode(state: AgentRuntimeState, id: string): boolean {
  return state.virtualNodes.has(id) ||
    state.context.input.attachments.some((attachment) => attachment.sourceNodeId === id);
}

function executeVirtualTool(
  call: CanvasAgentToolCall,
  state: AgentRuntimeState,
): CanvasAgentToolResult {
  if (call.name === "read_canvas_summary") {
    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "已读取画布摘要。",
      data: state.context.canvasSummary ?? {
        nodeCount: 0,
        edgeCount: 0,
        groupCount: 0,
      },
    };
  }

  if (call.name === "create_uploaded_image_node") {
    const attachmentId = getStringInput(call.input, "attachmentId");
    const attachment = attachmentId ? state.attachmentsById.get(attachmentId) : undefined;

    if (!attachment) {
      return {
        id: createRuntimeId("tool-result"),
        toolCallId: call.id,
        toolName: call.name,
        ok: false,
        message: "没有找到可用的上传图片。",
        error: "attachment_not_found",
      };
    }

    const nodeId = attachment.sourceNodeId ?? `virtual-uploaded-${attachment.id}`;
    state.virtualNodes.set(nodeId, {
      id: nodeId,
      type: "uploaded_image",
      title: attachment.name,
    });

    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "已把上传素材放入画布，作为后续图像生成的输入。",
      createdNodeIds: [nodeId],
      data: {
        nodeId,
        attachmentId: attachment.id,
      },
    };
  }

  if (call.name === "create_text_node") {
    const text = getStringInput(call.input, "text") ?? state.promptPreview;
    const clientActionId = getStringInput(call.input, "clientActionId") ?? "text-prompt-1";
    const title = getStringInput(call.input, "title") ?? "Agent Prompt";
    const nodeId = `created:${clientActionId}`;

    state.promptPreview = text;
    state.virtualNodes.set(nodeId, {
      id: nodeId,
      type: "text",
      title,
    });
    state.actions.push({
      type: "create_text_node",
      clientActionId,
      title,
      text,
    });

    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "已准备创建提示词文本节点。",
      createdNodeIds: [nodeId],
      data: {
        nodeId,
        clientActionId,
        text,
      },
    };
  }

  if (call.name === "create_image_generation_node") {
    const prompt = getStringInput(call.input, "prompt") ?? state.promptPreview;
    const clientActionId = getStringInput(call.input, "clientActionId") ?? "image-generation-1";
    const nodeId = `created:${clientActionId}`;

    state.promptPreview = prompt;
    state.virtualNodes.set(nodeId, {
      id: nodeId,
      type: "image_generation",
      title: getStringInput(call.input, "title") ?? "Agent Image",
    });
    state.actions.push({
      type: "create_image_generation_node",
      clientActionId,
      prompt,
      options: {
        provider: isAgentProvider(call.input.provider) ? call.input.provider : state.provider,
        model: getStringInput(call.input, "model") ?? (state.model === "auto" ? undefined : state.model),
        runningHubChannel: call.input.runningHubChannel === "low-cost" ? "low-cost" : undefined,
        aspectRatio: getStringInput(call.input, "aspectRatio"),
        quality: getStringInput(call.input, "quality"),
      },
    });

    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "已准备创建图像生成节点，并写入润色后的 prompt。",
      createdNodeIds: [nodeId],
      data: {
        nodeId,
        clientActionId,
        prompt,
      },
    };
  }

  if (call.name === "connect_nodes") {
    const sourceNodeId = getStringInput(call.input, "sourceNodeId");
    const targetNodeId = getStringInput(call.input, "targetNodeId");
    const sourceClientActionId = getStringInput(call.input, "sourceClientActionId");
    const targetClientActionId = getStringInput(call.input, "targetClientActionId");
    const sourceExists = sourceNodeId ? hasVirtualNode(state, sourceNodeId) : Boolean(sourceClientActionId);
    const targetExists = targetNodeId ? hasVirtualNode(state, targetNodeId) : Boolean(targetClientActionId);

    if (!sourceExists || !targetExists) {
      return {
        id: createRuntimeId("tool-result"),
        toolCallId: call.id,
        toolName: call.name,
        ok: false,
        message: "连线失败：源节点或目标节点不存在。",
        error: "node_not_found",
      };
    }

    state.actions.push({
      type: "connect_nodes",
      sourceRef: sourceClientActionId
        ? { kind: "created", clientActionId: sourceClientActionId }
        : { kind: "existing", nodeId: sourceNodeId as string },
      targetRef: targetClientActionId
        ? { kind: "created", clientActionId: targetClientActionId }
        : { kind: "existing", nodeId: targetNodeId as string },
      sourceHandle: getStringInput(call.input, "sourceHandle"),
      targetHandle: getStringInput(call.input, "targetHandle"),
    });

    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "已准备连接上游节点和图像生成节点。",
      createdEdgeIds: [createRuntimeId("virtual-edge")],
    };
  }

  if (call.name === "set_image_generation_options") {
    return {
      id: createRuntimeId("tool-result"),
      toolCallId: call.id,
      toolName: call.name,
      ok: true,
      message: "图像生成参数会在用户确认创建节点时按面板偏好写入。",
      updatedNodeIds: getStringInput(call.input, "nodeId") ? [getStringInput(call.input, "nodeId") as string] : undefined,
      data: call.input,
    };
  }

  return {
    id: createRuntimeId("tool-result"),
    toolCallId: call.id,
    toolName: call.name,
    ok: false,
    message: "触发生成需要用户显式确认，Agent 不会自动执行。",
    error: "generation_requires_confirmation",
  };
}

function executeAndTrace(state: AgentRuntimeState, call: CanvasAgentToolCall): CanvasAgentToolResult {
  const result = executeVirtualTool(call, state);

  state.trace.push({
    id: createRuntimeId("trace"),
    type: "tool_call",
    call,
  });
  state.trace.push({
    id: createRuntimeId("trace"),
    type: "tool_result",
    result,
  });

  return result;
}

function createFallbackState(params: {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
  fallbackReason: string;
  usedModel?: boolean;
  modelRawOutput?: string;
}): AgentRunResult {
  const selectedAttachments = getSelectedAttachments(params.context);
  const state = createRuntimeState(params);
  const enhancedPrompt = enhancePromptLocally(params.message, selectedAttachments);
  const batchCount = selectedAttachments.length === 0 ? parseRequestedImageCount(params.message) : 1;

  state.trace.push({
    id: createRuntimeId("trace"),
    type: "thinking",
    content: selectedAttachments.length
      ? "我会把这次任务作为图生图/图片编辑处理，先使用上传素材作为上游输入。"
      : batchCount > 1
        ? `我会把这次任务拆成 ${batchCount} 个不同画面，并创建批量文生图链路。`
        : "我会把这次任务作为文生图处理，先创建提示词节点再连接图像生成节点。",
  });

  executeAndTrace(state, createToolCall("read_canvas_summary", {}));

  if (selectedAttachments.length > 0) {
    for (const attachment of selectedAttachments) {
      executeAndTrace(state, createToolCall("create_uploaded_image_node", {
        attachmentId: attachment.id,
        title: attachment.name,
      }));
    }

    executeAndTrace(state, createToolCall("create_image_generation_node", {
      clientActionId: "image-generation-1",
      prompt: enhancedPrompt,
      provider: params.provider,
      model: params.model === "auto" ? undefined : params.model,
    }));

    for (const attachment of selectedAttachments) {
      if (!attachment.sourceNodeId) {
        continue;
      }

      executeAndTrace(state, createToolCall("connect_nodes", {
        sourceNodeId: attachment.sourceNodeId,
        targetClientActionId: "image-generation-1",
      }));
    }
  } else if (batchCount > 1) {
    const prompts = createBatchPromptVariants(params.message, batchCount);

    prompts.forEach((prompt, index) => {
      const number = index + 1;
      const textActionId = `text-prompt-${number}`;
      const generationActionId = `image-generation-${number}`;

      executeAndTrace(state, createToolCall("create_text_node", {
        clientActionId: textActionId,
        title: `Prompt ${number}`,
        text: prompt,
      }));
      executeAndTrace(state, createToolCall("create_image_generation_node", {
        clientActionId: generationActionId,
        prompt,
        provider: params.provider,
        model: params.model === "auto" ? undefined : params.model,
      }));
      executeAndTrace(state, createToolCall("connect_nodes", {
        sourceClientActionId: textActionId,
        targetClientActionId: generationActionId,
      }));
    });
  } else {
    executeAndTrace(state, createToolCall("create_text_node", {
      clientActionId: "text-prompt-1",
      title: "Agent Prompt",
      text: enhancedPrompt,
    }));
    executeAndTrace(state, createToolCall("create_image_generation_node", {
      clientActionId: "image-generation-1",
      prompt: enhancedPrompt,
      provider: params.provider,
      model: params.model === "auto" ? undefined : params.model,
    }));
    executeAndTrace(state, createToolCall("connect_nodes", {
      sourceClientActionId: "text-prompt-1",
      targetClientActionId: "image-generation-1",
    }));
  }

  const final = "我已经把节点链路准备好，确认后会把它放到画布上；生成图片仍需要你再点一次确认。";

  state.trace.push({
    id: createRuntimeId("trace"),
    type: "final",
    content: final,
  });

  return createAgentResultFromState(state, {
    usedModel: params.usedModel === true,
    usedFallback: true,
    fallbackReason: params.fallbackReason,
    model: params.model,
    modelRawOutput: params.modelRawOutput,
  });
}

function createRuntimeState(params: {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
}): AgentRuntimeState {
  const selectedAttachments = getSelectedAttachments(params.context);
  const attachmentsById = new Map(selectedAttachments.map((attachment) => [attachment.id, attachment]));
  const virtualNodes = new Map<string, { id: string; type: "text" | "uploaded_image" | "image_generation"; title?: string }>();

  for (const attachment of selectedAttachments) {
    if (attachment.sourceNodeId) {
      virtualNodes.set(attachment.sourceNodeId, {
        id: attachment.sourceNodeId,
        type: "uploaded_image",
        title: attachment.name,
      });
    }
  }

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
    virtualNodes,
    attachmentsById,
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
  const toolLabels = state.trace.flatMap((item) => (
    item.type === "tool_call" ? [getToolDisplayName(item.call.name)] : []
  ));

  return {
    summary: state.finalResponse ??
      (isBatchGeneration
        ? `我会创建 ${imageGenerationCount} 组文生图链路，并放入同一个批量生成分组。`
        : hasSourceImages
        ? "我会使用上传图片作为上游素材，创建图像生成节点并写入编辑 prompt。"
        : "我会创建提示词节点和图像生成节点，并把它们连接成文生图链路。"),
    plan: {
      stageLabel: "阶段 1/2",
      title: isBatchGeneration ? "批量图像生成组" : hasSourceImages ? "图片编辑链路" : "文生图链路",
      brief: [
        {
          label: "任务类型",
          value: isBatchGeneration ? "批量文生图" : hasSourceImages ? "图生图 / 图片编辑" : "文生图",
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
          value: meta.usedModel ? `${state.provider ?? "auto"} / ${meta.model ?? "auto"}` : "本地兜底规划",
        },
      ],
      steps: toolLabels.length > 0
        ? toolLabels
        : isBatchGeneration
          ? ["读取画布摘要", `创建 ${imageGenerationCount} 个提示词节点`, `创建 ${imageGenerationCount} 个图像生成节点`, "连接每组节点", "放入批量生成分组", "等待确认后并发生成"]
        : hasSourceImages
          ? ["读取画布摘要", "放置上传图片", "创建图像生成节点", "连接图片到生成节点", "等待确认生成"]
          : ["读取画布摘要", "创建提示词节点", "创建图像生成节点", "连接节点", "等待确认生成"],
      promptPreview: state.promptPreview,
      confirmationLabel: "确认创建到画布",
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
  }
}

function createAgentSystemPrompt(): string {
  return [
    "You are GenLink Canvas Agent, an intelligent operator that uses canvas tools.",
    "Return exactly one JSON object per response. Do not use markdown.",
    "You must choose one next tool call at a time, wait for tool results in the transcript, then continue.",
    "Do not return a batch of fixed actions. Think as a tool-using agent.",
    "Never call run_image_generation. Image generation costs credits and must wait for explicit user confirmation.",
    "If there are uploaded attachments, use create_uploaded_image_node for each selected attachment, then create_image_generation_node, then connect_nodes.",
    "If there are no uploaded attachments, this is usually text-to-image: create_text_node, create_image_generation_node, connect_nodes.",
    "If the user asks for multiple images, create one independent text_node + image_generation_node + connect_nodes chain per image. Vary scene, subject, composition, and details. Do not exceed 8 images.",
    "Always rewrite the user request into a high quality Chinese image prompt. Do not copy the user prompt verbatim.",
    "For image editing prompts, preserve subject identity, composition, lighting, pose, background unless the user asks to change them.",
    "Available tools:",
    JSON.stringify([
      { name: "read_canvas_summary", input: {} },
      { name: "create_uploaded_image_node", input: { attachmentId: "string", title: "string optional" } },
      { name: "create_text_node", input: { clientActionId: "text-prompt-1", title: "Agent Prompt", text: "rewritten prompt" } },
      { name: "create_image_generation_node", input: { clientActionId: "image-generation-1", prompt: "rewritten prompt" } },
      {
        name: "connect_nodes",
        input: {
          sourceNodeId: "existing source node id OR omitted",
          sourceClientActionId: "created source client action id OR omitted",
          targetClientActionId: "image-generation-1",
        },
      },
      { name: "set_image_generation_options", input: { nodeId: "optional", aspectRatio: "auto", quality: "1K" } },
    ]),
    "Response schema for tool call:",
    JSON.stringify({
      type: "tool_call",
      thinking: "short Chinese explanation of why this tool is next",
      tool: {
        name: "read_canvas_summary",
        input: {},
      },
    }),
    "Response schema for final:",
    JSON.stringify({
      type: "final",
      message: "short Chinese final message; tell the user generation still needs confirmation",
    }),
  ].join("\n");
}

function createAgentUserPrompt(state: AgentRuntimeState): string {
  return JSON.stringify({
    userMessage: state.message,
    cleanUserMessage: getCleanUserPrompt(state.message, state.context.input.attachments),
    canvasSummary: state.context.canvasSummary ?? {
      nodeCount: 0,
      edgeCount: 0,
      groupCount: 0,
    },
    generationPreference: {
      provider: state.provider,
      model: state.model,
    },
    attachments: state.context.input.attachments.map((attachment, index) => ({
      attachmentId: attachment.id,
      label: `图片${index + 1}`,
      fileName: attachment.name,
      width: attachment.width,
      height: attachment.height,
      sourceNodeId: attachment.sourceNodeId,
    })),
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

async function runAgentLoop(params: {
  message: string;
  context: AgentTaskContext;
  provider?: AgentProvider;
  model?: string;
  apiKey?: string;
}): Promise<AgentRunResult> {
  const state = createRuntimeState(params);
  let lastRawOutput = "";

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const response = await generateText({
      prompt: createAgentUserPrompt(state),
      systemPrompt: createAgentSystemPrompt(),
      provider: params.provider as ImageApiProvider | undefined,
      model: params.model === "auto" ? undefined : params.model,
      apiKey: params.apiKey,
      temperature: 0.2,
      maxTokens: 1200,
    });

    lastRawOutput = response.content;
    const modelStep = parseModelStep(response.content);

    if (!modelStep) {
      return createFallbackState({
        ...params,
        fallbackReason: "模型返回的工具调用 JSON 无法解析，已改用本地兜底规划。",
        usedModel: true,
        modelRawOutput: lastRawOutput,
      });
    }

    if (modelStep.type === "final") {
      state.finalResponse = modelStep.message;
      state.trace.push({
        id: createRuntimeId("trace"),
        type: "final",
        content: modelStep.message,
      });

      return createAgentResultFromState(state, {
        usedModel: true,
        usedFallback: false,
        model: response.model,
        modelRawOutput: lastRawOutput,
      });
    }

    if (modelStep.thinking?.trim()) {
      state.trace.push({
        id: createRuntimeId("trace"),
        type: "thinking",
        content: modelStep.thinking.trim(),
      });
    }

    const call = createToolCall(modelStep.tool.name, modelStep.tool.input);
    const result = executeAndTrace(state, call);

    if (!result.ok) {
      return createFallbackState({
        ...params,
        fallbackReason: `工具 ${call.name} 执行失败：${result.message}`,
        usedModel: true,
        modelRawOutput: lastRawOutput,
      });
    }
  }

  return createFallbackState({
    ...params,
    fallbackReason: `模型工具调用超过 ${MAX_TOOL_STEPS} 步，已改用本地兜底规划。`,
    usedModel: true,
    modelRawOutput: lastRawOutput,
  });
}

export async function POST(request: Request) {
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

    const provider = isAgentProvider(body.provider) ? body.provider : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;

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
      return NextResponse.json({
        ok: true,
        result: createFallbackState({
          message,
          context,
          provider,
          model,
          fallbackReason: error instanceof Error ? error.message : "模型调用失败，已改用本地兜底规划。",
          usedModel: false,
        }),
      });
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
