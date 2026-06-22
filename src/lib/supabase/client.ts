"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";

/**
 * Browser-side Supabase client — uses the anon key with the authenticated
 * user's session. Intended exclusively for Supabase Realtime subscriptions.
 *
 * All database mutations must go through server actions, not this client.
 */
export function createBrowserSupabaseClient() {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Ensure .env.local is populated from .env.local.example.",
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
