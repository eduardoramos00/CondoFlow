import type { Metadata } from "next";

import { PaymentsPageClient } from "./_components/PaymentsPageClient";

export const metadata: Metadata = {
  title: "Os Meus Pagamentos | CondoFlow",
  description: "Histórico de quotas e pagamentos do condomínio",
};

export default function PaymentsPage() {
  return (
    <div className="space-y-6 p-6">
      <PaymentsPageClient />
    </div>
  );
}
