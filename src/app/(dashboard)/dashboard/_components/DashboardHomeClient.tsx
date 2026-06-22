"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  PiggyBank,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  getGestorDashboardData,
  type GestorDashboardData,
} from "@/app/actions/analytics";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { QuotaStatusChart } from "@/components/charts/QuotaStatusChart";
import { ExpenseByCategoryChart } from "@/components/charts/ExpenseByCategoryChart";
import { Skeleton } from "@/components/ui/SkeletonCard";
import { useBuilding } from "@/contexts/BuildingContext";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

type KpiCardProps = {
  label:       string;
  value:       string;
  icon:        ReactNode;
  accent?:     string;
  sub?:        string;
};

function KpiCard({ label, value, icon, accent = "text-zinc-100", sub }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {label}
          </p>
          <p className={`mt-1.5 truncate text-2xl font-bold ${accent}`}>
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-zinc-500">{sub}</p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-zinc-800 p-2.5">{icon}</div>
      </div>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <Skeleton className="mb-2 h-3 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="mt-2 h-2 w-1/2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm ${className}`}>
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">
        {title}
      </p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / no-building state
// ---------------------------------------------------------------------------

function NoBuildingPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-24 text-center">
      <Building2 className="mb-4 h-10 w-10 text-zinc-600" />
      <p className="text-sm font-medium text-zinc-400">
        Nenhum edifício selecionado
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Selecione um edifício no painel lateral para ver o dashboard.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardHomeClient
// ---------------------------------------------------------------------------

export function DashboardHomeClient() {
  const { selectedBuilding, isLoading: buildingLoading } = useBuilding();
  const [data, setData]       = useState<GestorDashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) {
      setData(null);
      return;
    }
    setData(null);
    setLoading(true);
    void getGestorDashboardData(selectedBuilding.id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [selectedBuilding?.id]);

  const isLoading = buildingLoading || loading;

  // Today label — Portuguese locale
  const todayLabel = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6 p-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            {selectedBuilding?.name
              ? `${selectedBuilding.name} · ${todayLabel}`
              : todayLabel}
          </p>
        </div>
      </div>

      {buildingLoading ? null : !selectedBuilding ? (
        <NoBuildingPlaceholder />
      ) : (
        <>
          {/* ── KPI row ───────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
            ) : (
              <>
                <KpiCard
                  label="Receita MTD"
                  value={formatCurrency(data?.income_mtd_cents ?? 0)}
                  icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                  accent="text-emerald-400"
                  sub="Quotas pagas este mês"
                />
                <KpiCard
                  label="Despesas MTD"
                  value={formatCurrency(data?.expense_mtd_cents ?? 0)}
                  icon={<TrendingDown className="h-4 w-4 text-red-400" />}
                  accent="text-red-400"
                  sub="Despesas aprovadas este mês"
                />
                <KpiCard
                  label="Fundo de Reserva"
                  value={formatCurrency(data?.reserve_balance_cents ?? 0)}
                  icon={<PiggyBank className="h-4 w-4 text-indigo-400" />}
                  accent="text-indigo-400"
                  sub="Saldo acumulado"
                />
                <KpiCard
                  label="Incidentes Abertos"
                  value={String(data?.open_incidents_count ?? 0)}
                  icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
                  accent={
                    (data?.open_incidents_count ?? 0) > 0
                      ? "text-amber-400"
                      : "text-zinc-100"
                  }
                  sub="Excluindo resolvidos e encerrados"
                />
              </>
            )}
          </div>

          {/* ── Cash-flow chart ───────────────────────────────────────────── */}
          <SectionCard title="Fluxo de Caixa — 12 meses">
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <CashFlowChart data={data?.cash_flow ?? []} />
            )}
          </SectionCard>

          {/* ── Quota + Category grid ─────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Estado das Quotas — mês atual">
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <QuotaStatusChart
                  paid={data?.quota_status.paid ?? 0}
                  overdue={data?.quota_status.overdue ?? 0}
                  pending={data?.quota_status.pending ?? 0}
                  waived={data?.quota_status.waived ?? 0}
                  totalAmountCents={data?.quota_status.total_amount_cents ?? 0}
                />
              )}
            </SectionCard>

            <SectionCard title="Despesas por Categoria — 6 meses">
              {isLoading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : (
                <ExpenseByCategoryChart
                  data={data?.expense_by_category ?? []}
                />
              )}
            </SectionCard>
          </div>

          {/* ── Quick-access links ────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Gestão de Quotas",
                href:  "/dashboard/financials/quotas",
                icon:  <Wallet className="h-4 w-4 text-indigo-400" />,
                desc:  "Gerar e gerir quotas mensais",
              },
              {
                label: "Despesas",
                href:  "/dashboard/expenses",
                icon:  <ReceiptText className="h-4 w-4 text-amber-400" />,
                desc:  "Registar e aprovar despesas",
              },
              {
                label: "Incidentes",
                href:  "/dashboard/incidents",
                icon:  <AlertTriangle className="h-4 w-4 text-red-400" />,
                desc:  "Acompanhar ocorrências e manutenção",
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/60"
              >
                <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800 p-2">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1 text-sm font-medium text-zinc-200 group-hover:text-zinc-100">
                    {item.label}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{item.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
