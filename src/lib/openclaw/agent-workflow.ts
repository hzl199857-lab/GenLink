import type {
  AgentExecutionPlan,
  AgentRunMeta,
  AgentTaskContext,
  CanvasAgentAction,
  CanvasAgentTraceItem,
} from "@/types/agent";
import type { AgentPhaseDecision } from "./agent-phase-policy";

type GenericWorkflowNode = {
  id: string;
  type: string;
  role?: string;
  title?: string;
  data?: Record<string, unknown>;
};

type GenericWorkflowEdge = {
  id?: string;
  source: string;
  target: string;
  role?: string;
};

type GenericWorkflow = {
  nodes: GenericWorkflowNode[];
  edges?: GenericWorkflowEdge[];
};

const DEFAULT_IMAGE_ASPECT_RATIO = "1:1";

export type OpenClawAgentRunResult = {
  summary: string;
  plan: AgentExecutionPlan;
  actions: CanvasAgentAction[];
  trace: CanvasAgentTraceItem[];
  meta: AgentRunMeta;
};

type BuildOpenClawAgentMessageInput = {
  request: string;
  referenceImageCount: number;
  canvasSummary?: AgentTaskContext["canvasSummary"];
  phaseDecision?: AgentPhaseDecision;
  attachments?: Array<{
    id: string;
    name: string;
    sourceNodeId?: string;
    imageUrl?: string;
    semanticImageUrl?: string;
  }>;
};

type CreateResultInput = {
  request: string;
  text: string;
  model?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJsonObject(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function extractFence(text: string, fence: string): string | undefined {
  const pattern = new RegExp(`\`\`\`${fence}\\s*([\\s\\S]*?)\\s*\`\`\``, "i");
  const match = text.match(pattern);

  return match?.[1]?.trim();
}

function extractToolCallWorkflow(text: string): unknown {
  const toolCall = text.match(/<tool_call\b[^>]*>\s*([\s\S]*?)\s*<\/tool_call>/i);

  if (!toolCall?.[1]) {
    return undefined;
  }

  const parsed = parseJsonObject(toolCall[1]);

  if (!isRecord(parsed)) {
    return undefined;
  }

  const args = isRecord(parsed.arguments) ? parsed.arguments : undefined;
  const workflow = args?.workflow ?? args;

  return workflow;
}

function normalizeWorkflowNode(node: Record<string, unknown>): GenericWorkflowNode | undefined {
  if (typeof node.id !== "string" || typeof node.type !== "string") {
    return undefined;
  }

  if (node.type === "rh-image") {
    return {
      id: node.id,
      type: "image_generation",
      role: stringValue(node.agentNodeType) ?? stringValue(node.subType),
      title: stringValue(node.title),
      data: {
        prompt: stringValue(node.content) ?? "",
        content: stringValue(node.content) ?? "",
        subType: stringValue(node.subType),
        editAction: stringValue(node.editAction),
        aspectRatio: stringValue(node.aspectRatio),
        sourceNodeId: stringValue(node.sourceNodeId),
        from: stringValue(node.from),
        agentNodeType: stringValue(node.agentNodeType),
      },
    };
  }

  if (node.type === "rh-text") {
    return {
      id: node.id,
      type: "text",
      role: stringValue(node.agentNodeType) ?? stringValue(node.subType),
      title: stringValue(node.title),
      data: {
        text: stringValue(node.content) ?? "",
        content: stringValue(node.content) ?? "",
        from: stringValue(node.from),
        agentNodeType: stringValue(node.agentNodeType),
      },
    };
  }

  return {
    id: node.id,
    type: node.type,
    role: stringValue(node.role),
    title: stringValue(node.title),
    data: isRecord(node.data) ? node.data : {},
  };
}

function extractWorkflow(text: string): GenericWorkflow {
  const rawWorkflow =
    extractToolCallWorkflow(text) ??
    (extractFence(text, "workflow-json")
      ? parseJsonObject(extractFence(text, "workflow-json") as string)
      : undefined);

  if (!isRecord(rawWorkflow) || !Array.isArray(rawWorkflow.nodes)) {
    throw new Error("OpenClaw did not return a create_workflow or workflow-json payload");
  }

  return {
    nodes: rawWorkflow.nodes.flatMap((node): GenericWorkflowNode[] => {
      if (!isRecord(node)) {
        return [];
      }

      const normalized = normalizeWorkflowNode(node);

      return normalized ? [normalized] : [];
    }),
    edges: Array.isArray(rawWorkflow.edges)
      ? rawWorkflow.edges.flatMap((edge): GenericWorkflowEdge[] => (
          isRecord(edge) &&
          typeof edge.source === "string" &&
          typeof edge.target === "string"
            ? [{
                id: stringValue(edge.id),
                source: edge.source,
                target: edge.target,
                role: stringValue(edge.role),
              }]
            : []
        ))
      : [],
  };
}

function tryExtractWorkflow(text: string): GenericWorkflow | undefined {
  try {
    return extractWorkflow(text);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "OpenClaw did not return a create_workflow or workflow-json payload"
    ) {
      return undefined;
    }

    throw error;
  }
}

function getNodePrompt(node: GenericWorkflowNode): string {
  return stringValue(node.data?.prompt) ??
    stringValue(node.data?.content) ??
    stringValue(node.data?.text) ??
    "";
}

function toAction(node: GenericWorkflowNode): CanvasAgentAction | undefined {
  if (node.type === "text") {
    const text = getNodePrompt(node);

    if (!text) {
      return undefined;
    }

    return {
      type: "create_text_node",
      clientActionId: node.id,
      title: node.title,
      text,
    };
  }

  if (node.type === "image_generation") {
    const prompt = getNodePrompt(node);
    const options = {
      aspectRatio: stringValue(node.data?.aspectRatio) ?? DEFAULT_IMAGE_ASPECT_RATIO,
      quality: stringValue(node.data?.quality),
      model: stringValue(node.data?.model),
      provider: stringValue(node.data?.provider),
    };

    if (!prompt) {
      return undefined;
    }

    return {
      type: "create_image_generation_node",
      clientActionId: node.id,
      prompt,
      options: Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      ),
    };
  }

  return undefined;
}

