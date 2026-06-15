export type AgentReferenceUploadNudgeState = {
  requested: boolean;
  attachmentCount: number;
};

export type AgentReferenceUploadNudgePlanfPanelState = {
  panelOpen: boolean;
  attachmentCount: number;
};

export type AgentPlanfPresetPanelPreset<
  PresetId extends string = string,
  RouteMode extends string = string,
> = {
  id: PresetId;
  prompt: string;
  routeMode: RouteMode;
};

export type AgentPlanfPresetPanelOpenState<
  PresetId extends string = string,
  RouteMode extends string = string,
> = {
  attachmentCount: number;
  currentSelectedPresetId: PresetId | null;
  presets: Array<AgentPlanfPresetPanelPreset<PresetId, RouteMode>>;
};

export function shouldShowAgentReferenceUploadNudge(
  state: AgentReferenceUploadNudgeState,
): boolean {
  return state.requested && state.attachmentCount <= 0;
}

export function getAgentReferenceUploadNudgeRequestForPlanfPanel(
  state: AgentReferenceUploadNudgePlanfPanelState,
): boolean {
  return state.panelOpen && state.attachmentCount <= 0;
}

export function getAgentPlanfPresetPanelOpenState<
  PresetId extends string,
  RouteMode extends string,
>(state: AgentPlanfPresetPanelOpenState<PresetId, RouteMode>): {
  selectedPresetId: PresetId | null;
  routeMode: RouteMode | null;
  draft: string;
  referenceUploadNudgeRequested: boolean;
} {
  const selectedPreset = state.presets.find((preset) => preset.id === state.currentSelectedPresetId)
    ?? state.presets[0]
    ?? null;

  return {
    selectedPresetId: selectedPreset?.id ?? null,
    routeMode: selectedPreset?.routeMode ?? null,
    draft: selectedPreset?.prompt ?? '',
    referenceUploadNudgeRequested: getAgentReferenceUploadNudgeRequestForPlanfPanel({
      panelOpen: true,
      attachmentCount: state.attachmentCount,
    }),
  };
}
