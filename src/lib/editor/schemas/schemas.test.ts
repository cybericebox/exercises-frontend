import { describe, expect, it } from "vitest"
import { checkToDTO, checkToForm, emptyCheck, emptyCondition, nextTaskKey, emptyTask } from "./task"
import { bootstrapToDTO, emptyAccess, emptyBootstrap, emptyDevice, emptyTopology, emptyVariable, topologyToDTO, topologyToForm } from "./infra"
import { normalizeTopology } from "@/api/exercises/versions"
import type { CheckDTO } from "@/api/exercises/model"

describe("task schema", () => {
  it("round-trips an answer check", () => {
    const dto: CheckDTO = { Answer: { Type: "text", Values: ["admin"], InputHint: "login", IgnoreCase: true, Trim: false } }
    const form = checkToForm(dto)
    expect(form.Kind).toBe("answer")
    expect(checkToDTO(form)).toEqual(dto)
  })

  it("a flag never carries IgnoreCase or Trim", () => {
    const form = emptyCheck("answer")
    form.Answer.Values = ["ICE{x}"]
    form.Answer.IgnoreCase = true
    expect(checkToDTO(form)).toEqual({ Answer: { Type: "flag", Values: ["ICE{x}"] } })
  })

  it("no check goes out as nothing, and keeps both halves while the kind is switched", () => {
    const form = emptyCheck("none")
    form.Kind = "none"
    expect(checkToDTO(form)).toBeUndefined()
    const typed = emptyCheck("answer")
    typed.Answer.Values = ["a"]
    typed.Kind = "state"
    expect(typed.Answer.Values).toEqual(["a"])
    expect(checkToDTO(typed)?.Answer).toBeUndefined()
  })

  it("round-trips a state check with a port condition", () => {
    const condition = emptyCondition("port", "dev-1")
    condition.Port.Port = "8080"
    const form = emptyCheck("state")
    form.Kind = "state"
    form.State.Conditions = [condition]
    const dto = checkToDTO(form)
    expect(dto?.State?.Conditions[0]).toMatchObject({ DeviceID: "dev-1", Port: { Port: 8080 } })
    const back = checkToForm(dto as CheckDTO)
    expect(back.Kind).toBe("state")
    expect(back.State.Conditions[0].Kind).toBe("port")
    expect(back.State.Conditions[0].Port.Port).toBe("8080")
  })

  it("names new tasks task_N without a clash", () => {
    expect(nextTaskKey([])).toBe("task_1")
    expect(nextTaskKey([{ ...emptyTask(), Key: "task_1" }, { ...emptyTask(), Key: "task_3" }])).not.toBe("task_1")
    expect(nextTaskKey([{ ...emptyTask(), Key: "task_1" }, { ...emptyTask(), Key: "task_3" }])).not.toBe("task_3")
  })
})

describe("infrastructure schema", () => {
  it("reads a legacy container device as a node", () => {
    const topology = normalizeTopology({ Devices: [{ ID: "d", Name: "web", Type: "container", Image: "nginx", Interfaces: [] }] } as never)
    expect(topology.Devices[0].Type).toBe("node")
  })

  it("sends no bootstrap when it is empty", () => {
    expect(bootstrapToDTO(emptyBootstrap())).toBeUndefined()
  })

  it("keeps env, script and variables through the topology round trip", () => {
    const topology = emptyTopology()
    const device = emptyDevice()
    device.ID = "d1"
    device.Name = "web"
    device.Image = "nginx"
    device.Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.scan}}", Secret: false } as never]
    device.Bootstrap.Script = "echo hi"
    device.Access = [emptyAccess("http")]
    topology.Devices = [device]
    topology.Variables = [{ ...emptyVariable(), Name: "net", Text: "10.0.0.0/24" }]
    const dto = topologyToDTO(topology)
    expect(dto.Variables?.[0]).toMatchObject({ Name: "net" })
    const back = topologyToForm(normalizeTopology(dto))
    expect(back.Devices[0].Bootstrap.Script).toBe("echo hi")
    expect(back.Devices[0].Bootstrap.Env[0]).toMatchObject({ Name: "FLAG", Value: "{{task.scan}}" })
    expect(back.Variables[0]).toMatchObject({ Name: "net", Text: "10.0.0.0/24" })
  })
})
