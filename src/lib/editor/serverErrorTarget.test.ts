import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { ApiError } from "@/api/client"
import { emptyDevice, emptyDraft, emptyTask, emptyVariant } from "@/lib/exerciseSchemas"
import { placeServerFieldError, serverFieldTargets } from "./serverErrorTarget"

const fail = (code: number, context: Record<string, string | number>) => new ApiError(400, { Status: { Code: code, Message: "m", Context: context } }, "m", undefined, code)

function draft(variants: { linked?: boolean; keys?: string[]; devices?: string[] }[]) {
  const value = emptyDraft()
  value.Variants = variants.map((spec, vi) => {
    const variant = { ...emptyVariant(vi + 1), ID: `v${vi}`, LinkedTo: spec.linked ? "v0" : "" }
    variant.Tasks = (spec.keys ?? ["scan"]).map((key) => ({ ...emptyTask(key), Key: key }))
    variant.Topology.Devices = (spec.devices ?? ["web"]).map((name) => ({ ...emptyDevice(), ID: `${name}-${vi}`, Name: name }))
    return variant
  })
  return value
}

describe("serverFieldTargets", () => {
  const one = draft([{ keys: ["scan", "exploit"], devices: ["web", "db"] }])

  it("places a device runtime key (23506) on the device of the variant", () => {
    expect(serverFieldTargets(fail(23506, { device: "db", field: "bootstrap.env[3].name" }), one)).toEqual([["Variants", 0, "Topology", "Devices", 1, "Bootstrap", "Env", 2, "Name"]])
    expect(serverFieldTargets(fail(23506, { device: "web", field: "access[2].port" }), one)).toEqual([["Variants", 0, "Topology", "Devices", 0, "Access", 1, "Port"]])
  })

  it("places 23105 on the launch profile field", () => {
    expect(serverFieldTargets(fail(23105, { device: "web", field: "persistence" }), one)).toEqual([["Variants", 0, "Topology", "Devices", 0, "Profile"]])
  })

  it("places a description or a hint substitution (23519) and the task errors", () => {
    expect(serverFieldTargets(fail(23519, { task: "exploit", field: "description" }), one)).toEqual([["Variants", 0, "Tasks", 1, "Description"]])
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "hints[2].text" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Hints", 1, "Text"]])
    expect(serverFieldTargets(fail(23505, { task: "scan", field: "check.state.conditions[3].port.port" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Check", "State", "Conditions", 2, "Port", "Port"]])
    expect(serverFieldTargets(fail(23504, { task: "scan", field: "check.answer.values" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Check", "Answer", "Values"]])
    expect(serverFieldTargets(fail(23501, { task: "scan", key: "scan" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Key"]])
    expect(serverFieldTargets(fail(23502, { task: "scan", key: "scan" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Requires"]])
    expect(serverFieldTargets(fail(23513, { task: "scan" }), one)).toEqual([["Variants", 0, "Tasks", 0, "Check", "Kind"]])
  })

  it("places a variable of the schema (23507) and the reverse-connections error (23518)", () => {
    expect(serverFieldTargets(fail(23507, { field: "variables[2].name" }), one)).toEqual([["Variants", 0, "Topology", "Variables", 1, "Name"]])
    expect(serverFieldTargets(fail(23518, { field: "topology.vpn.reverse_connections" }), one)).toEqual([["Variants", 0, "Topology", "VPN", "ReverseConnections"]])
  })

  it("answers may be in any variant, the structure only in the variants that own it: one candidate is placed", () => {
    const two = draft([{}, { linked: true }])
    expect(serverFieldTargets(fail(23505, { task: "scan", field: "check.state.interval" }), two)).toEqual([["Variants", 0, "Tasks", 0, "Check", "State", "Interval"]])
    expect(serverFieldTargets(fail(23506, { device: "web", field: "command" }), two)).toEqual([["Variants", 0, "Topology", "Devices", 0, "Command"]])
  })

  it("never marks several fields: an answer that could be in two variants, or a task in two own variants, is form-level", () => {
    expect(serverFieldTargets(fail(23504, { task: "scan", field: "check.answer.values" }), draft([{}, { linked: true }]))).toBeNull()
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description" }), draft([{}, {}]))).toBeNull()
    expect(serverFieldTargets(fail(23506, { device: "web", field: "command" }), draft([{}, {}]))).toBeNull()
  })

  it("takes the variant from the context when the daemon names it (an int: the 1-based position)", () => {
    const two = draft([{}, {}])
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: 2 }), two)).toEqual([["Variants", 1, "Tasks", 0, "Description"]])
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: 1 }), two)).toEqual([["Variants", 0, "Tasks", 0, "Description"]])
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: "2" }), two)).toEqual([["Variants", 1, "Tasks", 0, "Description"]])
    const linked = draft([{}, { linked: true }])
    expect(serverFieldTargets(fail(23504, { task: "scan", field: "check.answer.values", variant: 2 }), linked)).toEqual([["Variants", 1, "Tasks", 0, "Check", "Answer", "Values"]])
    expect(serverFieldTargets(fail(23506, { device: "web", field: "command", variant: 2 }), two)).toEqual([["Variants", 1, "Topology", "Devices", 0, "Command"]])
  })

  it("a named variant that is not in the form, or that lacks the task or device, is form-level", () => {
    const two = draft([{}, {}])
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: 9 }), two)).toBeNull()
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: 0 }), two)).toBeNull()
    // an id or any other text is not the position
    expect(serverFieldTargets(fail(23519, { task: "scan", field: "description", variant: "v0" }), two)).toBeNull()
    expect(serverFieldTargets(fail(23519, { task: "ghost", field: "description", variant: 1 }), two)).toBeNull()
    // a publish error with task and field resolves in the one variant that has them
    expect(serverFieldTargets(fail(23519, { task: "exploit", field: "hints[1].text" }), draft([{ keys: ["scan", "exploit"] }]))).toEqual([["Variants", 0, "Tasks", 1, "Hints", 0, "Text"]])
  })

  it("stays form-level when it cannot be placed reliably", () => {
    expect(serverFieldTargets(fail(23506, { device: "ghost", field: "command" }), one)).toBeNull()
    expect(serverFieldTargets(fail(23519, { task: "ghost", field: "description" }), one)).toBeNull()
    expect(serverFieldTargets(fail(23506, { device: "web", field: "something.odd" }), one)).toBeNull()
    expect(serverFieldTargets(fail(23510, {}), one)).toBeNull()
    expect(serverFieldTargets(fail(73509, { features: "guest_agent" }), one)).toBeNull()
    expect(serverFieldTargets(new Error("offline"), one)).toBeNull()
  })
})

