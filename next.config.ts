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
]
const missing = REQUIRED_HOSTS.filter((name) => !process.env[name]?.trim())
if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`)

// Dev-only: `next dev` accepts the configured hosts (and event sites) behind a local proxy/tunnel.
const devHosts = [
  ...REQUIRED_HOSTS.filter((name) => name.endsWith("_HOST")).map((name) => process.env[name]!.trim()),
  `*.${process.env.NEXT_PUBLIC_EVENT_DOMAIN!.trim()}`,
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
]

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  images: {
    unoptimized: true,
  },
  // Keep URLs slashless and avoid browser-cached 308 slash redirects.
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: [...new Set(devHosts)],
}

export default nextConfig
