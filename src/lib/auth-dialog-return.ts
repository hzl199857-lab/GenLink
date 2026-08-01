export type AuthDialogMode = "login" | "register";

export const AUTH_DIALOG_QUERY_PARAM = "auth";
export const AUTH_RETURN_QUERY_PARAM = "next";

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

export function getSafeAuthReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
