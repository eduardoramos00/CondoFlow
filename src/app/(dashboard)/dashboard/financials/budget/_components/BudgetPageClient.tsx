"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, FileDown, Loader2 } from "lucide-react";

import {
  approveBudget,
  getBudgetForYear,
  type BudgetWithLineItems,
} from "@/app/actions/budgets";
import { formatCurrency } from "@/lib/utils/currency";
import { useBuilding } from "@/contexts/BuildingContext";
import { BudgetSummaryCard } from "@/components/finance/BudgetSummaryCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { CreateBudgetForm } from "./CreateBudgetForm";
import { AddLineItemForm } from "./AddLineItemForm";

const CATEGORY_LABELS: Record<string, string> = {
  MAINTENANCE: "Manutenção",
  WATER: "Água",
  ELECTRICITY: "Eletricidade",
  INSURANCE: "Seguros",
  CLEANING: "Limpeza",
  ELEVATOR: "Elevador",
  ADMINISTRATIVE: "Administrativo",
  OTHER: "Outros",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

export function BudgetPageClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [budget, setBudget] = useState<BudgetWithLineItems | null | undefined>(
    undefined,
  );
  const [isFetching, setIsFetching] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const fetchBudget = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    try {
      const data = await getBudgetForYear(selectedBuilding.id, year);
      setBudget(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id, year]);

  useEffect(() => {
    if (!selectedBuilding) {
      setBudget(undefined);
      return;
    }
    setBudget(undefined); // reset while loading
    void fetchBudget();
  }, [selectedBuilding?.id, year, fetchBudget]);

  const handleApprove = async () => {
    if (!budget || !selectedBuilding) return;
    setApproveError(null);
    setIsApproving(true);
    const result = await approveBudget(budget.id, selectedBuilding.id);
    setIsApproving(false);
    if ("error" in result) {
      setApproveError(result.error);
    } else {
      await fetchBudget();
    }
  };

  // Line items sum for BudgetSummaryCard
  const lineItemsTotal =
    budget?.line_items.reduce((acc, item) => acc + item.amount_cents, 0) ?? 0;

  // ---- Loading state ----
  if (buildingLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>A carregar edifícios…</span>
      </div>
    );
  }

  // ---- No building selected ----
  if (!selectedBuilding) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <Building2 className="mb-4 h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">
          Selecione um edifício no menu lateral
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          O orçamento será apresentado para o edifício selecionado
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Orçamento Anual
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">{selectedBuilding.name}</p>
        </div>

        {/* Year selector + PDF export */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-500" />
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Selecionar ano fiscal"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {budget ? (
            <a
              href={`/api/documents/export/annual-budget/${budget.id}`}
              download
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-100"
              aria-label="Exportar orçamento em PDF"
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </a>
          ) : null}
        </div>
      </div>

      {/* Content */}
      {isFetching || budget === undefined ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>A carregar orçamento…</span>
        </div>
      ) : budget === null ? (
        /* No budget for this year — show creation form */
        <div className="space-y-6">
          <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
            <p className="text-sm font-medium text-zinc-300">
              Nenhum orçamento para {year}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Crie o orçamento anual para este edifício
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-200">
              Novo orçamento — {year}
            </h2>
            <CreateBudgetForm
              buildingId={selectedBuilding.id}
              defaultYear={year}
              onSuccess={() => {
                void fetchBudget();
              }}
            />
          </div>
        </div>
      ) : (
        /* Budget exists */
        <div className="space-y-6">
          {/* Summary card */}
          <BudgetSummaryCard
            fiscalYear={budget.fiscal_year}
            status={budget.status}
            totalAmountCents={budget.total_amount_cents}
            reserveAmountCents={budget.reserve_amount_cents}
            lineItemsTotalCents={lineItemsTotal}
          />

          {/* Reserve compliance warning */}
          {budget.reserve_amount_cents * 10 < budget.total_amount_cents && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">
                <span className="font-medium">Fundo de reserva abaixo do mínimo legal.</span>{" "}
                O Decreto-Lei n.º 268/94 exige que o fundo de reserva corresponda
                a pelo menos 10% do orçamento total. Atualize o valor antes de
                aprovar.
              </p>
            </div>
          )}

          {/* Line items section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-zinc-200">
                Itens do orçamento
              </h2>
            </div>

            {budget.line_items.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-zinc-500">
                Nenhum item adicionado ainda
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Categoria
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Descrição
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Montante
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {budget.line_items.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-zinc-800/40"
                      >
                        <td className="px-6 py-3 text-zinc-300">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </td>
                        <td className="px-6 py-3 text-zinc-400">
                          {item.description ?? (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-zinc-200">
                          {formatCurrency(item.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-800/50">
                      <td
                        colSpan={2}
                        className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-zinc-400"
                      >
                        Total de itens
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-semibold text-zinc-100">
                        {formatCurrency(lineItemsTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Add line item form — only for DRAFT budgets */}
            {budget.status === "DRAFT" && (
              <div className="border-t border-zinc-800 px-6 py-5">
                <h3 className="mb-4 text-sm font-medium text-zinc-300">
                  Adicionar item
                </h3>
                <AddLineItemForm
                  budgetId={budget.id}
                  buildingId={selectedBuilding.id}
                  onSuccess={() => {
                    void fetchBudget();
                  }}
                />
              </div>
            )}
          </div>

          {/* Approval section */}
          {budget.status === "DRAFT" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">
                    Aprovar orçamento
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Após aprovação não será possível adicionar ou editar itens.
                    O orçamento ficará disponível para geração de quotas.
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Button
                    onClick={() => {
                      void handleApprove();
                    }}
                    disabled={isApproving}
                    className="gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isApproving ? "A aprovar…" : "Aprovar orçamento"}
                  </Button>

                  {approveError && (
                    <p
                      className="max-w-sm text-right text-xs text-red-400"
                      role="alert"
                    >
                      {approveError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Approved confirmation */}
          {budget.status === "APPROVED" && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-300">
                  Orçamento aprovado
                </p>
                <p className="text-xs text-emerald-400/70">
                  Este orçamento está aprovado e pronto para geração de quotas mensais.
                </p>
              </div>
              <StatusBadge status="APPROVED" className="ml-auto" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
