/**
 * exercisesI18n.test.ts — parity guard for the admin.ex* key namespace.
 * (1) en.json and uk.json carry the SAME admin.ex* key sets;
 * (2) every error-dictionary key resolves in both catalogs.
 */
import { describe, it, expect } from "vitest"
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"
import { CODE_TO_KEY } from "@/lib/exerciseErrors"

const exKeys = (cat: Record<string, string>) =>
  Object.keys(cat).filter((k) => k.startsWith("admin.ex")).sort()

describe("admin.ex* i18n parity", () => {
  it("en and uk define the same admin.ex* keys", () => {
    const enKeys = exKeys(en as Record<string, string>)
    const ukKeys = exKeys(uk as Record<string, string>)
    expect(ukKeys).toEqual(enKeys)
    expect(enKeys.length).toBeGreaterThan(0)
  })

  it("every error-dictionary key exists in both catalogs", () => {
    for (const key of Object.values(CODE_TO_KEY)) {
      expect((en as Record<string, string>)[key], `en missing ${key}`).toBeTruthy()
      expect((uk as Record<string, string>)[key], `uk missing ${key}`).toBeTruthy()
    }
  })

  it("no admin.ex* value is blank", () => {
    for (const cat of [en, uk] as Record<string, string>[]) {
      for (const k of exKeys(cat)) expect(cat[k].trim(), `blank value for ${k}`).not.toBe("")
    }
  })

  it("explains forwarding behavior, fixed ports, and the DHCP warning in both languages", () => {
    for (const cat of [en, uk] as Record<string, string>[]) {
      for (const kind of ["switch", "hub"]) {
        const ports = cat[`admin.exTopo.networkDescription.${kind}.ports`]
        expect(ports).toContain("48")
        expect(ports).toContain("GigabitEthernet0/1")
        expect(ports).not.toMatch(/one (link|connection)|одне зʼєднання/i)
        expect(cat[`admin.exTopo.networkDescription.${kind}.purpose`]).toMatch(/broadcast domain|широкомовному домені/i)
        expect(cat[`admin.exTopo.networkDescription.${kind}.speed`]).toBeUndefined()
      }
      expect(cat["admin.exTopo.networkDescription.switch.behavior"]).toMatch(/MAC/)
      expect(cat["admin.exTopo.networkDescription.hub.behavior"]).toMatch(/every other port|всі інші порти/i)
      for (const kind of ["vpn", "internet"]) expect(cat[`admin.exTopo.networkDescription.${kind}.ports`]).toMatch(/eth0/)
      expect(cat["admin.exTopo.dhcp.enabled.vpn"]).toMatch(/DHCP.*IP/i)
      expect(cat["admin.exTopo.dhcp.enabled.internet"]).toMatch(/DHCP.*IP/i)
      expect(cat["admin.exTopo.dhcp.disabled"]).toMatch(/IP/)
      expect(cat["admin.exTopo.dhcp.warning"]).toMatch(/DHCP/)
      expect(cat["admin.exTopo.dhcp.warningConsequence"]).toMatch(/Client behavior|Робота клієнтів/i)
      expect(cat["admin.exTopo.dhcp.limit"]).toBeUndefined()
    }
  })
})
