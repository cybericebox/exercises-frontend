import { describe, expect, it } from "vitest"

import type { DeployDeviceStatus, DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedDevice, NormalizedTask } from "@/api/exercises/versions"
import { BOOTSTRAP_MAX_ATTEMPTS, clockTime, conditionLine, deliveredTo, deviceStage, durationSeconds, formatCountdown, hasConsole, labChip, stageFor, stateTaskView, vpnView } from "./testLab"

const device = (extra: Partial<DeployDeviceStatus> = {}): DeployDeviceStatus => ({ Name: "srv", Ready: false, ...extra })
const boot = (Phase: string, Attempts: number, Reason = "") => ({ Phase, Attempts, Reason })

describe("deviceStage", () => {
  it("waits before the lab knows the device and while the lab is queued", () => {
    expect(deviceStage(undefined, "Queued").kind).toBe("waiting")
    expect(deviceStage(device(), "Queued").kind).toBe("waiting")
  })

  it("is starting once the lab provisions, or the pod is dispatched", () => {
    expect(deviceStage(device(), "Provisioning").kind).toBe("starting")
    expect(deviceStage(device({ Scheduling: { State: "Starting", QueuedAt: null, DispatchedAt: null, StartedAt: null, Failure: null } }), "Queued").kind).toBe("starting")
    expect(deviceStage(device({ Scheduling: { State: "Queued", QueuedAt: null, DispatchedAt: null, StartedAt: null, Failure: null } }), "Provisioning").kind).toBe("queued")
  })

  it("reads the initialization attempt while it is pending and never reports attempt 0", () => {
    const stage = deviceStage(device({ Bootstrap: boot("pending", 0) }), "Provisioning")
    expect(stage).toMatchObject({ kind: "initializing", attempt: 1, hasInit: true, steps: 4 })
    expect(deviceStage(device({ Bootstrap: boot("pending", 2) }), "Provisioning").attempt).toBe(2)
    expect(BOOTSTRAP_MAX_ATTEMPTS).toBe(3)
  })

  it("carries the reason the laboratory gives when the initialization failed", () => {
    expect(deviceStage(device({ Bootstrap: boot("failed", 3, "script exited with 1") }), "Failed")).toMatchObject({ kind: "initFailed", attempt: 3, reason: "script exited with 1" })
  })

  it("is ready when the device is up and its initialization is done or absent", () => {
    expect(deviceStage(device({ Ready: true }), "Ready")).toMatchObject({ kind: "ready", steps: 3, hasInit: false })
    expect(deviceStage(device({ Ready: true, Bootstrap: boot("done", 2) }), "Ready")).toMatchObject({ kind: "ready", attempt: 2, steps: 4 })
  })

  it("a pod that did not start is failed", () => {
    const failure = { Reason: "ImagePull", Message: "x", RestartCount: 0, At: null }
    expect(deviceStage(device({ Scheduling: { State: "Failed", QueuedAt: null, DispatchedAt: null, StartedAt: null, Failure: failure } }), "Provisioning").kind).toBe("failed")
  })

  it("a hub or a switch the lab does not list is ready with the lab", () => {
    expect(stageFor({ Name: "hub1", Type: "hub" }, { Phase: "Ready", Ready: true }).kind).toBe("ready")
    expect(stageFor({ Name: "hub1", Type: "hub" }, { Phase: "Provisioning", Ready: false }).kind).toBe("waiting")
    expect(stageFor({ Name: "srv", Type: "node" }, { Phase: "Provisioning", Ready: false }).kind).toBe("waiting")
  })
})

