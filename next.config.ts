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
  // Dev-only: platform domains are always allowed, so `next dev` works behind the
  // local proxy/tunnel even when NEXT_PUBLIC_DOMAIN is not set.
  allowedDevOrigins: [...new Set([...(DOMAIN ? [DOMAIN] : []), "cybericebox.com", "cybericebox-dev.pp.ua", "cybericebox.pp.ua"])].flatMap((d) => [d, `*.${d}`]),
}

export default nextConfig
