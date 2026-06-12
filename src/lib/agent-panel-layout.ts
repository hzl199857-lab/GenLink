export const AGENT_PANEL_DEFAULT_WIDTH = 520;
export const AGENT_PANEL_MIN_WIDTH = 420;
export const AGENT_PANEL_MAX_WIDTH = 920;
export const AGENT_PANEL_MAX_VIEWPORT_RATIO = 0.8;
export const AGENT_PANEL_FLOATING_INSET = 20;
export const AGENT_PANEL_WIDTH_STORAGE_KEY = 'genlink:canvas-agent-panel-width';

export function getAgentPanelMaxWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return AGENT_PANEL_MAX_WIDTH;
  }

  return Math.max(
    AGENT_PANEL_MIN_WIDTH,
    Math.min(AGENT_PANEL_MAX_WIDTH, Math.floor(viewportWidth * AGENT_PANEL_MAX_VIEWPORT_RATIO)),
  );
}

export function clampAgentPanelWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) {
    return AGENT_PANEL_DEFAULT_WIDTH;
  }

  return Math.min(
    getAgentPanelMaxWidth(viewportWidth),
    Math.max(AGENT_PANEL_MIN_WIDTH, Math.round(width)),
  );
}

export function resolveStoredAgentPanelWidth(storedWidth: string | null, viewportWidth: number): number {
  if (!storedWidth) {
    return AGENT_PANEL_DEFAULT_WIDTH;
  }

  const width = Number(storedWidth);

  if (!Number.isFinite(width)) {
    return AGENT_PANEL_DEFAULT_WIDTH;
  }

  return clampAgentPanelWidth(width, viewportWidth);
}
