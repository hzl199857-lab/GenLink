export function getCompleteRegisterCode(code: string[]): string | null {
  const value = code.join("");

  return /^\d{6}$/.test(value) ? value : null;
}
