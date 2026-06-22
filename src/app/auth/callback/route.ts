import { NextResponse, type NextRequest } from "next/server";

import { createServerSessionClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback handler.
 *
 * Handles two token exchange flows:
 *   1. Email confirmation (sign-up) — `type=signup`
 *   2. Password recovery — `type=recovery`, redirects to `next` param
 *   3. Magic link — `type=magiclink`
 *
 * Supabase redirects the user here with a short-lived `code` query param.
 * This route exchanges the code for a session cookie and redirects onward.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";

  // Reject absolute URLs and protocol-relative paths to prevent open-redirect
  // attacks. A crafted ?next=https://evil.com would otherwise bypass the `origin`
  // base in new URL(next, origin) because absolute URLs ignore the base argument.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  if (code) {
    const supabase = await createServerSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Invalid or missing code — redirect to login with an error hint.
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "link_invalid");
  return NextResponse.redirect(loginUrl);
}
