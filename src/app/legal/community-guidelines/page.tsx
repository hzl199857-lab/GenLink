import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { getAuthDialogMode } from "@/lib/auth-dialog-return";
import { communityGuidelinesDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "社区准则 | GenLink",
};

interface CommunityGuidelinesPageProps {
  searchParams: Promise<{ auth?: string | string[] }>;
}

export default async function CommunityGuidelinesPage({
  searchParams,
}: CommunityGuidelinesPageProps) {
  const authValue = (await searchParams).auth;
  const returnAuthMode = getAuthDialogMode(
    Array.isArray(authValue) ? authValue[0] : authValue,
  );

  return (
    <LegalDocumentPage
      document={communityGuidelinesDocument}
      returnAuthMode={returnAuthMode}
    />
  );
}
