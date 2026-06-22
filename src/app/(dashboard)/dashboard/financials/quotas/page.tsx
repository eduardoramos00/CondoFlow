import type { Metadata } from "next";

import { QuotasPageClient } from "./_components/QuotasPageClient";

export const metadata: Metadata = {
  title: "Quotas | CondoFlow",
  description: "Geração e gestão de quotas mensais do condomínio",
};

export default function QuotasPage() {
  return (
    <div className="space-y-6 p-6">
      <QuotasPageClient />
    </div>
  );
}
