"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import type { ExpenseCategory } from "@/lib/expenses/categories";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ExpenseStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "RECONCILED";

export type { ExpenseCategory } from "@/lib/expenses/categories";

export type ActiveSupplier = {
  id: string;
  name: string;
  service_type: string;
};

export type Expense = {
  id: string;
  building_id: string;
  document_id: string | null;
  supplier_id: string;
  supplier_name: string;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string;
  description: string | null;
  status: ExpenseStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CATEGORY_ENUM = [
  "MAINTENANCE",
  "WATER",
  "ELECTRICITY",
  "INSURANCE",
  "CLEANING",
  "ELEVATOR",
  "ADMINISTRATIVE",
  "OTHER",
] as const;

const createExpenseSchema = z.object({
  buildingId: z.string().uuid(),
  supplierId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  category: z.enum(CATEGORY_ENUM),
  amountCents: z.number().int().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(1000).optional(),
});

const idSchema = z.object({
  expenseId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// getActiveSuppliers — read
// ---------------------------------------------------------------------------

export async function getActiveSuppliers(
  buildingId: string,
): Promise<ActiveSupplier[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("suppliers")
    .select("id, name, service_type")
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("name");

  if (error || !data) return [];
  return data as unknown as ActiveSupplier[];
}

// ---------------------------------------------------------------------------
// getExpenses — read
// ---------------------------------------------------------------------------

export async function getExpenses(buildingId: string): Promise<Expense[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("expenses")
    .select(
      "id, building_id, document_id, supplier_id, category, amount_cents, expense_date, description, status, approved_by, approved_at, created_at, suppliers(name)",
    )
    .eq("building_id", buildingId)
    .order("expense_date", { ascending: false });

  if (error || !data) return [];

  type RawRow = {
    id: string;
    building_id: string;
    document_id: string | null;
    supplier_id: string;
    category: ExpenseCategory;
    amount_cents: number;
    expense_date: string;
    description: string | null;
    status: ExpenseStatus;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    suppliers: { name: string } | null;
  };

  return (data as unknown as RawRow[]).map((row) => ({
    id: row.id,
    building_id: row.building_id,
    document_id: row.document_id,
    supplier_id: row.supplier_id,
    supplier_name: row.suppliers?.name ?? "—",
    category: row.category,
    amount_cents: row.amount_cents,
    expense_date: row.expense_date,
    description: row.description,
    status: row.status,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    created_at: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------

export async function createExpense(
  buildingId: string,
  supplierId: string,
  category: ExpenseCategory,
  amountCents: number,
  expenseDate: string,
  description?: string,
  documentId?: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = createExpenseSchema.safeParse({
    buildingId,
    supplierId,
    documentId,
    category,
    amountCents,
    expenseDate,
    description,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Cross-tenant guard: confirm supplier belongs to this building.
  const { data: supplierRow } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .maybeSingle();

  if (!supplierRow) {
    return { error: "Fornecedor não encontrado ou inativo." };
  }

  const { data: row, error } = await admin
    .from("expenses")
    .insert({
      building_id: buildingId,
      supplier_id: supplierId,
      document_id: documentId ?? null,
      category,
      amount_cents: amountCents,
      expense_date: expenseDate,
      description: description ?? null,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error || !row) return { error: "Erro ao criar despesa." };

  const expense = row as unknown as { id: string };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "create_expense",
    target_table: "expenses",
    target_id: expense.id,
    after_snapshot: { supplier_id: supplierId, category, amount_cents: amountCents, expense_date: expenseDate, status: "DRAFT" },
  });

  revalidatePath("/dashboard/expenses");
  return { success: true, id: expense.id };
}

// ---------------------------------------------------------------------------
// submitExpenseForApproval — DRAFT → AWAITING_APPROVAL
// ---------------------------------------------------------------------------

export async function submitExpenseForApproval(
  expenseId: string,
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

  const parsed = idSchema.safeParse({ expenseId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: row } = await admin
    .from("expenses")
    .select("id, status")
    .eq("id", expenseId)
    .eq("building_id", buildingId)
    .single();

  if (!row) return { error: "Despesa não encontrada." };

  const expense = row as unknown as { id: string; status: ExpenseStatus };

  if (expense.status !== "DRAFT") {
    return { error: "Apenas despesas em Rascunho podem ser submetidas." };
  }

  const { error: updateError } = await admin
    .from("expenses")
    .update({ status: "AWAITING_APPROVAL" })
    .eq("id", expenseId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao submeter despesa." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "submit_expense_for_approval",
    target_table: "expenses",
    target_id: expenseId,
    before_snapshot: { status: "DRAFT" },
    after_snapshot: { status: "AWAITING_APPROVAL" },
  });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}

// ---------------------------------------------------------------------------
// approveExpense — AWAITING_APPROVAL → APPROVED
// ---------------------------------------------------------------------------

export async function approveExpense(
  expenseId: string,
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

  const parsed = idSchema.safeParse({ expenseId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: row } = await admin
    .from("expenses")
    .select("id, status")
    .eq("id", expenseId)
    .eq("building_id", buildingId)
    .single();

  if (!row) return { error: "Despesa não encontrada." };

  const expense = row as unknown as { id: string; status: ExpenseStatus };

  if (expense.status !== "AWAITING_APPROVAL") {
    return { error: "Apenas despesas em 'Aguarda Aprovação' podem ser aprovadas." };
  }

  const approvedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("expenses")
    .update({ status: "APPROVED", approved_by: session.user.id, approved_at: approvedAt })
    .eq("id", expenseId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao aprovar despesa." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "approve_expense",
    target_table: "expenses",
    target_id: expenseId,
    before_snapshot: { status: "AWAITING_APPROVAL" },
    after_snapshot: { status: "APPROVED", approved_by: session.user.id, approved_at: approvedAt },
  });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}
