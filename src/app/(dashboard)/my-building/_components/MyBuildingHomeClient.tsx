"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CreditCard,
  MapPin,
  Receipt,
  Wrench,
} from "lucide-react";

import { getBuildingStats, type BuildingStats } from "@/app/actions/analytics";
import { getMyQuotas, type MyQuota } from "@/app/actions/quotas";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/SkeletonCard";
import { useBuilding } from "@/contexts/BuildingContext";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PT_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

function formatDueDate(iso: string): string {
  const [year, month] = iso.split("-");
  if (!month || !year) return iso;
  const m = parseInt(month, 10);
  return `${PT_MONTHS[m - 1] ?? month} ${year}`;
}

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  ORDINÁRIA:      "Assembleia Ordinária",
  EXTRAORDINÁRIA: "Assembleia Extraordinária",
};

const ASSEMBLY_STATUS_LABELS: Record<string, string> = {
  PUBLISHED:   "Publicada",
  IN_PROGRESS: "A Decorrer",
};

// ---------------------------------------------------------------------------
// Balance card
// ---------------------------------------------------------------------------

function BalanceCard({
  label,
  amountCents,
  icon,
  accent,
}: {
  label:       string;
  amountCents: number;
  icon:        React.ReactNode;
  accent:      string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800 p-2">{icon}</div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {label}
          </p>
          <p className={`mt-1 text-2xl font-bold ${accent}`}>
            {formatCurrency(amountCents)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming assembly card
// ---------------------------------------------------------------------------

function UpcomingAssemblyCard({
  assembly,
}: {
  assembly: BuildingStats["upcoming_assembly"];
}) {
  if (!assembly) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-500">
        <CalendarCheck className="h-5 w-5 shrink-0 text-zinc-600" />
        <span>Sem assembleias agendadas</span>
      </div>
    );
  }

  const scheduledDate = new Date(assembly.scheduled_at);
  const dateLabel = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric", month: "long", year: "numeric",
  }).format(scheduledDate);
  const timeLabel = new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit", minute: "2-digit",
  }).format(scheduledDate);

  return (
    <Link
      href={`/dashboard/assemblies/${assembly.id}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-lg bg-indigo-500/10 p-2">
            <CalendarCheck className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100">
              {ASSEMBLY_TYPE_LABELS[assembly.type] ?? assembly.type}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {dateLabel} às {timeLabel}
            </p>
            {assembly.location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                {assembly.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={assembly.status} />
          <ArrowRight className="h-4 w-4 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// MyBuildingHomeClient
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

export function MyBuildingHomeClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [stats, setStats]   = useState<BuildingStats | null>(null);
  const [quotas, setQuotas] = useState<MyQuota[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) {
      setStats(null);
      setQuotas(null);
      return;
    }
    setStats(null);
    setQuotas(null);
    setLoading(true);
    void Promise.all([
      getBuildingStats(selectedBuilding.id),
      getMyQuotas(CURRENT_YEAR),
    ])
      .then(([s, q]) => {
        setStats(s);
        // Filter quotas to this building only (user may own units in multiple buildings)
        setQuotas(q.filter((quota) => quota.building_id === selectedBuilding.id));
      })
      .finally(() => setLoading(false));
  }, [selectedBuilding?.id]);

  const isLoading = buildingLoading || loading;

  // Derived balance figures from current building's quotas
  const outstandingCents = (quotas ?? [])
    .filter((q) => q.status === "PENDING" || q.status === "OVERDUE")
    .reduce((s, q) => s + q.amount_cents + q.reserve_cents, 0);

  const paidYtdCents = (quotas ?? [])
    .filter((q) => q.status === "PAID")
    .reduce((s, q) => s + q.amount_cents + q.reserve_cents, 0);

  // Five most recent quotas (newest first)
  const recentQuotas = [...(quotas ?? [])]
    .sort((a, b) => b.due_date.localeCompare(a.due_date))
    .slice(0, 5);

  return (
    <div className="space-y-6 p-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">
          O Meu Condomínio
        </h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          {selectedBuilding?.name ?? "Selecione um edifício para começar"}
        </p>
      </div>

      {buildingLoading ? null : !selectedBuilding ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-24 text-center">
          <Building2 className="mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            Nenhum edifício selecionado
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Selecione um edifício no painel lateral.
          </p>
        </div>
      ) : (
        <>
          {/* ── Balance cards ─────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            {isLoading ? (
              <>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
                  <Skeleton className="mb-2 h-3 w-1/3" />
                  <Skeleton className="h-7 w-2/3" />
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
                  <Skeleton className="mb-2 h-3 w-1/3" />
                  <Skeleton className="h-7 w-2/3" />
                </div>
              </>
            ) : (
              <>
                <BalanceCard
                  label="Em Dívida"
                  amountCents={outstandingCents}
                  icon={<CreditCard className="h-4 w-4 text-amber-400" />}
                  accent={outstandingCents > 0 ? "text-amber-400" : "text-zinc-100"}
                />
                <BalanceCard
                  label={`Pago em ${CURRENT_YEAR}`}
                  amountCents={paidYtdCents}
                  icon={<Receipt className="h-4 w-4 text-emerald-400" />}
                  accent="text-emerald-400"
                />
              </>
            )}
          </div>

          {/* ── Stats row (incidents + assemblies) ─────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Open incidents */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Incidentes Abertos
                </p>
                <Link
                  href="/my-building/incidents"
                  className="flex items-center gap-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  Ver todos
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {isLoading ? (
                <Skeleton className="h-12 w-1/3" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
                    <Wrench className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-zinc-100">
                      {stats?.open_incidents_count ?? 0}
                    </p>
                    <p className="text-xs text-zinc-500">
                      ocorrência{stats?.open_incidents_count !== 1 ? "s" : ""} em aberto
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Upcoming assembly */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Próxima Assembleia
                </p>
                <Link
                  href="/dashboard/assemblies"
                  className="flex items-center gap-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  Ver todas
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <UpcomingAssemblyCard
                  assembly={stats?.upcoming_assembly ?? null}
                />
              )}
            </div>
          </div>

          {/* ── Recent quotas ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Quotas Recentes — {CURRENT_YEAR}
              </p>
              <Link
                href="/my-building/payments"
                className="flex items-center gap-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Ver histórico completo
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {isLoading ? (
              <div className="divide-y divide-zinc-800/60 px-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-3.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentQuotas.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Receipt className="mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-500">Sem quotas em {CURRENT_YEAR}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/50">
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Período
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Total
                      </th>
                      <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Estado
                      </th>
                      <th className="hidden px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 sm:table-cell">
                        Pago em
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {recentQuotas.map((q) => (
                      <tr
                        key={q.id}
                        className="transition-colors hover:bg-zinc-800/30"
                      >
                        <td className="px-5 py-3 font-medium text-zinc-300">
                          {formatDueDate(q.due_date)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-zinc-200">
                          {formatCurrency(q.amount_cents + q.reserve_cents)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <StatusBadge status={q.status} />
                        </td>
                        <td className="hidden px-5 py-3 text-right text-xs text-zinc-500 sm:table-cell">
                          {q.paid_at
                            ? new Date(q.paid_at).toLocaleDateString("pt-PT")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
