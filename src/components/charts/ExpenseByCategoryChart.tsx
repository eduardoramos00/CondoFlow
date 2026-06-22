"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/utils/currency";

/** Matches public.budget_category_enum from migration 003 */
const CATEGORY_LABELS: Record<string, string> = {
  MAINTENANCE:    "Manutenção",
  WATER:          "Água",
  ELECTRICITY:    "Eletricidade",
  INSURANCE:      "Seguros",
  CLEANING:       "Limpeza",
  ELEVATOR:       "Elevador",
  ADMINISTRATIVE: "Administrativo",
  OTHER:          "Outros",
};

/** Distinct indigo-to-zinc palette — avoids confusion with status colors */
const CATEGORY_COLORS: Record<string, string> = {
  MAINTENANCE:    "#6366f1", // indigo-500
  WATER:          "#38bdf8", // sky-400
  ELECTRICITY:    "#facc15", // yellow-400
  INSURANCE:      "#a78bfa", // violet-400
  CLEANING:       "#34d399", // emerald-400
  ELEVATOR:       "#fb923c", // orange-400
  ADMINISTRATIVE: "#94a3b8", // slate-400
  OTHER:          "#71717a", // zinc-500
};

const DEFAULT_COLOR = "#52525b"; // zinc-600 fallback

export type CategoryExpense = {
  category: string;
  amount_cents: number;
};

type Props = {
  data: CategoryExpense[];
  height?: number;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: { value: number; payload: CategoryExpense }[];
};

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (!entry) return null;
  const label = CATEGORY_LABELS[entry.payload.category] ?? entry.payload.category;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-zinc-200">{label}</p>
      <p className="mt-0.5 text-zinc-400">
        {formatCurrency(entry.value)}
      </p>
    </div>
  );
}

function XAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
}) {
  if (x === undefined || y === undefined || !payload) return null;
  return (
    <text x={x} y={y} dy={4} textAnchor="middle" fill="#71717a" fontSize={11}>
      {formatCurrency(payload.value)}
    </text>
  );
}

function YAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  if (x === undefined || y === undefined || !payload) return null;
  const label = CATEGORY_LABELS[payload.value] ?? payload.value;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#a1a1aa" fontSize={11}>
      {label}
    </text>
  );
}

export function ExpenseByCategoryChart({ data, height = 320 }: Props) {
  const sorted = [...data].sort((a, b) => b.amount_cents - a.amount_cents);

  if (!sorted.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900"
      >
        <p className="text-sm text-zinc-500">Sem despesas no período</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* layout="vertical" = horizontal bars (categories on Y-axis, values on X-axis) */}
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        barSize={14}
      >
        <XAxis
          type="number"
          tick={<XAxisTick />}
          axisLine={false}
          tickLine={false}
          tickCount={5}
        />

        <YAxis
          type="category"
          dataKey="category"
          tick={<YAxisTick />}
          axisLine={false}
          tickLine={false}
          width={100}
        />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "#27272a" }}
        />

        <Bar dataKey="amount_cents" name="Despesa" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, index) => (
            <Cell
              key={index}
              fill={CATEGORY_COLORS[entry.category] ?? DEFAULT_COLOR}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
