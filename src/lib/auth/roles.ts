import "server-only";

import type { Session, User } from "@supabase/supabase-js";

import type { AppRole, BuildingRole } from "@/lib/auth/can";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Re-exported for server-action convenience. Client components must import
// these types from @/lib/auth/can (not here) to avoid bundling server-only code.
export type { AppRole, BuildingRole };

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class UnauthorizedError extends Error {
  readonly statusCode = 403;

  constructor(message = "Acesso não autorizado.") {
    super(message);
    this.name = "UnauthorizedError";
    // Required for correct instanceof checks when TypeScript targets ES5/ES2015
    // and the error subclass is transpiled to a prototype-chain assignment.
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

// ---------------------------------------------------------------------------
// SuperAdmin detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the user holds the SUPERADMIN platform role.
 *
 * The flag is stored in auth.users.app_metadata.role and is set exclusively
 * via the Supabase Auth admin API — it cannot be written by the user.
 *
 * SuperAdmins bypass all building-scoped role checks.
 */
export function isSuperAdmin(user: User): boolean {
  return user.app_metadata?.["role"] === "SUPERADMIN";
}

// ---------------------------------------------------------------------------
// getUserRole
// ---------------------------------------------------------------------------

/**
 * Returns the calling user's role in the given building, or null if they have
 * no assignment. Uses the service-role client to bypass RLS so this function
 * is safe to call from any server action context, regardless of the current
 * user's own RLS visibility.
 */
export async function getUserRole(
  userId: string,
  buildingId: string,
): Promise<BuildingRole | null> {
  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (error || !data) return null;

  // The DB stub types the row as Record<string,Json>; narrow to the known enum.
  const raw = (data as { role: unknown }).role;
  if (raw === "GESTOR" || raw === "CONDÓMINO") return raw;

  return null;
}

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

/**
 * Asserts that the session holder has one of the required roles in the given
 * building. Throws UnauthorizedError when the check fails.
 *
 * Returns the caller's effective AppRole so server actions can branch on it
 * after the guard without a second DB round-trip.
 *
 * SuperAdmins bypass building-level checks and receive 'SUPERADMIN' as the
 * return value — callers should use isSuperAdmin() before calling this if
 * they need to distinguish the superadmin path.
 *
 * Typical server action pattern:
 *
 *   const session = await getServerSession();
 *   if (!session) return { error: 'Não autenticado.' };
 *   try {
 *     await requireRole(session, buildingId, ['GESTOR']);
 *   } catch (err) {
 *     if (err instanceof UnauthorizedError) return { error: err.message };
 *     throw err;
 *   }
 */
export async function requireRole(
  session: Session,
  buildingId: string,
  allowedRoles: ReadonlyArray<BuildingRole>,
): Promise<AppRole> {
  if (isSuperAdmin(session.user)) return "SUPERADMIN";

  const role = await getUserRole(session.user.id, buildingId);

  if (!role || !allowedRoles.includes(role)) {
    const allowed = allowedRoles.length
      ? allowedRoles.join(" ou ")
      : "adequado";
    throw new UnauthorizedError(
      `Esta operação requer o papel ${allowed} neste condomínio.`,
    );
  }

  return role;
}