function toConnection(edge: GenericWorkflowEdge, createdNodeIds: Set<string>): CanvasAgentAction {
  return {
    type: "connect_nodes",
    sourceRef: createdNodeIds.has(edge.source)
      ? { kind: "created", clientActionId: edge.source }
      : { kind: "existing", nodeId: edge.source },
    targetRef: createdNodeIds.has(edge.target)
      ? { kind: "created", clientActionId: edge.target }
      : { kind: "existing", nodeId: edge.target },
  };
}

function workflowToActions(workflow: GenericWorkflow): CanvasAgentAction[] {
  const workflowNodeIds = new Set(workflow.nodes.map((node) => node.id));
  const imageGenerationIds = new Set(
    workflow.nodes.flatMap((node) => node.type === "image_generation" ? [node.id] : []),
  );
  const hasExternalImageReference = (workflow.edges ?? []).some((edge) => (
    !workflowNodeIds.has(edge.source) && imageGenerationIds.has(edge.target)
  ));
  const promptNodeIds = new Set(
    hasExternalImageReference
      ? workflow.nodes.flatMap((node) => node.type === "text" ? [node.id] : [])
      : [],
  );
  const nodeActions = workflow.nodes.flatMap((node) => {
    if (promptNodeIds.has(node.id)) {
      return [];
    }

    const action = toAction(node);

    return action ? [action] : [];
  });
  const createdNodeIds = new Set(nodeActions.flatMap((action) => (
    action.type === "create_text_node" || action.type === "create_image_generation_node"
      ? [action.clientActionId]
      : []
  )));
  const connections = (workflow.edges ?? [])
    .filter((edge) => !promptNodeIds.has(edge.source))
    .filter((edge) => createdNodeIds.has(edge.source) || createdNodeIds.has(edge.target))
    .map((edge) => toConnection(edge, createdNodeIds));

  return [...nodeActions, ...connections];
}

function summarizeAttachments(input: BuildOpenClawAgentMessageInput["attachments"]) {
  return (input ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    sourceNodeId: attachment.sourceNodeId,
    hasImage: Boolean(attachment.imageUrl),
    semanticImageUrl: /^https?:\/\//i.test(attachment.semanticImageUrl?.trim() ?? "")
      ? attachment.semanticImageUrl?.trim()
      : undefined,
  }));
}

function buildReferenceNodeMap(input: BuildOpenClawAgentMessageInput["attachments"]) {
  return (input ?? []).flatMap((attachment) => (
    attachment.sourceNodeId
      ? [{
          attachmentId: attachment.id,
          name: attachment.name,
          sourceNodeId: attachment.sourceNodeId,
        }]
      : []
  ));
}

function makeTrace(text: string): CanvasAgentTraceItem[] {
  return [{
    id: `openclaw-trace-${crypto.randomUUID()}`,
    type: "thinking",
    content: text,
  }];
}

function makeSummary(actions: CanvasAgentAction[]): string {
  const imageCount = actions.filter((action) => action.type === "create_image_generation_node").length;
  const textCount = actions.filter((action) => action.type === "create_text_node").length;

  if (imageCount > 0) {
    return `GenLink 已按规则库创建 ${imageCount} 个图片生成节点，已准备放到画布。`;
  }

  if (textCount > 0) {
    return "GenLink 已按规则库创建提示词节点，已准备放到画布。";
  }

  return "GenLink 已按规则库返回画布工作流，已准备放到画布。";
}

