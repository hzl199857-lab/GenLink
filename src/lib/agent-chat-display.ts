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
