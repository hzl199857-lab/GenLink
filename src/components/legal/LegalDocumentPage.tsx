import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import {
  buildAuthReturnHref,
  type AuthDialogMode,
} from "@/lib/auth-dialog-return";
import type { LegalDocument } from "@/lib/legal-documents";

interface LegalDocumentPageProps {
  document: LegalDocument;
  returnAuthMode?: AuthDialogMode | null;
}

export function LegalDocumentPage({
  document,
  returnAuthMode = null,
}: LegalDocumentPageProps) {
  return (
    <div className="h-dvh overflow-y-auto bg-[#0b0c0e] text-white">
      <header className="sticky top-0 z-10 border-b border-[#262729] bg-[#0b0c0e]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[900px] items-center px-5 sm:px-8">
          <Link
            href={buildAuthReturnHref(returnAuthMode)}
            className="inline-flex items-center gap-2 text-sm text-white/62 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 GenLink
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <div className="border-b border-[#262729] pb-10">
          <p className="text-sm text-white/42">更新及生效日期：{document.effectiveDate}</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-white sm:text-4xl">
            {document.title}
          </h1>
          <p className="mt-5 max-w-[760px] text-[15px] leading-7 text-white/62">
            {document.description}
          </p>
        </div>

        <div className="divide-y divide-[#242527]">
          {document.sections.map((section) => (
            <section key={section.heading} className="py-9">
              <h2 className="text-xl font-medium leading-8 tracking-normal text-white/94">
                {section.heading}
              </h2>

              {section.paragraphs ? (
                <div className="mt-4 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-[15px] leading-7 text-white/60">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}

              {section.items ? (
                <ul className="mt-4 space-y-3 pl-5 text-[15px] leading-7 text-white/60">
                  {section.items.map((item) => (
                    <li key={item} className="list-disc pl-1 marker:text-white/28">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
