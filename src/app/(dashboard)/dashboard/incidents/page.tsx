import type { Metadata } from "next";

import { KanbanBoard } from "./_components/KanbanBoard";

export const metadata: Metadata = {
  title: "Incidentes | CondoFlow",
  description: "Gestão de ocorrências e manutenção do condomínio",
};

export default function IncidentsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-0 p-6">
      <KanbanBoard />
    </div>
  );
}
