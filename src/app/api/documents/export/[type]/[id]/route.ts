import "server-only";

import { createElement } from "react";
import type { ReactElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";

import { getServerUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Input validation schemas
// ---------------------------------------------------------------------------

const paramsSchema = z.object({
  type: z.enum(["quota-receipt", "annual-budget", "expense-report"]),
  id: z.string().uuid("id must be a valid UUID"),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dateQuerySchema = z.object({
  from: z.string().regex(ISO_DATE, "from must be YYYY-MM-DD").optional(),
  to:   z.string().regex(ISO_DATE, "to must be YYYY-MM-DD").optional(),
});
import {
  QuotaReceiptDocument,
  type QuotaReceiptDocumentProps,
} from "@/lib/pdf/QuotaReceiptTemplate";
import {
  AnnualBudgetReportDocument,
  type AnnualBudgetDocumentProps,
} from "@/lib/pdf/AnnualBudgetReportTemplate";
import {
  ExpenseReportDocument,
  type ExpenseReportDocumentProps,
} from "@/lib/pdf/ExpenseReportTemplate";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/documents/export/[type]/[id]
//
// Supported types:
//   quota-receipt   — [id] = quota UUID  (any building member)
//   annual-budget   — [id] = budget UUID (GESTOR only)
//   expense-report  — [id] = building UUID, ?from=YYYY-MM-DD&to=YYYY-MM-DD (GESTOR only)
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
): Promise<NextResponse> {
  const rawParams = await params;
  const parsedParams = paramsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }
  const { type, id } = parsedParams.data;

  const { searchParams } = new URL(req.url);
  const parsedQuery = dateQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to:   searchParams.get("to")   ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  switch (type) {
    case "quota-receipt":
      return handleQuotaReceipt(user.id, id);
    case "annual-budget":
      return handleAnnualBudget(user.id, id);
    case "expense-report":
      return handleExpenseReport(req, user.id, id, parsedQuery.data);
    default:
      return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// quota-receipt handler
// ---------------------------------------------------------------------------

async function handleQuotaReceipt(
  userId: string,
  quotaId: string,
): Promise<NextResponse> {
  const admin = createServerSupabaseClient();

  type QuotaJoinRow = {
    id: string;
    unit_id: string;
    due_date: string;
    amount_cents: number;
    reserve_cents: number;
    status: string;
    paid_at: string | null;
    units: { id: string; identifier: string; floor: number; building_id: string };
  };

  const { data: quotaRow } = await admin
    .from("quotas")
    .select(
      "id, unit_id, due_date, amount_cents, reserve_cents, status, paid_at, units!inner(id, identifier, floor, building_id)",
    )
    .eq("id", quotaId)
    .single();

  if (!quotaRow) {
    return NextResponse.json({ error: "Quota not found" }, { status: 404 });
  }

  const quota = quotaRow as unknown as QuotaJoinRow;

  // Verify caller is a member of this building (any role).
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", quota.units.building_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: buildingRow }, { data: ownershipRow }] = await Promise.all([
    admin
      .from("buildings")
      .select("name, address, fiscal_number")
      .eq("id", quota.units.building_id)
      .single(),
    admin
      .from("unit_ownership")
      .select("owner_user_id")
      .eq("unit_id", quota.unit_id)
      .is("ended_at", null)
      .maybeSingle(),
  ]);

  if (!buildingRow) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const building = buildingRow as unknown as {
    name: string;
    address: string;
    fiscal_number: string;
  };

  let ownerName: string | null = null;
  if (ownershipRow) {
    const ownership = ownershipRow as unknown as { owner_user_id: string };
    const { data: profileRow } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", ownership.owner_user_id)
      .maybeSingle();
    if (profileRow) {
      ownerName =
        (profileRow as unknown as { full_name: string | null }).full_name;
    }
  }

  const props: QuotaReceiptDocumentProps = {
    building,
    unit: {
      identifier: quota.units.identifier,
      floor: quota.units.floor,
    },
    ownerName,
    quota: {
      due_date: quota.due_date,
      amount_cents: quota.amount_cents,
      reserve_cents: quota.reserve_cents,
      status: quota.status,
      paid_at: quota.paid_at,
    },
  };

  const element = createElement(
    QuotaReceiptDocument,
    props,
  ) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const parts = quota.due_date.split("-");
  const slug = quota.units.identifier.toLowerCase().replace(/\s+/g, "-");
  const filename = `recibo-quota-${slug}-${parts[0]}-${parts[1]}.pdf`;

  return pdfResponse(buffer, filename);
}

// ---------------------------------------------------------------------------
// annual-budget handler
// ---------------------------------------------------------------------------

async function handleAnnualBudget(
  userId: string,
  budgetId: string,
): Promise<NextResponse> {
  const admin = createServerSupabaseClient();

  type BudgetRow = {
    id: string;
    building_id: string;
    fiscal_year: number;
    total_amount_cents: number;
    reserve_amount_cents: number;
    status: string;
  };

  const { data: budgetRow } = await admin
    .from("budgets")
    .select(
      "id, building_id, fiscal_year, total_amount_cents, reserve_amount_cents, status",
    )
    .eq("id", budgetId)
    .single();

  if (!budgetRow) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  const budget = budgetRow as unknown as BudgetRow;

  // Verify GESTOR role.
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", budget.building_id)
    .eq("user_id", userId)
    .eq("role", "GESTOR")
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  type LineItemRow = {
    category: string;
    description: string | null;
    amount_cents: number;
  };

  const [{ data: buildingRow }, { data: lineItemRows }] = await Promise.all([
    admin
      .from("buildings")
      .select("name, address, fiscal_number")
      .eq("id", budget.building_id)
      .single(),
    admin
      .from("budget_line_items")
      .select("category, description, amount_cents")
      .eq("budget_id", budgetId)
      .order("category", { ascending: true }),
  ]);

  if (!buildingRow) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const building = buildingRow as unknown as {
    name: string;
    address: string;
    fiscal_number: string;
  };

  const props: AnnualBudgetDocumentProps = {
    building,
    fiscal_year: budget.fiscal_year,
    status: budget.status,
    total_amount_cents: budget.total_amount_cents,
    reserve_amount_cents: budget.reserve_amount_cents,
    line_items: (lineItemRows ?? []) as unknown as LineItemRow[],
  };

  const element = createElement(
    AnnualBudgetReportDocument,
    props,
  ) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const filename = `orcamento-${budget.fiscal_year}.pdf`;
  return pdfResponse(buffer, filename);
}

// ---------------------------------------------------------------------------
// expense-report handler
// ---------------------------------------------------------------------------

async function handleExpenseReport(
  _req: NextRequest,
  userId: string,
  buildingId: string,
  query: { from?: string | undefined; to?: string | undefined },
): Promise<NextResponse> {
  const admin = createServerSupabaseClient();

  // Verify GESTOR role.
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", buildingId)
    .eq("user_id", userId)
    .eq("role", "GESTOR")
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawFrom = query.from;
  const rawTo   = query.to;

  const currentYear = new Date().getFullYear();
  const dateFrom = rawFrom ?? `${currentYear}-01-01`;
  const dateTo = rawTo ?? `${currentYear}-12-31`;

  type ExpenseRow = {
    id: string;
    category: string;
    amount_cents: number;
    expense_date: string;
    description: string | null;
    status: string;
    suppliers: { name: string } | null;
  };

  const [{ data: buildingRow }, { data: expenseRows }] = await Promise.all([
    admin
      .from("buildings")
      .select("name, address, fiscal_number")
      .eq("id", buildingId)
      .single(),
    admin
      .from("expenses")
      .select(
        "id, category, amount_cents, expense_date, description, status, suppliers(name)",
      )
      .eq("building_id", buildingId)
      .gte("expense_date", dateFrom)
      .lte("expense_date", dateTo)
      .order("category", { ascending: true })
      .order("expense_date", { ascending: true }),
  ]);

  if (!buildingRow) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const building = buildingRow as unknown as {
    name: string;
    address: string;
    fiscal_number: string;
  };

  const expenses = (expenseRows ?? []) as unknown as ExpenseRow[];

  const props: ExpenseReportDocumentProps = {
    building,
    expenses: expenses.map((e) => ({
      id: e.id,
      supplier_name: e.suppliers?.name ?? "—",
      category: e.category,
      description: e.description,
      amount_cents: e.amount_cents,
      expense_date: e.expense_date,
      status: e.status,
    })),
    dateFrom: rawFrom ?? null,
    dateTo: rawTo ?? null,
  };

  const element = createElement(
    ExpenseReportDocument,
    props,
  ) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const filename = `despesas-${dateFrom}-a-${dateTo}.pdf`;
  return pdfResponse(buffer, filename);
}

// ---------------------------------------------------------------------------
// Shared response builder
// ---------------------------------------------------------------------------

function pdfResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
