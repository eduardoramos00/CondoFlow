"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DoorOpen,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { PlatformStats } from "@/app/actions/admin";
import { formatCurrency } from "@/lib/utils/currency";

type KpiCardProps = {
  label: string;
  value: string;
  icon: ReactNode;
  sub?: string;
  accent?: string;
};

function KpiCard({ label, value, icon, sub, accent = "text-zinc-100" }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
          <p className={`mt-1.5 truncate text-2xl font-bold ${accent}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
        </div>
        <div className="shrink-0 rounded-lg bg-zinc-800 p-2.5">{icon}</div>
      </div>
    </div>
  );
}

function SlaGauge({ rate }: { rate: number }) {
  const color =
    rate >= 80 ? "text-emerald-400" : rate >= 60 ? "text-amber-400" : "text-red-400";
  const barColor =
    rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            SLA Incidentes
          </p>
          <p className={`mt-1.5 text-2xl font-bold ${color}`}>{rate}%</p>
          <p className="mt-1 text-xs text-zinc-500">resolvidos em ≤7 dias (últimos 90d)</p>
        </div>
        <div className="shrink-0 rounded-lg bg-zinc-800 p-2.5">
          <CheckCircle2 className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
}

export function AdminStatsClient({ stats }: { stats: PlatformStats }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Estatísticas da Plataforma</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Visão global em tempo real de todos os condomínios
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Total de Edifícios"
          value={String(stats.total_buildings)}
          icon={<Building2 className="h-5 w-5 text-zinc-400" />}
          sub="condomínios registados"
        />

        <KpiCard
          label="Total de Frações"
          value={String(stats.total_units)}
          icon={<DoorOpen className="h-5 w-5 text-zinc-400" />}
          sub="unidades em todos os edifícios"
        />

        <KpiCard
          label="MRR da Plataforma"
          value={formatCurrency(stats.platform_mrr_cents)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          sub="total de quotas geradas este mês"
          accent="text-emerald-400"
        />

        <KpiCard
          label="Dívida Total"
          value={formatCurrency(stats.total_outstanding_debt_cents)}
          icon={<TrendingDown className="h-5 w-5 text-red-400" />}
          sub="quotas pendentes + em atraso"
          accent={stats.total_outstanding_debt_cents > 0 ? "text-red-400" : "text-zinc-100"}
        />

        <KpiCard
          label="Incidentes Resolvidos"
          value={String(stats.sla_sample_size)}
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          sub={
            stats.sla_sample_size === 0
              ? "nenhum resolvido nos últimos 90 dias"
              : `amostra dos últimos 90 dias para cálculo do SLA`
          }
        />

        <SlaGauge rate={stats.sla_compliance_rate} />
      </div>

      {stats.sla_sample_size === 0 && (
        <p className="text-center text-sm text-zinc-600">
          Sem incidentes resolvidos nos últimos 90 dias — o SLA é reportado como 100%.
        </p>
      )}
    </div>
  );
}
