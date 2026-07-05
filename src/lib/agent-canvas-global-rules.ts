export const AGENT_CANVAS_GLOBAL_RULE_SOURCE_FILES = [
  "rules/planf-canvas/AGENTS.md",
  "rules/planf-canvas/BOOTSTRAP.md",
  "rules/planf-canvas/TOOLS.md",
  "rules/planf-canvas/canvas-capabilities.yaml",
  "rules/planf-canvas/skills/_shared/self-check.md",
  "rules/planf-canvas/skills/engineer/SKILL.md",
  "rules/planf-canvas/skills/engineer/validation.md",
] as const;

const IMAGE_AGENT_NODE_TYPES = new Set([
  "character",
  "non_human_character",
  "prop",
  "shot",
  "first_frame",
  "logo",
  "cover",
  "illustration",
  "background",
  "reference",
  "style_ref",
  "storyboard",
  "campaign_shot",
  "interior_render",
  "floor_plan",
  "material_board",
  "detail_shot",
  "body_part",
  "transform_state",
]);
const VIDEO_AGENT_NODE_TYPES = new Set(["video_clip", "enhancer"]);
const TEXT_AGENT_NODE_TYPES = new Set(["copywriting", "prompt_bridge"]);
const GENERATION_CLAIM_PATTERNS = [
  /已\s*(?:经)?\s*生成(?:完成|好了|完毕)?/,
  /生成\s*(?:完成|好了|完毕)/,
  /已\s*(?:经)?\s*画好/,
  /已\s*(?:经)?\s*渲染(?:完成|好了|完毕)?/,
  /渲染\s*(?:完成|好了|完毕)/,
];

export type AgentCanvasNodeKind = "image" | "video" | "text";

export type AgentCanvasRuleValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function getAgentCanvasGlobalRulePromptLines(): string[] {
  return [
    `Global rule sources: ${AGENT_CANVAS_GLOBAL_RULE_SOURCE_FILES.join(", ")}.`,
    "Follow the global GenLink Canvas rules from BOOTSTRAP, TOOLS, canvas-capabilities, self-check, engineer, and engineer validation.",
    "Output only canonical create_workflow/workflow-json data: root {name,nodes,edges,autoRun}; every node includes id,type,subType,from:\"agent\",agentNodeType,title,content.",
    "Use only subType values from canvas-capabilities; never invent subType or editAction.",
    "Never write forbidden Agent node fields: toolsType, modelCode, resolution, videoWithAudio, negativePrompt, seed, cameraMovement, motionScore, qualitySuffix, upscale, position, status.",
    "Image edits based on uploaded or existing canvas images must use subType image-image, editAction redraw by default, an incoming edge from the real source node, and sourceNodeId equal to that source.",
    "Agent only creates/prepares canvas workflows. Never claim the image/video has already been generated, rendered, drawn, or completed.",
    "Do not call or imply external image/video generation APIs; generation is owned by the canvas after user confirmation.",
    "Do not use semantic aliases such as ref_xxx_real or node_character_final as cross-round node ids; use only real canvas node ids from snapshot/attachments.",
    "agentNodeType must match node type: visual assets use rh-image, video_clip/enhancer use rh-video, copywriting/prompt_bridge use rh-text.",
    "Do not create character anchor nodes and video_clip nodes in the same workflow; character anchors must finish before downstream video nodes reference them.",
    "For character anchor nodes, content must describe a canonical board with white background, full body, and three-view/front-side-back structure.",
  ];
}

export function getExpectedCanvasNodeKindForAgentType(
  agentNodeType: string,
): AgentCanvasNodeKind | undefined {
  if (IMAGE_AGENT_NODE_TYPES.has(agentNodeType)) {
    return "image";
  }

  if (VIDEO_AGENT_NODE_TYPES.has(agentNodeType)) {
    return "video";
  }

  if (TEXT_AGENT_NODE_TYPES.has(agentNodeType)) {
    return "text";
  }

  return undefined;
}

export function normalizeCanvasNodeKind(type: string): AgentCanvasNodeKind | undefined {
  if (type === "rh-image" || type === "image_generation" || type === "image" || type === "uploaded_image") {
    return "image";
  }

  if (type === "rh-video" || type === "video_generation" || type === "video_upscale" || type === "video") {
    return "video";
  }

  if (type === "rh-text" || type === "text" || type === "ai_text_result") {
    return "text";
  }

  return undefined;
}

export function validateAgentNodeTypeMatchesCanvasKind(params: {
  nodeId: string;
  type: string;
  agentNodeType: string;
}): AgentCanvasRuleValidationResult {
  const expected = getExpectedCanvasNodeKindForAgentType(params.agentNodeType);
  const actual = normalizeCanvasNodeKind(params.type);

  if (expected && actual !== expected) {
    return {
      ok: false,
      error: `workflow node ${params.nodeId} agentNodeType ${params.agentNodeType} requires ${expected} node type`,
    };
  }

  return { ok: true };
}

export function validateNoGenerationCompletionClaim(text: string): AgentCanvasRuleValidationResult {
  if (GENERATION_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: false,
      error: "Agent summary must not claim generation/rendering/drawing has already completed",
    };
  }

  return { ok: true };
}

export function validateCharacterAnchorContent(params: {
  nodeId: string;
  agentNodeType: string;
  content: string;
}): AgentCanvasRuleValidationResult {
  if (params.agentNodeType !== "character") {
    return { ok: true };
  }

  const hasWhiteBackground = /纯白色背景|白底|无背景/.test(params.content);
  const hasThreeView = /三视图|正面[、/／]侧面[、/／]背面|正视图[、/／]侧视图[、/／]后视图/.test(params.content);
  const hasFullBody = /完整全身|全身像|从头到脚/.test(params.content);

  if (!hasWhiteBackground || !hasThreeView || !hasFullBody) {
    return {
      ok: false,
      error: `workflow node ${params.nodeId} character anchor must include white background, three-view, and full-body signals`,
    };
  }

  return { ok: true };
}
