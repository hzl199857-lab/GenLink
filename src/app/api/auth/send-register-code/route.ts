import { NextResponse } from "next/server";
import { Resend } from "resend";

import {
  createEmailVerificationIdentifier,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
  normalizeEmailForVerification,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { createRegisterVerificationEmail } from "@/lib/register-verification-email";

export const runtime = "nodejs";

interface SendRegisterCodeBody {
  email?: unknown;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as SendRegisterCodeBody;
  const email = normalizeEmailForVerification(typeof body.email === "string" ? body.email : "");

  if (!isEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { ok: false, error: "Email already registered" },
      { status: 409 },
    );
  }

  const code = generateEmailVerificationCode();
  const identifier = createEmailVerificationIdentifier(email);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.verification.deleteMany({ where: { identifier } });
  await prisma.verification.create({
    data: {
      id: crypto.randomUUID(),
      identifier,
      value: hashEmailVerificationCode(code),
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "GenLink <onboarding@resend.dev>";

  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    const emailContent = createRegisterVerificationEmail(code);

    await resend.emails.send({
      from,
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    return NextResponse.json({ ok: true });
  }

  console.log(`[GenLink auth] Verification code for ${email}: ${code}`);

  return NextResponse.json({
    ok: true,
    devCode: code,
  });
}
