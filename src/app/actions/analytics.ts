"use server";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, getUserRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CashFlowDataPoint } from "@/components/charts/CashFlowChart";
import type { CategoryExpense } from "@/components/charts/ExpenseByCategoryChart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PT_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

function monthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Shifts a date N months forward/backward (always lands on the 1st). */
function shiftMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(1);
  result.setMonth(result.getMonth() + n);
  return result;
}

/** Formats a "YYYY-MM-DD" (or "YYYY-MM-01") month string → "Jan 26" */
function formatMonthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  const m = parseInt(month ?? "1", 10);
  return `${PT_MONTHS[m - 1] ?? month} ${(year ?? "").slice(2)}`;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type GestorDashboardData = {
  income_mtd_cents:      number;
  expense_mtd_cents:     number;
  reserve_balance_cents: number;
  open_incidents_count:  number;
  cash_flow:             CashFlowDataPoint[];
  quota_status: {
    paid:              number;
    overdue:           number;
    pending:           number;
    waived:            number;
    total_amount_cents: number;
  };
  expense_by_category: CategoryExpense[];
};

export type UpcomingAssembly = {
  id:           string;
  type:         string;
  status:       string;
  scheduled_at: string;
  location:     string | null;
};

export type BuildingStats = {
  open_incidents_count: number;
  upcoming_assembly:    UpcomingAssembly | null;
};

// ---------------------------------------------------------------------------
// getGestorDashboardData — aggregated analytics for the Gestor home page
//
// Queries:
//   - financial_summary view  — 12-month rolling cash flow + MTD KPIs
//   - quotas                  — status breakdown for the current month
//   - expenses                — by-category totals over the last 6 months
//   - incidents               — count of open (non-terminal) incidents
//
// Requires: caller has GESTOR role for buildingId.
// ---------------------------------------------------------------------------

export async function getGestorDashboardData(
  buildingId: string,
): Promise<GestorDashboardData | null> {
  const session = await getServerSession();
  if (!session) return null;

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }

  const admin    = createServerSupabaseClient();
  const now      = new Date();
  const curStart = monthStart(now);
  const t12Start = monthStart(shiftMonths(now, -11)); // 12 months rolling
  const t6Start  = monthStart(shiftMonths(now, -5));  // 6 months rolling

  // Step 1 — unit IDs for the building (joins are cheaper via IN for quota query).
  const { data: unitRows } = await admin
    .from("units")
    .select("id")
    .eq("building_id", buildingId);

  const unitIds = (unitRows as unknown as { id: string }[] ?? []).map((u) => u.id);

  // Step 2 — parallel fetches.
  const [summaryRes, quotaRes, expenseRes, incidentRes] = await Promise.all([
    // financial_summary is a DB view (migration 008). Service-role client bypasses
    // RLS/INVOKER, so the building_id filter below is the sole scope guard.
    admin
      .from("financial_summary")
      .select("month, income_cents, expense_cents, reserve_balance_cents")
      .eq("building_id", buildingId)
      .gte("month", t12Start)
      .order("month", { ascending: true }),

    // Quota status breakdown for current month.
    unitIds.length > 0
      ? admin
          .from("quotas")
          .select("status, amount_cents, reserve_cents")
          .in("unit_id", unitIds)
          .eq("due_date", curStart)
      : Promise.resolve({ data: [] as unknown[], error: null }),

    // Expense totals by category for the last 6 months.
    admin
      .from("expenses")
      .select("category, amount_cents")
      .eq("building_id", buildingId)
      .in("status", ["APPROVED", "RECONCILED"])
      .gte("expense_date", t6Start),

    // Non-terminal incident count.
    admin
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .neq("status", "RESOLVED")
      .neq("status", "CLOSED"),
  ]);

  // ── Process financial summary ──────────────────────────────────────────────
  type SummaryRow = {
    month:                  string;
    income_cents:           number;
    expense_cents:          number;
    reserve_balance_cents:  number;
  };
  const summaryRows = (summaryRes.data ?? []) as unknown as SummaryRow[];

  const cashFlow: CashFlowDataPoint[] = summaryRows.map((r) => ({
    month:         formatMonthLabel(r.month),
    income_cents:  r.income_cents,
    expense_cents: r.expense_cents,
  }));

  const curRow  = summaryRows.find((r) => r.month === curStart);
  const lastRow = summaryRows.at(-1);

  // ── Process quota status ───────────────────────────────────────────────────
  type QuotaRow = { status: string; amount_cents: number; reserve_cents: number };
  const quotaRows = (quotaRes.data ?? []) as unknown as QuotaRow[];

  let paid = 0, overdue = 0, pending = 0, waived = 0, total_amount_cents = 0;
  for (const r of quotaRows) {
    total_amount_cents += r.amount_cents + r.reserve_cents;
    if      (r.status === "PAID")    paid++;
    else if (r.status === "OVERDUE") overdue++;
    else if (r.status === "PENDING") pending++;
    else if (r.status === "WAIVED")  waived++;
  }

  // ── Process expense by category ────────────────────────────────────────────
  type ExpenseRow = { category: string; amount_cents: number };
  const expenseRows = (expenseRes.data ?? []) as unknown as ExpenseRow[];

  const catMap = new Map<string, number>();
  for (const r of expenseRows) {
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amount_cents);
  }
  const expense_by_category: CategoryExpense[] = [...catMap.entries()].map(
    ([category, amount_cents]) => ({ category, amount_cents }),
  );

  return {
    income_mtd_cents:      curRow?.income_cents           ?? 0,
    expense_mtd_cents:     curRow?.expense_cents          ?? 0,
    reserve_balance_cents: lastRow?.reserve_balance_cents ?? 0,
    open_incidents_count:  incidentRes.count              ?? 0,
    cash_flow:             cashFlow,
    quota_status:          { paid, overdue, pending, waived, total_amount_cents },
    expense_by_category,
  };
}

// ---------------------------------------------------------------------------
// getBuildingStats — lightweight stats for the Condómino home page
//
// Returns open incident count and the next upcoming assembly (PUBLISHED or
// IN_PROGRESS) for any authenticated building member (GESTOR or CONDÓMINO).
// ---------------------------------------------------------------------------

export async function getBuildingStats(
  buildingId: string,
): Promise<BuildingStats | null> {
  const session = await getServerSession();
  if (!session) return null;

  const role = await getUserRole(session.user.id, buildingId);
  if (!role) return null;

  const admin = createServerSupabaseClient();

  const [incidentRes, assemblyRes] = await Promise.all([
    admin
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .neq("status", "RESOLVED")
      .neq("status", "CLOSED"),

    admin
      .from("assemblies")
      .select("id, type, status, scheduled_at, location")
      .eq("building_id", buildingId)
      .in("status", ["PUBLISHED", "IN_PROGRESS"])
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  type AssemblyRow = {
    id:           string;
    type:         string;
    status:       string;
    scheduled_at: string;
    location:     string | null;
  };

  const assembly = assemblyRes.data as unknown as AssemblyRow | null;

  return {
    open_incidents_count: incidentRes.count ?? 0,
    upcoming_assembly:    assembly
      ? {
          id:           assembly.id,
          type:         assembly.type,
          status:       assembly.status,
          scheduled_at: assembly.scheduled_at,
          location:     assembly.location,
        }
      : null,
  };
}
