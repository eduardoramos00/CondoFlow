import type { Metadata } from "next";

import { BuildingWizard } from "./_components/BuildingWizard";

export const metadata: Metadata = {
  title: "Novo Edifício | CondoFlow",
  description: "Assistente de criação de edifício",
};

export default function NewBuildingPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Novo edifício</h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          Siga os três passos para configurar o seu condomínio.
        </p>
      </div>
      <BuildingWizard />
    </div>
  );
}
