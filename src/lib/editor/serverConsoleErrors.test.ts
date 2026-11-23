import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { ApiError } from "@/api/client"
import { emptyDefender } from "@/lib/editor/defender"
import { emptyDevice, emptyDraft, emptyTask, emptyVariant } from "@/lib/exerciseSchemas"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { placeServerFieldError, serverFieldTargets } from "./serverErrorTarget"

const fail = (code: number, context: Record<string, string | number>) => new ApiError(400, { Status: { Code: code, Message: "m", Context: context } }, "m", undefined, code)

/** One variant: a router with console0, a pc with serial0, a network link and a console cable. */
function draft(variants = 1) {
  const value = emptyDraft()
  value.Variants = Array.from({ length: variants }, (_, vi) => {
    const variant = { ...emptyVariant(vi + 1), ID: `v${vi}`, LinkedTo: "" }
    variant.Tasks = [{ ...emptyTask("scan"), Key: "scan" }]
    variant.Topology.Devices = [
      { ...emptyDevice(), ID: `r${vi}`, Name: "router", ConsolePorts: [{ Name: "console0", Mode: "program", Command: [], User: "", Port: "" }] },
      { ...emptyDevice(), ID: `p${vi}`, Name: "pc", SerialPorts: [{ Name: "serial0", Path: "" }] },
    ]
    variant.Topology.Connections = [
      { Endpoints: [{ Kind: "device", DeviceID: `r${vi}`, Interface: "eth0" }, { Kind: "device", DeviceID: `p${vi}`, Interface: "eth0" }] },
      { Kind: "console", Endpoints: [{ Kind: "device", DeviceID: `p${vi}`, Interface: "serial0" }, { Kind: "device", DeviceID: `r${vi}`, Interface: "console0" }] },
    ]
    variant.Defender = { ...emptyDefender(), Seat: "pc", Credentials: [{ Device: "router", Port: "console0", User: "admin", Value: "", Secret: true, HasValue: true }] }
    variant.Opponents = [{ Role: "defense", Band: 1, Goal: ["scan"], Operates: ["router"], Seat: "pc" }]
    return variant
  })
  return value
}

