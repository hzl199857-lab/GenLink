import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { getAuthDialogMode } from "@/lib/auth-dialog-return";
import { termsDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "服务条款 | GenLink",
};

interface TermsPageProps {
  searchParams: Promise<{ auth?: string | string[] }>;
}

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const authValue = (await searchParams).auth;
  const returnAuthMode = getAuthDialogMode(
    Array.isArray(authValue) ? authValue[0] : authValue,
  );

  return (
    <LegalDocumentPage
      document={termsDocument}
      returnAuthMode={returnAuthMode}
    />
  );
}
