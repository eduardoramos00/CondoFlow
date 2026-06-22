"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  notifyAssemblyScheduled,
  notifyVoteOpen,
} from "@/lib/notifications/triggers";
import type { Json } from "@/lib/supabase/types";
import type { AssemblyType } from "@/lib/assemblies/constants";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type { AssemblyType } from "@/lib/assemblies/constants";
export type AssemblyStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "IN_PROGRESS"
  | "CONCLUDED"
  | "ARCHIVED";
export type AgendaItemVotingStatus = "CLOSED" | "OPEN" | "CONCLUDED";
export type VoteChoice = "FAVOR" | "AGAINST" | "ABSTAIN";
export type AtaStatus = "DRAFT" | "FINALIZED";

export type Assembly = {
  id: string;
  building_id: string;
  type: AssemblyType;
  status: AssemblyStatus;
  scheduled_at: string;
  quorum_required: number;
  location: string | null;
  created_by: string;
  created_at: string;
};

export type AgendaItem = {
  id: string;
  assembly_id: string;
  order_index: number;
  title: string;
  description: string | null;
  voting_enabled: boolean;
  voting_status: AgendaItemVotingStatus;
  created_at: string;
};

export type Vote = {
  id: string;
  agenda_item_id: string;
  unit_id: string;
  voter_user_id: string;
  vote: VoteChoice;
  weighted_permilagem: number;
  cast_at: string;
};

export type VoteTally = {
  favor_permilagem: number;
  against_permilagem: number;
  abstain_permilagem: number;
  total_permilagem: number;
  favor_count: number;
  against_count: number;
  abstain_count: number;
};

export type VoteProxy = {
  id: string;
  assembly_id: string;
  grantor_unit_id: string;
  proxy_unit_id: string;
  created_at: string;
};

export type Ata = {
  id: string;
  assembly_id: string;
  content: string;
  status: AtaStatus;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ASSEMBLY_TYPE_ENUM = ["ORDINÁRIA", "EXTRAORDINÁRIA"] as const;
const ASSEMBLY_STATUS_ENUM = [
  "DRAFT",
  "PUBLISHED",
  "IN_PROGRESS",
  "CONCLUDED",
  "ARCHIVED",
] as const;
const VOTE_CHOICE_ENUM = ["FAVOR", "AGAINST", "ABSTAIN"] as const;

const createAssemblySchema = z.object({
  buildingId: z.string().uuid(),
  type: z.enum(ASSEMBLY_TYPE_ENUM),
  scheduledAt: z.string().datetime(),
  quorumRequired: z.number().gt(0).lte(100).optional(),
  location: z.string().max(500).optional(),
});

const updateAssemblySchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  quorumRequired: z.number().gt(0).lte(100).optional(),
  location: z.string().max(500).nullable().optional(),
});

const transitionSchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
  targetStatus: z.enum(ASSEMBLY_STATUS_ENUM),
});

const addAgendaItemSchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  votingEnabled: z.boolean().optional(),
});

const reorderSchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
  orderedItemIds: z.array(z.string().uuid()).min(1),
});

const agendaItemIdSchema = z.object({
  agendaItemId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

const castVoteSchema = z.object({
  agendaItemId: z.string().uuid(),
  unitId: z.string().uuid(),
  vote: z.enum(VOTE_CHOICE_ENUM),
});

const grantProxySchema = z.object({
  assemblyId: z.string().uuid(),
  grantorUnitId: z.string().uuid(),
  proxyUnitId: z.string().uuid(),
});

const ataSchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
  content: z.string(),
});

