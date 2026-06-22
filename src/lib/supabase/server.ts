import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "./types";

/**
 * Reads a required environment variable.
 * Throws at call-time (server startup) rather than silently returning undefined.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Cookie-aware server client — uses the anon key with the authenticated user's
 * session cookie. Respects RLS. Use this for session reads and user-scoped queries.
 *
 * Must be called from a Server Component, Server Action, or Route Handler.
 */
export async function createServerSessionClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component where cookies are read-only.
            // Session refresh is handled by middleware — this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role admin client — bypasses RLS entirely.
 * Use ONLY in Server Actions and Route Handlers for privileged mutations.
 *
 * NEVER import this in client components or expose it to the browser.
 */
export function createServerSupabaseClient() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
