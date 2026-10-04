import type { NextConfig } from "next"

// Static export for the exercise catalog.
// One base domain: NEXT_PUBLIC_DOMAIN is the only host input and every host derives from it (src/**/hosts.ts, deploy/base-domain.sh; the daemon and
// the infrastructure renderer share the rule and tests/base-domain-vectors.json). The Docker build bakes a placeholder for it.
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? ""
if (!DOMAIN) throw new Error("NEXT_PUBLIC_DOMAIN is required")
if (DOMAIN !== "__NEXT_PUBLIC_DOMAIN__" && (DOMAIN.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(DOMAIN))) {
  throw new Error(`NEXT_PUBLIC_DOMAIN must be a bare lowercase host name (no scheme, port or path), got: ${DOMAIN}`)
}
const PLATFORM_HOSTS = [DOMAIN, `api.${DOMAIN}`, `id.${DOMAIN}`, `admin.${DOMAIN}`, `exercises.${DOMAIN}`]

// Every other operator value is required: a missing one fails the build.
const REQUIRED = [
  "NEXT_PUBLIC_SUPPORT_EMAIL",
]
const missing = REQUIRED.filter((name) => !process.env[name]?.trim())
if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`)

// Dev-only: `next dev` accepts the configured hosts (and event sites) behind a local proxy/tunnel.
const devHosts = [
  ...PLATFORM_HOSTS,
  `*.${DOMAIN}`,
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
]

// Dev-only Content-Security-Policy (`next dev` serves real headers; the export gets its CSP from
// deploy/csp.sh at container start, so `headers` is not defined for production builds).
// Same directives as production, except script-src: dev needs inline scripts and eval (React dev
// stack, HMR) and cannot use hashes, and connect-src also allows the HMR websocket.
// Hosts and vendor toggles come from the same env as production.
function devContentSecurityPolicy(): string {
  const api = `https://api.${DOMAIN}`
  const script = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  const connect = ["'self'", api, "ws:", "wss:"]
  if (process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim()) {
    script.push("https://www.googletagmanager.com")
    connect.push("https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://www.google.com/ccm/", "https://*.doubleclick.net")
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "frame-src 'none'",
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
