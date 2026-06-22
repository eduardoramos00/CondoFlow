import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendEmail, EmailTemplate } from "./email";
import type { EmailTemplatePayload } from "./email";
import type { Database, Json } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createServerSupabaseClient>;

type NotificationEvent =
  Database["public"]["Enums"]["notification_event_enum"];

type NotificationPrefs = {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function getUserEmail(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

// Returns the user's notification preferences for a given building.
// Defaults to all-channels-enabled when no preference row exists yet,
// consistent with the DB column defaults in migration 005.
async function getPreferences(
  admin: AdminClient,
  userId: string,
  buildingId: string,
): Promise<NotificationPrefs> {
  const { data } = await admin
    .from("notification_preferences")
    .select("email_enabled, sms_enabled, push_enabled")
    .eq("user_id", userId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!data) return { email_enabled: true, sms_enabled: true, push_enabled: true };

  const row = data as unknown as NotificationPrefs;
  return {
    email_enabled: row.email_enabled,
    sms_enabled:   row.sms_enabled,
    push_enabled:  row.push_enabled,
  };
}

// Inserts a single IN_APP notification and marks it SENT immediately.
// The NotificationContext Realtime subscription (Phase 4.4) will pick it up.
async function insertInApp(
  admin: AdminClient,
  buildingId: string,
  recipientUserId: string,
  eventType: NotificationEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await admin.from("notifications").insert({
    building_id:       buildingId,
    recipient_user_id: recipientUserId,
    event_type:        eventType,
    channel:           "IN_APP",
    payload:           payload as unknown as Json,
    delivery_status:   "SENT",
    sent_at:           new Date().toISOString(),
  });
}

// Inserts an EMAIL notification row (PENDING), calls the email provider,
// then updates delivery_status to SENT or FAILED. Email failures are
// contained here — they do not throw to the caller.
async function insertAndSendEmail<T extends EmailTemplate>(
  admin: AdminClient,
  buildingId: string,
  recipientUserId: string,
  eventType: NotificationEvent,
  emailAddress: string,
  template: T,
  payload: EmailTemplatePayload[T],
): Promise<void> {
  const { data: row } = await admin
    .from("notifications")
    .insert({
      building_id:       buildingId,
      recipient_user_id: recipientUserId,
      event_type:        eventType,
      channel:           "EMAIL",
      payload:           payload as unknown as Json,
      delivery_status:   "PENDING",
    })
    .select("id")
    .single();

  if (!row) return;

  const notifId = (row as unknown as { id: string }).id;
  const sentAt  = new Date().toISOString();

  try {
    await sendEmail(template, emailAddress, payload);
    await admin
      .from("notifications")
      .update({ delivery_status: "SENT", sent_at: sentAt })
      .eq("id", notifId);
  } catch {
    await admin
      .from("notifications")
      .update({ delivery_status: "FAILED" })
      .eq("id", notifId);
  }
}

// ---------------------------------------------------------------------------
// notifyQuotaOverdue
//
// Triggered by: markQuotaOverdue server action (Phase 2.5, wired below) and
//               the overdue-quota-sweep Edge Function (Phase 4.3).
// Recipients:   active unit owner(s) at the time of the event.
// ---------------------------------------------------------------------------

export async function notifyQuotaOverdue(quotaId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: quotaData } = await admin
    .from("quotas")
    .select(
      "id, unit_id, amount_cents, due_date, units!inner(identifier, building_id, buildings!inner(name))",
    )
    .eq("id", quotaId)
    .single();

  if (!quotaData) return;

  const quota = quotaData as unknown as {
    id: string;
    unit_id: string;
    amount_cents: number;
    due_date: string;
    units: { identifier: string; building_id: string; buildings: { name: string } };
  };

  const buildingId     = quota.units.building_id;
  const buildingName   = quota.units.buildings.name;
  const unitIdentifier = quota.units.identifier;

  const { data: ownerRows } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", quota.unit_id)
    .is("ended_at", null);

  for (const row of (ownerRows ?? []) as unknown as { owner_user_id: string }[]) {
    const ownerId = row.owner_user_id;

    const [prefs, email] = await Promise.all([
      getPreferences(admin, ownerId, buildingId),
      getUserEmail(admin, ownerId),
    ]);

    const payload: EmailTemplatePayload["QUOTA_OVERDUE"] = {
      unit_identifier: unitIdentifier,
      amount_cents:    quota.amount_cents,
      due_date:        quota.due_date,
      building_name:   buildingName,
    };

    await insertInApp(admin, buildingId, ownerId, "QUOTA_OVERDUE", payload);

    if (prefs.email_enabled && email) {
      await insertAndSendEmail(
        admin, buildingId, ownerId, "QUOTA_OVERDUE",
        email, EmailTemplate.QUOTA_OVERDUE, payload,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// notifyQuotaReminder
//
// Triggered by: a scheduled reminder sweep (future Phase) — quota is still
//               PENDING but the due date is approaching.
// Recipients:   active unit owner(s).
// ---------------------------------------------------------------------------

export async function notifyQuotaReminder(quotaId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: quotaData } = await admin
    .from("quotas")
    .select(
      "id, unit_id, amount_cents, due_date, units!inner(identifier, building_id, buildings!inner(name))",
    )
    .eq("id", quotaId)
    .single();

  if (!quotaData) return;

  const quota = quotaData as unknown as {
    id: string;
    unit_id: string;
    amount_cents: number;
    due_date: string;
    units: { identifier: string; building_id: string; buildings: { name: string } };
  };

  const buildingId     = quota.units.building_id;
  const buildingName   = quota.units.buildings.name;
  const unitIdentifier = quota.units.identifier;

  const { data: ownerRows } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", quota.unit_id)
    .is("ended_at", null);

  for (const row of (ownerRows ?? []) as unknown as { owner_user_id: string }[]) {
    const ownerId = row.owner_user_id;

    const [prefs, email] = await Promise.all([
      getPreferences(admin, ownerId, buildingId),
      getUserEmail(admin, ownerId),
    ]);

    const payload: EmailTemplatePayload["QUOTA_REMINDER"] = {
      unit_identifier: unitIdentifier,
      amount_cents:    quota.amount_cents,
      due_date:        quota.due_date,
      building_name:   buildingName,
    };

    await insertInApp(admin, buildingId, ownerId, "QUOTA_REMINDER", payload);

    if (prefs.email_enabled && email) {
      await insertAndSendEmail(
        admin, buildingId, ownerId, "QUOTA_REMINDER",
        email, EmailTemplate.QUOTA_REMINDER, payload,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// notifyAssemblyScheduled
//
// Triggered by: transitionAssemblyStatus to PUBLISHED (Phase 5.2).
// Recipients:   all GESTOR and CONDÓMINO members of the building.
// ---------------------------------------------------------------------------

export async function notifyAssemblyScheduled(assemblyId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: assemblyData } = await admin
    .from("assemblies")
    .select(
      "id, type, scheduled_at, location, building_id, buildings!inner(name)",
    )
    .eq("id", assemblyId)
    .single();

  if (!assemblyData) return;

  const assembly = assemblyData as unknown as {
    id: string;
    type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
    scheduled_at: string;
    location: string;
    building_id: string;
    buildings: { name: string };
  };

  const buildingId   = assembly.building_id;
  const buildingName = assembly.buildings.name;

  const { data: memberRows } = await admin
    .from("user_building_roles")
    .select("user_id")
    .eq("building_id", buildingId);

  for (const row of (memberRows ?? []) as unknown as { user_id: string }[]) {
    const userId = row.user_id;

    const [prefs, email] = await Promise.all([
      getPreferences(admin, userId, buildingId),
      getUserEmail(admin, userId),
    ]);

    const payload: EmailTemplatePayload["ASSEMBLY_SCHEDULED"] = {
      assembly_type: assembly.type,
      scheduled_at:  assembly.scheduled_at,
      location:      assembly.location,
      building_name: buildingName,
    };

    await insertInApp(admin, buildingId, userId, "ASSEMBLY_SCHEDULED", payload);

    if (prefs.email_enabled && email) {
      await insertAndSendEmail(
        admin, buildingId, userId, "ASSEMBLY_SCHEDULED",
        email, EmailTemplate.ASSEMBLY_SCHEDULED, payload,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// notifyAssemblyReminder48h
//
// Triggered by: a scheduled 48-hour reminder sweep (future Phase).
// Recipients:   all building members.
// ---------------------------------------------------------------------------

export async function notifyAssemblyReminder48h(assemblyId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: assemblyData } = await admin
    .from("assemblies")
    .select(
      "id, type, scheduled_at, location, building_id, buildings!inner(name)",
    )
    .eq("id", assemblyId)
    .single();

  if (!assemblyData) return;

  const assembly = assemblyData as unknown as {
    id: string;
    type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
    scheduled_at: string;
    location: string;
    building_id: string;
    buildings: { name: string };
  };

  const buildingId   = assembly.building_id;
  const buildingName = assembly.buildings.name;

  const { data: memberRows } = await admin
    .from("user_building_roles")
    .select("user_id")
    .eq("building_id", buildingId);

  for (const row of (memberRows ?? []) as unknown as { user_id: string }[]) {
    const userId = row.user_id;

    const [prefs, email] = await Promise.all([
      getPreferences(admin, userId, buildingId),
      getUserEmail(admin, userId),
    ]);

    const payload: EmailTemplatePayload["ASSEMBLY_REMINDER_48H"] = {
      assembly_type: assembly.type,
      scheduled_at:  assembly.scheduled_at,
      location:      assembly.location,
      building_name: buildingName,
    };

    await insertInApp(admin, buildingId, userId, "ASSEMBLY_REMINDER_48H", payload);

    if (prefs.email_enabled && email) {
      await insertAndSendEmail(
        admin, buildingId, userId, "ASSEMBLY_REMINDER_48H",
        email, EmailTemplate.ASSEMBLY_REMINDER_48H, payload,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// notifyVoteOpen
//
// Triggered by: openVoting server action (Phase 5.2).
// Recipients:   all building members.
// ---------------------------------------------------------------------------

export async function notifyVoteOpen(agendaItemId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: itemData } = await admin
    .from("agenda_items")
    .select(
      "id, title, assemblies!inner(id, building_id, type, buildings!inner(name))",
    )
    .eq("id", agendaItemId)
    .single();

  if (!itemData) return;

  const item = itemData as unknown as {
    id: string;
    title: string;
    assemblies: {
      id: string;
      building_id: string;
      type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
      buildings: { name: string };
    };
  };

  const buildingId   = item.assemblies.building_id;
  const buildingName = item.assemblies.buildings.name;

  const { data: memberRows } = await admin
    .from("user_building_roles")
    .select("user_id")
    .eq("building_id", buildingId);

  for (const row of (memberRows ?? []) as unknown as { user_id: string }[]) {
    const userId = row.user_id;

    const [prefs, email] = await Promise.all([
      getPreferences(admin, userId, buildingId),
      getUserEmail(admin, userId),
    ]);

    const payload: EmailTemplatePayload["VOTE_OPEN"] = {
      agenda_item_title: item.title,
      assembly_type:     item.assemblies.type,
      building_name:     buildingName,
    };

    await insertInApp(admin, buildingId, userId, "VOTE_OPEN", payload);

    if (prefs.email_enabled && email) {
      await insertAndSendEmail(
        admin, buildingId, userId, "VOTE_OPEN",
        email, EmailTemplate.VOTE_OPEN, payload,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// notifyIncidentReported
//
// Triggered by: reportIncident server action (Phase 6.2).
// Recipients:   GESTOR(s) of the building.
// Channel:      IN_APP only — no EmailTemplate for INCIDENT_REPORTED exists
//               in the current email template set (GESTORs are expected to
//               monitor the app dashboard in real-time).
// unit_id is nullable (common-area incidents have no unit). The unit lookup
// is done as a separate optional query rather than an !inner join to avoid
// PostgREST returning no rows when unit_id IS NULL.
// ---------------------------------------------------------------------------

export async function notifyIncidentReported(incidentId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: incidentData } = await admin
    .from("incidents")
    .select("id, title, building_id, unit_id, buildings!inner(name)")
    .eq("id", incidentId)
    .single();

  if (!incidentData) return;

  const incident = incidentData as unknown as {
    id: string;
    title: string;
    building_id: string;
    unit_id: string | null;
    buildings: { name: string };
  };

  const buildingId = incident.building_id;

  let unitIdentifier = "Área comum";
  if (incident.unit_id) {
    const { data: unitRow } = await admin
      .from("units")
      .select("identifier")
      .eq("id", incident.unit_id)
      .maybeSingle();
    if (unitRow) {
      unitIdentifier = (unitRow as unknown as { identifier: string }).identifier;
    }
  }

  const { data: gestorRows } = await admin
    .from("user_building_roles")
    .select("user_id")
    .eq("building_id", buildingId)
    .eq("role", "GESTOR");

  const inAppPayload: Record<string, unknown> = {
    incident_id:     incidentId,
    incident_title:  incident.title,
    unit_identifier: unitIdentifier,
    building_name:   incident.buildings.name,
  };

  for (const row of (gestorRows ?? []) as unknown as { user_id: string }[]) {
    await insertInApp(admin, buildingId, row.user_id, "INCIDENT_REPORTED", inAppPayload);
  }
}

// ---------------------------------------------------------------------------
// notifyIncidentCritical
//
// Triggered by: transitionIncident server action (Phase 6.2) whenever the
// incident has CRITICAL priority. Broadcasts to ALL building members so
// every owner is aware of critical ongoing situations.
// Reuses the INCIDENT_REPORTED event type (the DB enum has no separate
// INCIDENT_CRITICAL value); the payload carries is_critical: true so the
// in-app UI (Phase 4.4) can render a distinct badge.
// ---------------------------------------------------------------------------

export async function notifyIncidentCritical(incidentId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: incidentData } = await admin
    .from("incidents")
    .select("id, title, status, building_id, buildings!inner(name)")
    .eq("id", incidentId)
    .single();

  if (!incidentData) return;

  const incident = incidentData as unknown as {
    id: string;
    title: string;
    status: string;
    building_id: string;
    buildings: { name: string };
  };

  const buildingId   = incident.building_id;
  const buildingName = incident.buildings.name;

  const { data: memberRows } = await admin
    .from("user_building_roles")
    .select("user_id")
    .eq("building_id", buildingId);

  const payload: Record<string, unknown> = {
    incident_id:    incidentId,
    incident_title: incident.title,
    building_name:  buildingName,
    new_status:     incident.status,
    is_critical:    true,
  };

  for (const row of (memberRows ?? []) as unknown as { user_id: string }[]) {
    await insertInApp(admin, buildingId, row.user_id, "INCIDENT_REPORTED", payload);
  }
}

// ---------------------------------------------------------------------------
// notifyIncidentResolved
//
// Triggered by: transitionIncident to RESOLVED (Phase 6.2).
// Recipients:   the user who originally reported the incident.
// ---------------------------------------------------------------------------

export async function notifyIncidentResolved(incidentId: string): Promise<void> {
  const admin = createServerSupabaseClient();

  const { data: incidentData } = await admin
    .from("incidents")
    .select(
      "id, title, reported_by, building_id, updated_at, buildings!inner(name)",
    )
    .eq("id", incidentId)
    .single();

  if (!incidentData) return;

  const incident = incidentData as unknown as {
    id: string;
    title: string;
    reported_by: string;
    building_id: string;
    updated_at: string;
    buildings: { name: string };
  };

  const buildingId   = incident.building_id;
  const buildingName = incident.buildings.name;
  const reporterId   = incident.reported_by;

  const [prefs, email] = await Promise.all([
    getPreferences(admin, reporterId, buildingId),
    getUserEmail(admin, reporterId),
  ]);

  const payload: EmailTemplatePayload["INCIDENT_RESOLVED"] = {
    incident_title: incident.title,
    building_name:  buildingName,
    resolved_at:    incident.updated_at,
  };

  await insertInApp(admin, buildingId, reporterId, "INCIDENT_RESOLVED", payload);

  if (prefs.email_enabled && email) {
    await insertAndSendEmail(
      admin, buildingId, reporterId, "INCIDENT_RESOLVED",
      email, EmailTemplate.INCIDENT_RESOLVED, payload,
    );
  }
}
