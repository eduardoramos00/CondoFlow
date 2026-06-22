"use server";

import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { createServerSessionClient, createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Server-side validation schemas
// Mirrors the client-side schemas in each page; enforced here because server
// actions are callable directly via fetch(), bypassing all browser-side Zod.
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(72), // bcrypt max
});

const emailSchema = z.object({ email: z.string().email() });

const passwordSchema = z.object({ password: z.string().min(8).max(72) });

export type AuthActionResult = { error: string };

// Successful auth transitions return the destination path instead of calling
// redirect(). The client must navigate with window.location.assign() (a full
// page load) so that browser-side state — the Supabase browser client and the
// User/Notification/Building contexts in the root layout — is rebuilt from the
// new auth cookies. A server-action redirect() is a soft navigation and would
// leave the previous account's session live in those contexts.
export type AuthRedirectResult = { redirectTo: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function translateAuthError(message: string): string {
  if (message.includes("Invalid login credentials"))
    return "Credenciais inválidas. Verifique o seu email e palavra-passe.";
  if (message.includes("Email not confirmed"))
    return "Email não confirmado. Verifique a sua caixa de entrada.";
  if (message.includes("User already registered"))
    return "Este email já está registado.";
  if (message.includes("Password should be at least"))
    return "A palavra-passe deve ter pelo menos 6 caracteres.";
  if (message.includes("over_email_send_rate_limit"))
    return "Demasiadas tentativas. Aguarde alguns minutos.";
  return message;
}

async function resolveRoleRedirect(userId: string, appMetadata: Record<string, unknown>): Promise<string> {
  if (appMetadata?.role === "SUPERADMIN") return "/admin";

  const admin = createServerSupabaseClient();
  const { data } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "GESTOR")
    .limit(1)
    .maybeSingle();

  // If any GESTOR row found, the user is a manager; otherwise treat as resident.
  return data ? "/dashboard" : "/my-building";
}

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------

export async function signIn(
  email: string,
  password: string,
): Promise<AuthActionResult | AuthRedirectResult> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createServerSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: translateAuthError(error.message) };
  if (!data.user) return { error: "Erro de autenticação. Tente novamente." };

  const path = await resolveRoleRedirect(
    data.user.id,
    data.user.app_metadata as Record<string, unknown>,
  );
  return { redirectTo: path };
}

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------

export async function signUp(
  fullName: string,
  email: string,
  password: string,
): Promise<{ success: true } | AuthActionResult> {
  const parsed = signUpSchema.safeParse({ fullName, email, password });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createServerSessionClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // raw_user_meta_data used by the handle_new_user DB trigger (migration 001)
      // to populate profiles.full_name automatically on sign-up.
      data: { full_name: fullName },
    },
  });

  if (error) return { error: translateAuthError(error.message) };
  return { success: true };
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------

export async function signOut(): Promise<AuthRedirectResult> {
  const session = await getServerSession();
  if (!session) return { redirectTo: "/login" };

  const supabase = await createServerSessionClient();
  await supabase.auth.signOut();
  return { redirectTo: "/login" };
}

// ---------------------------------------------------------------------------
// forgotPassword
// ---------------------------------------------------------------------------

export async function forgotPassword(email: string): Promise<AuthActionResult | void> {
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createServerSessionClient();

  const siteUrl =
    process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    // Rate-limiting is the one error we surface; all others are swallowed to
    // prevent email-enumeration (the UI always shows "email sent" regardless).
    if (error.message.includes("over_email_send_rate_limit")) {
      return { error: translateAuthError(error.message) };
    }
    return; // silently succeed — do not reveal whether the address exists
  }
}

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

export async function resetPassword(
  password: string,
): Promise<AuthActionResult | AuthRedirectResult> {
  const parsed = passwordSchema.safeParse({ password });
  if (!parsed.success) return { error: "Dados inválidos." };

  const session = await getServerSession();
  if (!session)
    return { error: "Sessão expirada. Solicite um novo link de recuperação." };

  const supabase = await createServerSessionClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: translateAuthError(error.message) };

  const path = await resolveRoleRedirect(
    session.user.id,
    session.user.app_metadata as Record<string, unknown>,
  );
  return { redirectTo: path };
}
