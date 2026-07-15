export type HomeEntryDecision =
  | { action: "show-hero" }
  | { action: "open-library" };

interface HomeEntryDecisionInput {
  appParam: string | null;
  isAuthenticated: boolean;
}

export function getHomeEntryDecision({
  appParam,
  isAuthenticated,
}: HomeEntryDecisionInput): HomeEntryDecision {
  if (appParam !== "library") {
    return { action: "show-hero" };
  }

  if (!isAuthenticated) {
    return { action: "show-hero" };
  }

  return { action: "open-library" };
}
