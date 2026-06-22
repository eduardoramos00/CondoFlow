import type { Metadata } from "next";

import { AssembliesPageClient } from "./_components/AssembliesPageClient";

export const metadata: Metadata = {
  title: "Assembleias | CondoFlow",
  description: "Gestão de assembleias gerais e votações digitais do condomínio",
};

export default function AssembliesPage() {
  return (
    <div className="space-y-6 p-6">
      <AssembliesPageClient />
    </div>
  );
}
