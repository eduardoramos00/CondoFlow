import { AlertTriangle, BarChart3, CheckCircle2, PiggyBank, Receipt } from "lucide-react";

import { formatCurrency } from "@/lib/utils/currency";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Props = {
  fiscalYear: number;
  status: "DRAFT" | "APPROVED";
  totalAmountCents: number;
  reserveAmountCents: number;
  lineItemsTotalCents: number;
};

// Display-only percentage — not used in financial arithmetic.
// Integer division: (reserve * 10_000 / total) gives basis points; divide by 100 → %.
function reservePercent(reserveCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  return Math.floor((reserveCents * 10_000) / totalCents) / 100;
}

function lineItemsPercent(itemsCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  return Math.floor((itemsCents * 10_000) / totalCents) / 100;
}

export function BudgetSummaryCard({
  fiscalYear,
  status,
  totalAmountCents,
  reserveAmountCents,
  lineItemsTotalCents,
}: Props) {
  // Integer compliance check — no floats: reserve * 10 >= total ⟺ reserve >= 10%
  const isReserveCompliant = reserveAmountCents * 10 >= totalAmountCents;
  const resPct = reservePercent(reserveAmountCents, totalAmountCents);
  const itemsPct = lineItemsPercent(lineItemsTotalCents, totalAmountCents);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Orçamento Anual
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">
            {fiscalYear}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {/* Total */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-indigo-500/10 p-2.5">
            <Receipt className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total orçamentado</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">
              {formatCurrency(totalAmountCents)}
            </p>
          </div>
        </div>

        {/* Reserve fund */}
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 rounded-lg p-2.5 ${isReserveCompliant ? "bg-emerald-500/10" : "bg-amber-500/10"}`}
          >
            <PiggyBank
              className={`h-4 w-4 ${isReserveCompliant ? "text-emerald-400" : "text-amber-400"}`}
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Fundo de reserva</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">
              {formatCurrency(reserveAmountCents)}
            </p>
            <div
              className={`mt-1 flex items-center gap-1 text-xs ${isReserveCompliant ? "text-emerald-400" : "text-amber-400"}`}
            >
              {isReserveCompliant ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0" />
              )}
              <span>
                {resPct}%{" "}
                {isReserveCompliant ? "(≥ 10% — conforme)" : "(< 10% — abaixo do mínimo legal)"}
              </span>
            </div>
          </div>
        </div>

        {/* Line items defined */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-zinc-800 p-2.5">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Itens definidos</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">
              {formatCurrency(lineItemsTotalCents)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{itemsPct}% do total</p>
          </div>
        </div>
      </div>
    </div>
  );
}
