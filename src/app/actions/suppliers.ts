"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Supplier = {
  id: string;
  building_id: string;
  name: string;
  nif: string | null;
  contact_email: string | null;
  service_type: string;
  is_active: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const supplierFieldsSchema = z.object({
  name: z.string().min(1, "Nome obrigatório.").max(200),
  serviceType: z.string().min(1, "Tipo de serviço obrigatório.").max(100),
  nif: z.string().max(20).optional(),
  contactEmail: z.string().email("Email inválido.").max(200).optional(),
});

const idSchema = z.object({
  supplierId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// getSuppliers — all suppliers for management view (GESTOR + CONDÓMINO)
// ---------------------------------------------------------------------------

export async function getSuppliers(buildingId: string): Promise<Supplier[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("suppliers")
    .select("id, building_id, name, nif, contact_email, service_type, is_active, created_at")
    .eq("building_id", buildingId)
    .order("name");

  if (error || !data) return [];
  return data as unknown as Supplier[];
}

// ---------------------------------------------------------------------------
// createSupplier — GESTOR only
// ---------------------------------------------------------------------------

export async function createSupplier(
  buildingId: string,
  name: string,
  serviceType: string,
  nif?: string,
  contactEmail?: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = supplierFieldsSchema.safeParse({
    name,
    serviceType,
    nif: nif || undefined,
    contactEmail: contactEmail || undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Dados inválidos." };
  }

  const admin = createServerSupabaseClient();

  const { data: row, error } = await admin
    .from("suppliers")
    .insert({
      building_id: buildingId,
      name,
      service_type: serviceType,
      nif: nif || null,
      contact_email: contactEmail || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !row) return { error: "Erro ao criar fornecedor." };

  const supplier = row as unknown as { id: string };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "create_supplier",
    target_table: "suppliers",
    target_id: supplier.id,
    after_snapshot: { name, service_type: serviceType },
  });

  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/expenses/new");
  return { success: true, id: supplier.id };
}

// ---------------------------------------------------------------------------
// updateSupplier — GESTOR only
// ---------------------------------------------------------------------------

export async function updateSupplier(
  supplierId: string,
  buildingId: string,
  name: string,
  serviceType: string,
  nif?: string,
  contactEmail?: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const idParsed = idSchema.safeParse({ supplierId, buildingId });
  const fieldsParsed = supplierFieldsSchema.safeParse({
    name,
    serviceType,
    nif: nif || undefined,
    contactEmail: contactEmail || undefined,
  });
  if (!idParsed.success || !fieldsParsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Ownership check: confirm supplier belongs to this building.
  const { data: existing } = await admin
    .from("suppliers")
    .select("id, name, service_type")
    .eq("id", supplierId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!existing) return { error: "Fornecedor não encontrado." };

  const prev = existing as unknown as { name: string; service_type: string };

  const { error: updateError } = await admin
    .from("suppliers")
    .update({
      name,
      service_type: serviceType,
      nif: nif || null,
      contact_email: contactEmail || null,
    })
    .eq("id", supplierId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao atualizar fornecedor." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "update_supplier",
    target_table: "suppliers",
    target_id: supplierId,
    before_snapshot: { name: prev.name, service_type: prev.service_type },
    after_snapshot: { name, service_type: serviceType },
  });

  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/expenses/new");
  return { success: true };
}

// ---------------------------------------------------------------------------
// deactivateSupplier — GESTOR only (soft delete)
// ---------------------------------------------------------------------------

export async function deactivateSupplier(
  supplierId: string,
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

  const parsed = idSchema.safeParse({ supplierId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: existing } = await admin
    .from("suppliers")
    .select("id, is_active")
    .eq("id", supplierId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!existing) return { error: "Fornecedor não encontrado." };

  const s = existing as unknown as { is_active: boolean };
  if (!s.is_active) return { error: "Fornecedor já está inativo." };

  const { error: updateError } = await admin
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", supplierId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao desativar fornecedor." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "deactivate_supplier",
    target_table: "suppliers",
    target_id: supplierId,
    before_snapshot: { is_active: true },
    after_snapshot: { is_active: false },
  });

  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/expenses/new");
  return { success: true };
}

// ---------------------------------------------------------------------------
// reactivateSupplier — GESTOR only
// ---------------------------------------------------------------------------

export async function reactivateSupplier(
  supplierId: string,
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

  const parsed = idSchema.safeParse({ supplierId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: existing } = await admin
    .from("suppliers")
    .select("id, is_active")
    .eq("id", supplierId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!existing) return { error: "Fornecedor não encontrado." };

  const s = existing as unknown as { is_active: boolean };
  if (s.is_active) return { error: "Fornecedor já está ativo." };

  const { error: updateError } = await admin
    .from("suppliers")
    .update({ is_active: true })
    .eq("id", supplierId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao reativar fornecedor." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "reactivate_supplier",
    target_table: "suppliers",
    target_id: supplierId,
    before_snapshot: { is_active: false },
    after_snapshot: { is_active: true },
  });

  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/expenses/new");
  return { success: true };
}
