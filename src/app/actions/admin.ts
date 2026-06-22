"use server";

import { revalidatePath } from "next/cache";

import { getServerUser } from "@/lib/auth/session";
import { isSuperAdmin, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type AdminBuilding = {
  id: string;
  name: string;
  address: string;
  fiscal_number: string;
  created_at: string;
  owner_gestor_id: string;
  gestor_name: string | null;
  unit_count: number;
  open_incident_count: number;
  last_quota_run_date: string | null;
};

export type AdminUserBuilding = {
  building_id: string;
  building_name: string;
  role: string;
};

export type AdminUser = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_suspended: boolean;
  buildings: AdminUserBuilding[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requireSuperAdmin() {
  const user = await getServerUser();
  if (!user || !isSuperAdmin(user)) {
    throw new UnauthorizedError("Acesso exclusivo a SuperAdmin.");
  }
  return user;
}

async function writeAuditLog(opts: {
  superadminUserId: string;
  action: string;
  impersonatedUserId?: string | null;
  buildingId?: string | null;
}) {
  const admin = createServerSupabaseClient();
  await admin.from("session_log").insert({
    superadmin_user_id: opts.superadminUserId,
    action: opts.action,
    impersonated_user_id: opts.impersonatedUserId ?? null,
    building_id: opts.buildingId ?? null,
  });
}

// ---------------------------------------------------------------------------
// listAllBuildings
// ---------------------------------------------------------------------------

/**
 * Returns every building on the platform with aggregated stats.
 * Requires SuperAdmin. Bypasses RLS via service-role client.
 */
export async function listAllBuildings(): Promise<AdminBuilding[]> {
  await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const { data: buildings, error } = await admin
    .from("buildings")
    .select("id, name, address, fiscal_number, created_at, owner_gestor_id")
    .order("name");

  if (error || !buildings?.length) return [];

  type BuildingRow = {
    id: string;
    name: string;
    address: string;
    fiscal_number: string;
    created_at: string;
    owner_gestor_id: string;
  };

  const bRows = buildings as BuildingRow[];
  const buildingIds = bRows.map((b) => b.id);
  const gestorIds = [...new Set(bRows.map((b) => b.owner_gestor_id))];

  const [gestorResult, unitResult, incidentResult] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", gestorIds),
    admin.from("units").select("id, building_id").in("building_id", buildingIds),
    // Open = any status that is not yet resolved or closed
    admin
      .from("incidents")
      .select("building_id")
      .in("building_id", buildingIds)
      .in("status", ["REPORTED", "ASSESSED", "SUPPLIER_DISPATCHED", "IN_PROGRESS"]),
  ]);

  type ProfileRow = { id: string; full_name: string | null };
  type UnitRow = { id: string; building_id: string };
  type IncidentRow = { building_id: string };

  const gestorMap = new Map<string, string | null>(
    (gestorResult.data as ProfileRow[] ?? []).map((p) => [p.id, p.full_name]),
  );

  const unitRows = unitResult.data as UnitRow[] ?? [];
  const unitIds = unitRows.map((u) => u.id);

  const unitCountMap = new Map<string, number>();
  for (const u of unitRows) {
    unitCountMap.set(u.building_id, (unitCountMap.get(u.building_id) ?? 0) + 1);
  }

  const incidentCountMap = new Map<string, number>();
  for (const i of (incidentResult.data as IncidentRow[] ?? [])) {
    incidentCountMap.set(i.building_id, (incidentCountMap.get(i.building_id) ?? 0) + 1);
  }

  // Last quota run date: MAX(quotas.due_date) per building, via units join.
  // quotas has no created_at column; due_date is the generation period marker.
  const lastQuotaMap = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: quotas } = await admin
      .from("quotas")
      .select("unit_id, due_date")
      .in("unit_id", unitIds)
      .order("due_date", { ascending: false });

    const unitBuildingMap = new Map(unitRows.map((u) => [u.id, u.building_id]));
    for (const q of quotas ?? []) {
      const bId = unitBuildingMap.get(q.unit_id);
      // First hit per building is the most recent (desc order)
      if (bId && !lastQuotaMap.has(bId)) {
        lastQuotaMap.set(bId, q.due_date);
      }
    }
  }

  return bRows.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    fiscal_number: b.fiscal_number,
    created_at: b.created_at,
    owner_gestor_id: b.owner_gestor_id,
    gestor_name: gestorMap.get(b.owner_gestor_id) ?? null,
    unit_count: unitCountMap.get(b.id) ?? 0,
    open_incident_count: incidentCountMap.get(b.id) ?? 0,
    last_quota_run_date: lastQuotaMap.get(b.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// listAllUsers
// ---------------------------------------------------------------------------

/**
 * Returns every platform user with profile, role assignments, and auth state.
 * Fetches up to 1 000 users — sufficient for a single-region condo platform.
 * Requires SuperAdmin.
 */
export async function listAllUsers(): Promise<AdminUser[]> {
  await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const {
    data: { users: authUsers },
    error: authError,
  } = await admin.auth.admin.listUsers({ perPage: 1000 });

  if (authError || !authUsers?.length) return [];

  const userIds = authUsers.map((u) => u.id);

  const [profileResult, roleResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds),
    admin
      .from("user_building_roles")
      .select("user_id, building_id, role")
      .in("user_id", userIds),
  ]);

  type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null };
  type RoleRow = { user_id: string; building_id: string; role: string };

  const profileMap = new Map<string, ProfileRow>(
    (profileResult.data as ProfileRow[] ?? []).map((p) => [p.id, p]),
  );

  const roleRows = roleResult.data as RoleRow[] ?? [];
  const buildingIds = [...new Set(roleRows.map((r) => r.building_id))];

  const buildingNameMap = new Map<string, string>();
  if (buildingIds.length > 0) {
    const { data: bNames } = await admin
      .from("buildings")
      .select("id, name")
      .in("id", buildingIds);
    for (const b of (bNames as Array<{ id: string; name: string }> ?? [])) {
      buildingNameMap.set(b.id, b.name);
    }
  }

  const userBuildingsMap = new Map<string, AdminUserBuilding[]>();
  for (const r of roleRows) {
    const list = userBuildingsMap.get(r.user_id) ?? [];
    list.push({
      building_id: r.building_id,
      building_name: buildingNameMap.get(r.building_id) ?? r.building_id,
      role: r.role,
    });
    userBuildingsMap.set(r.user_id, list);
  }

  const now = new Date();

  return authUsers.map((u) => {
    const profile = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_suspended: !!u.banned_until && new Date(u.banned_until) > now,
      buildings: userBuildingsMap.get(u.id) ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// assignGestorToBuilding
// ---------------------------------------------------------------------------

/**
 * Upserts a GESTOR role for `userId` in `buildingId`.
 * If the user already has a CONDÓMINO role in the same building it is
 * replaced — the (user_id, building_id) PK is unique per the schema.
 */
export async function assignGestorToBuilding(
  buildingId: string,
  userId: string,
): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const [buildingResult, profileResult] = await Promise.all([
    admin.from("buildings").select("id").eq("id", buildingId).maybeSingle(),
    admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
  ]);

  if (!buildingResult.data) return { error: "Edifício não encontrado." };
  if (!profileResult.data) return { error: "Utilizador não encontrado." };

  const { error } = await admin.from("user_building_roles").upsert(
    { user_id: userId, building_id: buildingId, role: "GESTOR" },
    { onConflict: "user_id,building_id" },
  );

  if (error) return { error: "Falha ao atribuir gestor." };

  await writeAuditLog({
    superadminUserId: caller.id,
    action: "ASSIGN_GESTOR",
    impersonatedUserId: userId,
    buildingId,
  });

  revalidatePath("/admin/buildings");
  revalidatePath("/admin/users");
  return {};
}

// ---------------------------------------------------------------------------
// revokeGestor
// ---------------------------------------------------------------------------

/**
 * Removes the GESTOR role for `userId` from `buildingId`.
 * Does not modify `buildings.owner_gestor_id` — use `assignGestorToBuilding`
 * to transfer ownership before revoking the current owner.
 */
export async function revokeGestor(
  buildingId: string,
  userId: string,
): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const { error } = await admin
    .from("user_building_roles")
    .delete()
    .eq("user_id", userId)
    .eq("building_id", buildingId)
    .eq("role", "GESTOR");

  if (error) return { error: "Falha ao revogar gestor." };

  await writeAuditLog({
    superadminUserId: caller.id,
    action: "REVOKE_GESTOR",
    impersonatedUserId: userId,
    buildingId,
  });

  revalidatePath("/admin/buildings");
  revalidatePath("/admin/users");
  return {};
}

