import type { NextConfig } from "next"

// Static export for the exercise catalog. Every host is an explicit env value; a missing
// one fails the build (no derivation, no fallback).
const REQUIRED_HOSTS = [
  "NEXT_PUBLIC_MAIN_HOST",
  "NEXT_PUBLIC_API_HOST",
  "NEXT_PUBLIC_ID_HOST",
  "NEXT_PUBLIC_ADMIN_HOST",
  "NEXT_PUBLIC_EXERCISES_HOST",
  "NEXT_PUBLIC_EVENT_DOMAIN",
  "NEXT_PUBLIC_COOKIE_DOMAIN",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
]
const missing = REQUIRED_HOSTS.filter((name) => !process.env[name]?.trim())
if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`)

// Dev-only: `next dev` accepts the configured hosts (and event sites) behind a local proxy/tunnel.
const devHosts = [
  ...REQUIRED_HOSTS.filter((name) => name.endsWith("_HOST")).map((name) => process.env[name]!.trim()),
  `*.${process.env.NEXT_PUBLIC_EVENT_DOMAIN!.trim()}`,
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
]

// Dev-only Content-Security-Policy (`next dev` serves real headers; the export gets its CSP from
// deploy/csp.sh at container start, so `headers` is not defined for production builds).
// Same directives as production, except script-src: dev needs inline scripts and eval (React dev
// stack, HMR) and cannot use hashes, and connect-src also allows the HMR websocket.
// Hosts and vendor toggles come from the same env as production.
function devContentSecurityPolicy(): string {
  const api = `https://${process.env.NEXT_PUBLIC_API_HOST!.trim()}`
  const script = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  const connect = ["'self'", api, "ws:", "wss:"]
  let frame = "'none'"
  if (process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim()) {
    script.push("https://www.googletagmanager.com")
    connect.push("https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://www.google.com/ccm/", "https://*.doubleclick.net")
  }
  if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim()) {
    script.push("https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/")
    connect.push("https://www.google.com/recaptcha/")
    frame = "https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/"
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frame}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development"
    ? { headers: async () => [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: devContentSecurityPolicy() }] }] }
    : {}),
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  images: {
    unoptimized: true,
  },
  // Keep URLs slashless and avoid browser-cached 308 slash redirects.
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: [...new Set(devHosts)],
}

export default nextConfig
