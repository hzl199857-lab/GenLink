"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import {
  buildLegalDocumentHref,
  type AuthDialogMode,
} from "@/lib/auth-dialog-return";

interface AuthConsentProps {
  checked: boolean;
  error?: string | null;
  id: string;
  mode: AuthDialogMode;
  onCheckedChange: (checked: boolean) => void;
}

const legalLinkClass =
  "font-medium text-white/78 underline decoration-white/35 underline-offset-2 transition hover:text-white";

export function AuthConsent({
  checked,
  error,
  id,
  mode,
  onCheckedChange,
}: AuthConsentProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2 text-left">
      <div className="flex items-start gap-3">
        <label
          htmlFor={id}
          className="relative mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
        >
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
            aria-describedby={error ? errorId : undefined}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-[4px] border border-[#5a5a5a] bg-[#141517] transition peer-checked:border-[#d8d8d8] peer-checked:bg-[#d8d8d8] peer-focus-visible:ring-2 peer-focus-visible:ring-[#777] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#08090b]" />
          <Check
            aria-hidden="true"
            className="relative h-3.5 w-3.5 text-[#111214] opacity-0 transition peer-checked:opacity-100"
            strokeWidth={3}
          />
        </label>

        <p className="text-xs leading-5 text-white/48">
          <label htmlFor={id} className="cursor-pointer">
            我已阅读并同意
          </label>
          <Link
            href={buildLegalDocumentHref("/legal/terms", mode)}
            target="_blank"
            rel="noreferrer"
            className={legalLinkClass}
          >
            《服务条款》
          </Link>
          、
          <Link
            href={buildLegalDocumentHref("/legal/community-guidelines", mode)}
            target="_blank"
            rel="noreferrer"
            className={legalLinkClass}
          >
            《社区准则》
          </Link>
          和
          <Link
            href={buildLegalDocumentHref("/legal/privacy", mode)}
            target="_blank"
            rel="noreferrer"
            className={legalLinkClass}
          >
            《隐私政策》
          </Link>
        </p>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="pl-8 text-xs text-red-300/90">
          {error}
        </p>
      ) : null}
    </div>
  );
}
