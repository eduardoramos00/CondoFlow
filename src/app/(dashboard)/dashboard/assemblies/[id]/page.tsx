import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AssemblyDetailClient } from "./_components/AssemblyDetailClient";

export const metadata: Metadata = {
  title: "Assembleia | CondoFlow",
};

export default async function AssemblyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/assemblies"
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Assembleias
        </Link>
      </div>
      <AssemblyDetailClient assemblyId={id} />
    </div>
  );
}
