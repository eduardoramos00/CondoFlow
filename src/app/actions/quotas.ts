"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateUnitQuota, calculateReserve } from "@/lib/finance/permilagem";
import { notifyQuotaOverdue } from "@/lib/notifications/triggers";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type QuotaStatus = "PENDING" | "PAID" | "OVERDUE" | "WAIVED";

export type QuotaWithUnit = {
  id: string;
  unit_id: string;
  unit_identifier: string;
  unit_floor: number;
  budget_id: string;
  due_date: string;
  amount_cents: number;
  reserve_cents: number;
  status: QuotaStatus;
  paid_at: string | null;
};

export type MyQuota = {
  id: string;
  unit_id: string;
  unit_identifier: string;
  building_id: string;
  building_name: string;
  due_date: string;
  amount_cents: number;
  reserve_cents: number;
  status: QuotaStatus;
  paid_at: string | null;
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  buildingId: z.string().uuid(),
  budgetId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const quotaIdSchema = z.object({
  quotaId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

const markPaidSchema = z.object({
  quotaId: z.string().uuid(),
  buildingId: z.string().uuid(),
  paymentMethod: z.string().min(1).max(50),
  reference: z.string().max(100).optional(),
});

const bulkMarkPaidSchema = z.object({
  quotaIds: z.array(z.string().uuid()).min(1).max(200),
  buildingId: z.string().uuid(),
  paymentMethod: z.string().min(1).max(50),
  reference: z.string().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Pads month to 2 digits for ISO date string construction.
function isoMonth(m: number): string {
  return String(m).padStart(2, "0");
}

// Returns the ISO date string for the first day of the next month.
function firstOfNextMonth(month: number, year: number): string {
  const next = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${isoMonth(next)}-01`;
}

// ---------------------------------------------------------------------------
// generateMonthlyQuotas
// ---------------------------------------------------------------------------

export async function generateMonthlyQuotas(
  buildingId: string,
  budgetId: string,
  month: number,
  year: number,
): Promise<
  | { error: string }
  | { success: true; generated: number; skipped: number }
> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = generateSchema.safeParse({ buildingId, budgetId, month, year });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Verify budget is APPROVED and belongs to this building (cross-tenant guard).
  const { data: budgetRow } = await admin
    .from("budgets")
    .select("id, total_amount_cents, reserve_amount_cents, status, building_id")
    .eq("id", budgetId)
    .eq("building_id", buildingId)
    .single();

  if (!budgetRow) return { error: "Orçamento não encontrado." };

  const budget = budgetRow as unknown as {
    id: string;
    total_amount_cents: number;
    reserve_amount_cents: number;
    status: string;
    building_id: string;
  };

  if (budget.status !== "APPROVED") {
    return { error: "O orçamento deve estar aprovado antes de gerar quotas." };
  }

  // Fetch all active units for the building.
  const { data: unitRows } = await admin
    .from("units")
    .select("id, identifier, floor, permilagem")
    .eq("building_id", buildingId);

  if (!unitRows || unitRows.length === 0) {
    return { error: "Nenhuma fração registada neste edifício." };
  }

  const units = unitRows as unknown as {
    id: string;
    identifier: string;
    floor: number;
    permilagem: number;
  }[];

  // Monthly budget amounts — integer division, remainder handled below.
  // Math.round follows the same pattern as calculateUnitQuota's / 10_000 division.
  const monthlyTotalCents = Math.round(budget.total_amount_cents / 12);
  const monthlyReserveCents = Math.round(budget.reserve_amount_cents / 12);

  // Calculate per-unit monthly amounts using the pure-integer permilagem engine.
  const amounts = units.map((u) =>
    calculateUnitQuota(monthlyTotalCents, u.permilagem),
  );
  const reserves = units.map((u) =>
    calculateReserve(monthlyReserveCents, u.permilagem),
  );

  // Assign any integer rounding remainder to the highest-permilagem unit,
  // ensuring the sum of all quotas equals monthlyTotalCents exactly.
  const totalCollected = amounts.reduce((s, a) => s + a, 0);
  const totalReserveCollected = reserves.reduce((s, r) => s + r, 0);
  const quotaRemainder = monthlyTotalCents - totalCollected;
  const reserveRemainder = monthlyReserveCents - totalReserveCollected;

  const maxPermIdx = units.reduce(
    (maxI, u, i) => (u.permilagem > units[maxI]!.permilagem ? i : maxI),
    0,
  );
  amounts[maxPermIdx] = (amounts[maxPermIdx] ?? 0) + quotaRemainder;
  reserves[maxPermIdx] = (reserves[maxPermIdx] ?? 0) + reserveRemainder;

  const dueDate = `${year}-${isoMonth(month)}-01`;

  // Build quota records — one per unit. amount_cents must remain > 0 per DB constraint.
  const quotaInserts = units.map((u, i) => ({
    unit_id: u.id,
    budget_id: budgetId,
    due_date: dueDate,
    amount_cents: Math.max(1, amounts[i] ?? 0),
    reserve_cents: Math.max(0, reserves[i] ?? 0),
    status: "PENDING" as const,
  }));

  // Bulk insert; ON CONFLICT DO NOTHING prevents duplicates if run twice.
  const { data: inserted, error: insertError } = await admin
    .from("quotas")
    .upsert(quotaInserts, {
      onConflict: "unit_id,due_date",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    return { error: `Erro ao gerar quotas: ${insertError.message}` };
  }

  const generated = (inserted ?? []).length;
  const skipped = units.length - generated;

  // Write one audit entry for the entire generation run.
  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "generate_monthly_quotas",
    target_table: "quotas",
    target_id: budgetId,
    after_snapshot: {
      month,
      year,
      generated,
      skipped,
      due_date: dueDate,
    },
  });

  revalidatePath("/dashboard/financials/quotas");
  return { success: true, generated, skipped };
}

// ---------------------------------------------------------------------------
// markQuotaPaid
// ---------------------------------------------------------------------------

export async function markQuotaPaid(
  quotaId: string,
  buildingId: string,
  paymentMethod: string,
  reference?: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = markPaidSchema.safeParse({
    quotaId,
    buildingId,
    paymentMethod,
    reference,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Cross-tenant guard: verify quota belongs to a unit in this building.
  const { data: quotaRow } = await admin
    .from("quotas")
    .select(
      "id, unit_id, amount_cents, reserve_cents, status, units!inner(building_id)",
    )
    .eq("id", quotaId)
    .single();

  if (!quotaRow) return { error: "Quota não encontrada." };

  const quota = quotaRow as unknown as {
    id: string;
    unit_id: string;
    amount_cents: number;
    reserve_cents: number;
    status: string;
    units: { building_id: string };
  };

  if (quota.units.building_id !== buildingId) {
    return { error: "Acesso não autorizado." };
  }
  if (quota.status === "PAID") {
    return { error: "Esta quota já está paga." };
  }
  if (quota.status === "WAIVED") {
    return { error: "Esta quota foi isenta — não pode ser marcada como paga." };
  }

  const totalPaymentCents = quota.amount_cents + quota.reserve_cents;
  const paidAt = new Date().toISOString();

  // Insert payment record.
  const { error: payError } = await admin.from("payments").insert({
    quota_id: quotaId,
    amount_cents: totalPaymentCents,
    paid_by: session.user.id,
    payment_method: paymentMethod,
    reference: reference ?? null,
  });

  if (payError) return { error: "Erro ao registar pagamento." };

  // Update quota status to PAID + set paid_at.
  // The DB trigger enforces the valid status transition (PENDING/OVERDUE → PAID).
  const { error: updateError } = await admin
    .from("quotas")
    .update({ status: "PAID", paid_at: paidAt })
    .eq("id", quotaId);

  if (updateError) {
    return { error: `Erro ao atualizar quota: ${updateError.message}` };
  }

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "mark_quota_paid",
    target_table: "quotas",
    target_id: quotaId,
    before_snapshot: { status: quota.status },
    after_snapshot: { status: "PAID", paid_at: paidAt },
  });

  revalidatePath("/dashboard/financials/quotas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// bulkMarkQuotaPaid
// ---------------------------------------------------------------------------

export async function bulkMarkQuotaPaid(
  quotaIds: string[],
  buildingId: string,
  paymentMethod: string,
  reference?: string,
): Promise<
  | { error: string }
  | { success: true; processed: number; failed: number }
> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = bulkMarkPaidSchema.safeParse({
    quotaIds,
    buildingId,
    paymentMethod,
    reference,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  let processed = 0;
  let failed = 0;

  for (const qid of quotaIds) {
    const result = await markQuotaPaid(qid, buildingId, paymentMethod, reference);
    if ("error" in result) {
      failed++;
    } else {
      processed++;
    }
  }

  revalidatePath("/dashboard/financials/quotas");
  return { success: true, processed, failed };
}

// ---------------------------------------------------------------------------
// markQuotaOverdue
// ---------------------------------------------------------------------------

export async function markQuotaOverdue(
  quotaId: string,
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

  const parsed = quotaIdSchema.safeParse({ quotaId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: quotaRow } = await admin
    .from("quotas")
    .select("id, status, units!inner(building_id)")
    .eq("id", quotaId)
    .single();

  if (!quotaRow) return { error: "Quota não encontrada." };

  const quota = quotaRow as unknown as {
    id: string;
    status: string;
    units: { building_id: string };
  };

  if (quota.units.building_id !== buildingId) {
    return { error: "Acesso não autorizado." };
  }
  if (quota.status !== "PENDING") {
    return {
      error: `Apenas quotas PENDENTES podem ser marcadas em atraso (estado atual: ${quota.status}).`,
    };
  }

  const { error: updateError } = await admin
    .from("quotas")
    .update({ status: "OVERDUE" })
    .eq("id", quotaId);

  if (updateError) {
    return { error: `Erro ao atualizar quota: ${updateError.message}` };
  }

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "mark_quota_overdue",
    target_table: "quotas",
    target_id: quotaId,
    before_snapshot: { status: "PENDING" },
    after_snapshot: { status: "OVERDUE" },
  });

  // Fire notification without blocking the response. Email send failures are
  // recorded in the notifications table (delivery_status: 'FAILED') and must
  // not roll back the quota status transition.
  void notifyQuotaOverdue(quotaId).catch((err: unknown) => {
    console.error("[notifyQuotaOverdue] Failed for quota", quotaId, err);
  });

  revalidatePath("/dashboard/financials/quotas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// waiveQuota
// ---------------------------------------------------------------------------

export async function waiveQuota(
  quotaId: string,
  buildingId: string,
  reason?: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = quotaIdSchema.safeParse({ quotaId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: quotaRow } = await admin
    .from("quotas")
    .select("id, status, units!inner(building_id)")
    .eq("id", quotaId)
    .single();

  if (!quotaRow) return { error: "Quota não encontrada." };

  const quota = quotaRow as unknown as {
    id: string;
    status: string;
    units: { building_id: string };
  };

  if (quota.units.building_id !== buildingId) {
    return { error: "Acesso não autorizado." };
  }
  if (quota.status === "PAID") {
    return { error: "Uma quota paga não pode ser isenta." };
  }
  if (quota.status === "WAIVED") {
    return { error: "Esta quota já está isenta." };
  }

  const { error: updateError } = await admin
    .from("quotas")
    .update({ status: "WAIVED" })
    .eq("id", quotaId);

  if (updateError) {
    return { error: `Erro ao atualizar quota: ${updateError.message}` };
  }

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "waive_quota",
    target_table: "quotas",
    target_id: quotaId,
    before_snapshot: { status: quota.status },
    after_snapshot: { status: "WAIVED", reason: reason ?? null },
  });

  revalidatePath("/dashboard/financials/quotas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// getQuotasForMonth — GESTOR read
// ---------------------------------------------------------------------------

export async function getQuotasForMonth(
  buildingId: string,
  month: number,
  year: number,
): Promise<QuotaWithUnit[]> {
  const session = await getServerSession();
  if (!session) return [];

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return [];
    throw err;
  }

  const admin = createServerSupabaseClient();

  // Fetch all units for the building.
  const { data: unitRows } = await admin
    .from("units")
    .select("id, identifier, floor, permilagem")
    .eq("building_id", buildingId);

  if (!unitRows || unitRows.length === 0) return [];

  const units = unitRows as unknown as {
    id: string;
    identifier: string;
    floor: number;
    permilagem: number;
  }[];

  const unitIds = units.map((u) => u.id);
  const unitMap = new Map(units.map((u) => [u.id, u]));

  const firstDay = `${year}-${isoMonth(month)}-01`;
  const nextFirst = firstOfNextMonth(month, year);

  const { data: quotaRows } = await admin
    .from("quotas")
    .select(
      "id, unit_id, budget_id, due_date, amount_cents, reserve_cents, status, paid_at",
    )
    .in("unit_id", unitIds)
    .gte("due_date", firstDay)
    .lt("due_date", nextFirst)
    .order("due_date", { ascending: true });

  const quotas = (quotaRows ?? []) as unknown as {
    id: string;
    unit_id: string;
    budget_id: string;
    due_date: string;
    amount_cents: number;
    reserve_cents: number;
    status: string;
    paid_at: string | null;
  }[];

  return quotas.map((q) => {
    const unit = unitMap.get(q.unit_id);
    return {
      id: q.id,
      unit_id: q.unit_id,
      unit_identifier: unit?.identifier ?? "—",
      unit_floor: unit?.floor ?? 0,
      budget_id: q.budget_id,
      due_date: q.due_date,
      amount_cents: q.amount_cents,
      reserve_cents: q.reserve_cents,
      status: q.status as QuotaStatus,
      paid_at: q.paid_at,
    };
  });
}

// ---------------------------------------------------------------------------
// getMyQuotas — CONDÓMINO read (own units only)
//
// Security: scoped exclusively to unit_ownership records where
// owner_user_id = authenticated user's ID. No building ID parameter to
// prevent parameter tampering — the user's identity is the only gate.
// ---------------------------------------------------------------------------

export async function getMyQuotas(year: number): Promise<MyQuota[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  // Step 1: Get active unit ownership for this user.
  const { data: ownershipRows } = await admin
    .from("unit_ownership")
    .select("unit_id")
    .eq("owner_user_id", session.user.id)
    .is("ended_at", null);

  if (!ownershipRows || ownershipRows.length === 0) return [];

  const ownedUnitIds = (
    ownershipRows as unknown as { unit_id: string }[]
  ).map((r) => r.unit_id);

  // Step 2: Get unit details + building info.
  const { data: unitRows } = await admin
    .from("units")
    .select("id, identifier, building_id")
    .in("id", ownedUnitIds);

  if (!unitRows || unitRows.length === 0) return [];

  const units = unitRows as unknown as {
    id: string;
    identifier: string;
    building_id: string;
  }[];

  const buildingIds = [...new Set(units.map((u) => u.building_id))];

  // Step 3: Get building names.
  const { data: buildingRows } = await admin
    .from("buildings")
    .select("id, name")
    .in("id", buildingIds);

  const buildingMap = new Map(
    (buildingRows as unknown as { id: string; name: string }[] ?? []).map(
      (b) => [b.id, b.name],
    ),
  );
  const unitMap = new Map(units.map((u) => [u.id, u]));

  // Step 4: Get quotas for owned units, filtered by year.
  const { data: quotaRows } = await admin
    .from("quotas")
    .select(
      "id, unit_id, due_date, amount_cents, reserve_cents, status, paid_at",
    )
    .in("unit_id", ownedUnitIds)
    .gte("due_date", `${year}-01-01`)
    .lte("due_date", `${year}-12-31`)
    .order("due_date", { ascending: false });

  const quotas = (quotaRows ?? []) as unknown as {
    id: string;
    unit_id: string;
    due_date: string;
    amount_cents: number;
    reserve_cents: number;
    status: string;
    paid_at: string | null;
  }[];

  return quotas.map((q) => {
    const unit = unitMap.get(q.unit_id);
    return {
      id: q.id,
      unit_id: q.unit_id,
      unit_identifier: unit?.identifier ?? "—",
      building_id: unit?.building_id ?? "",
      building_name: buildingMap.get(unit?.building_id ?? "") ?? "—",
      due_date: q.due_date,
      amount_cents: q.amount_cents,
      reserve_cents: q.reserve_cents,
      status: q.status as QuotaStatus,
      paid_at: q.paid_at,
    };
  });
}
