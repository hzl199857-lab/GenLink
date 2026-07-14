export type MidjourneyQuadrant = 1 | 2 | 3 | 4;

export type MidjourneyUpscaleActions = Record<MidjourneyQuadrant, string>;

type MidjourneySubmissionResponse = {
  code?: number;
  description?: string;
  result?: string | number;
};

type MidjourneyButton = {
  customId?: unknown;
  label?: unknown;
};

export function buildMidjourneyPrompt(
  prompt: string,
  aspectRatio?: string,
): string {
  const normalizedPrompt = prompt.trim();

  if (
    !aspectRatio ||
    aspectRatio === "auto" ||
    /(?:^|\s)--(?:ar|aspect)(?:\s|=)/i.test(normalizedPrompt)
  ) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt} --ar ${aspectRatio}`;
}

export function parseMidjourneySubmission(
  value: unknown,
): { taskId: string } {
  const response = (value ?? {}) as MidjourneySubmissionResponse;

  if (response.code === 23) {
    throw new Error("Midjourney 队列已满，请稍后重试");
  }

  if (response.code === 24) {
    throw new Error("提示词包含 Midjourney 不支持的敏感内容");
  }

  if (response.code !== 1 && response.code !== 22) {
    throw new Error(response.description?.trim() || "Midjourney 任务提交失败");
  }

  const taskId = String(response.result ?? "").trim();

  if (!taskId) {
    throw new Error("Midjourney 未返回任务 ID");
  }

  return { taskId };
}

export function extractMidjourneyUpscaleActions(
  value: unknown,
): MidjourneyUpscaleActions | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = new Map<MidjourneyQuadrant, string>();

  for (const item of value) {
    const button = (item ?? {}) as MidjourneyButton;
    const customId = typeof button.customId === "string" ? button.customId.trim() : "";
    const label = typeof button.label === "string" ? button.label.trim().toUpperCase() : "";
    const labelMatch = label.match(/^U([1-4])$/);
    const customIdMatch = customId.match(/::upsample::([1-4])::/i);
    const quadrantValue = labelMatch?.[1] ?? customIdMatch?.[1];

    if (!customId || !quadrantValue) {
      continue;
    }

    actions.set(Number(quadrantValue) as MidjourneyQuadrant, customId);
  }

  if (actions.size !== 4) {
    return undefined;
  }

  return {
    1: actions.get(1)!,
    2: actions.get(2)!,
    3: actions.get(3)!,
    4: actions.get(4)!,
  };
}
