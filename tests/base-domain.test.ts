import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The base-domain rule (NEXT_PUBLIC_DOMAIN derives the hosts that are not set) is implemented in deploy/base-domain.sh (container start,
// the Pages build) and in next.config.ts (dev and local builds). Both run every case of the shared vectors; the same vector file is in the daemon,
// infrastructure and every frontend and the copies must stay identical.
const root = resolve(import.meta.dirname, "..")
type Case = { name: string; env: Record<string, string>; expect?: Record<string, string>; error_contains?: string[] }
const vectors = JSON.parse(readFileSync(resolve(root, "tests/base-domain-vectors.json"), "utf8")) as { hosts: string[]; cases: Case[] }

// The per-site values the next config requires besides the hosts (any extra one is harmless).
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

function prefixed(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [`NEXT_PUBLIC_${k}`, v]))
}

// Only NODE_ENV, PATH and the given values: nothing of the developer environment leaks into the cases.
function childEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", PATH: process.env.PATH ?? "", ...env }
}

type Result = { ok: boolean; stderr: string; hosts: Record<string, string> }

function parse(stdout: string): Record<string, string> {
  return Object.fromEntries(stdout.split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
}

// deploy/base-domain.sh sourced by sh (dash on the CI runner), as the entrypoint does.
function viaShell(env: Record<string, string>): Result {
  const print = vectors.hosts.map((h) => `printf '%s=%s\\n' ${h} "$NEXT_PUBLIC_${h}"`).join("; ")
  const r = spawnSync("sh", ["-c", `. ./deploy/base-domain.sh && base_domain_derive && { ${print}; }`], {
    cwd: root, encoding: "utf8", env: childEnv(prefixed(env)),
  })
  return { ok: r.status === 0, stderr: r.stderr, hosts: parse(r.stdout) }
}

// The next config, run as plain node (type stripping): it derives into process.env or throws.
function viaNextConfig(env: Record<string, string>): Result {
  const print = vectors.hosts.map((h) => `console.log("${h}=" + process.env.NEXT_PUBLIC_${h})`).join(";")
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import("./next.config.ts"); ${print}`], {
    cwd: root, encoding: "utf8", env: childEnv({ ...SITE, ...prefixed(env) }),
  })
  return { ok: r.status === 0, stderr: r.stderr, hosts: parse(r.stdout) }
}

const runners: [string, (env: Record<string, string>) => Result][] = [["deploy/base-domain.sh", viaShell], ["next.config.ts", viaNextConfig]]

for (const [label, run] of runners) {
  describe(`base domain: ${label}`, () => {
    for (const c of vectors.cases) {
      it(c.name, () => {
        const got = run(c.env)
        if (c.error_contains) {
          expect(got.ok, `want an error, got ${JSON.stringify(got.hosts)}`).toBe(false)
          for (const part of c.error_contains) expect(got.stderr).toContain(part)
        } else {
          expect(got.ok, got.stderr).toBe(true)
          expect(got.hosts).toEqual(c.expect)
        }
      })
    }
  })
}