describe("labChip", () => {
  const status = (extra: Partial<DeployStatus>): DeployStatus => ({ Phase: "Provisioning", Ready: false, ...extra })

  it("counts every device of the schema when the topology is given, hub and switch included", () => {
    const topology: Pick<NormalizedDevice, "Name" | "Type">[] = [{ Name: "a", Type: "node" }, { Name: "b", Type: "node" }, { Name: "sw", Type: "unmanaged-switch" }]
    const chip = labChip(status({ Devices: [{ Name: "a", Ready: false }, { Name: "b", Ready: false }] }), false, topology)
    expect(chip).toMatchObject({ ready: 0, total: 3, kind: "starting" })
  })

  it("creating until the first answer, then the queue", () => {
    expect(labChip(null).kind).toBe("creating")
    const queued = labChip(status({ Phase: "Queued", Queue: { Position: 2, Length: 3, Reason: "WaitingForTurn", Message: "", Pods: 3, Pending: 3 }, Devices: [] }))
    expect(queued).toMatchObject({ kind: "queued", queuePosition: 2 })
  })

  it("counts ready devices while starting", () => {
    const chip = labChip(status({ Devices: [device({ Name: "a", Ready: true }), device({ Name: "b" })] }))
    expect(chip).toMatchObject({ kind: "starting", ready: 1, total: 2 })
  })

  it("names the devices that failed after the lab is ready", () => {
    const chip = labChip(status({ Phase: "Ready", Ready: true, Devices: [device({ Name: "a", Ready: true }), device({ Name: "b", Ready: true, Bootstrap: boot("failed", 3, "x") })] }))
    expect(chip).toMatchObject({ kind: "deviceFailed", failed: ["b"] })
    expect(labChip(status({ Phase: "Ready", Ready: true, Devices: [device({ Ready: true })] })).kind).toBe("ready")
  })

  it("failed, expired and removing win over the devices", () => {
    expect(labChip(status({ Phase: "Failed" })).kind).toBe("failed")
    expect(labChip(null, true).kind).toBe("failed")
    expect(labChip(status({ Phase: "Ready", Ready: true, Expired: true })).kind).toBe("expired")
    expect(labChip(status({ Phase: "Removing", Removing: true })).kind).toBe("removing")
  })
})

describe("vpnView", () => {
  it("is pending until the lab is ready and has a configuration", () => {
    expect(vpnView(null)).toEqual({ ready: false, connected: null, state: "pending" })
    expect(vpnView({ Phase: "Ready", Ready: true }).ready).toBe(false)
    expect(vpnView({ Phase: "Ready", Ready: true, VPNConfig: "x", Expired: true }).ready).toBe(false)
  })

  it("available, connected and unknown", () => {
    expect(vpnView({ Phase: "Ready", Ready: true, VPNConfig: "x", VPNConnected: false })).toEqual({ ready: true, connected: false, state: "available" })
    expect(vpnView({ Phase: "Ready", Ready: true, VPNConfig: "x", VPNConnected: true })).toEqual({ ready: true, connected: true, state: "connected" })
    expect(vpnView({ Phase: "Ready", Ready: true, VPNConfig: "x" })).toEqual({ ready: true, connected: null, state: "available" })
  })
})

const dev = (name: string, id: string): NormalizedDevice => ({ ID: id, Name: name, Type: "node", Access: [], Bootstrap: { Timeout: "", Env: [], Files: [], Script: "", Interpreter: "" } } as unknown as NormalizedDevice)

