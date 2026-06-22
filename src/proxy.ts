import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/types";

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = ["/dashboard", "/my-building", "/admin"];

// Auth-flow routes: redirect authenticated users away to avoid back-button issues.
// NOTE: /reset-password is intentionally absent. The password-reset flow requires
// an already-authenticated session (established by /auth/callback exchanging the
// recovery code). Including it here would redirect users away from the page they
// need to reach immediately after clicking their recovery email link.
const AUTH_PREFIXES = ["/login", "/register", "/forgot-password"];

// Auth paths subject to rate limiting (includes the OAuth callback endpoint).
const RATE_LIMITED_PREFIXES = ["/login", "/register", "/forgot-password", "/auth/"];

// ---------------------------------------------------------------------------
// Auth-route rate limiter
//
// Per-process in-memory limiter: 20 requests / 60 s per client IP.
// In multi-instance / edge deployments each worker maintains its own window,
// so this is defence-in-depth — not a distributed limit.  The primary rate
// limiting layer is Supabase Auth's built-in throttle on the Auth API.
// ---------------------------------------------------------------------------
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RL_MAX = 20;
const RL_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Prune expired entries periodically to prevent unbounded growth.
  if (rateLimitStore.size > 5_000) {
    for (const [key, val] of rateLimitStore) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }

  const record = rateLimitStore.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }
  if (record.count >= RL_MAX) return true;
  record.count++;
  return false;
}

/**
 * Middleware responsibilities (executed in order on every matched request):
 *
 * 1. Auth-route rate limiting — limits /login, /register, /forgot-password,
 *    /auth/* to 20 req / 60 s per IP to slow credential-stuffing attempts.
 *
 * 2. Session refresh — rotates the Supabase JWT access token via the anon client.
 *    Required by @supabase/ssr; without this, tokens expire silently.
 *
 * 3. Route protection — unauthenticated requests to PROTECTED_PREFIXES are
 *    redirected to /login.
 *
 * 4. SuperAdmin gate — /admin/* additionally requires app_metadata.role = 'SUPERADMIN'.
 *
 * 5. Auth-route bypass — authenticated users visiting login/register are sent
 *    to /dashboard. Fine-grained role-based redirects happen inside signIn()
 *    (src/app/actions/auth.ts), not here, to avoid a DB call on every request.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Auth-route rate limiting ---
  const isRateLimitedPath = RATE_LIMITED_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  if (isRateLimitedPath) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    if (isRateLimited(ip)) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }

  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() validates the JWT server-side and triggers a token refresh
  // when the access token is close to expiry.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Route protection ---
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the originally requested path so the user can be sent there
    // after successful login (Phase 1.4+ can wire this up with requireRole).
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- SuperAdmin gate ---
  // /admin/* is included in PROTECTED_PREFIXES (authenticated-only above), but
  // requires the additional app_metadata.role = 'SUPERADMIN' claim.  Regular
  // GESTOR / CONDÓMINO users are silently redirected to their own dashboard.
  if (pathname.startsWith("/admin") && user) {
    if (user.app_metadata?.["role"] !== "SUPERADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // --- Auth-route bypass ---
  const isAuthRoute = AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isAuthRoute && user) {
    // Default to /dashboard; the role-based destination is resolved by signIn().
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (compiled assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public static files (images, fonts, icons)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
