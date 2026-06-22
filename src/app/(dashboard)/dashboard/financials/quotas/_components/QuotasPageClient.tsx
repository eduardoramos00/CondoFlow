"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileDown,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";

import {
  bulkMarkQuotaPaid,
  generateMonthlyQuotas,
  getQuotasForMonth,
  markQuotaOverdue,
  waiveQuota,
  type QuotaWithUnit,
} from "@/app/actions/quotas";
import { getBudgetForYear } from "@/app/actions/budgets";
import { PaymentsPageClient } from "@/app/(dashboard)/my-building/payments/_components/PaymentsPageClient";
import { formatCurrency } from "@/lib/utils/currency";
import { useBuilding } from "@/contexts/BuildingContext";
import { QuotaStatusChart } from "@/components/charts/QuotaStatusChart";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "Todas" },
  { value: "PENDING", label: "Pendentes" },
  { value: "OVERDUE", label: "Em Atraso" },
  { value: "PAID", label: "Pagas" },
  { value: "WAIVED", label: "Isentas" },
] as const;

type StatusFilter = "ALL" | "PENDING" | "OVERDUE" | "PAID" | "WAIVED";

const PAYMENT_METHODS = [
  "MB WAY",
  "Transferência Bancária",
  "Numerário",
  "Cheque",
  "Débito Direto",
  "Outros",
];

function formatDueDate(iso: string): string {
  const [year, month] = iso.split("-");
  if (!month || !year) return iso;
  const m = parseInt(month, 10);
  return `${MONTH_NAMES[m - 1] ?? month} ${year}`;
}

