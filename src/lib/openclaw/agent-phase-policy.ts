export type AgentPhaseState =
  | "GREET"
  | "FAST"
  | "STANDARD"
  | "DOC_CHAIN"
  | "ECOM_IMAGE"
  | "VIDEO_SOP";

export type AgentRouteMode = "auto" | "default" | "detail-page" | "ugc" | "stylist";

export type AgentEcomPresetId =
  | "full-set-8"
  | "detail-page-pack"
  | "amazon-adapter"
  | "ugc-lifestyle"
  | "editorial-stylist";

export type AgentPhaseRoute =
  | "greet"
  | "generic-openclaw"
  | "ecom-start";

export type AgentPresetPrompt = {
  id: AgentEcomPresetId;
  prompt: string;
  routeMode: Exclude<AgentRouteMode, "auto">;
};

export type AgentPhaseDecision = {
  phase: AgentPhaseState;
  route: AgentPhaseRoute;
  nextAction: "reply" | "create-workflow" | "await-form-submit";
  preset?: AgentEcomPresetId;
  routeMode: AgentRouteMode;
  score: number;
  loadedFiles: string[];
  reason: string;
};

export type DecideAgentPhaseRouteInput = {
  message: string;
  attachmentCount?: number;
  routeMode?: AgentRouteMode;
  selectedPresetId?: AgentEcomPresetId | null;
  presetPrompts?: AgentPresetPrompt[];
};

const DEFAULT_PRESET_BY_ROUTE_MODE: Record<Exclude<AgentRouteMode, "auto">, AgentEcomPresetId> = {
  default: "full-set-8",
  "detail-page": "detail-page-pack",
  ugc: "ugc-lifestyle",
  stylist: "editorial-stylist",
};

const GREET_PATTERN = /^(hi|hello|hey|\u4f60\u597d|\u5728\u5417|\u6709\u4eba\u5417|test|\u6d4b\u8bd5)[\s!！。,.，?？]*$/i;
const DIRECT_PATTERN = /\u76f4\u63a5\u505a|\u4e0d\u7528\u95ee|\u5148\u51fa\u4e00\u7248|\u4e00\u952e\u62ff\u7ed3\u679c/i;
const DEEP_PATTERN = /\u8be6\u7ec6\u7b56\u5212|\u5b8c\u6574\u65b9\u6848|\u7cfb\u7edf\u89c4\u5212|\u6df1\u5ea6\u7b56\u5212|deep mode/i;
const VIDEO_PATTERN = /\u89c6\u9891|\u77ed\u7247|\u5fae\u7535\u5f71|\u5206\u955c|clip|seedance|tvc/i;
const ECOM_PATTERN = /\u7535\u5546|\u5546\u54c1|\u4ea7\u54c1\u4e3b\u56fe|\u4ea7\u54c1\u56fe|\u4e3b\u56fe|\u8be6\u60c5\u9875|\u5356\u70b9\u56fe|\u5957\u56fe|\u767d\u5e95\u56fe|\u6dd8\u5b9d|\u5929\u732b|\u4eac\u4e1c|\u4e9a\u9a6c\u900a|amazon|a\+|\u5c0f\u7ea2\u4e66|\u62fc\u591a\u591a/i;
const UGC_PATTERN = /ugc|\u4e0a\u8eab\u56fe|\u751f\u6d3b\u5316|\u7d20\u4eba|\u79cd\u8349|iphone|\u8857\u62cd/i;
const STYLIST_PATTERN = /\u9020\u578b\u5e08|stylist|editorial|lookbook|vogue|\u5927\u7247|\u65f6\u5c1a/i;
const DETAIL_PATTERN = /\u8be6\u60c5\u9875|\u5356\u70b9|\u7ec6\u8282|a\+/i;

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function selectedPresetStillActive(input: DecideAgentPhaseRouteInput): AgentEcomPresetId | undefined {
  if (!input.selectedPresetId || !input.presetPrompts?.length) {
    return undefined;
  }

  const selected = input.presetPrompts.find((preset) => preset.id === input.selectedPresetId);

  if (!selected) {
    return undefined;
  }

  return normalizeMessage(input.message).startsWith(normalizeMessage(selected.prompt))
    ? selected.id
    : undefined;
}

