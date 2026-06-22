import "server-only";

import type { Session, User } from "@supabase/supabase-js";

import { createServerSessionClient } from "@/lib/supabase/server";

export type { Session, User };

/**
 * Returns the current user's session from the request cookie.
 *
 * Use in server actions and route handlers as the primary auth guard:
 *   const session = await getServerSession();
 *   if (!session) return { error: "Unauthorized", status: 401 };
 *
 * NOTE: getSession() reads from the signed cookie and is safe for SSR.
 * For mutations that require verified identity, use getServerUser() instead,
 * which validates the JWT against the Supabase Auth server on every call.
 */
export async function getServerSession(): Promise<Session | null> {
  const supabase = await createServerSessionClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

/**
 * Returns the currently authenticated user, verified server-side via a
 * network call to Supabase Auth. Prefer this over getServerSession() for
 * any action that reads or mutates sensitive data.
 *
 * Returns null if the user is unauthenticated or the JWT is invalid/expired.
 */
export async function getServerUser(): Promise<User | null> {
  const supabase = await createServerSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Returns the authenticated user's ID (UUID), or null if unauthenticated.
 * Convenience wrapper around getServerUser() for the common case of only
 * needing the ID for a DB query filter.
 */
export async function getServerUserId(): Promise<string | null> {
  const user = await getServerUser();
  return user?.id ?? null;
}
