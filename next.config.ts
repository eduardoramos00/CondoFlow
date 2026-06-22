import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Content Security Policy
//
// 'unsafe-inline' on script-src is required by Next.js App Router for
// hydration scripts. Tighten this to a nonce-based policy in a future
// hardening pass (requires middleware to inject the nonce into every response).
//
// connect-src covers Supabase REST, Auth, Storage, and Realtime (WSS).
// img-src allows blob: for react-pdf previews and Supabase Storage avatars.
// ---------------------------------------------------------------------------
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.io wss://*.supabase.io",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .replace(/\n/g, "");

const securityHeaders = [
  // Blocks the page from being embedded in any iframe — prevents clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Prevents MIME-type sniffing; browsers must respect Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Restricts referrer information sent to third-party origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disables browser features not required by the application.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],

  // IP/host adicional permitido em dev (ex.: aceder à app pela LAN a partir do
  // telemóvel). Define ALLOWED_DEV_ORIGIN no ambiente; vazio por omissão.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN
    ? [process.env.ALLOWED_DEV_ORIGIN]
    : [],

  turbopack: {
    root: __dirname,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