describe("stateTaskView", () => {
  const task = {
    ID: "t2", Key: "ospf",
    Check: { State: { Mode: "once", Conditions: [
      { DeviceID: "d1", Process: { Name: "ospfd" } }, { DeviceID: "d2", Port: { Port: 2604 } }, { DeviceID: "d1", File: { Path: "/etc/frr/frr.conf" } },
    ] } },
  } as unknown as NormalizedTask
  const devices = [dev("r1", "d1"), dev("r2", "d2")]
  const check = (ID: string, Passed: boolean) => ({ ID, Known: true, Passed, FirstPassedAt: null, ChangedAt: "2026-11-12T10:00:00Z", Value: "", Detail: Passed ? "" : "nope" })
  const state = (Checks: ReturnType<typeof check>[], extra = {}) => ({ TaskID: "t2", Key: "ospf", Mode: "once" as const, Manual: true, Solved: false, SolvedAt: null, FirstSolvedAt: null, Known: true, Checks, ...extra })

  it("maps `<key>:<n>` back to the device in order of first appearance and groups its conditions", () => {
    const view = stateTaskView(task, state([check("ospf:1", true), check("ospf:2", false)]), devices, null)
    expect(view.checks.map((entry) => [entry.id, entry.device, entry.passed, entry.conditions.length])).toEqual([["ospf:1", "r1", true, 2], ["ospf:2", "r2", false, 1]])
    expect(view.checks[1].detail).toBe("nope")
    expect(view.status).toBe("notSolved")
  })

  it("names the observation kind of each condition", () => {
    const view = stateTaskView(task, undefined, devices, null)
    expect(view.checks[0].conditions.map((entry) => entry.kind)).toEqual(["process", "file"])
    expect(view.checks[1].conditions[0]).toEqual({ kind: "port", subject: "2604/tcp" })
  })

  it("is unknown before every check has a result and solved when the server says so", () => {
    expect(stateTaskView(task, undefined, devices, null).status).toBe("unknown")
    expect(stateTaskView(task, state([check("ospf:1", true)], { Known: false }), devices, null).status).toBe("unknown")
    const solved = stateTaskView(task, state([check("ospf:1", true), check("ospf:2", true)], { Solved: true, SolvedAt: "2026-11-12T10:05:00Z" }), devices, null)
    expect(solved).toMatchObject({ status: "solved", solvedAt: "2026-11-12T10:05:00Z" })
  })

  it("lists the devices of the task that are not ready", () => {
    const status: DeployStatus = { Phase: "Ready", Ready: true, Devices: [{ Name: "r1", Ready: true }, { Name: "r2", Ready: false }] }
    expect(stateTaskView(task, undefined, devices, status).blockedBy).toEqual(["r2"])
  })
})

describe("conditionLine", () => {
  it("describes every kind by what it looks at", () => {
    expect(conditionLine({ DeviceID: "d", Directory: { Path: "/var" } })).toEqual({ kind: "directory", subject: "/var" })
    expect(conditionLine({ DeviceID: "d", KernelParam: { Name: "net.ipv4.ip_forward" } })).toEqual({ kind: "kernelParam", subject: "net.ipv4.ip_forward" })
    expect(conditionLine({ DeviceID: "d", Request: { Protocol: "http", Port: 80, Path: "/" } })).toEqual({ kind: "request", subject: "http://localhost:80/" })
    expect(conditionLine({ DeviceID: "d", Permission: { User: "app", Path: "/x" } })).toEqual({ kind: "permission", subject: "app: /x" })
    expect(conditionLine({ DeviceID: "d", Custom: { Run: "x".repeat(100) } }).subject.length).toBe(60)
  })
})

describe("helpers", () => {
  it("parses a Go duration", () => {
    expect(durationSeconds("30s")).toBe(30)
    expect(durationSeconds("1m30s")).toBe(90)
    expect(durationSeconds("2h")).toBe(7200)
    expect(durationSeconds("0")).toBeNull()
    expect(durationSeconds("")).toBeNull()
  })

  it("finds the devices an answer is delivered to", () => {
    const srv = dev("srv", "d3")
    srv.Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.secret}}", Secret: false, HasValue: false }]
    const other = dev("r1", "d1")
    expect(deliveredTo("secret", [srv, other])).toEqual(["srv"])
    expect(deliveredTo("missing", [srv, other])).toEqual([])
  })

  it("a console exists when the device has a terminal entry", () => {
    const withConsole = dev("r1", "d1")
    withConsole.Access = [{ Kind: "terminal" }]
    expect(hasConsole(withConsole)).toBe(true)
    expect(hasConsole(dev("r2", "d2"))).toBe(false)
  })

  it("formats the time", () => {
    expect(formatCountdown(3_723_000)).toBe("1:02:03")
    expect(formatCountdown(-5)).toBe("0:00:00")
    expect(clockTime(new Date(2026, 10, 12, 9, 5, 7))).toBe("09:05:07")
  })
})
