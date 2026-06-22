import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { IncidentDetailClient } from "./_components/IncidentDetailClient";

export const metadata: Metadata = {
  title: "Ocorrência | CondoFlow",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/incidents"
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Incidentes
        </Link>
      </div>
      <IncidentDetailClient incidentId={id} />
    </div>
  );
}