describe("console errors beside their fields (23701-23713, 23525)", () => {
  const one = draft()
  const device = (index: number, ...rest: (string | number)[]) => ["Variants", 0, "Topology", "Devices", index, ...rest]

  it("places a console port error on the field it names", () => {
    expect(serverFieldTargets(fail(23701, { variant: 1, device: "router", field: "console_ports[1].command", reason: "command" }), one)).toEqual([device(0, "ConsolePorts", 0, "Command")])
    expect(serverFieldTargets(fail(23701, { variant: 1, device: "router", field: "console_ports[1].name", reason: "name" }), one)).toEqual([device(0, "ConsolePorts", 0, "Name")])
    expect(serverFieldTargets(fail(23701, { variant: 1, device: "router", field: "console_ports[1].user", reason: "user" }), one)).toEqual([device(0, "ConsolePorts", 0, "User")])
    // The native line is the mode of the port in the form.
    expect(serverFieldTargets(fail(23701, { variant: 1, device: "router", field: "console_ports[1].native", reason: "stdio_twice" }), one)).toEqual([device(0, "ConsolePorts", 0, "Mode")])
  })

  it("places a serial port, a taken name, a limit and a port on a wrong device", () => {
    expect(serverFieldTargets(fail(23702, { variant: 1, device: "pc", field: "serial_ports[1].path", reason: "path" }), one)).toEqual([device(1, "SerialPorts", 0, "Path")])
    expect(serverFieldTargets(fail(23703, { variant: 1, device: "pc", field: "serial_ports[1].name", port: "serial0" }), one)).toEqual([device(1, "SerialPorts", 0, "Name")])
    expect(serverFieldTargets(fail(23704, { variant: 1, device: "pc", field: "serial_ports", kind: "serial", limit: 16 }), one)).toEqual([device(1, "SerialPorts")])
    expect(serverFieldTargets(fail(23705, { variant: 1, device: "router", field: "console_ports", reason: "system" }), one)).toEqual([device(0, "ConsolePorts")])
  })

  it("places a cable error on the end it names, or on the second end of a cable whose ends do not pair", () => {
    const end = (side: number) => ["Variants", 0, "Topology", "Connections", 1, "Endpoints", side, "Interface"]
    expect(serverFieldTargets(fail(23708, { variant: 1, connection: 2, device: "router", port: "console0" }), one)).toEqual([end(1)])
    expect(serverFieldTargets(fail(23708, { variant: 1, connection: 2, device: "pc", port: "serial0" }), one)).toEqual([end(0)])
    expect(serverFieldTargets(fail(23707, { variant: 1, connection: 2, reason: "two_serial" }), one)).toEqual([end(1)])
    expect(serverFieldTargets(fail(23706, { variant: 1, connection: 2, field: "kind" }), one)).toEqual([end(0)])
    expect(serverFieldTargets(fail(23712, { variant: 1, connection: 1, device: "pc", port: "eth0", field: "kind", reason: "port" }), one)).toEqual([["Variants", 0, "Topology", "Connections", 0, "Endpoints", 1, "Interface"]])
  })

  it("never guesses: a connection that is not there, or a port not on it, stays form-level", () => {
    expect(serverFieldTargets(fail(23708, { variant: 1, connection: 9, device: "router", port: "console0" }), one)).toBeNull()
    expect(serverFieldTargets(fail(23708, { variant: 1, connection: 2, device: "router", port: "aux0" }), one)).toBeNull()
    // Without the variant, two variants with the same connection are ambiguous.
    expect(serverFieldTargets(fail(23707, { connection: 2, reason: "nic" }), draft(2))).toBeNull()
  })

  it("places a defender error on its field and an opponent's seat on its picker", () => {
    expect(serverFieldTargets(fail(23711, { variant: 1, field: "defender.seat", reason: "seat_no_serial" }), one)).toEqual([["Variants", 0, "Defender", "Seat"]])
    expect(serverFieldTargets(fail(23711, { variant: 1, field: "defender.off_limits[2]", reason: "off_limits_cabled" }), one)).toEqual([["Variants", 0, "Defender", "OffLimits"]])
    expect(serverFieldTargets(fail(23711, { variant: 1, field: "defender.credentials[1].port", reason: "credential_unknown" }), one)).toEqual([["Variants", 0, "Defender", "Credentials", 0, "Port"]])
    expect(serverFieldTargets(fail(23711, { variant: 1, field: "defender.credentials[1]", reason: "credential_repeated" }), one)).toEqual([["Variants", 0, "Defender", "Credentials", 0, "User"]])
    expect(serverFieldTargets(fail(23525, { variant: 1, field: "opponents[1].seat", reason: "seat_on_foothold" }), one)).toEqual([["Variants", 0, "Opponents", 0, "Seat"]])
    expect(serverFieldTargets(fail(23525, { variant: 1, field: "opponents[1].goal[1]", reason: "goal_unknown" }), one)).toEqual([["Variants", 0, "Opponents"]])
  })

  it("says the reason of the error in its own words", () => {
    expect(exerciseErrorMessage(fail(23701, { device: "router", field: "console_ports[1].native", reason: "stdio_twice" }))).toBe("ed.c.port.val.stdioTwice")
    expect(exerciseErrorMessage(fail(23707, { connection: 2, reason: "same_device" }))).toBe("ed.c.port.val.cable.same_device")
    expect(exerciseErrorMessage(fail(23704, { device: "pc", kind: "serial", limit: 16 }))).toBe('ed.c.port.val.serialMax{"max":16}')
    expect(exerciseErrorMessage(fail(23525, { field: "opponents[1].seat", reason: "seat_referenced" }))).toBe("ed.c.def.seat.seat_referenced")
    expect(exerciseErrorMessage(fail(23711, { field: "defender.off_limits[1]", reason: "off_limits_cabled" }))).toBe("ed.c.def.err.offLimitsCabled")
  })

  it("sets the server error on the field with its message", () => {
    const form = { getValues: () => one, setError: vi.fn() }
    const issues = placeServerFieldError(fail(23711, { variant: 1, field: "defender.seat", reason: "seat_unknown" }), form as never)
    expect(form.setError).toHaveBeenCalledWith("Variants.0.Defender.Seat", { type: "server", message: "ed.c.def.seat.seat_unknown" })
    expect(issues?.[0].text).toBe("Ed.shell.issue.defender: ed.c.def.seat.seat_unknown")
  })
})
