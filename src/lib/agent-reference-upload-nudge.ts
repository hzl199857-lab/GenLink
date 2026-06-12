export type AgentReferenceUploadNudgeState = {
  requested: boolean;
  attachmentCount: number;
};

export type AgentReferenceUploadNudgePlanfPanelState = {
  panelOpen: boolean;
  attachmentCount: number;
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
