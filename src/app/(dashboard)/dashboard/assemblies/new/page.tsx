import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewAssemblyForm } from "./_components/NewAssemblyForm";

export const metadata: Metadata = {
  title: "Nova Assembleia | CondoFlow",
  description: "Criar nova assembleia geral",
};

export default function NewAssemblyPage() {
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

      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Nova Assembleia</h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          Preencha os dados para criar uma nova assembleia em rascunho.
        </p>
      </div>

      <div className="max-w-xl">
        <NewAssemblyForm />
      </div>
    </div>
  );
}