describe("placeServerFieldError", () => {
  it("sets the field error and returns the lines for the problems list", () => {
    const form = { getValues: () => draft([{ devices: ["web"] }]), setError: vi.fn() }
    const issues = placeServerFieldError(fail(23506, { device: "web", field: "bootstrap.script" }), form as never)
    expect(form.setError).toHaveBeenCalledWith("Variants.0.Topology.Devices.0.Bootstrap.Script", { type: "server", message: expect.any(String) })
    expect(issues).toHaveLength(1)
    expect(issues?.[0].path).toEqual(["Variants", 0, "Topology", "Devices", 0, "Bootstrap", "Script"])
    expect(placeServerFieldError(fail(73509, {}), form as never)).toBeNull()
    expect(form.setError).toHaveBeenCalledTimes(1)
  })
})

describe("withServerErrors", () => {
  it("keeps a server error through a validation pass while the value is unchanged and drops it after an edit", async () => {
    const { withServerErrors } = await import("./serverErrorTarget")
    const memory = new Map([["Name", { message: "server", value: JSON.stringify("a") }]])
    const base = vi.fn(async () => ({ values: {}, errors: {} }))
    const resolver = withServerErrors(base as never, memory)
    const options = { names: ["Name"] } as never
    const kept = await resolver({ Name: "a" } as never, undefined, options)
    expect((kept.errors as Record<string, { message: string }>).Name.message).toBe("server")
    const dropped = await resolver({ Name: "b" } as never, undefined, options)
    expect(dropped.errors).toEqual({})
    expect(memory.size).toBe(0)
  })
})

describe("publish errors with task, variant and field (daemon counts from 1)", () => {
  const two = draft([{ keys: ["scan"] }, { keys: ["scan"], linked: true }])
  const publish = (field: string, variant: number) => fail(23520, { task: "scan", variant, field })

  it("places name, description, a hint by its 1-based number and the answer values on the named variant", () => {
    expect(serverFieldTargets(publish("name", 1), two)).toEqual([["Variants", 0, "Tasks", 0, "Name"]])
    expect(serverFieldTargets(publish("description", 2), two)).toEqual([["Variants", 1, "Tasks", 0, "Description"]])
    expect(serverFieldTargets(publish("hints[1].text", 1), two)).toEqual([["Variants", 0, "Tasks", 0, "Hints", 0, "Text"]])
    expect(serverFieldTargets(publish("hints[3].text", 2), two)).toEqual([["Variants", 1, "Tasks", 0, "Hints", 2, "Text"]])
    expect(serverFieldTargets(publish("check.answer.values", 2), two)).toEqual([["Variants", 1, "Tasks", 0, "Check", "Answer", "Values"]])
  })

  it("does not place hints[0] (the daemon never sends it) or a variant outside the form", () => {
    expect(serverFieldTargets(publish("hints[0].text", 1), two)).toBeNull()
    expect(serverFieldTargets(publish("name", 3), two)).toBeNull()
  })
})