export function QuotasPageClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quotas, setQuotas] = useState<QuotaWithUnit[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0] ?? "");
  const [paymentRef, setPaymentRef] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);

  const inputBase =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  const fetchQuotas = useCallback(async () => {
    if (!selectedBuilding) return;
    setIsFetching(true);
    setSelectedIds(new Set());
    try {
      const data = await getQuotasForMonth(selectedBuilding.id, month, year);
      setQuotas(data);
    } finally {
      setIsFetching(false);
    }
  }, [selectedBuilding?.id, month, year]);

  useEffect(() => {
    if (!selectedBuilding) {
      setQuotas(undefined);
      return;
    }
    setQuotas(undefined);
    void fetchQuotas();
  }, [selectedBuilding?.id, month, year, fetchQuotas]);

  const handleGenerate = async () => {
    if (!selectedBuilding) return;
    setGenerateMsg(null);
    setGenerateLoading(true);
    try {
      const budget = await getBudgetForYear(selectedBuilding.id, year);
      if (!budget) {
        setGenerateMsg("Nenhum orçamento encontrado para " + year + ".");
        return;
      }
      if (budget.status !== "APPROVED") {
        setGenerateMsg("O orçamento de " + year + " ainda não está aprovado.");
        return;
      }
      const result = await generateMonthlyQuotas(
        selectedBuilding.id,
        budget.id,
        month,
        year,
      );
      if ("error" in result) {
        setGenerateMsg(result.error);
      } else {
        setGenerateMsg(
          `✓ ${result.generated} quota(s) gerada(s)${result.skipped > 0 ? `, ${result.skipped} já existia(m).` : "."}`,
        );
        await fetchQuotas();
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleBulkPay = async () => {
    if (!selectedBuilding || selectedIds.size === 0) return;
    setBulkError(null);
    setBulkLoading(true);
    const result = await bulkMarkQuotaPaid(
      [...selectedIds],
      selectedBuilding.id,
      paymentMethod,
      paymentRef || undefined,
    );
    setBulkLoading(false);
    if ("error" in result) {
      setBulkError(result.error);
    } else {
      setBulkError(
        result.failed > 0
          ? `${result.processed} processada(s), ${result.failed} falharam.`
          : null,
      );
      setSelectedIds(new Set());
      await fetchQuotas();
    }
  };

  const toggleSelect = (id: string, eligible: boolean) => {
    if (!eligible) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const eligible = filtered.filter(
      (q) => q.status === "PENDING" || q.status === "OVERDUE",
    );
    const allSelected = eligible.every((q) => selectedIds.has(q.id));
    setSelectedIds(
      allSelected ? new Set() : new Set(eligible.map((q) => q.id)),
    );
  };

  const filtered = (quotas ?? []).filter(
    (q) => statusFilter === "ALL" || q.status === statusFilter,
  );

  const counts = {
    PAID: (quotas ?? []).filter((q) => q.status === "PAID").length,
    OVERDUE: (quotas ?? []).filter((q) => q.status === "OVERDUE").length,
    PENDING: (quotas ?? []).filter((q) => q.status === "PENDING").length,
    WAIVED: (quotas ?? []).filter((q) => q.status === "WAIVED").length,
  };

  const totalAmountCents = (quotas ?? []).reduce(
    (s, q) => s + q.amount_cents + q.reserve_cents,
    0,
  );

  const eligibleSelected = [...selectedIds].filter((id) => {
    const q = quotas?.find((x) => x.id === id);
    return q?.status === "PENDING" || q?.status === "OVERDUE";
  });

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

  // CONDÓMINOS get the identity-scoped "Os Meus Pagamentos" view — the
  // management table below is GESTOR-only (getQuotasForMonth requires it).
  if (selectedBuilding.userRole !== "GESTOR") {
    return <PaymentsPageClient />;
  }

  return (
    <div className="space-y-6">
      {/* Header + selectors */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Gestão de Quotas
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            {selectedBuilding.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-500" />
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className={inputBase}
            aria-label="Mês"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={inputBase}
            aria-label="Ano"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={generateLoading}
            className="gap-2"
          >
            {generateLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Gerar Quotas
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              void fetchQuotas();
            }}
            disabled={isFetching}
            aria-label="Atualizar"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Generation feedback */}
      {generateMsg && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
            generateMsg.startsWith("✓")
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300"
          }`}
        >
          {generateMsg.startsWith("✓") ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{generateMsg}</span>
        </div>
      )}

      {isFetching || quotas === undefined ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>A carregar quotas…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Chart */}
          {(quotas ?? []).length > 0 && (
            <QuotaStatusChart
              paid={counts.PAID}
              overdue={counts.OVERDUE}
              pending={counts.PENDING}
              waived={counts.WAIVED}
              totalAmountCents={totalAmountCents}
            />
          )}

          {/* Bulk pay panel */}
          {eligibleSelected.length > 0 && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <p className="mb-3 text-sm font-medium text-indigo-300">
                {eligibleSelected.length} quota(s) selecionada(s) para pagamento
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Método de pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={inputBase}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Referência (opcional)
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="Ex: MBWAY#1234"
                    maxLength={100}
                    className={`${inputBase} w-48`}
                  />
                </div>
                <Button
                  onClick={() => {
                    void handleBulkPay();
                  }}
                  disabled={bulkLoading}
                  className="gap-2"
                >
                  {bulkLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirmar pagamento
                </Button>
              </div>
              {bulkError && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {bulkError}
                </p>
              )}
            </div>
          )}

          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const count =
                opt.value === "ALL"
                  ? (quotas ?? []).length
                  : counts[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatusFilter(opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}{" "}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Quotas table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900">
            {filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-500">
                {(quotas ?? []).length === 0
                  ? `Sem quotas em ${MONTH_NAMES[month - 1]} ${year}. Use "Gerar Quotas" para criar.`
                  : "Nenhuma quota com este filtro."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="w-10 px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas"
                          checked={
                            filtered
                              .filter(
                                (q) =>
                                  q.status === "PENDING" ||
                                  q.status === "OVERDUE",
                              )
                              .every((q) => selectedIds.has(q.id)) &&
                            filtered.some(
                              (q) =>
                                q.status === "PENDING" ||
                                q.status === "OVERDUE",
                            )
                          }
                          onChange={toggleSelectAll}
                          className="h-4 w-4 cursor-pointer accent-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Fração
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Período
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Quota
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Reserva
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Total
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filtered.map((quota) => {
                      const isEligible =
                        quota.status === "PENDING" ||
                        quota.status === "OVERDUE";
                      return (
                        <tr
                          key={quota.id}
                          className={`transition-colors hover:bg-zinc-800/40 ${
                            selectedIds.has(quota.id)
                              ? "bg-indigo-500/5"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(quota.id)}
                              onChange={() =>
                                toggleSelect(quota.id, isEligible)
                              }
                              disabled={!isEligible}
                              className="h-4 w-4 cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-30"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-200">
                            {quota.unit_identifier}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {formatDueDate(quota.due_date)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">
                            {formatCurrency(quota.amount_cents)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">
                            {formatCurrency(quota.reserve_cents)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-100">
                            {formatCurrency(
                              quota.amount_cents + quota.reserve_cents,
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={quota.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <QuotaRowActions
                              quota={quota}
                              buildingId={selectedBuilding.id}
                              onDone={() => {
                                void fetchQuotas();
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuotaRowActions — per-row action buttons
// ---------------------------------------------------------------------------

type RowActionProps = {
  quota: QuotaWithUnit;
  buildingId: string;
  onDone: () => void;
};

function QuotaRowActions({ quota, buildingId, onDone }: RowActionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    action: () => Promise<{ error: string } | { success: true }>,
    label: string,
  ) => {
    setError(null);
    setLoading(label);
    const result = await action();
    setLoading(null);
    if ("error" in result) {
      setError(result.error);
    } else {
      onDone();
    }
  };

  if (quota.status === "PAID" || quota.status === "WAIVED") {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-zinc-600">
          {quota.status === "PAID"
            ? quota.paid_at
              ? new Date(quota.paid_at).toLocaleDateString("pt-PT")
              : "Pago"
            : "Isento"}
        </span>
        <a
          href={`/api/documents/export/quota-receipt/${quota.id}`}
          download
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          aria-label="Descarregar recibo"
        >
          <FileDown className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {quota.status === "PENDING" && (
          <button
            type="button"
            disabled={!!loading}
            onClick={() =>
              run(
                () => markQuotaOverdue(quota.id, buildingId),
                "overdue",
              )
            }
            className="rounded px-2 py-1 text-xs text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
          >
            {loading === "overdue" ? "…" : "Em Atraso"}
          </button>
        )}
        <button
          type="button"
          disabled={!!loading}
          onClick={() =>
            run(() => waiveQuota(quota.id, buildingId), "waive")
          }
          className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 disabled:opacity-40"
        >
          {loading === "waive" ? "…" : "Isentar"}
        </button>
        <a
          href={`/api/documents/export/quota-receipt/${quota.id}`}
          download
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          aria-label="Descarregar recibo"
        >
          <FileDown className="h-3.5 w-3.5" />
        </a>
      </div>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
