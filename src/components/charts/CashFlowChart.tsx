"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/utils/currency";

export type CashFlowDataPoint = {
  /** Pre-formatted label for the X-axis tick, e.g. "Jan 26" */
  month: string;
  income_cents: number;
  expense_cents: number;
};

type Props = {
  data: CashFlowDataPoint[];
  height?: number;
};

type CustomTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number; color: string }[];
};

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-zinc-300">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-200">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function YAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (x === undefined || y === undefined || !payload) return null;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#71717a" fontSize={11}>
      {formatCurrency(payload.value)}
    </text>
  );
}

export function CashFlowChart({ data, height = 280 }: Props) {
  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900"
      >
        <p className="text-sm text-zinc-500">Sem dados financeiros</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 16 }}>
        <defs>
          {/* Indigo gradient for income area */}
          <linearGradient id="indigoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          {/* Red gradient for expense area */}
          <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#27272a"
          vertical={false}
        />

        <XAxis
          dataKey="month"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />

        <YAxis
          tick={<YAxisTick />}
          axisLine={false}
          tickLine={false}
          width={80}
        />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: "#3f3f46", strokeWidth: 1 }}
        />

        <Area
          type="monotone"
          dataKey="income_cents"
          name="Receita"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#indigoGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
        />

        <Area
          type="monotone"
          dataKey="expense_cents"
          name="Despesas"
          stroke="#f87171"
          strokeWidth={2}
          fill="url(#redGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#f87171", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
