"use server";

import { getServerSession } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UserBuilding = {
  id: string;
  name: string;
  address: string;
  userRole: "GESTOR" | "CONDÓMINO";
};

/**
 * Returns all buildings the current user belongs to, with their role in each.
 * Uses the service-role client to bypass RLS — safe because we always scope
 * the query to the authenticated user's own ID.
 */
export async function getUserBuildings(): Promise<UserBuilding[]> {
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

  const { data: buildingRows, error: buildingError } = await admin
    .from("buildings")
    .select("id, name, address")
    .in("id", buildingIds);

  if (buildingError || !buildingRows) return [];

  const buildingMap = new Map(
    (buildingRows as { id: string; name: string; address: string }[]).map(
      (b) => [b.id, b],
    ),
  );

  return rows
    .filter(
      (r): r is { building_id: string; role: "GESTOR" | "CONDÓMINO" } =>
        r.role === "GESTOR" || r.role === "CONDÓMINO",
    )
    .flatMap((r) => {
      const b = buildingMap.get(r.building_id);
      if (!b) return [];
      return [{ id: b.id, name: b.name, address: b.address, userRole: r.role }];
    });
}
