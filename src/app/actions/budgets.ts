"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type BudgetCategory =
  | "MAINTENANCE"
  | "WATER"
  | "ELECTRICITY"
  | "INSURANCE"
  | "CLEANING"
  | "ELEVATOR"
  | "ADMINISTRATIVE"
  | "OTHER";

export type BudgetStatus = "DRAFT" | "APPROVED";

export type Budget = {
  id: string;
  building_id: string;
  fiscal_year: number;
  total_amount_cents: number;
  reserve_amount_cents: number;
  status: BudgetStatus;
  created_by: string;
  created_at: string;
};

export type BudgetLineItem = {
  id: string;
  budget_id: string;
  category: BudgetCategory;
  amount_cents: number;
  description: string | null;
};

export type BudgetWithLineItems = Budget & {
  line_items: BudgetLineItem[];
};

// ---------------------------------------------------------------------------
// Validation schemas (server-side — callers cannot bypass these)
// ---------------------------------------------------------------------------

const createBudgetSchema = z.object({
  buildingId: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  totalAmountCents: z.number().int().positive(),
  reserveAmountCents: z.number().int().min(0),
});

const approveBudgetSchema = z.object({
  budgetId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

const addLineItemSchema = z.object({
  budgetId: z.string().uuid(),
  buildingId: z.string().uuid(),
  category: z.enum([
    "MAINTENANCE",
    "WATER",
    "ELECTRICITY",
    "INSURANCE",
    "CLEANING",
    "ELEVATOR",
    "ADMINISTRATIVE",
    "OTHER",
  ]),
  amountCents: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// getBudgetForYear — read
// Accessible to GESTOR and CONDÓMINO; RLS enforced at DB level.
// Uses service-role client for reliability; auth is verified before the query.
// ---------------------------------------------------------------------------

export async function getBudgetForYear(
  buildingId: string,
  year: number,
): Promise<BudgetWithLineItems | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  const { data: budgetRow } = await admin
    .from("budgets")
    .select(
      "id, building_id, fiscal_year, total_amount_cents, reserve_amount_cents, status, created_by, created_at",
    )
    .eq("building_id", buildingId)
    .eq("fiscal_year", year)
    .maybeSingle();

  if (!budgetRow) return null;

  const budget = budgetRow as unknown as Budget;

  const { data: itemRows } = await admin
    .from("budget_line_items")
    .select("id, budget_id, category, amount_cents, description")
    .eq("budget_id", budget.id);

  return {
    ...budget,
    line_items: (itemRows ?? []) as unknown as BudgetLineItem[],
  };
}

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------

export async function createBudget(
  buildingId: string,
  fiscalYear: number,
  totalAmountCents: number,
  reserveAmountCents: number,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = createBudgetSchema.safeParse({
    buildingId,
    fiscalYear,
    totalAmountCents,
    reserveAmountCents,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  if (reserveAmountCents > totalAmountCents) {
    return {
      error: "O fundo de reserva não pode exceder o total do orçamento.",
    };
  }

  const admin = createServerSupabaseClient();

  const { data: row, error } = await admin
    .from("budgets")
    .insert({
      building_id: buildingId,
      fiscal_year: fiscalYear,
      total_amount_cents: totalAmountCents,
      reserve_amount_cents: reserveAmountCents,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um orçamento para este ano fiscal." };
    }
    return { error: "Erro ao criar orçamento." };
  }

  const created = row as unknown as { id: string };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "create_budget",
    target_table: "budgets",
    target_id: created.id,
    after_snapshot: {
      fiscal_year: fiscalYear,
      total_amount_cents: totalAmountCents,
      reserve_amount_cents: reserveAmountCents,
      status: "DRAFT",
    },
  });

  revalidatePath("/dashboard/financials/budget");
  return { success: true, id: created.id };
}

// ---------------------------------------------------------------------------
// approveBudget
// ---------------------------------------------------------------------------

export async function approveBudget(
  budgetId: string,
  buildingId: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = approveBudgetSchema.safeParse({ budgetId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Fetch the budget — building_id equality prevents cross-tenant approval.
  const { data: row, error: fetchError } = await admin
    .from("budgets")
    .select(
      "id, total_amount_cents, reserve_amount_cents, status, building_id",
    )
    .eq("id", budgetId)
    .eq("building_id", buildingId)
    .single();

  if (fetchError || !row) return { error: "Orçamento não encontrado." };

  const budget = row as unknown as Budget;

  if (budget.status === "APPROVED") {
    return { error: "O orçamento já está aprovado." };
  }

  // 10% reserve floor — integer arithmetic, no floats.
  // reserve * 10 >= total  ⟺  reserve >= total / 10  (avoids division)
  if (budget.reserve_amount_cents * 10 < budget.total_amount_cents) {
    return {
      error:
        "O fundo de reserva é inferior ao mínimo legal de 10% do total orçamentado. Atualize o orçamento antes de aprovar.",
    };
  }

  const { error: updateError } = await admin
    .from("budgets")
    .update({ status: "APPROVED" })
    .eq("id", budgetId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao aprovar orçamento." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "approve_budget",
    target_table: "budgets",
    target_id: budgetId,
    before_snapshot: { status: "DRAFT" },
    after_snapshot: { status: "APPROVED" },
  });

  revalidatePath("/dashboard/financials/budget");
  return { success: true };
}

// ---------------------------------------------------------------------------
// addLineItem
// ---------------------------------------------------------------------------

export async function addLineItem(
  budgetId: string,
  buildingId: string,
  category: BudgetCategory,
  amountCents: number,
  description?: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = addLineItemSchema.safeParse({
    budgetId,
    buildingId,
    category,
    amountCents,
    description,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Cross-tenant guard: confirm this budget belongs to the claimed building.
  const { data: budgetRow, error: fetchError } = await admin
    .from("budgets")
    .select("id, status, building_id")
    .eq("id", budgetId)
    .eq("building_id", buildingId)
    .single();

  if (fetchError || !budgetRow) return { error: "Orçamento não encontrado." };

  const b = budgetRow as unknown as Pick<Budget, "id" | "status" | "building_id">;

  if (b.status === "APPROVED") {
    return {
      error: "Não é possível adicionar itens a um orçamento aprovado.",
    };
  }

  const { data: itemRow, error } = await admin
    .from("budget_line_items")
    .insert({
      budget_id: budgetId,
      category: parsed.data.category,
      amount_cents: amountCents,
      description: description ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: "Erro ao adicionar item." };

  const item = itemRow as unknown as { id: string };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "add_budget_line_item",
    target_table: "budget_line_items",
    target_id: item.id,
    after_snapshot: {
      budget_id: budgetId,
      category,
      amount_cents: amountCents,
    },
  });

  revalidatePath("/dashboard/financials/budget");
  return { success: true, id: item.id };
}