const assemblyBuildingSchema = z.object({
  assemblyId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

export type OwnedUnit = {
  id: string;
  identifier: string;
  permilagem: number;
};

// ---------------------------------------------------------------------------
// getMyUnitsForBuilding — returns units actively owned by the caller in a building
// ---------------------------------------------------------------------------

export async function getMyUnitsForBuilding(
  buildingId: string,
): Promise<OwnedUnit[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data } = await admin
    .from("unit_ownership")
    .select("units!inner(id, identifier, permilagem, building_id)")
    .eq("owner_user_id", session.user.id)
    .is("ended_at", null);

  if (!data) return [];

  type Row = {
    units: { id: string; identifier: string; permilagem: number; building_id: string };
  };

  return (data as unknown as Row[])
    .map((r) => r.units)
    .filter((u) => u.building_id === buildingId)
    .map((u) => ({ id: u.id, identifier: u.identifier, permilagem: u.permilagem }));
}

// ---------------------------------------------------------------------------
// getAssemblies — read
// ---------------------------------------------------------------------------

export async function getAssemblies(buildingId: string): Promise<Assembly[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("assemblies")
    .select(
      "id, building_id, type, status, scheduled_at, quorum_required, location, created_by, created_at",
    )
    .eq("building_id", buildingId)
    .order("scheduled_at", { ascending: false });

  if (error || !data) return [];
  return data as unknown as Assembly[];
}

// ---------------------------------------------------------------------------
// getAssembly — read (single)
// ---------------------------------------------------------------------------

export async function getAssembly(
  assemblyId: string,
  buildingId: string,
): Promise<Assembly | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("assemblies")
    .select(
      "id, building_id, type, status, scheduled_at, quorum_required, location, created_by, created_at",
    )
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (error || !data) return null;
  return data as unknown as Assembly;
}

// ---------------------------------------------------------------------------
// getAgendaItems — read
// ---------------------------------------------------------------------------

export async function getAgendaItems(assemblyId: string): Promise<AgendaItem[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("agenda_items")
    .select(
      "id, assembly_id, order_index, title, description, voting_enabled, voting_status, created_at",
    )
    .eq("assembly_id", assemblyId)
    .order("order_index", { ascending: true });

  if (error || !data) return [];
  return data as unknown as AgendaItem[];
}

// ---------------------------------------------------------------------------
// getVoteTally — aggregated tally for Phase 5.3 VoteTallyBar
// ---------------------------------------------------------------------------

export async function getVoteTally(agendaItemId: string): Promise<VoteTally> {
  const empty: VoteTally = {
    favor_permilagem: 0,
    against_permilagem: 0,
    abstain_permilagem: 0,
    total_permilagem: 0,
    favor_count: 0,
    against_count: 0,
    abstain_count: 0,
  };

  const session = await getServerSession();
  if (!session) return empty;

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("votes")
    .select("vote, weighted_permilagem")
    .eq("agenda_item_id", agendaItemId);

  if (error || !data) return empty;

  const rows = data as unknown as { vote: VoteChoice; weighted_permilagem: number }[];

  const tally = rows.reduce(
    (acc, v) => {
      if (v.vote === "FAVOR") {
        acc.favor_permilagem += v.weighted_permilagem;
        acc.favor_count += 1;
      } else if (v.vote === "AGAINST") {
        acc.against_permilagem += v.weighted_permilagem;
        acc.against_count += 1;
      } else {
        acc.abstain_permilagem += v.weighted_permilagem;
        acc.abstain_count += 1;
      }
      return acc;
    },
    {
      favor_permilagem: 0,
      against_permilagem: 0,
      abstain_permilagem: 0,
      favor_count: 0,
      against_count: 0,
      abstain_count: 0,
    },
  );

  return {
    ...tally,
    total_permilagem:
      tally.favor_permilagem + tally.against_permilagem + tally.abstain_permilagem,
  };
}

// ---------------------------------------------------------------------------
// getMyVoteForItem — has this unit already voted on this item?
// ---------------------------------------------------------------------------

export async function getMyVoteForItem(
  agendaItemId: string,
  unitId: string,
): Promise<Vote | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("votes")
    .select("id, agenda_item_id, unit_id, voter_user_id, vote, weighted_permilagem, cast_at")
    .eq("agenda_item_id", agendaItemId)
    .eq("unit_id", unitId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Vote;
}

// ---------------------------------------------------------------------------
// getProxiesForAssembly — read
// ---------------------------------------------------------------------------

export async function getProxiesForAssembly(
  assemblyId: string,
): Promise<VoteProxy[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("vote_proxies")
    .select("id, assembly_id, grantor_unit_id, proxy_unit_id, created_at")
    .eq("assembly_id", assemblyId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as unknown as VoteProxy[];
}

// ---------------------------------------------------------------------------
// getAta — read
// ---------------------------------------------------------------------------

export async function getAta(
  assemblyId: string,
  buildingId: string,
): Promise<Ata | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  // Cross-tenant guard before returning ata content.
  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!assemblyRow) return null;

  const { data, error } = await admin
    .from("atas")
    .select("id, assembly_id, content, status, finalized_at, finalized_by, created_at")
    .eq("assembly_id", assemblyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Ata;
}

