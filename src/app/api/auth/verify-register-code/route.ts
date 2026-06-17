import { NextResponse } from "next/server";

import {
  createEmailVerificationIdentifier,
  normalizeEmailForVerification,
  verifyEmailVerificationCodeHash,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface VerifyRegisterCodeBody {
  email?: unknown;
  code?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyRegisterCodeBody;
  const email = normalizeEmailForVerification(typeof body.email === "string" ? body.email : "");
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Invalid verification code" },
      { status: 400 },
    );
  }

  const identifier = createEmailVerificationIdentifier(email);
  const verification = await prisma.verification.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
  });

  if (!verification || verification.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Verification code expired" },
      { status: 400 },
    );
  }

  if (!verifyEmailVerificationCodeHash(code, verification.value)) {
    return NextResponse.json(
      { ok: false, error: "Invalid verification code" },
      { status: 400 },
    );
  }

  await prisma.verification.deleteMany({ where: { identifier } });

  return NextResponse.json({ ok: true });
}