function makePlan(request: string, actions: CanvasAgentAction[]): AgentExecutionPlan {
  const imageCount = actions.filter((action) => action.type === "create_image_generation_node").length;
  const textCount = actions.filter((action) => action.type === "create_text_node").length;
  const connectionCount = actions.filter((action) => action.type === "connect_nodes").length;
  const promptPreview = [...actions]
    .reverse()
    .find((action): action is Extract<CanvasAgentAction, { type: "create_image_generation_node" }> => (
      action.type === "create_image_generation_node"
    ))?.prompt ?? request;

  return {
    stageLabel: "OpenClaw",
    title: "OpenClaw 规则库工作流",
    brief: [
      { label: "任务", value: "通用 Agent" },
      { label: "规则", value: "GenLink Canvas" },
      { label: "画布", value: "自动创建节点" },
    ],
    steps: [
      "读取 AGENTS.md / BOOTSTRAP.md 完成任务分流。",
      `创建 ${textCount} 个提示词节点。`,
      `创建 ${imageCount} 个图片生成节点。`,
      `创建 ${connectionCount} 条节点连线。`,
      "画布节点创建后，等待用户确认生成。",
    ],
    promptPreview,
    confirmationLabel: "确认生成",
  };
}

function makeTextReplyResult(input: CreateResultInput): OpenClawAgentRunResult {
  const reply = input.text.trim();

  return {
    summary: reply,
    plan: {
      stageLabel: "GenLink",
      title: "GenLink 助手",
      brief: [
        { label: "类型", value: "文字回复" },
      ],
      steps: [],
      promptPreview: reply,
    },
    actions: [],
    trace: makeTrace(input.text),
    meta: {
      usedModel: true,
      usedFallback: false,
      model: "openclaw",
      modelRawOutput: input.text,
    },
  };
}

export function buildOpenClawAgentMessage(input: BuildOpenClawAgentMessageInput): string {
  return [
    "你是 GenLink 内置规则执行主体，用户可见品牌必须始终是 GenLink。",
    "请从当前 OpenClaw workspace 的 ./AGENTS.md 开始，遵守 ./BOOTSTRAP.md，并读取 ./IDENTITY.md；需要阶段判断时参考 ./phase-policy.md。",
    "输出主协议前必须读取并执行 ./skills/_shared/self-check.md；engineer 装配 workflow-json 前必须读取并执行 ./skills/engineer/SKILL.md 与 ./skills/engineer/validation.md。",
    "内部可使用 RH / PlanF Canvas canonical schema，但不要对用户自称 RH、RunningHub 或 PlanF。",
    "这是通用 Canvas Agent 路由，不是前端电商 preset 专线。",
    "如果用户没有明确电商主图/商品主图/详情页/UGC/造型师图集意图，不要进入 ecom-image。",
    "普通图片编辑走快速道：analyst(内联) -> prompter(内联) -> engineer(内联)。",
    "用户基于上传图或画布已有图做加帽子/去帽子/换装/改发型/局部修改/换风格时，必须 workflow-json 新建 image-image + editAction:redraw。",
    "如 attachments 中存在 sourceNodeId，workflow edges 必须使用该真实 sourceNodeId 连接到 image_generation 节点。",
    "没有参考图的普通生图走 text-image。",
    "输出格式硬要求：当前 OpenClaw CLI runtime 没有 client tool bridge，所以按 rules/planf-canvas/TOOLS.md 的 fallback 路径输出。只输出一个 ```workflow-json fence；本运行时不要输出 <tool_call>。不要同时输出两种主协议；不要调用 image_generate/video_generate。",
    "workflow-json 使用 RH canonical schema：{name,nodes,edges,autoRun}。",
    "workflow 节点必须带 from=\"agent\" 和 agentNodeType。",
    "Every rh-image node must include aspectRatio. 普通无参考图生图默认 1:1；图片编辑如需继承参考图比例可写 auto；用户明确指定比例时优先用户比例。不要写 resolution。",
    "按 skills/_shared/self-check.md 先做 Self-Check；按 skills/engineer/validation.md 做 Delivery Validation。若任一事实层规则失败，先自修复；仍失败则输出 Engineering Blocker，不得输出 workflow-json。",
    "referenceNodeMap is authoritative: use sourceNodeId from referenceNodeMap for existing image references, and never invent node ids such as node-upload-1 unless they are present in referenceNodeMap.",
    "",
    `referenceImageCount=${input.referenceImageCount}`,
    `phasePolicyDecision=${JSON.stringify(input.phaseDecision ?? null)}`,
    `canvasSummary=${JSON.stringify(input.canvasSummary ?? { nodeCount: 0, edgeCount: 0, groupCount: 0 })}`,
    `attachments=${JSON.stringify(summarizeAttachments(input.attachments))}`,
    `referenceNodeMap=${JSON.stringify(buildReferenceNodeMap(input.attachments))}`,
    `userRequest=${input.request}`,
  ].join("\n");
}

export function createAgentResultFromOpenClawText(input: CreateResultInput): OpenClawAgentRunResult {
  const workflow = tryExtractWorkflow(input.text);

  if (!workflow) {
    if (input.text.trim()) {
      return makeTextReplyResult(input);
    }

    throw new Error("OpenClaw returned no visible reply");
  }

  const actions = workflowToActions(workflow);

  if (actions.length === 0) {
    throw new Error("OpenClaw workflow did not contain supported GenLink canvas actions");
  }

  return {
    summary: makeSummary(actions),
    plan: makePlan(input.request, actions),
    actions,
    trace: makeTrace(input.text),
    meta: {
      usedModel: true,
      usedFallback: false,
      model: "openclaw",
      modelRawOutput: input.text,
    },
  };
}
