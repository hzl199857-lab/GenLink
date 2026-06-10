import type { ImageApiProvider } from "@/lib/vibe";

const GENLINK_OPENCLAW_TEXT_PROVIDER = "genlink_text";

function normalizeModelId(model?: string): string | undefined {
  const trimmed = model?.trim();

  if (!trimmed || trimmed === "auto") {
    return undefined;
  }

  return trimmed.toLowerCase();
}

export function mapAgentPanelModelToOpenClaw(params: {
  provider?: ImageApiProvider;
  model?: string;
}): string | undefined {
  const model = normalizeModelId(params.model);

  if (!model) {
    return undefined;
  }

  if (model.includes("/")) {
    return model;
  }

  return `${GENLINK_OPENCLAW_TEXT_PROVIDER}/${model}`;
}
