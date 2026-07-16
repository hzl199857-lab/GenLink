import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { termsDocument } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "服务条款 | GenLink",
};

export default function TermsPage() {
  return <LegalDocumentPage document={termsDocument} />;
}
