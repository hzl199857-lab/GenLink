import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { privacyDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "隐私政策 | GenLink",
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={privacyDocument} />;
}
