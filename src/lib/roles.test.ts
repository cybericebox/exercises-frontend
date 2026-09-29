// One canonical label per role, identical in every app (main, id, admin, exercises, event).
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"
import { EVENT_ROLES, PLATFORM_ROLES, eventRoleLabel, roleLabel } from "./roles"

const LABELS = {
  uk: {
    "role.super_admin": "Суперадміністратор",
    "role.admin": "Адміністратор",
    "role.admin_viewer": "Адміністратор (лише перегляд)",
    "role.user": "Користувач",
    "role.event.owner": "Власник",
    "role.event.moderator": "Модератор",
    "role.event.observer": "Спостерігач",
  },
  en: {
    "role.super_admin": "Super administrator",
    "role.admin": "Administrator",
    "role.admin_viewer": "Administrator (view-only)",
    "role.user": "User",
    "role.event.owner": "Owner",
    "role.event.moderator": "Moderator",
    "role.event.observer": "Observer",
  },
}
// Short or variant role names that must not appear anywhere in the UI text.
const VARIANTS = /super[\s-]?admin(?!istrator)|суперадмін(?!істратор)|супер-адмін|\badmins?\b(?!\s+(area|interface))/i
const ROOT = join(import.meta.dirname, "../..")
const catalogs = { uk, en } as Record<"uk" | "en", Record<string, string>>

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe("role labels", () => {
  it("labels every backend role with its canonical name", () => {
    for (const role of PLATFORM_ROLES) expect(roleLabel(role)).toBe(LABELS.uk[`role.${role}`])
    for (const [code, name] of Object.entries(EVENT_ROLES)) expect(eventRoleLabel(Number(code))).toBe(LABELS.uk[`role.event.${name}`])
    expect(roleLabel("unknown")).toBe("unknown")
  })

  it("keeps the role.* keys identical to the canonical set in both languages", () => {
    for (const lang of ["uk", "en"] as const) {
      const roleKeys = Object.fromEntries(Object.entries(catalogs[lang]).filter(([k]) => k.startsWith("role.")))
      expect(roleKeys).toEqual(LABELS[lang])
    }
  })

  it("has no other role names in the messages", () => {
    const names = [...PLATFORM_ROLES, ...Object.values(EVENT_ROLES)].join("|")
    for (const lang of ["uk", "en"] as const) {
      for (const [k, v] of Object.entries(catalogs[lang])) {
        if (k.startsWith("role.")) continue
        expect(k, `role label outside role.*: ${k}`).not.toMatch(new RegExp(`\\.role\\.(${names}|superAdmin|viewer)$`))
        expect(v, `${lang}: ${k}`).not.toMatch(VARIANTS)
      }
    }
  })

  it("builds role keys only in the role helper", () => {
    const helper = join(import.meta.dirname, "roles.ts")
    for (const file of sources(join(ROOT, "src"))) {
      if (file === helper) continue
      expect(readFileSync(file, "utf8"), relative(ROOT, file)).not.toMatch(/["'`]([\w.]+\.)?role\.(\$\{|super_admin|admin|user|event\.|owner|moderator|observer)/)
    }
  })
})