// ---------------------------------------------------------------------------
// suspendUser
// ---------------------------------------------------------------------------

/**
 * Bans the target user for ~100 years via the Supabase Auth admin API.
 * Guards against suspending another SuperAdmin.
 */
export async function suspendUser(userId: string): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const { data: targetData, error: fetchError } =
    await admin.auth.admin.getUserById(userId);

  if (fetchError || !targetData.user) return { error: "Utilizador não encontrado." };
  if (isSuperAdmin(targetData.user)) {
    return { error: "Não é possível suspender outro SuperAdmin." };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });

  if (error) return { error: "Falha ao suspender utilizador." };

  await writeAuditLog({
    superadminUserId: caller.id,
    action: "SUSPEND_USER",
    impersonatedUserId: userId,
  });

  revalidatePath("/admin/users");
  return {};
}

// ---------------------------------------------------------------------------
// getPlatformStats
// ---------------------------------------------------------------------------

export type PlatformStats = {
  total_buildings: number;
  total_units: number;
  /** Sum of all quota amounts (amount_cents + reserve_cents) for the current calendar month. */
  platform_mrr_cents: number;
  /** Sum of PENDING + OVERDUE quota amounts across all buildings. */
  total_outstanding_debt_cents: number;
  /** Percentage (0–100) of incidents resolved within 7 days; sampled over the last 90 days. */
  sla_compliance_rate: number;
  /** Number of resolved incidents in the 90-day sample window. */
  sla_sample_size: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const now = new Date();
  const curMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [buildingRes, unitRes, mrrRes, debtRes] = await Promise.all([
    admin.from("buildings").select("id", { count: "exact", head: true }),
    admin.from("units").select("id", { count: "exact", head: true }),
    admin
      .from("quotas")
      .select("amount_cents, reserve_cents")
      .eq("due_date", curMonthStart),
    admin
      .from("quotas")
      .select("amount_cents, reserve_cents")
      .in("status", ["PENDING", "OVERDUE"]),
  ]);

  type QuotaRow = { amount_cents: number; reserve_cents: number };

  const platform_mrr_cents = (mrrRes.data as QuotaRow[] ?? []).reduce(
    (s, q) => s + q.amount_cents + q.reserve_cents,
    0,
  );
  const total_outstanding_debt_cents = (debtRes.data as QuotaRow[] ?? []).reduce(
    (s, q) => s + q.amount_cents + q.reserve_cents,
    0,
  );

  // SLA: % of incidents resolved within 7 days; sample = last 90 days.
  type HistoryRow = { incident_id: string; transitioned_at: string };
  const { data: resolvedHistory } = await admin
    .from("incident_history")
    .select("incident_id, transitioned_at")
    .eq("to_status", "RESOLVED")
    .gte("transitioned_at", ninetyDaysAgo);

  const histRows = (resolvedHistory as HistoryRow[]) ?? [];
  const sla_sample_size = histRows.length;
  let sla_compliance_rate = 100;

  if (sla_sample_size > 0) {
    const incidentIds = histRows.map((h) => h.incident_id);
    const { data: incidents } = await admin
      .from("incidents")
      .select("id, created_at")
      .in("id", incidentIds);

    const createdMap = new Map(
      (incidents as Array<{ id: string; created_at: string }> ?? []).map((i) => [
        i.id,
        i.created_at,
      ]),
    );

    let within = 0;
    for (const h of histRows) {
      const created = createdMap.get(h.incident_id);
      if (created) {
        const days =
          (new Date(h.transitioned_at).getTime() - new Date(created).getTime()) /
          86_400_000;
        if (days <= 7) within++;
      }
    }
    sla_compliance_rate = Math.round((within / sla_sample_size) * 100);
  }

  return {
    total_buildings: buildingRes.count ?? 0,
    total_units: unitRes.count ?? 0,
    platform_mrr_cents,
    total_outstanding_debt_cents,
    sla_compliance_rate,
    sla_sample_size,
  };
}

// ---------------------------------------------------------------------------
// reactivateUser
// ---------------------------------------------------------------------------

/**
 * Removes the ban from a previously suspended user.
 * Counterpart to suspendUser(); exposed here so the Phase 8.3 toggle can call it.
 */
export async function reactivateUser(userId: string): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  const admin = createServerSupabaseClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) return { error: "Falha ao reativar utilizador." };

  await writeAuditLog({
    superadminUserId: caller.id,
    action: "REACTIVATE_USER",
    impersonatedUserId: userId,
  });

  revalidatePath("/admin/users");
  return {};
}
