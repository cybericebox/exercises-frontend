import type { NextConfig } from "next"

// Static export for the exercise catalog (exercises.<domain>).
// Dev resources are served through the platform domain and its subdomains.
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN;

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  images: {
    unoptimized: true,
  },
  // Keep URLs slashless and avoid browser-cached 308 slash redirects.
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: DOMAIN ? [DOMAIN, `*.${DOMAIN}`] : [],
}

export default nextConfig
