import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import type { OpponentDTO } from "@/api/exercises/versions"
import { draftSchema, emptyDevice, emptyDraft, emptyTask, type DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyGateway } from "@/lib/editor/schemas/infra"
import { draftIssues } from "./issues"
import { renameGatewayInForm } from "./gatewayRefs"
import { danglingOpponentRefs, opponentsNamingDevice, opponentsNamingTask, renameDeviceInOpponents, renameDeviceOpponentsInForm } from "./opponentRefs"

const defender: OpponentDTO = { Role: "defense", Band: 2, Goal: ["task_1"], Operates: ["router", "web"], Seat: "pc" }
const attacker: OpponentDTO = { Role: "attack", Band: 1, Goal: ["task_1"], StartAfter: "task_2", Foothold: "sw" }

function draft(): DraftFormValues {
  const value = emptyDraft()
  value.Variants[0].Tasks = [emptyTask("task_1"), emptyTask("task_2")]
  value.Variants[0].Topology.Devices = [
    { ...emptyDevice(), ID: "r", Name: "router" }, { ...emptyDevice(), ID: "w", Name: "web" }, { ...emptyDevice(), ID: "p", Name: "pc" },
    { ...emptyDevice(), ID: "s", Name: "sw", Type: "unmanaged-switch", Interfaces: [] },
  ]
  value.Variants[0].Opponents = [defender, attacker]
  return value
}

/** The two form methods the helpers use, over a plain draft. */
function fakeForm(value: DraftFormValues) {
  const at = (path: string) => path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], value)
  return {
    getValues: ((path: string) => at(path)) as never,
    setValue: ((path: string, next: unknown) => {
      const parts = path.split(".")
      const parent = parts.slice(0, -1).reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], value) as Record<string, unknown>
      parent[parts[parts.length - 1]] = next
    }) as never,
  }
}

describe("opponent references", () => {
  it("a renamed device follows into Operates, Seat and Foothold; the others stay the same objects", () => {
    const opponents = [defender, attacker]
    expect(renameDeviceInOpponents(opponents, "web", "www")[0].Operates).toEqual(["router", "www"])
    expect(renameDeviceInOpponents(opponents, "pc", "desk")[0].Seat).toBe("desk")
    const footholdMoved = renameDeviceInOpponents(opponents, "sw", "core")
    expect(footholdMoved[1].Foothold).toBe("core")
    expect(footholdMoved[0]).toBe(defender)
    expect(renameDeviceInOpponents(opponents, "nothing", "x")).toBe(opponents)
  })

  it("renames in the form, but not while another device still carries the old name", () => {
    const value = draft()
    renameDeviceOpponentsInForm(fakeForm(value), 0, "r", "router", "edge")
    expect(value.Variants[0].Opponents?.[0].Operates).toEqual(["edge", "web"])
    value.Variants[0].Topology.Devices[1].Name = "pc" // a second "pc": ambiguous
    renameDeviceOpponentsInForm(fakeForm(value), 0, "p", "pc", "desk")
    expect(value.Variants[0].Opponents?.[0].Seat).toBe("pc")
  })

  it("a gateway rename carries the opponents too", () => {
    const value = draft()
    value.Variants[0].Topology.Devices.push({ ...emptyGateway("vpn_gateway", "vpn-1"), ID: "g" })
    value.Variants[0].Opponents = [{ ...defender, Operates: ["vpn-1"] }]
    renameGatewayInForm(fakeForm(value), 0, "g", "vpn-2")
    expect(value.Variants[0].Opponents[0].Operates).toEqual(["vpn-2"])
  })

  it("counts the opponents that name a device or a task", () => {
    const variant = draft().Variants[0]
    expect(opponentsNamingDevice(variant, "web")).toBe(1)
    expect(opponentsNamingDevice(variant, "sw")).toBe(1)
    expect(opponentsNamingTask(variant, "task_1")).toBe(2)
    expect(opponentsNamingTask(variant, "task_2")).toBe(1)
    expect(opponentsNamingTask(variant, "task_3")).toBe(0)
  })

  it("lists what the opponents name that is gone, and the draft check reports it at the variant's opponents", () => {
    const value = draft()
    expect(danglingOpponentRefs(value.Variants[0])).toEqual([])
    expect(draftIssues(value).filter((issue) => issue.path.includes("Opponents"))).toEqual([])
    value.Variants[0].Topology.Devices = value.Variants[0].Topology.Devices.filter((device) => device.Name !== "pc" && device.Name !== "sw")
    value.Variants[0].Tasks = [emptyTask("task_1")]
    expect(danglingOpponentRefs(value.Variants[0])).toEqual(["pc", "sw", "task_2"])
    const parsed = draftSchema.safeParse(value)
    const issue = parsed.success ? undefined : parsed.error.issues.find((candidate) => candidate.path.join(".") === "Variants.0.Opponents")
    expect(issue?.message).toBe("ed.c.val.opponentRefMissing «pc», «sw», «task_2»")
    expect(draftIssues(value).find((line) => line.path.join(".") === "Variants.0.Opponents")?.text).toBe("Ed.shell.issue.opponents: ed.c.val.opponentRefMissing «pc», «sw», «task_2»")
  })

  it("a variant without opponents gets no issue", () => {
    const value = draft()
    delete value.Variants[0].Opponents
    value.Variants[0].Topology.Devices = []
    expect(danglingOpponentRefs(value.Variants[0])).toEqual([])
  })
})
