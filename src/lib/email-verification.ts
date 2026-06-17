import { createHash, randomInt } from "node:crypto";

const REGISTER_EMAIL_IDENTIFIER_PREFIX = "register-email:";

export function normalizeEmailForVerification(email: string): string {
  return email.trim().toLowerCase();
}

export function createEmailVerificationIdentifier(email: string): string {
  return `${REGISTER_EMAIL_IDENTIFIER_PREFIX}${normalizeEmailForVerification(email)}`;
}

export function generateEmailVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashEmailVerificationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyEmailVerificationCodeHash(code: string, hash: string): boolean {
  return hashEmailVerificationCode(code) === hash;
}
