"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import {
  approveExpense,
  getExpenses,
  submitExpenseForApproval,
  type Expense,
  type ExpenseStatus,
} from "@/app/actions/expenses";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/expenses/categories";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { useBuilding } from "@/contexts/BuildingContext";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_TABS: { value: ExpenseStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "DRAFT", label: "Rascunho" },
  { value: "AWAITING_APPROVAL", label: "Aguarda Aprovação" },
  { value: "APPROVED", label: "Aprovadas" },
  { value: "RECONCILED", label: "Reconciliadas" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildExpenseReportUrl(
  buildingId: string,
  from: string,
  to: string,
): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return `/api/documents/export/expense-report/${buildingId}${qs ? `?${qs}` : ""}`;
}

// ---------------------------------------------------------------------------
// ExpensesPageClient
// ---------------------------------------------------------------------------

export function ExpensesPageClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [expenses, setExpenses] = useState<Expense[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);

  // Filters (client-side)
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const inputBase =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  const fetchExpenses = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    try {
      const data = await getExpenses(selectedBuilding.id);
      setExpenses(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding) {
      setExpenses(undefined);
      return;
    }
    setExpenses(undefined);
    void fetchExpenses();
  }, [selectedBuilding?.id, fetchExpenses]);

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = (expenses ?? []).filter((e) => {
    if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
    if (categoryFilter !== "ALL" && e.category !== categoryFilter) return false;
    if (dateFrom && e.expense_date < dateFrom) return false;
    if (dateTo && e.expense_date > dateTo) return false;
    return true;
  });

  const totalCents = filtered.reduce((sum, e) => sum + e.amount_cents, 0);

  const isGestor = selectedBuilding?.userRole === "GESTOR";

  // ── Loading / empty states ────────────────────────────────────────────────
  if (buildingLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>A carregar edifícios…</span>
      </div>
    );
  }

  if (!selectedBuilding) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <Building2 className="mb-4 h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">
          Selecione um edifício no menu lateral
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Despesas</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{selectedBuilding.name}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => void fetchExpenses()}
            disabled={isFetching}
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {isGestor && (
            <>
              <a
                href={buildExpenseReportUrl(selectedBuilding.id, dateFrom, dateTo)}
                download
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-100"
                aria-label="Exportar relatório de despesas em PDF"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </a>
              <Link
                href="/dashboard/expenses/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Despesa
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Categoria
          </label>
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as ExpenseCategory | "ALL")
            }
            className={inputBase}
          >
            <option value="ALL">Todas</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            De
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputBase}
          />
        </div>

        {/* Date to */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Até
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputBase}
          />
        </div>

        {/* Clear filters */}
        {(categoryFilter !== "ALL" || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("ALL");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === "ALL"
              ? (expenses ?? []).length
              : (expenses ?? []).filter((e) => e.status === tab.value).length;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {tab.label}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isFetching || expenses === undefined ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>A carregar despesas…</span>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              {(expenses ?? []).length === 0
                ? "Sem despesas registadas. Clique em «Nova Despesa» para começar."
                : "Nenhuma despesa corresponde aos filtros selecionados."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Fornecedor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Categoria
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Data
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Estado
                    </th>
                    {isGestor && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Ações
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filtered.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      isGestor={isGestor}
                      buildingId={selectedBuilding.id}
                      onDone={() => void fetchExpenses()}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-700">
                    <td
                      colSpan={isGestor ? 3 : 3}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500"
                    >
                      Total ({filtered.length} despesa{filtered.length !== 1 ? "s" : ""})
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-100">
                      {formatCurrency(totalCents)}
                    </td>
                    <td colSpan={isGestor ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpenseRow — per-row with inline actions
// ---------------------------------------------------------------------------

type RowProps = {
  expense: Expense;
  isGestor: boolean;
  buildingId: string;
  onDone: () => void;
};

function ExpenseRow({ expense, isGestor, buildingId, onDone }: RowProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "error" | "ok";
    message: string;
  } | null>(null);

  const run = async (
    action: () => Promise<{ error: string } | { success: true }>,
    key: string,
  ) => {
    setFeedback(null);
    setLoading(key);
    const result = await action();
    setLoading(null);
    if ("error" in result) {
      setFeedback({ type: "error", message: result.error });
    } else {
      setFeedback({ type: "ok", message: "Concluído." });
      onDone();
    }
  };

  const formattedDate = new Date(expense.expense_date + "T00:00:00").toLocaleDateString(
    "pt-PT",
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );

  return (
    <tr className="transition-colors hover:bg-zinc-800/40">
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-200">{expense.supplier_name}</p>
        {expense.description && (
          <p className="truncate text-xs text-zinc-500" title={expense.description}>
            {expense.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-400">
        {CATEGORY_LABELS[expense.category]}
      </td>
      <td className="px-4 py-3 text-zinc-400">{formattedDate}</td>
      <td className="px-4 py-3 text-right font-mono text-zinc-100">
        {formatCurrency(expense.amount_cents)}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge status={expense.status} />
      </td>
      {isGestor && (
        <td className="px-4 py-3 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {expense.status === "DRAFT" && (
                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() =>
                    run(
                      () => submitExpenseForApproval(expense.id, buildingId),
                      "submit",
                    )
                  }
                  className="rounded px-2 py-1 text-xs text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                >
                  {loading === "submit" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Submeter"
                  )}
                </button>
              )}
              {expense.status === "AWAITING_APPROVAL" && (
                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() =>
                    run(() => approveExpense(expense.id, buildingId), "approve")
                  }
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {loading === "approve" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Aprovar
                    </>
                  )}
                </button>
              )}
            </div>
            {feedback && (
              <p
                className={`text-xs ${feedback.type === "error" ? "text-red-400" : "text-emerald-400"}`}
                role="alert"
              >
                {feedback.type === "error" ? (
                  <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                ) : null}
                {feedback.message}
              </p>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