// ---------------------------------------------------------------------------
// createAssembly — GESTOR only
// ---------------------------------------------------------------------------

export async function createAssembly(
  buildingId: string,
  type: AssemblyType,
  scheduledAt: string,
  quorumRequired?: number,
  location?: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = createAssemblySchema.safeParse({
    buildingId,
    type,
    scheduledAt,
    quorumRequired,
    location,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: row, error } = await admin
    .from("assemblies")
    .insert({
      building_id: buildingId,
      type,
      status: "DRAFT",
      scheduled_at: scheduledAt,
      quorum_required: quorumRequired ?? 50.01,
      location: location ?? null,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error || !row) return { error: "Erro ao criar assembleia." };

  const assembly = row as unknown as { id: string };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "create_assembly",
    target_table: "assemblies",
    target_id: assembly.id,
    after_snapshot: {
      type,
      scheduled_at: scheduledAt,
      quorum_required: quorumRequired ?? 50.01,
    },
  });

  revalidatePath("/dashboard/assemblies");
  return { success: true, id: assembly.id };
}

// ---------------------------------------------------------------------------
// updateAssembly — GESTOR only (DRAFT or PUBLISHED only)
// ---------------------------------------------------------------------------

export async function updateAssembly(
  assemblyId: string,
  buildingId: string,
  updates: {
    scheduledAt?: string;
    quorumRequired?: number;
    location?: string | null;
  },
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = updateAssemblySchema.safeParse({
    assemblyId,
    buildingId,
    ...updates,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  if (!["DRAFT", "PUBLISHED"].includes(assembly.status)) {
    return {
      error:
        "Apenas assembleias em Rascunho ou Publicada podem ser editadas.",
    };
  }

  const patch: {
    scheduled_at?: string;
    quorum_required?: number;
    location?: string | null;
  } = {};
  if (updates.scheduledAt !== undefined) patch.scheduled_at = updates.scheduledAt;
  if (updates.quorumRequired !== undefined) patch.quorum_required = updates.quorumRequired;
  if (updates.location !== undefined) patch.location = updates.location;

  if (Object.keys(patch).length === 0) return { success: true };

  const { error: updateError } = await admin
    .from("assemblies")
    .update(patch)
    .eq("id", assemblyId)
    .eq("building_id", buildingId);

  if (updateError) return { error: "Erro ao atualizar assembleia." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "update_assembly",
    target_table: "assemblies",
    target_id: assemblyId,
    after_snapshot: patch as unknown as Json,
  });

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  revalidatePath("/dashboard/assemblies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// transitionAssemblyStatus — GESTOR only
// Fires notifyAssemblyScheduled when transitioning to PUBLISHED.
// The DB trigger enforces legal transition order; the error message from the
// trigger surfaces directly as the action error for full transparency.
// ---------------------------------------------------------------------------

export async function transitionAssemblyStatus(
  assemblyId: string,
  buildingId: string,
  targetStatus: AssemblyStatus,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = transitionSchema.safeParse({ assemblyId, buildingId, targetStatus });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  const { error: updateError } = await admin
    .from("assemblies")
    .update({ status: targetStatus })
    .eq("id", assemblyId)
    .eq("building_id", buildingId);

  if (updateError) {
    // The DB trigger provides a descriptive error for illegal transitions.
    return { error: updateError.message };
  }

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "transition_assembly_status",
    target_table: "assemblies",
    target_id: assemblyId,
    before_snapshot: { status: assembly.status },
    after_snapshot: { status: targetStatus },
  });

  if (targetStatus === "PUBLISHED") {
    void notifyAssemblyScheduled(assemblyId).catch((err: unknown) => {
      console.error(
        "[notifyAssemblyScheduled] Failed for assembly",
        assemblyId,
        err,
      );
    });
  }

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  revalidatePath("/dashboard/assemblies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// addAgendaItem — GESTOR only
// New items are appended with order_index = max(existing) + 1.
// ---------------------------------------------------------------------------

export async function addAgendaItem(
  assemblyId: string,
  buildingId: string,
  title: string,
  description?: string,
  votingEnabled?: boolean,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = addAgendaItemSchema.safeParse({
    assemblyId,
    buildingId,
    title,
    description,
    votingEnabled,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  if (["IN_PROGRESS", "CONCLUDED", "ARCHIVED"].includes(assembly.status)) {
    return { error: "Não é possível adicionar pontos a uma assembleia que já iniciou." };
  }

  // Determine next order_index without a COUNT — a single ordered row is faster.
  const { data: maxRow } = await admin
    .from("agenda_items")
    .select("order_index")
    .eq("assembly_id", assemblyId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = maxRow
    ? (maxRow as unknown as { order_index: number }).order_index + 1
    : 0;

  const { data: row, error } = await admin
    .from("agenda_items")
    .insert({
      assembly_id: assemblyId,
      order_index: nextIndex,
      title,
      description: description ?? null,
      voting_enabled: votingEnabled ?? false,
      voting_status: "CLOSED",
    })
    .select("id")
    .single();

  if (error || !row) return { error: "Erro ao adicionar ponto à ordem do dia." };

  const item = row as unknown as { id: string };

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  return { success: true, id: item.id };
}

// ---------------------------------------------------------------------------
// reorderAgendaItems — GESTOR only
//
// orderedItemIds must contain every item ID for the assembly in the desired
// new order. A two-phase offset strategy avoids unique-key violations between
// individual Supabase calls (each call is a separate transaction, so the
// DEFERRABLE constraint cannot be used across HTTP requests):
//   Phase 1 — shift all indices up by OFFSET to clear the target range.
//   Phase 2 — assign the final indices (0, 1, 2, …).
// ---------------------------------------------------------------------------

export async function reorderAgendaItems(
  assemblyId: string,
  buildingId: string,
  orderedItemIds: string[],
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = reorderSchema.safeParse({ assemblyId, buildingId, orderedItemIds });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Verify all provided IDs belong to this assembly (cross-tenant guard).
  const { data: existingRows } = await admin
    .from("agenda_items")
    .select("id")
    .eq("assembly_id", assemblyId);

  const existingIds = new Set(
    (existingRows ?? []).map((r) => (r as unknown as { id: string }).id),
  );

  if (orderedItemIds.some((id) => !existingIds.has(id))) {
    return { error: "Lista de pontos contém IDs inválidos." };
  }

  const OFFSET = 100_000;

  // Phase 1: assign temporary high indices to clear conflicts.
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await admin
      .from("agenda_items")
      .update({ order_index: OFFSET + i })
      .eq("id", orderedItemIds[i]!)
      .eq("assembly_id", assemblyId);

    if (error) return { error: "Erro ao reordenar pontos (fase 1)." };
  }

  // Phase 2: assign final target indices.
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await admin
      .from("agenda_items")
      .update({ order_index: i })
      .eq("id", orderedItemIds[i]!)
      .eq("assembly_id", assemblyId);

    if (error) return { error: "Erro ao reordenar pontos (fase 2)." };
  }

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// openVoting — GESTOR only (CLOSED → OPEN)
// Fires notifyVoteOpen so building members are alerted via in-app + email.
// ---------------------------------------------------------------------------

export async function openVoting(
  agendaItemId: string,
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

  const parsed = agendaItemIdSchema.safeParse({ agendaItemId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Cross-tenant guard: verify the item's assembly belongs to this building.
  const { data: itemRow } = await admin
    .from("agenda_items")
    .select(
      "id, voting_status, voting_enabled, assemblies!inner(building_id)",
    )
    .eq("id", agendaItemId)
    .single();

  if (!itemRow) return { error: "Ponto da ordem do dia não encontrado." };

  const item = itemRow as unknown as {
    id: string;
    voting_status: AgendaItemVotingStatus;
    voting_enabled: boolean;
    assemblies: { building_id: string };
  };

  if (item.assemblies.building_id !== buildingId) {
    return { error: "Acesso não autorizado." };
  }
  if (!item.voting_enabled) {
    return { error: "Este ponto não tem votação habilitada." };
  }
  if (item.voting_status === "OPEN") {
    return { error: "A votação já está aberta." };
  }
  if (item.voting_status === "CONCLUDED") {
    return { error: "A votação já foi encerrada e não pode ser reaberta." };
  }

  const { error: updateError } = await admin
    .from("agenda_items")
    .update({ voting_status: "OPEN" })
    .eq("id", agendaItemId);

  if (updateError) return { error: "Erro ao abrir votação." };

  void notifyVoteOpen(agendaItemId).catch((err: unknown) => {
    console.error("[notifyVoteOpen] Failed for item", agendaItemId, err);
  });

  revalidatePath("/dashboard/assemblies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// closeVoting — GESTOR only (OPEN → CONCLUDED)
// ---------------------------------------------------------------------------

export async function closeVoting(
  agendaItemId: string,
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

  const parsed = agendaItemIdSchema.safeParse({ agendaItemId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: itemRow } = await admin
    .from("agenda_items")
    .select("id, voting_status, assemblies!inner(building_id)")
    .eq("id", agendaItemId)
    .single();

  if (!itemRow) return { error: "Ponto da ordem do dia não encontrado." };

  const item = itemRow as unknown as {
    id: string;
    voting_status: AgendaItemVotingStatus;
    assemblies: { building_id: string };
  };

  if (item.assemblies.building_id !== buildingId) {
    return { error: "Acesso não autorizado." };
  }
  if (item.voting_status !== "OPEN") {
    return { error: "A votação não está aberta." };
  }

  const { error: updateError } = await admin
    .from("agenda_items")
    .update({ voting_status: "CONCLUDED" })
    .eq("id", agendaItemId);

  if (updateError) return { error: "Erro ao fechar votação." };

  revalidatePath("/dashboard/assemblies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// castVote — any authenticated user who owns (or holds proxy for) the unit
//
// Validation order (mirrors the DB trigger as defence-in-depth):
//   1. Agenda item exists and its assembly is IN_PROGRESS.
//   2. Item has voting_enabled and voting_status OPEN.
//   3. The target unit is in the assembly's building.
//   4. Caller directly owns the unit (active ownership) OR
//      holds a proxy: the target unit delegated to a unit the caller owns.
//   5. No existing vote for (agenda_item_id, unit_id) — friendly pre-check
//      before the DB UNIQUE constraint would surface a less clear error.
//   6. Snapshot weighted_permilagem from unit.permilagem at cast time.
// ---------------------------------------------------------------------------

export async function castVote(
  agendaItemId: string,
  unitId: string,
  vote: VoteChoice,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = castVoteSchema.safeParse({ agendaItemId, unitId, vote });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Fetch item + parent assembly in one hop.
  const { data: itemRow } = await admin
    .from("agenda_items")
    .select(
      "id, voting_status, voting_enabled, assemblies!inner(id, status, building_id)",
    )
    .eq("id", agendaItemId)
    .single();

  if (!itemRow) return { error: "Ponto da ordem do dia não encontrado." };

  const item = itemRow as unknown as {
    id: string;
    voting_status: AgendaItemVotingStatus;
    voting_enabled: boolean;
    assemblies: { id: string; status: AssemblyStatus; building_id: string };
  };

  if (item.assemblies.status !== "IN_PROGRESS") {
    return { error: "A assembleia não está em curso." };
  }
  if (!item.voting_enabled) {
    return { error: "Este ponto não tem votação habilitada." };
  }
  if (item.voting_status !== "OPEN") {
    return { error: "A votação para este ponto não está aberta." };
  }

  const assemblyId = item.assemblies.id;
  const buildingId = item.assemblies.building_id;

  // Fetch unit for cross-tenant check and permilagem snapshot.
  const { data: unitRow } = await admin
    .from("units")
    .select("id, building_id, permilagem")
    .eq("id", unitId)
    .eq("building_id", buildingId)
    .single();

  if (!unitRow) return { error: "Fração não encontrada neste edifício." };

  const unit = unitRow as unknown as {
    id: string;
    building_id: string;
    permilagem: number;
  };

  // Check direct ownership first.
  const { data: ownershipRow } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", unitId)
    .eq("owner_user_id", session.user.id)
    .is("ended_at", null)
    .maybeSingle();

  const isDirectOwner = ownershipRow !== null;
  let isProxyHolder = false;

  if (!isDirectOwner) {
    // Check if the target unit has delegated its vote to a unit owned by the caller.
    const { data: proxyRow } = await admin
      .from("vote_proxies")
      .select("proxy_unit_id")
      .eq("assembly_id", assemblyId)
      .eq("grantor_unit_id", unitId)
      .maybeSingle();

    if (proxyRow) {
      const proxy = proxyRow as unknown as { proxy_unit_id: string };

      const { data: proxyOwnerRow } = await admin
        .from("unit_ownership")
        .select("owner_user_id")
        .eq("unit_id", proxy.proxy_unit_id)
        .eq("owner_user_id", session.user.id)
        .is("ended_at", null)
        .maybeSingle();

      isProxyHolder = proxyOwnerRow !== null;
    }
  }

  if (!isDirectOwner && !isProxyHolder) {
    return { error: "Não tem autorização para votar por esta fração." };
  }

  // Friendly duplicate check before the UNIQUE constraint surfaces a raw DB error.
  const { data: existingVote } = await admin
    .from("votes")
    .select("id")
    .eq("agenda_item_id", agendaItemId)
    .eq("unit_id", unitId)
    .maybeSingle();

  if (existingVote) return { error: "Esta fração já votou neste ponto." };

  const { error: insertError } = await admin.from("votes").insert({
    agenda_item_id: agendaItemId,
    unit_id: unitId,
    voter_user_id: session.user.id,
    vote,
    weighted_permilagem: unit.permilagem,
    cast_at: new Date().toISOString(),
  });

  if (insertError) return { error: "Erro ao registar voto." };

  revalidatePath("/dashboard/assemblies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// grantProxy — unit owner only (before assembly IN_PROGRESS)
// grantorUnitId: the caller's unit that is delegating its vote.
// proxyUnitId:   the unit whose owner will vote on behalf of the grantor.
// ---------------------------------------------------------------------------

export async function grantProxy(
  assemblyId: string,
  grantorUnitId: string,
  proxyUnitId: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = grantProxySchema.safeParse({ assemblyId, grantorUnitId, proxyUnitId });
  if (!parsed.success) return { error: "Dados inválidos." };

  if (grantorUnitId === proxyUnitId) {
    return { error: "A fração delegante e a fração mandatária devem ser diferentes." };
  }

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status, building_id")
    .eq("id", assemblyId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as {
    id: string;
    status: AssemblyStatus;
    building_id: string;
  };

  if (["IN_PROGRESS", "CONCLUDED", "ARCHIVED"].includes(assembly.status)) {
    return {
      error: "Não é possível delegar procuração após o início da assembleia.",
    };
  }

  // Verify caller actively owns the grantor unit.
  const { data: ownershipRow } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", grantorUnitId)
    .eq("owner_user_id", session.user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (!ownershipRow) {
    return { error: "Não é proprietário ativo desta fração." };
  }

  // Verify both units belong to the assembly's building.
  const { data: unitRows } = await admin
    .from("units")
    .select("id")
    .in("id", [grantorUnitId, proxyUnitId])
    .eq("building_id", assembly.building_id);

  const foundIds = new Set(
    (unitRows ?? []).map((r) => (r as unknown as { id: string }).id),
  );

  if (!foundIds.has(grantorUnitId) || !foundIds.has(proxyUnitId)) {
    return {
      error: "As frações devem pertencer ao mesmo edifício da assembleia.",
    };
  }

  const { error: insertError } = await admin.from("vote_proxies").insert({
    assembly_id: assemblyId,
    grantor_unit_id: grantorUnitId,
    proxy_unit_id: proxyUnitId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        error: "Já existe uma procuração para esta fração nesta assembleia.",
      };
    }
    return { error: "Erro ao registar procuração." };
  }

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// revokeProxy — grantor owner only (before assembly IN_PROGRESS)
// ---------------------------------------------------------------------------

export async function revokeProxy(
  assemblyId: string,
  grantorUnitId: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = z
    .object({ assemblyId: z.string().uuid(), grantorUnitId: z.string().uuid() })
    .safeParse({ assemblyId, grantorUnitId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  if (["IN_PROGRESS", "CONCLUDED", "ARCHIVED"].includes(assembly.status)) {
    return {
      error: "Não é possível revogar procuração após o início da assembleia.",
    };
  }

  const { data: ownershipRow } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", grantorUnitId)
    .eq("owner_user_id", session.user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (!ownershipRow) {
    return { error: "Não é proprietário ativo desta fração." };
  }

  const { error: deleteError } = await admin
    .from("vote_proxies")
    .delete()
    .eq("assembly_id", assemblyId)
    .eq("grantor_unit_id", grantorUnitId);

  if (deleteError) return { error: "Erro ao revogar procuração." };

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// upsertAta — GESTOR only (create or update DRAFT ata content)
// The ata row is created lazily on first save rather than on assembly creation.
// ---------------------------------------------------------------------------

export async function upsertAta(
  assemblyId: string,
  buildingId: string,
  content: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = ataSchema.safeParse({ assemblyId, buildingId, content });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  if (assembly.status === "ARCHIVED") {
    return { error: "Não é possível editar a ata de uma assembleia arquivada." };
  }

  const { data: existingAta } = await admin
    .from("atas")
    .select("id, status")
    .eq("assembly_id", assemblyId)
    .maybeSingle();

  if (existingAta) {
    const ata = existingAta as unknown as { id: string; status: AtaStatus };

    if (ata.status === "FINALIZED") {
      return { error: "A ata já foi finalizada e não pode ser editada." };
    }

    const { error: updateError } = await admin
      .from("atas")
      .update({ content })
      .eq("id", ata.id);

    if (updateError) return { error: "Erro ao guardar ata." };
  } else {
    const { error: insertError } = await admin.from("atas").insert({
      assembly_id: assemblyId,
      content,
      status: "DRAFT",
    });

    if (insertError) return { error: "Erro ao criar ata." };
  }

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// finalizeAta — GESTOR only
// Assembly must be CONCLUDED before the ata can be finalised.
// Triggers notifyAssemblyScheduled to notify all building members that the
// ata is available (as specified in Phase 5.2 TODO).
// ---------------------------------------------------------------------------

export async function finalizeAta(
  assemblyId: string,
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

  const parsed = assemblyBuildingSchema.safeParse({ assemblyId, buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: assemblyRow } = await admin
    .from("assemblies")
    .select("id, status")
    .eq("id", assemblyId)
    .eq("building_id", buildingId)
    .single();

  if (!assemblyRow) return { error: "Assembleia não encontrada." };

  const assembly = assemblyRow as unknown as { id: string; status: AssemblyStatus };

  if (assembly.status !== "CONCLUDED") {
    return {
      error: "Apenas assembleias concluídas podem ter a ata finalizada.",
    };
  }

  const { data: ataRow } = await admin
    .from("atas")
    .select("id, status")
    .eq("assembly_id", assemblyId)
    .maybeSingle();

  if (!ataRow) {
    return {
      error:
        "A ata ainda não foi criada. Guarde o conteúdo da ata antes de finalizar.",
    };
  }

  const ata = ataRow as unknown as { id: string; status: AtaStatus };

  if (ata.status === "FINALIZED") {
    return { error: "A ata já foi finalizada." };
  }

  const finalizedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("atas")
    .update({
      status: "FINALIZED",
      finalized_at: finalizedAt,
      finalized_by: session.user.id,
    })
    .eq("id", ata.id);

  if (updateError) return { error: "Erro ao finalizar ata." };

  await admin.from("audit_log").insert({
    actor_user_id: session.user.id,
    building_id: buildingId,
    action: "finalize_ata",
    target_table: "atas",
    target_id: ata.id,
    before_snapshot: { status: "DRAFT" },
    after_snapshot: {
      status: "FINALIZED",
      finalized_at: finalizedAt,
      finalized_by: session.user.id,
    },
  });

  void notifyAssemblyScheduled(assemblyId).catch((err: unknown) => {
    console.error(
      "[notifyAssemblyScheduled] Failed for assembly (ata finalized)",
      assemblyId,
      err,
    );
  });

  revalidatePath(`/dashboard/assemblies/${assemblyId}`);
  revalidatePath("/dashboard/assemblies");
  return { success: true };
}
