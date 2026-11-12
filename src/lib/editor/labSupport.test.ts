import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { labSupport } from "./labSupport"
import type { LabCapabilities } from "@/api/exercises/capabilities"

const caps = (over: Partial<LabCapabilities> = {}): LabCapabilities => ({
  Known: true,
  Observations: { file: "all", directory: "all", process: "some", port: "none", kernel_param: "none", request: "all", permission: "all", custom: "all", "file.type": "none", "file.checksum": "unknown" },
  Access: { http: "all", terminal: "none", vnc: "none", rdp: "none" },
  Profiles: { container: "all", microvm: "none", vm: "some" },
  Bootstrap: "all", Checks: "none", VPNReverse: "some",
  ...over,
})

describe("labSupport", () => {
  it("disables on none, warns on some, says nothing on all and unknown", () => {
    expect(labSupport(caps(), { observation: "port" })).toEqual({ state: "disabled", reason: "ed.ui.lab.none" })
    expect(labSupport(caps(), { observation: "process" })).toEqual({ state: "warn", reason: "ed.ui.lab.some" })
    expect(labSupport(caps(), { observation: "file" }).state).toBe("ok")
    expect(labSupport(caps(), { observation: "file.checksum" }).state).toBe("ok")
  })

  it("maps camel-case observation names and the other groups", () => {
    expect(labSupport(caps(), { observation: "kernelParam" }).state).toBe("disabled")
    expect(labSupport(caps(), { observation: "file.type" }).state).toBe("disabled")
    expect(labSupport(caps(), { access: "terminal" }).state).toBe("disabled")
    expect(labSupport(caps(), { access: "http" }).state).toBe("ok")
    expect(labSupport(caps(), { profile: "microvm" }).state).toBe("disabled")
    expect(labSupport(caps(), { profile: "vm" }).state).toBe("warn")
    expect(labSupport(caps(), "checks").state).toBe("disabled")
    expect(labSupport(caps(), "bootstrap").state).toBe("ok")
    expect(labSupport(caps(), "vpnReverse").state).toBe("warn")
  })

  it("enables everything when nothing is known or the server sends no block", () => {
    expect(labSupport(caps({ Known: false }), "checks").state).toBe("ok")
    expect(labSupport(null, { access: "terminal" }).state).toBe("ok")
    expect(labSupport(undefined, "checks").state).toBe("ok")
  })
})
