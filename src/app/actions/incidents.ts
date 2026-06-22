"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, getUserRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  notifyIncidentReported,
  notifyIncidentResolved,
  notifyIncidentCritical,
} from "@/lib/notifications/triggers";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type IncidentStatus =
  | "REPORTED"
  | "ASSESSED"
  | "SUPPLIER_DISPATCHED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

export type IncidentPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Incident = {
  id: string;
  building_id: string;
  unit_id: string | null;
  reported_by: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority | null;
  created_at: string;
  updated_at: string;
};

export type IncidentWithDetails = Incident & {
  unit_identifier: string | null;
  attachment_count: number;
};

export type IncidentHistoryRow = {
  id: string;
  incident_id: string;
  actor_user_id: string;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus;
  comment: string | null;
  transitioned_at: string;
};

export type IncidentAttachment = {
  id: string;
  incident_id: string;
  storage_path: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  signed_url: string | null;
};

export type SupplierDispatch = {
  id: string;
  incident_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_service_type: string;
  scheduled_date: string;
  quoted_cost_cents: number | null;
  notes: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCIDENT_STATUS_VALUES = [
  "REPORTED",
  "ASSESSED",
  "SUPPLIER_DISPATCHED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;

const INCIDENT_PRIORITY_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

// App-layer transition guard for transitionIncident().
// Does NOT include REPORTED→ASSESSED (assessIncident) or
// ASSESSED→SUPPLIER_DISPATCHED (dispatchSupplier) since those functions
// perform additional side-effects that require their own dedicated paths.
const LEGAL_TRANSITIONS: Partial<Record<IncidentStatus, IncidentStatus[]>> = {
  REPORTED:            ["CLOSED"],
  ASSESSED:            ["IN_PROGRESS", "CLOSED"],
  SUPPLIER_DISPATCHED: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS:         ["RESOLVED", "CLOSED"],
  RESOLVED:            ["CLOSED"],
};

const ACCEPTED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

type AttachmentMimeType = (typeof ACCEPTED_ATTACHMENT_MIME_TYPES)[number];

const ATTACHMENT_MIME_TO_EXT: Record<AttachmentMimeType, string> = {
  "image/jpeg":      "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
  "application/pdf": "pdf",
};

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

function isAcceptedAttachmentMime(mime: string): mime is AttachmentMimeType {
  return (ACCEPTED_ATTACHMENT_MIME_TYPES as ReadonlyArray<string>).includes(mime);
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const reportIncidentSchema = z.object({
  buildingId:  z.string().uuid(),
  title:       z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
});

const assessIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  priority:   z.enum(INCIDENT_PRIORITY_VALUES),
});

const dispatchSupplierSchema = z.object({
  incidentId:      z.string().uuid(),
  supplierId:      z.string().uuid(),
  scheduledDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido"),
  quotedCostCents: z.number().int().positive().optional(),
  notes:           z.string().max(2000).optional(),
});

const transitionIncidentSchema = z.object({
  incidentId:   z.string().uuid(),
  targetStatus: z.enum(INCIDENT_STATUS_VALUES),
  comment:      z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// getIncidents — read (all incidents for a building, flat list for kanban)
// ---------------------------------------------------------------------------

export async function getIncidents(
  buildingId: string,
): Promise<IncidentWithDetails[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("incidents")
    .select(
      "id, building_id, unit_id, reported_by, title, description, status, priority, created_at, updated_at, units(identifier), incident_attachments(id)",
    )
    .eq("building_id", buildingId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  type Row = {
    id: string;
    building_id: string;
    unit_id: string | null;
    reported_by: string;
    title: string;
    description: string | null;
    status: IncidentStatus;
    priority: IncidentPriority | null;
    created_at: string;
    updated_at: string;
    units: { identifier: string } | null;
    incident_attachments: { id: string }[];
  };

  return (data as unknown as Row[]).map((r) => ({
    id:               r.id,
    building_id:      r.building_id,
    unit_id:          r.unit_id,
    reported_by:      r.reported_by,
    title:            r.title,
    description:      r.description,
    status:           r.status,
    priority:         r.priority,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    unit_identifier:  r.units?.identifier ?? null,
    attachment_count: r.incident_attachments.length,
  }));
}

// ---------------------------------------------------------------------------
// getIncident — read (single)
// ---------------------------------------------------------------------------

export async function getIncident(
  incidentId: string,
  buildingId: string,
): Promise<IncidentWithDetails | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("incidents")
    .select(
      "id, building_id, unit_id, reported_by, title, description, status, priority, created_at, updated_at, units(identifier), incident_attachments(id)",
    )
    .eq("id", incidentId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (error || !data) return null;

  type Row = {
    id: string;
    building_id: string;
    unit_id: string | null;
    reported_by: string;
    title: string;
    description: string | null;
    status: IncidentStatus;
    priority: IncidentPriority | null;
    created_at: string;
    updated_at: string;
    units: { identifier: string } | null;
    incident_attachments: { id: string }[];
  };

  const r = data as unknown as Row;

  return {
    id:               r.id,
    building_id:      r.building_id,
    unit_id:          r.unit_id,
    reported_by:      r.reported_by,
    title:            r.title,
    description:      r.description,
    status:           r.status,
    priority:         r.priority,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    unit_identifier:  r.units?.identifier ?? null,
    attachment_count: r.incident_attachments.length,
  };
}

// ---------------------------------------------------------------------------
// getIncidentHistory — read (chronological timeline)
// ---------------------------------------------------------------------------

export async function getIncidentHistory(
  incidentId: string,
): Promise<IncidentHistoryRow[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  // Resolve building_id from the incident so we can verify building membership.
  // The service-role client bypasses RLS, so we must enforce the authorization
  // boundary explicitly here.
  const { data: incidentRow } = await admin
    .from("incidents")
    .select("building_id")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return [];

  const role = await getUserRole(session.user.id, (incidentRow as unknown as { building_id: string }).building_id);
  if (!role) return [];

  const { data, error } = await admin
    .from("incident_history")
    .select(
      "id, incident_id, actor_user_id, from_status, to_status, comment, transitioned_at",
    )
    .eq("incident_id", incidentId)
    .order("transitioned_at", { ascending: true });

  if (error || !data) return [];

  return data as unknown as IncidentHistoryRow[];
}

// ---------------------------------------------------------------------------
// getIncidentAttachments — read (with 1-hour signed URLs for lightbox)
// ---------------------------------------------------------------------------

export async function getIncidentAttachments(
  incidentId: string,
): Promise<IncidentAttachment[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  // Resolve building_id and verify membership before exposing attachment
  // metadata and generating signed storage URLs (1-hour expiry).
  const { data: incidentRow } = await admin
    .from("incidents")
    .select("building_id")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return [];

  const role = await getUserRole(session.user.id, (incidentRow as unknown as { building_id: string }).building_id);
  if (!role) return [];

  const { data, error } = await admin
    .from("incident_attachments")
    .select("id, incident_id, storage_path, mime_type, uploaded_by, created_at")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    incident_id: string;
    storage_path: string;
    mime_type: string;
    uploaded_by: string;
    created_at: string;
  };

  const rows = data as unknown as Row[];

  // Generate signed URLs in parallel — 1-hour expiry matches the typical
  // session length for the incident detail page lightbox.
  const signedResults = await Promise.all(
    rows.map((r) =>
      admin.storage
        .from("incident-media")
        .createSignedUrl(r.storage_path, 3600)
        .then(({ data: d }) => d?.signedUrl ?? null),
    ),
  );

  return rows.map((r, i) => ({
    id:           r.id,
    incident_id:  r.incident_id,
    storage_path: r.storage_path,
    mime_type:    r.mime_type,
    uploaded_by:  r.uploaded_by,
    created_at:   r.created_at,
    signed_url:   signedResults[i] ?? null,
  }));
}

// ---------------------------------------------------------------------------
// getSupplierDispatches — read (with supplier name for detail page)
// ---------------------------------------------------------------------------

export async function getSupplierDispatches(
  incidentId: string,
): Promise<SupplierDispatch[]> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  // Verify building membership before returning supplier commercial data
  // (quoted costs, vendor names, scheduled dates).
  const { data: incidentRow } = await admin
    .from("incidents")
    .select("building_id")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return [];

  const role = await getUserRole(session.user.id, (incidentRow as unknown as { building_id: string }).building_id);
  if (!role) return [];

  const { data, error } = await admin
    .from("supplier_dispatches")
    .select(
      "id, incident_id, supplier_id, scheduled_date, quoted_cost_cents, notes, created_at, suppliers!inner(name, service_type)",
    )
    .eq("incident_id", incidentId)
    .order("scheduled_date", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    incident_id: string;
    supplier_id: string;
    scheduled_date: string;
    quoted_cost_cents: number | null;
    notes: string | null;
    created_at: string;
    suppliers: { name: string; service_type: string };
  };

  return (data as unknown as Row[]).map((r) => ({
    id:                    r.id,
    incident_id:           r.incident_id,
    supplier_id:           r.supplier_id,
    supplier_name:         r.suppliers.name,
    supplier_service_type: r.suppliers.service_type,
    scheduled_date:        r.scheduled_date,
    quoted_cost_cents:     r.quoted_cost_cents,
    notes:                 r.notes,
    created_at:            r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// reportIncident — any authenticated building member (CONDÓMINO or GESTOR)
//
// Creates the incident in REPORTED status and writes the creation entry to
// incident_history (from_status NULL signals the initial creation event,
// which is distinct from a status transition).
// GESTORs may report on behalf of any unit without ownership verification.
// CONDÓMINOs must actively own the unit they attribute the incident to.
// ---------------------------------------------------------------------------

export async function reportIncident(
  buildingId: string,
  unitId: string | null,
  title: string,
  description?: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  let callerRole: string;
  try {
    callerRole = await requireRole(session, buildingId, ["CONDÓMINO", "GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = reportIncidentSchema.safeParse({ buildingId, title, description });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // CONDÓMINOs must actively own the unit they associate with the incident.
  // GESTORs bypass this check so they can report on behalf of any unit.
  if (unitId && callerRole === "CONDÓMINO") {
    const unitParsed = z.string().uuid().safeParse(unitId);
    if (!unitParsed.success) return { error: "ID de fração inválido." };

    const { data: ownerRow } = await admin
      .from("unit_ownership")
      .select("owner_user_id")
      .eq("unit_id", unitId)
      .eq("owner_user_id", session.user.id)
      .is("ended_at", null)
      .maybeSingle();

    if (!ownerRow) {
      return { error: "Não é proprietário ativo desta fração." };
    }
  }

  const { data: incidentRow, error: insertError } = await admin
    .from("incidents")
    .insert({
      building_id: buildingId,
      unit_id:     unitId ?? null,
      reported_by: session.user.id,
      title:       title.trim(),
      description: description?.trim() ?? null,
      status:      "REPORTED",
    })
    .select("id")
    .single();

  if (insertError || !incidentRow) {
    return { error: "Erro ao reportar ocorrência." };
  }

  const incident = incidentRow as unknown as { id: string };

  // Append the creation entry to incident_history.
  // from_status IS NULL marks this as the initial creation event (not a transition).
  await admin.from("incident_history").insert({
    incident_id:   incident.id,
    actor_user_id: session.user.id,
    from_status:   null,
    to_status:     "REPORTED",
    comment:       null,
  });

  // Notify all GESTORs of the building (fire-and-forget).
  void notifyIncidentReported(incident.id).catch((err: unknown) => {
    console.error(
      "[notifyIncidentReported] Failed for incident",
      incident.id,
      err,
    );
  });

  revalidatePath("/dashboard/incidents");
  revalidatePath("/my-building/incidents");
  return { success: true, id: incident.id };
}

// ---------------------------------------------------------------------------
// assessIncident — GESTOR only
//
// Transitions status: REPORTED → ASSESSED.
// Priority is mandatory from this point onward; its absence in subsequent
// reads signals a data integrity issue and is rendered distinctly in the UI.
// ---------------------------------------------------------------------------

export async function assessIncident(
  incidentId: string,
  priority: IncidentPriority,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = assessIncidentSchema.safeParse({ incidentId, priority });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: incidentRow } = await admin
    .from("incidents")
    .select("id, building_id, status, priority")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return { error: "Ocorrência não encontrada." };

  const incident = incidentRow as unknown as {
    id: string;
    building_id: string;
    status: IncidentStatus;
    priority: IncidentPriority | null;
  };

  try {
    await requireRole(session, incident.building_id, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  if (incident.status !== "REPORTED") {
    return {
      error: "Apenas ocorrências no estado 'Reportada' podem ser avaliadas.",
    };
  }

  const { error: updateError } = await admin
    .from("incidents")
    .update({ status: "ASSESSED", priority })
    .eq("id", incidentId);

  if (updateError) return { error: updateError.message };

  await admin.from("incident_history").insert({
    incident_id:   incidentId,
    actor_user_id: session.user.id,
    from_status:   "REPORTED",
    to_status:     "ASSESSED",
    comment:       null,
  });

  await admin.from("audit_log").insert({
    actor_user_id:   session.user.id,
    building_id:     incident.building_id,
    action:          "assess_incident",
    target_table:    "incidents",
    target_id:       incidentId,
    before_snapshot: { status: "REPORTED", priority: incident.priority },
    after_snapshot:  { status: "ASSESSED", priority },
  });

  revalidatePath(`/dashboard/incidents/${incidentId}`);
  revalidatePath("/dashboard/incidents");
  return { success: true };
}

// ---------------------------------------------------------------------------
// dispatchSupplier — GESTOR only
//
// Creates a supplier_dispatches record and advances status ASSESSED → SUPPLIER_DISPATCHED.
// Cross-building supplier scope is enforced at the DB layer by the
// check_supplier_dispatch_building_scope trigger; this action verifies it
// at the app layer too to surface a friendly error message before the INSERT.
// ---------------------------------------------------------------------------

export async function dispatchSupplier(
  incidentId: string,
  supplierId: string,
  scheduledDate: string,
  quotedCostCents?: number,
  notes?: string,
): Promise<{ error: string } | { success: true; dispatchId: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = dispatchSupplierSchema.safeParse({
    incidentId,
    supplierId,
    scheduledDate,
    quotedCostCents,
    notes,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: incidentRow } = await admin
    .from("incidents")
    .select("id, building_id, status")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return { error: "Ocorrência não encontrada." };

  const incident = incidentRow as unknown as {
    id: string;
    building_id: string;
    status: IncidentStatus;
  };

  try {
    await requireRole(session, incident.building_id, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  if (incident.status !== "ASSESSED") {
    return {
      error: "Apenas ocorrências no estado 'Avaliada' podem ter fornecedor despachado.",
    };
  }

  // App-layer cross-building supplier scope guard (mirrors the DB trigger).
  const { data: supplierRow } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("building_id", incident.building_id)
    .maybeSingle();

  if (!supplierRow) {
    return { error: "Fornecedor não encontrado neste condomínio." };
  }

  const { data: dispatchRow, error: dispatchError } = await admin
    .from("supplier_dispatches")
    .insert({
      incident_id:       incidentId,
      supplier_id:       supplierId,
      scheduled_date:    scheduledDate,
      quoted_cost_cents: quotedCostCents ?? null,
      notes:             notes ?? null,
    })
    .select("id")
    .single();

  if (dispatchError || !dispatchRow) {
    return { error: "Erro ao registar despacho de fornecedor." };
  }

  const dispatch = dispatchRow as unknown as { id: string };

  const { error: updateError } = await admin
    .from("incidents")
    .update({ status: "SUPPLIER_DISPATCHED" })
    .eq("id", incidentId);

  if (updateError) return { error: updateError.message };

  await admin.from("incident_history").insert({
    incident_id:   incidentId,
    actor_user_id: session.user.id,
    from_status:   "ASSESSED",
    to_status:     "SUPPLIER_DISPATCHED",
    comment:       notes ?? null,
  });

  await admin.from("audit_log").insert({
    actor_user_id:  session.user.id,
    building_id:    incident.building_id,
    action:         "dispatch_supplier",
    target_table:   "supplier_dispatches",
    target_id:      dispatch.id,
    after_snapshot: {
      incident_id:       incidentId,
      supplier_id:       supplierId,
      scheduled_date:    scheduledDate,
      quoted_cost_cents: quotedCostCents ?? null,
    },
  });

  revalidatePath(`/dashboard/incidents/${incidentId}`);
  revalidatePath("/dashboard/incidents");
  return { success: true, dispatchId: dispatch.id };
}

// ---------------------------------------------------------------------------
// transitionIncident — GESTOR only
//
// General-purpose status transition for all moves NOT covered by
// assessIncident() (REPORTED→ASSESSED) or dispatchSupplier()
// (ASSESSED→SUPPLIER_DISPATCHED). The LEGAL_TRANSITIONS map above defines
// the allowed moves; the DB trigger is the hard guard.
//
// Notification side-effects:
//   targetStatus = RESOLVED  → notifyIncidentResolved to the reporter
//   priority     = CRITICAL  → notifyIncidentCritical to all building members
// ---------------------------------------------------------------------------

export async function transitionIncident(
  incidentId: string,
  targetStatus: IncidentStatus,
  comment?: string,
): Promise<{ error: string } | { success: true }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = transitionIncidentSchema.safeParse({
    incidentId,
    targetStatus,
    comment,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  const { data: incidentRow } = await admin
    .from("incidents")
    .select("id, building_id, status, priority")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return { error: "Ocorrência não encontrada." };

  const incident = incidentRow as unknown as {
    id: string;
    building_id: string;
    status: IncidentStatus;
    priority: IncidentPriority | null;
  };

  try {
    await requireRole(session, incident.building_id, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  if (incident.status === targetStatus) {
    return { error: "A ocorrência já se encontra neste estado." };
  }

  // App-layer pre-check before hitting the DB trigger (returns a friendly
  // error message rather than a raw PostgreSQL exception).
  const allowedNext = LEGAL_TRANSITIONS[incident.status] ?? [];
  if (!allowedNext.includes(targetStatus)) {
    return {
      error: `Transição inválida: ${incident.status} → ${targetStatus}.`,
    };
  }

  const { error: updateError } = await admin
    .from("incidents")
    .update({ status: targetStatus })
    .eq("id", incidentId);

  if (updateError) {
    // DB trigger provides a descriptive error for illegal transitions.
    return { error: updateError.message };
  }

  await admin.from("incident_history").insert({
    incident_id:   incidentId,
    actor_user_id: session.user.id,
    from_status:   incident.status,
    to_status:     targetStatus,
    comment:       comment?.trim() ?? null,
  });

  await admin.from("audit_log").insert({
    actor_user_id:   session.user.id,
    building_id:     incident.building_id,
    action:          "transition_incident",
    target_table:    "incidents",
    target_id:       incidentId,
    before_snapshot: { status: incident.status },
    after_snapshot:  { status: targetStatus },
  });

  if (targetStatus === "RESOLVED") {
    void notifyIncidentResolved(incidentId).catch((err: unknown) => {
      console.error(
        "[notifyIncidentResolved] Failed for incident",
        incidentId,
        err,
      );
    });
  }

  if (incident.priority === "CRITICAL") {
    void notifyIncidentCritical(incidentId).catch((err: unknown) => {
      console.error(
        "[notifyIncidentCritical] Failed for incident",
        incidentId,
        err,
      );
    });
  }

  revalidatePath(`/dashboard/incidents/${incidentId}`);
  revalidatePath("/dashboard/incidents");
  revalidatePath("/my-building/incidents");
  return { success: true };
}

// ---------------------------------------------------------------------------
// uploadIncidentAttachment — any authenticated building member
//
// Validates the file, checks the 5-attachment cap (pre-check at the app
// layer; the enforce_max_incident_attachments DB trigger is the hard guard),
// uploads to the incident-media bucket, and creates the DB record.
// Path convention: incident-media/{building_id}/{incident_id}/{uuid}.{ext}
// Storage cleanup is attempted best-effort if the DB insert fails.
// ---------------------------------------------------------------------------

export async function uploadIncidentAttachment(
  incidentId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true; attachmentId: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsedId = z.string().uuid().safeParse(incidentId);
  if (!parsedId.success) return { error: "ID de ocorrência inválido." };

  const admin = createServerSupabaseClient();

  const { data: incidentRow } = await admin
    .from("incidents")
    .select("id, building_id, status")
    .eq("id", incidentId)
    .maybeSingle();

  if (!incidentRow) return { error: "Ocorrência não encontrada." };

  const incident = incidentRow as unknown as {
    id: string;
    building_id: string;
    status: IncidentStatus;
  };

  // Verify caller is a member of the building (any role).
  const callerRole = await getUserRole(session.user.id, incident.building_id);
  if (!callerRole) return { error: "Acesso não autorizado." };

  if (incident.status === "CLOSED") {
    return {
      error: "Não é possível adicionar anexos a uma ocorrência encerrada.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Nenhum ficheiro fornecido." };
  if (file.size === 0) return { error: "O ficheiro está vazio." };

  if (!isAcceptedAttachmentMime(file.type)) {
    return {
      error: "Tipo de ficheiro não permitido. Aceites: JPEG, PNG, WebP, PDF.",
    };
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { error: "Ficheiro demasiado grande. Tamanho máximo: 10 MB." };
  }

  // Pre-check: count existing attachments before uploading to storage.
  // The DB trigger (enforce_max_incident_attachments) is the hard serialised
  // guard against concurrent race conditions.
  const { count } = await admin
    .from("incident_attachments")
    .select("id", { count: "exact", head: true })
    .eq("incident_id", incidentId);

  if ((count ?? 0) >= 5) {
    return { error: "Limite de 5 anexos por ocorrência atingido." };
  }

  const ext         = ATTACHMENT_MIME_TO_EXT[file.type as AttachmentMimeType];
  const uuid        = randomUUID();
  const storagePath = `incident-media/${incident.building_id}/${incidentId}/${uuid}.${ext}`;

  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("incident-media")
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: "Erro ao fazer upload do ficheiro. Tente novamente." };
  }

  const { data: attachRow, error: insertError } = await admin
    .from("incident_attachments")
    .insert({
      incident_id:  incidentId,
      storage_path: storagePath,
      mime_type:    file.type,
      uploaded_by:  session.user.id,
    })
    .select("id")
    .single();

  if (insertError || !attachRow) {
    // Best-effort cleanup: remove the orphaned storage object.
    await admin.storage.from("incident-media").remove([storagePath]);
    return { error: "Erro ao registar o anexo. Tente novamente." };
  }

  const attach = attachRow as unknown as { id: string };

  revalidatePath(`/dashboard/incidents/${incidentId}`);
  revalidatePath("/my-building/incidents");
  return { success: true, attachmentId: attach.id };
}
