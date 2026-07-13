import { NextResponse } from "next/server";
import { Resend } from "resend";

import {
  createEmailVerificationIdentifier,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
  normalizeEmailForVerification,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import {
  getRegistrationCodeRateLimit,
  REGISTRATION_CODE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/registration-code-rate-limit";
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
      { ok: false, error: "邮箱格式不正确，请重新输入" },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { ok: false, error: "这个邮箱已经注册过，请直接登录" },
      { status: 409 },
    );
  }

  const now = new Date();
  const code = generateEmailVerificationCode();
  const identifier = createEmailVerificationIdentifier(email);
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const rateLimit = await prisma.$transaction(async (tx) => {
    const windowStart = new Date(now.getTime() - REGISTRATION_CODE_RATE_LIMIT_WINDOW_MS);
    await tx.registrationCodeRequest.deleteMany({ where: { createdAt: { lt: windowStart } } });

    const [latestRequest, recentCount] = await Promise.all([
      tx.registrationCodeRequest.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      tx.registrationCodeRequest.count({ where: { email, createdAt: { gte: windowStart } } }),
    ]);
    const limit = getRegistrationCodeRateLimit({
      recentCount,
      latestRequestAt: latestRequest?.createdAt ?? null,
      now,
    });

    if (limit) return limit;

    await tx.verification.deleteMany({ where: { identifier } });
    await tx.verification.create({
      data: {
        id: crypto.randomUUID(),
        identifier,
        value: hashEmailVerificationCode(code),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.registrationCodeRequest.create({ data: { id: crypto.randomUUID(), email, createdAt: now } });
    return null;
  });

  if (rateLimit) {
    return NextResponse.json({ ok: false, error: "请稍后再试" }, { status: 429 });
  }

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
