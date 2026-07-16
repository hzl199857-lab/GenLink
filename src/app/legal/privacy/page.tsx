import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { getAuthDialogMode } from "@/lib/auth-dialog-return";
import { privacyDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "隐私政策 | GenLink",
};

interface PrivacyPageProps {
  searchParams: Promise<{ auth?: string | string[] }>;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const authValue = (await searchParams).auth;
  const returnAuthMode = getAuthDialogMode(
    Array.isArray(authValue) ? authValue[0] : authValue,
  );

  return (
    <LegalDocumentPage
      document={privacyDocument}
      returnAuthMode={returnAuthMode}
    />
  );
}
