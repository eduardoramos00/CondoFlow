"use server";

import { revalidatePath } from "next/cache";

import { getServerUser } from "@/lib/auth/session";
import { isSuperAdmin, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type GdprRequestStatus = "PENDING" | "PROCESSING" | "COMPLETED";

export type GdprDeletionRequest = {
  id: string;
  requesting_user_id: string;
  target_user_id: string;
  status: GdprRequestStatus;
  requested_at: string;
  completed_at: string | null;
};

// ---------------------------------------------------------------------------
// requestDataDeletion
// ---------------------------------------------------------------------------

/**
 * Creates a GDPR Article 17 erasure request.
 *
 * - Regular users: may only request deletion of their own data
 *   (target defaults to and is locked to auth.uid()).
 * - SuperAdmins: may specify any targetUserId.
 *
 * Guard: rejects if an active (PENDING or PROCESSING) request already
 * exists for the same target, preventing duplicate in-flight operations.
 */
export async function requestDataDeletion(
  targetUserId?: string,
): Promise<{ error?: string; id?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Não autenticado." };

  const resolvedTargetId = targetUserId ?? user.id;

  if (!isSuperAdmin(user) && resolvedTargetId !== user.id) {
    return {
      error:
        "Não está autorizado a solicitar a eliminação de dados de outro utilizador.",
    };
  }

  const admin = createServerSupabaseClient();

  // Duplicate-guard: one active request per target at a time.
  const { data: existing } = await admin
    .from("gdpr_deletion_requests")
    .select("id, status")
    .eq("target_user_id", resolvedTargetId)
    .in("status", ["PENDING", "PROCESSING"])
    .maybeSingle();

  if (existing) {
    const s = (existing as { id: string; status: string }).status;
    return {
      error: `Já existe um pedido de eliminação ${s === "PENDING" ? "pendente" : "em processamento"} para este utilizador.`,
    };
  }

  const { data, error } = await admin
    .from("gdpr_deletion_requests")
    .insert({
      requesting_user_id: user.id,
      target_user_id: resolvedTargetId,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Falha ao criar pedido de eliminação." };

  return { id: (data as { id: string }).id };
}

// ---------------------------------------------------------------------------
// processDataDeletion
// ---------------------------------------------------------------------------

/**
 * SuperAdmin-only. Anonymises all PII for the request's target user:
 *
 *   auth.users.email              → {8-char uuid prefix}@deleted.condoflow
 *   auth.users.user_metadata      → { full_name: 'REDACTED', avatar_url: null }
 *   profiles.full_name            → 'REDACTED'
 *   profiles.avatar_url           → null
 *
 * Intentionally NOT touched (no PII beyond FK references):
 *   quotas, payments, expenses, budget_line_items, audit_log,
 *   incident_history, session_log
 *
 * Failure model: if the auth-layer update fails the request is rolled
 * back to PENDING so the operation is safely retryable.  Once COMPLETED
 * the function is idempotent (returns an error rather than re-running).
 */
export async function processDataDeletion(
  requestId: string,
): Promise<{ error?: string }> {
  const caller = await getServerUser();
  if (!caller || !isSuperAdmin(caller)) {
    throw new UnauthorizedError(
      "Apenas SuperAdmins podem processar pedidos GDPR.",
    );
  }

  const admin = createServerSupabaseClient();

  // Fetch and validate the request.
  const { data: raw, error: fetchError } = await admin
    .from("gdpr_deletion_requests")
    .select("id, target_user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !raw) return { error: "Pedido não encontrado." };

  const request = raw as { id: string; target_user_id: string; status: string };

  if (request.status === "COMPLETED") {
    return { error: "Este pedido já foi processado." };
  }

  // ── Step 1: mark PROCESSING ────────────────────────────────────────────────
  await admin
    .from("gdpr_deletion_requests")
    .update({ status: "PROCESSING" })
    .eq("id", requestId);

  // ── Step 2: anonymise auth.users (email + user_metadata) ──────────────────
  // The deleted email embeds the first 8 chars of the UUID to satisfy the
  // UNIQUE constraint on auth.users.email while remaining clearly non-personal.
  const deletedEmail = `${request.target_user_id.slice(0, 8)}@deleted.condoflow`;

  const { error: authError } = await admin.auth.admin.updateUserById(
    request.target_user_id,
    {
      email: deletedEmail,
      user_metadata: { full_name: "REDACTED", avatar_url: null },
    },
  );

  if (authError) {
    // Roll back to PENDING — safe to retry.
    await admin
      .from("gdpr_deletion_requests")
      .update({ status: "PENDING" })
      .eq("id", requestId);
    return {
      error: `Falha ao anonimizar dados de autenticação: ${authError.message}`,
    };
  }

  // ── Step 3: anonymise profiles table ──────────────────────────────────────
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: "REDACTED", avatar_url: null })
    .eq("id", request.target_user_id);

  if (profileError) {
    await admin
      .from("gdpr_deletion_requests")
      .update({ status: "PENDING" })
      .eq("id", requestId);
    return {
      error: `Falha ao anonimizar perfil: ${profileError.message}`,
    };
  }

  // ── Step 4: mark COMPLETED ─────────────────────────────────────────────────
  await admin
    .from("gdpr_deletion_requests")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  revalidatePath("/admin/users");
  return {};
}
