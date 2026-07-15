export function getProjectSaveIntent(
  currentProject: { id: string } | null,
): "open-save-dialog" | "save-project" {
  return currentProject ? "save-project" : "open-save-dialog";
}
