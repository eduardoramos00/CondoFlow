"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CreditCard, Loader2, Receipt } from "lucide-react";

import { getMyQuotas, type MyQuota } from "@/app/actions/quotas";
import { formatCurrency } from "@/lib/utils/currency";
import { StatusBadge } from "@/components/ui/StatusBadge";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i);

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatDueDate(iso: string): string {
  const [year, month] = iso.split("-");
  if (!month || !year) return iso;
  const m = parseInt(month, 10);
  return `${MONTH_NAMES[m - 1] ?? month} ${year}`;
}

type GroupedQuotas = Map<string, MyQuota[]>;

function groupByBuilding(quotas: MyQuota[]): GroupedQuotas {
  const map: GroupedQuotas = new Map();
  for (const q of quotas) {
    const key = q.building_id;
    const existing = map.get(key);
    if (existing) {
      existing.push(q);
    } else {
      map.set(key, [q]);
    }
  }
  return map;
}

export function PaymentsPageClient() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quotas, setQuotas] = useState<MyQuota[] | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);

  const inputBase =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  useEffect(() => {
    setQuotas(undefined);
    setIsFetching(true);
    void getMyQuotas(year)
      .then((data) => setQuotas(data))
      .finally(() => setIsFetching(false));
  }, [year]);

  const grouped = groupByBuilding(quotas ?? []);

  const totalOwed = (quotas ?? [])
    .filter((q) => q.status === "PENDING" || q.status === "OVERDUE")
    .reduce((s, q) => s + q.amount_cents + q.reserve_cents, 0);

  const totalPaid = (quotas ?? [])
    .filter((q) => q.status === "PAID")
    .reduce((s, q) => s + q.amount_cents + q.reserve_cents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Os Meus Pagamentos
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Histórico de quotas do ano selecionado
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-500" />
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
        </div>
      </div>

      {isFetching || quotas === undefined ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>A carregar pagamentos…</span>
        </div>
      ) : (quotas ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
          <Receipt className="mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            Sem quotas em {year}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Contacte o seu gestor de condomínio para mais informações.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              label="Em dívida"
              amountCents={totalOwed}
              accent="text-amber-400"
              icon={<CreditCard className="h-4 w-4 text-amber-500" />}
            />
            <SummaryCard
              label="Pago este ano"
              amountCents={totalPaid}
              accent="text-emerald-400"
              icon={<Receipt className="h-4 w-4 text-emerald-500" />}
            />
          </div>

          {/* Per-building tables */}
          {[...grouped.entries()].map(([buildingId, bQuotas]) => {
            const buildingName = bQuotas[0]?.building_name ?? buildingId;
            return (
              <div
                key={buildingId}
                className="rounded-xl border border-zinc-800 bg-zinc-900"
              >
                <div className="border-b border-zinc-800 px-4 py-3">
                  <p className="text-sm font-semibold text-zinc-200">
                    {buildingName}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {bQuotas[0]?.unit_identifier ?? ""} &middot;{" "}
                    {bQuotas.length} quota{bQuotas.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800/50">
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Período
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Quota
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Fundo Reserva
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Total
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Data de pagamento
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {bQuotas
                        .sort((a, b) => a.due_date.localeCompare(b.due_date))
                        .map((quota) => (
                          <tr
                            key={quota.id}
                            className="transition-colors hover:bg-zinc-800/30"
                          >
                            <td className="px-4 py-3 text-zinc-300">
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
                            <td className="px-4 py-3 text-right text-xs text-zinc-500">
                              {quota.paid_at
                                ? new Date(quota.paid_at).toLocaleDateString(
                                    "pt-PT",
                                  )
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryCard — small stat card
// ---------------------------------------------------------------------------

type SummaryCardProps = {
  label: string;
  amountCents: number;
  accent: string;
  icon: React.ReactNode;
};

function SummaryCard({ label, amountCents, accent, icon }: SummaryCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={`mt-0.5 text-xl font-bold ${accent}`}>
          {formatCurrency(amountCents)}
        </p>
      </div>
    </div>
  );
}
