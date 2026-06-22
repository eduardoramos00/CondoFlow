"use server";

import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildingPreference = {
  building_id: string;
  building_name: string;
  user_role: "GESTOR" | "CONDÓMINO";
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
};

// ---------------------------------------------------------------------------
// getNotificationPreferences
//
// Returns all notification preference rows for the current user, one per
// building membership.  When no row exists for a building (e.g. the row was
// not yet bootstrapped), the DB defaults (all-true) are returned in-memory so
// the UI shows the correct initial state without requiring a separate upsert.
// ---------------------------------------------------------------------------

export async function getNotificationPreferences(): Promise<
  BuildingPreference[]
> {
  const session = await getServerSession();
  if (!session) return [];

  const admin = createServerSupabaseClient();

  const { data: roleRows, error: roleError } = await admin
    .from("user_building_roles")
    .select("building_id, role")
    .eq("user_id", session.user.id);

  if (roleError || !roleRows?.length) return [];

  const rows = roleRows as { building_id: string; role: string }[];
  const buildingIds = rows.map((r) => r.building_id);

  const [{ data: buildingRows }, { data: prefRows }] = await Promise.all([
    admin.from("buildings").select("id, name").in("id", buildingIds),
    admin
      .from("notification_preferences")
      .select("building_id, email_enabled, sms_enabled, push_enabled")
      .eq("user_id", session.user.id)
      .in("building_id", buildingIds),
  ]);

  if (!buildingRows) return [];

  const buildings = buildingRows as { id: string; name: string }[];
  const prefs = (prefRows ?? []) as {
    building_id: string;
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
  }[];

  return rows
    .map((r) => {
      const building = buildings.find((b) => b.id === r.building_id);
      if (!building) return null;
      const pref = prefs.find((p) => p.building_id === r.building_id);
      return {
        building_id: r.building_id,
        building_name: building.name,
        user_role: r.role as "GESTOR" | "CONDÓMINO",
        // Fall back to DB defaults when no row exists yet.
        email_enabled: pref?.email_enabled ?? true,
        sms_enabled: pref?.sms_enabled ?? true,
        push_enabled: pref?.push_enabled ?? true,
      };
    })
    .filter((x): x is BuildingPreference => x !== null);
}

// ---------------------------------------------------------------------------
// updateNotificationPreferences
//
// Upserts the notification_preferences row for the current user + building.
// Membership is verified before the write to prevent unauthorised rows.
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  buildingId: z.string().uuid("buildingId must be a valid UUID"),
  prefs: z.object({
    email_enabled: z.boolean(),
    sms_enabled: z.boolean(),
    push_enabled: z.boolean(),
  }),
});

export async function updateNotificationPreferences(
  buildingId: string,
  prefs: {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
  },
): Promise<{ error?: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = updateSchema.safeParse({ buildingId, prefs });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createServerSupabaseClient();

  // Membership check — prevents upserts for buildings the user doesn't belong to.
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", buildingId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!roleRow) return { error: "Sem permissão para este edifício." };

  const { error } = await admin.from("notification_preferences").upsert(
    {
      user_id: session.user.id,
      building_id: buildingId,
      email_enabled: prefs.email_enabled,
      sms_enabled: prefs.sms_enabled,
      push_enabled: prefs.push_enabled,
    },
    { onConflict: "user_id,building_id" },
  );

  if (error) return { error: "Erro ao guardar preferências." };
  return {};
}
