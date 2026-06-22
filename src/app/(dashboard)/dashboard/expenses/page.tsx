import type { Metadata } from "next";

import { ExpensesPageClient } from "./_components/ExpensesPageClient";

export const metadata: Metadata = {
  title: "Despesas | CondoFlow",
  description: "Gestão de despesas e aprovação de faturas do condomínio",
};

export default function ExpensesPage() {
  return (
    <div className="space-y-6 p-6">
      <ExpensesPageClient />
    </div>
  );
}
