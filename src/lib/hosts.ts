// The one base domain: every platform host derives from NEXT_PUBLIC_DOMAIN, there are no per-host settings. The same rule is in
// deploy/base-domain.sh, next.config, the daemon and the infrastructure renderer; tests/base-domain-vectors.json holds the shared vectors
// (identical copies in every repository). Read lazily: a missing value throws where it is used, never a silent fallback.
export type Hosts = {
  domain: string
  main: string
  api: string
  id: string
  admin: string
  exercises: string
  /** Event sites are <tag>.<eventDomain>. */
  eventDomain: string
  /** Domain attribute of the shared theme and consent cookies. */
  cookieDomain: string
}

/** The hosts of a base domain (pure; the rule of the shared vectors). */
export function deriveHosts(domain: string): Hosts {
  return {
    domain,
    main: domain,
    api: `api.${domain}`,
    id: `id.${domain}`,
    admin: `admin.${domain}`,
    exercises: `exercises.${domain}`,
    eventDomain: domain,
    cookieDomain: domain,
  }
}

export function hosts(): Hosts {
  const domain = process.env.NEXT_PUBLIC_DOMAIN
  if (!domain) throw new Error("NEXT_PUBLIC_DOMAIN is required")
  return deriveHosts(domain)
}
