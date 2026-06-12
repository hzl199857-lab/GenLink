export function shouldShowProjectLibraryEntryLoader(
  knownProjectCount: number | null,
): boolean {
  return knownProjectCount === null || knownProjectCount > 0;
}

export function areCanvasNodesSynced(
  canvasNodeIds: readonly string[],
  renderedNodeIds: readonly string[],
): boolean {
  if (canvasNodeIds.length === 0) {
    return true;
  }

  const rendered = new Set(renderedNodeIds);
  return canvasNodeIds.every((nodeId) => rendered.has(nodeId));
}

export function shouldKeepEntryLoaderVisible(params: {
  visibleForMs: number;
  minVisibleMs: number;
}): boolean {
  return params.visibleForMs < params.minVisibleMs;
}