function inferEcomRouteMode(message: string, routeMode: AgentRouteMode): Exclude<AgentRouteMode, "auto"> {
  if (routeMode !== "auto") {
    return routeMode;
  }

  if (UGC_PATTERN.test(message)) {
    return "ugc";
  }

  if (STYLIST_PATTERN.test(message)) {
    return "stylist";
  }

  if (DETAIL_PATTERN.test(message)) {
    return "detail-page";
  }

  return "default";
}

function scoreGenericTask(message: string, attachmentCount: number): number {
  if (DIRECT_PATTERN.test(message)) {
    return 0;
  }

  let score = 1;

  if (attachmentCount > 1) {
    score += 2;
  }

  if (/\u591a\u5f20|\u4e00\u7ec4|\u51e0\u7248|\u591a\u65b9\u6848|\u7cfb\u5217/i.test(message)) {
    score += 2;
  }

  if (/\u98ce\u683c\u7edf\u4e00|\u4e00\u81f4|\u8fde\u8d2f|\u89d2\u8272|\u573a\u666f/i.test(message)) {
    score += 3;
  }

  if (DEEP_PATTERN.test(message)) {
    score += 10;
  }

  return score;
}

export function decideAgentPhaseRoute(input: DecideAgentPhaseRouteInput): AgentPhaseDecision {
  const message = normalizeMessage(input.message);
  const routeMode = input.routeMode ?? "auto";
  const attachmentCount = input.attachmentCount ?? 0;

  if (!message || GREET_PATTERN.test(message)) {
    return {
      phase: "GREET",
      route: "greet",
      nextAction: "reply",
      routeMode,
      score: 0,
      loadedFiles: ["AGENTS.md", "BOOTSTRAP.md", "phase-policy.md"],
      reason: "non-execution message",
    };
  }

  const selectedPresetId = selectedPresetStillActive(input);
  const forcedEcomRouteMode = routeMode !== "auto" ? routeMode : undefined;
  const hasEcomSignal = ECOM_PATTERN.test(message) || UGC_PATTERN.test(message) || STYLIST_PATTERN.test(message);

  if (selectedPresetId || forcedEcomRouteMode || hasEcomSignal) {
    const resolvedRouteMode = inferEcomRouteMode(message, forcedEcomRouteMode ?? routeMode);
    const preset = selectedPresetId ?? DEFAULT_PRESET_BY_ROUTE_MODE[resolvedRouteMode];

    return {
      phase: "ECOM_IMAGE",
      route: "ecom-start",
      nextAction: "await-form-submit",
      preset,
      routeMode: resolvedRouteMode,
      score: 6 + (attachmentCount > 0 ? 2 : 0),
      loadedFiles: ["AGENTS.md", "BOOTSTRAP.md", "IDENTITY.md", "phase-policy.md", "skill-registry.yaml", "skills/ecom-image/SKILL.md"],
      reason: selectedPresetId
        ? "explicit ecommerce preset"
        : forcedEcomRouteMode
          ? "explicit ecommerce route mode"
          : "ecommerce keyword signal",
    };
  }

  if (VIDEO_PATTERN.test(message)) {
    return {
      phase: "VIDEO_SOP",
      route: "generic-openclaw",
      nextAction: "create-workflow",
      routeMode,
      score: 5,
      loadedFiles: ["AGENTS.md", "BOOTSTRAP.md", "VIDEO_PIPELINE.md", "phase-policy.md"],
      reason: "video-sop keyword signal",
    };
  }

  const score = scoreGenericTask(message, attachmentCount);
  const phase: AgentPhaseState = score >= 9 ? "DOC_CHAIN" : score >= 5 ? "STANDARD" : "FAST";

  return {
    phase,
    route: "generic-openclaw",
    nextAction: "create-workflow",
    routeMode,
    score,
    loadedFiles: phase === "FAST"
      ? ["AGENTS.md", "BOOTSTRAP.md"]
      : ["AGENTS.md", "BOOTSTRAP.md", "IDENTITY.md", "phase-policy.md"],
    reason: phase === "FAST"
      ? "simple image/canvas task"
      : phase === "STANDARD"
        ? "medium-complexity task"
        : "deep planning signal",
  };
}
