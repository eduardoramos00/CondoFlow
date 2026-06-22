import type { Metadata } from "next";

import { SuppliersPageClient } from "./_components/SuppliersPageClient";

export const metadata: Metadata = {
  title: "Fornecedores | CondoFlow",
  description: "Gestão de fornecedores e prestadores de serviço do condomínio",
};

export default function SuppliersPage() {
  return (
    <div className="space-y-6 p-6">
      <SuppliersPageClient />
    </div>
  );
}
