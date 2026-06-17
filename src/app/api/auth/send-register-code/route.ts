import { NextResponse } from "next/server";
import { Resend } from "resend";

import {
  createEmailVerificationIdentifier,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
  normalizeEmailForVerification,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface SendRegisterCodeBody {
  email?: unknown;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createVerificationEmailHtml(code: string): string {
  return `
    <div style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 18px;">
                  <div style="font-size:18px;font-weight:700;letter-spacing:0;color:#111827;">GenLink</div>
                  <h1 style="margin:24px 0 8px;font-size:24px;line-height:1.25;font-weight:700;color:#111827;">Verify your email</h1>
                  <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">Use this code to finish creating your GenLink account. The code expires in 10 minutes.</p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:8px 28px 28px;">
                  <div style="display:inline-block;padding:18px 30px;border-radius:14px;background:#111827;color:#ffffff;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${code}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 28px;">
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">If you did not request this code, you can ignore this email.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
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
    await resend.emails.send({
      from,
      to: email,
      subject: "GenLink verification code",
      text: `Your GenLink verification code is ${code}. It expires in 10 minutes.`,
      html: createVerificationEmailHtml(code),
    });

    return NextResponse.json({ ok: true });
  }

  console.log(`[GenLink auth] Verification code for ${email}: ${code}`);

  return NextResponse.json({
    ok: true,
    devCode: code,
  });
}
