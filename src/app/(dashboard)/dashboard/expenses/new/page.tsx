import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewExpenseForm } from "./_components/NewExpenseForm";

export const metadata: Metadata = {
  title: "Nova Despesa | CondoFlow",
  description: "Registe uma nova despesa do condomínio",
};

export default function NewExpensePage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/dashboard/expenses"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar às despesas
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-100">Nova Despesa</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Registe uma nova despesa. Pode anexar a fatura e submeter para aprovação após guardar.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <NewExpenseForm />
      </div>
    </div>
  );
}
