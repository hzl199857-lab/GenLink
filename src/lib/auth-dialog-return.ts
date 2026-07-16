export type AuthDialogMode = "login" | "register";

export const AUTH_DIALOG_QUERY_PARAM = "auth";

export function getAuthDialogMode(
  value: string | null | undefined,
): AuthDialogMode | null {
  return value === "login" || value === "register" ? value : null;
}

export function buildLegalDocumentHref(
  path: string,
  mode: AuthDialogMode,
) {
  return `${path}?${AUTH_DIALOG_QUERY_PARAM}=${mode}`;
}

export function buildAuthReturnHref(mode: AuthDialogMode | null) {
  return mode ? `/?${AUTH_DIALOG_QUERY_PARAM}=${mode}` : "/";
}
