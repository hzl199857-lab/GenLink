const INTERNAL_AGENT_TEXT_PATTERNS = [
  /OpenClaw/i,
  /creative-doc/i,
  /workflow-json/i,
  /Prompt Pack/i,
  /form-fields/i,
  /FailoverError/i,
  /LLM request timed out/i,
  /tool policy/i,
  /\[agent\//i,
  /\[diagnostic\]/i,
  /\[model-fallback/i,
  /\bphase=/i,
  /\broute=/i,
  /\bnextAction=/i,
  /\bloadedFiles=/i,
  /\bdurationMs=/i,
  /\bsessionKey=/i,
  /\brawError=/i,
  /\bprofile=/i,
];

const INTERNAL_AGENT_TITLE_PATTERNS = [
  /OpenClaw/i,
  /规则库/,
  /工作流/,
  /workflow/i,
  /workflow-json/i,
  /Prompt Pack/i,
  /creative-doc/i,
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimTrailingSentencePunctuation(text: string): string {
  return text.replace(/[。！？!?，,；;：:\s]+$/g, "").trim();
}

function summarizeUserTask(text: string, maxLength = 18): string {
  const normalized = trimTrailingSentencePunctuation(
    normalizeWhitespace(stripReferenceLikeText(text))
      .replace(/^(请|帮我|帮忙|麻烦|可以|能不能|能否|我想要|我要|生成|创建|做一个|做一张|画一个|画一张)+/g, "")
      .trim(),
  );

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function stripReferenceLikeText(text: string): string {
  return text
    .replace(/\[\[ref:[^\]]+\]\]/g, "")
    .replace(/@\S+/g, "")
    .trim();
}

export function shouldShowAgentInternalText(text: string | undefined): boolean {
  const value = text?.trim();

  if (!value) {
    return false;
  }

  return !INTERNAL_AGENT_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeAgentChatText(text: string | undefined): string {
  const value = text?.trim();

  if (!value) {
    return "";
  }

  return value
    .replace(/已由\s*OpenClaw\s*生成/g, "已生成")
    .replace(/等待确认后再?进入\s*Prompt Pack\s*\/\s*workflow-json/g, "确认后将创建到画布")
    .replace(/确认下面信息后再生成\s*GL\s*workflow-json/g, "确认下面信息后，我会创建到画布")
    .replace(/\s*workflow-json/g, "")
    .replace(/\s*workflow\b/g, "节点")
    .replace(/\s*Prompt Pack\s*\/\s*/g, "")
    .replace(/\s*OpenClaw\s*/g, "GenLink")
    .replace(/。{2,}/g, "。");
}

export function formatAgentCanvasNodeChipTitle(input: {
  title?: string;
  userPrompt?: string;
  promptPreview?: string;
  fallback: string;
}): string {
  const title = sanitizeAgentChatText(input.title);
  const isInternalTitle = !title || INTERNAL_AGENT_TITLE_PATTERNS.some((pattern) => pattern.test(title));

  if (!isInternalTitle) {
    return title;
  }

  const userTask = summarizeUserTask(input.userPrompt ?? "");
  if (userTask) {
    return userTask;
  }

  const promptTask = summarizeUserTask(input.promptPreview ?? "");
  if (promptTask) {
    return promptTask;
  }

  return input.fallback;
}

export function formatAgentChatErrorText(text: string | undefined, fallback: string): string {
  const value = text?.trim();

  if (!value) {
    return fallback;
  }

  if (
    INTERNAL_AGENT_TEXT_PATTERNS.some((pattern) => pattern.test(value)) ||
    /\b(first|repair|previousOpenClawText|create_workflow|fence)=/i.test(value) ||
    /did not return|failed validation|JSON object|exited with code|terminated/i.test(value)
  ) {
    return fallback;
  }

  return sanitizeAgentChatText(value) || fallback;
}

export function formatEcomPlannerOptionErrorText(text: string | undefined, fallback: string): string {
  const value = text?.trim();

  if (!value) {
    return fallback;
  }

  if (
    INTERNAL_AGENT_TEXT_PATTERNS.some((pattern) => pattern.test(value)) ||
    /\b(first|repair|previousOpenClawText|create_workflow|fence)=/i.test(value) ||
    /failed validation|exited with code|terminated/i.test(value)
  ) {
    return fallback;
  }

  return sanitizeAgentChatText(value) || fallback;
}
