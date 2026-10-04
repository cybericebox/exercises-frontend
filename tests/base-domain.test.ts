import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The base-domain rule: NEXT_PUBLIC_DOMAIN is the only host input and every host derives from it. It is implemented in src/lib/hosts.ts (the code),
// deploy/base-domain.sh (container start) and next.config.ts (build and dev). Each runs the cases of the shared vectors; the same vector file is in the
// daemon, infrastructure and every frontend and the copies must stay identical.
const root = resolve(import.meta.dirname, "..")
type Case = { name: string; domain: string; expect?: Record<string, string>; error_contains?: string[] }
const vectors = JSON.parse(readFileSync(resolve(root, "tests/base-domain-vectors.json"), "utf8")) as { hosts: string[]; cases: Case[] }

// The per-site values the next config requires besides the domain (any extra one is harmless).
const SITE = {
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.test",
  NEXT_PUBLIC_CONTACT_EMAIL: "contact@example.test",
  NEXT_PUBLIC_PRIVACY_EMAIL: "privacy@example.test",
  NEXT_PUBLIC_SECURITY_EMAIL: "security@example.test",
  NEXT_PUBLIC_SOURCE_URL: "https://example.test/source",
  NEXT_PUBLIC_PARTNER_ICE_NURE_URL: "https://example.test/ice",
  NEXT_PUBLIC_PARTNER_NURE_URL: "https://example.test/nure",
  NEXT_PUBLIC_WIREGUARD_INSTALL_URL: "https://example.test/wg",
  NEXT_PUBLIC_CAPTCHA_PROVIDER: "none",
}

// Only NODE_ENV, PATH and the given values: nothing of the developer environment leaks into the cases.
function childEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", PATH: process.env.PATH ?? "", ...env }
}

type Result = { ok: boolean; stderr: string; hosts?: Record<string, string> }

// The hosts keyed like the vectors (MAIN_HOST ... COOKIE_DOMAIN) from a derived object or from the shell lines.
const KEYS = ["main", "api", "id", "admin", "exercises", "eventDomain", "cookieDomain"] as const
function byVectorKey(values: string[]): Record<string, string> {
  return Object.fromEntries(vectors.hosts.map((k, i) => [k, values[i]]))
}

// deploy/base-domain.sh sourced by sh (dash on the CI runner), as the entrypoint does.
function viaShell(domain: string): Result {
  const prefixes = ["", "api", "id", "admin", "exercises", "", ""]
  const print = prefixes.map((p) => `base_domain_host '${p}'`).join("; ")
  const r = spawnSync("sh", ["-c", `. ./deploy/base-domain.sh && base_domain_check && { ${print}; }`], {
    cwd: root, encoding: "utf8", env: childEnv(domain ? { NEXT_PUBLIC_DOMAIN: domain } : {}),
  })
  return { ok: r.status === 0, stderr: r.stderr, hosts: byVectorKey(r.stdout.split("\n").filter(Boolean)) }
}

// The next config, run as plain node (type stripping): it accepts the domain or throws.
function viaNextConfig(domain: string): Result {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import("./next.config.ts")`], {
    cwd: root, encoding: "utf8", env: childEnv({ ...SITE, ...(domain ? { NEXT_PUBLIC_DOMAIN: domain } : {}) }),
  })
  return { ok: r.status === 0, stderr: r.stderr }
}

// The helper the code uses, with the domain in the env as the container provides it.
async function viaHelper(domain: string): Promise<Result> {
  const path = "../src/lib/hosts.ts"
  const { hosts } = (await import(path)) as typeof import("../src/lib/hosts.ts")
  const saved = process.env.NEXT_PUBLIC_DOMAIN
  if (domain) process.env.NEXT_PUBLIC_DOMAIN = domain
  else delete process.env.NEXT_PUBLIC_DOMAIN
  try {
    const h = hosts()
    return { ok: true, stderr: "", hosts: byVectorKey(KEYS.map((k) => h[k])) }
  } catch (e) {
    return { ok: false, stderr: String(e) }
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_DOMAIN
    else process.env.NEXT_PUBLIC_DOMAIN = saved
  }
}

const runners: [string, (domain: string) => Result | Promise<Result>, boolean][] = [
  ["deploy/base-domain.sh", viaShell, true],
  ["next.config.ts", viaNextConfig, false],
  ["src/lib/hosts.ts", viaHelper, true],
]

for (const [label, run, derives] of runners) {
  describe(`base domain: ${label}`, () => {
    for (const c of vectors.cases) {
      it(c.name, async () => {
        const got = await run(c.domain)
        if (c.error_contains) {
          // The helper only checks that a domain is set; the shape of it is checked where the value enters (entrypoint, next config).
          if (label.endsWith("hosts.ts") && c.domain) return
          expect(got.ok, "want an error").toBe(false)
          for (const part of c.error_contains) expect(got.stderr).toContain(part)
        } else {
          expect(got.ok, got.stderr).toBe(true)
          if (derives) expect(got.hosts).toEqual(c.expect)
        }
      })
    }
  })
}
