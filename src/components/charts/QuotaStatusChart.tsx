"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatCurrency } from "@/lib/utils/currency";

// Design system colors matching StatusBadge
const COLORS = {
  PAID: "#10b981",    // emerald-500
  OVERDUE: "#ef4444", // red-500
  PENDING: "#f59e0b", // amber-500
  WAIVED: "#71717a",  // zinc-500
} as const;

const STATUS_LABELS: Record<string, string> = {
  PAID: "Pagas",
  OVERDUE: "Em Atraso",
  PENDING: "Pendentes",
  WAIVED: "Isentas",
};

type Props = {
  paid: number;
  overdue: number;
  pending: number;
  waived?: number;
  /** Optional: total amount in cents for chart tooltip */
  totalAmountCents?: number;
};

type ChartEntry = {
  name: string;
  value: number;
  color: string;
};

type TooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number }[];
};

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (!entry) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-zinc-200">{entry.name}</p>
      <p className="mt-0.5 text-zinc-400">
        {entry.value} quota{entry.value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function QuotaStatusChart({
  paid,
  overdue,
  pending,
  waived = 0,
  totalAmountCents,
}: Props) {
  const total = paid + overdue + pending + waived;

  const data: ChartEntry[] = [
    { name: STATUS_LABELS["PAID"] ?? "Pagas", value: paid, color: COLORS.PAID },
    { name: STATUS_LABELS["OVERDUE"] ?? "Em Atraso", value: overdue, color: COLORS.OVERDUE },
    { name: STATUS_LABELS["PENDING"] ?? "Pendentes", value: pending, color: COLORS.PENDING },
    { name: STATUS_LABELS["WAIVED"] ?? "Isentas", value: waived, color: COLORS.WAIVED },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
        <p className="text-sm text-zinc-500">Sem quotas geradas</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Estado das quotas
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Donut chart with centre label */}
        <div className="relative h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centre label — absolute overlay */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-zinc-100">{total}</span>
            <span className="text-[10px] text-zinc-500">unidades</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 sm:flex-col">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-zinc-400">
                {entry.name}{" "}
                <span className="font-medium text-zinc-200">{entry.value}</span>
              </span>
            </div>
          ))}
          {totalAmountCents !== undefined && (
            <div className="mt-1 border-t border-zinc-800 pt-2">
              <p className="text-xs text-zinc-500">
                Total{" "}
                <span className="font-medium text-zinc-200">
                  {formatCurrency(totalAmountCents)}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
