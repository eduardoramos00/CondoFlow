import type { Metadata } from "next";

import { BudgetPageClient } from "./_components/BudgetPageClient";

export const metadata: Metadata = {
  title: "Orçamento",
};

export default function BudgetPage() {
  return <BudgetPageClient />;
}
