import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { communityGuidelinesDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "社区准则 | GenLink",
};

export default function CommunityGuidelinesPage() {
  return <LegalDocumentPage document={communityGuidelinesDocument} />;
}
