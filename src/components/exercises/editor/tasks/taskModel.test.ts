import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }))

import { OBSERVATION_KINDS, type ObservationKind } from "@/api/exercises/model"
import { emptyCheck, emptyCondition, emptyTask, nextTaskKey, taskSchema, taskToDTO, type ConditionFormValues, type TaskFormValues } from "@/lib/editor/schemas/task"
import { deliveryPlaces } from "./deliveryPlaces"
import { eligibleRequires } from "./taskShared"
import { conditionSummary } from "./conditionSummary"
import { KIND_SPEC, customRunsWithRights } from "./conditionSpec"
import uk from "../../../../../messages/editor/b.uk.json"
import en from "../../../../../messages/editor/b.en.json"
import { node } from "./harness"

function stateTask(condition: ConditionFormValues): TaskFormValues {
  const task = emptyTask("task_1")
  task.Name = "Check"
  task.Check = { ...emptyCheck("state"), Kind: "state", State: { Mode: "once", Interval: "", Manual: false, Conditions: [condition] } }
  return task
}
const issues = (condition: ConditionFormValues) => {
  const result = taskSchema.safeParse(stateTask(condition))
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}
const filled = (kind: ObservationKind, patch: Record<string, unknown>): ConditionFormValues => {
  const c = emptyCondition(kind, "d1")
  const key = { file: "File", directory: "Directory", process: "Process", port: "Port", kernelParam: "KernelParam", request: "Request", permission: "Permission", custom: "Custom" }[kind] as "File"
  c[key] = { ...c[key], ...patch } as never
  return c
}

describe("validation of the eight condition kinds", () => {
  it("file: an absolute path; «Відсутній» stands alone; checksum, mode and content rules", () => {
    expect(issues(filled("file", { Path: "/etc/x" }))).toEqual([])
    expect(issues(filled("file", { Path: "etc/x" }))).toEqual(["Check.State.Conditions.0.File.Path: ed.b.val.pathAbsolute"])
    expect(issues(filled("file", { Path: "" }))).toEqual(["Check.State.Conditions.0.File.Path: ed.b.val.pathRequired"])
    expect(issues(filled("file", { Path: "/x", Exists: false, Mode: "0644" }))).toEqual(["Check.State.Conditions.0.File.Exists: ed.b.val.fileAbsentAlone"])
    expect(issues(filled("file", { Path: "/x", Exists: false }))).toEqual([])
    expect(issues(filled("file", { Path: "/x", Checksum: "abc" }))).toEqual(["Check.State.Conditions.0.File.Checksum: ed.b.val.checksum"])
    expect(issues(filled("file", { Path: "/x", Checksum: "{{task.task_1}}" }))).toEqual([])
    expect(issues(filled("file", { Path: "/x", Mode: "999" }))).toEqual(["Check.State.Conditions.0.File.Mode: ed.b.val.mode"])
    expect(issues(filled("file", { Path: "/x", Type: "directory", Contains: "a" }))).toEqual(["Check.State.Conditions.0.File.Type: ed.b.val.fileContentNeedsFile"])
  })

  it("directory: an absolute path, a mode, names without a slash", () => {
    expect(issues(filled("directory", { Path: "/srv" }))).toEqual([])
    expect(issues(filled("directory", { Path: "srv" }))).toHaveLength(1)
    expect(issues(filled("directory", { Path: "/srv", Mode: "12" }))).toEqual(["Check.State.Conditions.0.Directory.Mode: ed.b.val.mode"])
    expect(issues(filled("directory", { Path: "/srv", HasEntries: ["a/b"] }))).toEqual(["Check.State.Conditions.0.Directory.HasEntries: ed.b.val.dirEntries"])
  })

  it("process: a name or a pattern; no path in the name; no user for a stopped process", () => {
    expect(issues(filled("process", {}))).toEqual(["Check.State.Conditions.0.Process.Name: ed.b.val.processNameOrMatches"])
    expect(issues(filled("process", { Matches: "nginx: master" }))).toEqual([])
    expect(issues(filled("process", { Name: "/usr/sbin/nginx" }))).toEqual(["Check.State.Conditions.0.Process.Name: ed.b.val.processNameNoPath"])
    expect(issues(filled("process", { Name: "nginx", Running: false, User: "www" }))).toEqual(["Check.State.Conditions.0.Process.User: ed.b.val.processUserWithStopped"])
  })

  it("port: 1 to 65535", () => {
    expect(issues(filled("port", { Port: "8080" }))).toEqual([])
    expect(issues(filled("port", { Port: "" }))).toEqual(["Check.State.Conditions.0.Port.Port: ed.b.val.portRequired"])
    expect(issues(filled("port", { Port: "70000" }))).toEqual(["Check.State.Conditions.0.Port.Port: ed.b.val.portRange"])
  })

  it("kernel parameter: a name and «Дорівнює» or a pattern", () => {
    expect(issues(filled("kernelParam", { Name: "net.ipv4.ip_forward", Equals: "1" }))).toEqual([])
    expect(issues(filled("kernelParam", { Name: "", Equals: "1" }))).toEqual(["Check.State.Conditions.0.KernelParam.Name: ed.b.val.kernelName"])
    expect(issues(filled("kernelParam", { Name: "x" }))).toEqual(["Check.State.Conditions.0.KernelParam.Equals: ed.b.val.kernelValue"])
  })

  it("request: a port; path and status only for http and https", () => {
    expect(issues(filled("request", { Protocol: "tcp", Port: "22" }))).toEqual([])
    expect(issues(filled("request", { Protocol: "tcp", Port: "22", Path: "bad", Status: "999" }))).toEqual([])
    expect(issues(filled("request", { Protocol: "http", Port: "80", Path: "health" }))).toEqual(["Check.State.Conditions.0.Request.Path: ed.b.val.requestPath"])
    expect(issues(filled("request", { Protocol: "https", Port: "443", Status: "99" }))).toEqual(["Check.State.Conditions.0.Request.Status: ed.b.val.requestStatus"])
    expect(issues(filled("request", { Protocol: "http" }))).toEqual(["Check.State.Conditions.0.Request.Port: ed.b.val.portRequired"])
  })

  it("permission: a user, a path and at least one of read, write, execute", () => {
    expect(issues(filled("permission", { User: "www", Path: "/etc/shadow", Read: false }))).toEqual([])
    expect(issues(filled("permission", { User: "www", Path: "/etc/shadow" }))).toEqual(["Check.State.Conditions.0.Permission.Read: ed.b.val.permissionAction"])
    expect(issues(filled("permission", { User: "", Path: "/x", Read: true }))).toEqual(["Check.State.Conditions.0.Permission.User: ed.b.val.userRequired"])
  })

  it("command: something to run; an absolute interpreter", () => {
    expect(issues(filled("custom", { Run: "true" }))).toEqual([])
    expect(issues(filled("custom", { Run: "  " }))).toEqual(["Check.State.Conditions.0.Custom.Run: ed.b.val.customRun"])
    expect(issues(filled("custom", { Run: "true", Interpreter: "sh" }))).toEqual(["Check.State.Conditions.0.Custom.Interpreter: ed.b.val.pathAbsolute"])
  })

  it("a condition needs a device and a timeout in range", () => {
    const c = filled("file", { Path: "/x" })
    c.DeviceID = ""
    expect(issues(c)).toEqual(["Check.State.Conditions.0.DeviceID: ed.b.val.deviceRequired"])
    const slow = filled("file", { Path: "/x" })
    slow.Timeout = "5m"
    expect(issues(slow)).toEqual(["Check.State.Conditions.0.Timeout: ed.b.val.conditionTimeout"])
  })

  it("the wire carries only the chosen kind and only the fields that are set", () => {
    const dto = taskToDTO(stateTask(filled("request", { Protocol: "tcp", Host: "", Port: "22", Method: "GET", Path: "/x" })))
    expect(dto.Check?.State?.Conditions[0]).toEqual({ DeviceID: "d1", Request: { Protocol: "tcp", Port: 22 } })
    const file = taskToDTO(stateTask(filled("file", { Path: "/x", Exists: null, Mode: "0600" })))
    expect(file.Check?.State?.Conditions[0]).toEqual({ DeviceID: "d1", File: { Path: "/x", Mode: "0600" } })
  })
})

describe("the kind of a condition and its messages", () => {
  const MESSAGES = { uk: uk as Record<string, string>, en: en as Record<string, string> }
  for (const lang of ["uk", "en"] as const) {
    it(`${lang}: every field of every kind has a label, a help, and what the spec promises`, () => {
      const messages = MESSAGES[lang]
      for (const kind of OBSERVATION_KINDS) {
        const spec = KIND_SPEC[kind]
        expect(messages[`ed.b.cond.kind.${spec.stem}`], kind).toBeTruthy()
        expect(messages[`ed.b.cond.kind.${spec.stem}.sub`], kind).toBeTruthy()
        for (const field of spec.fields) {
          const stem = `ed.b.cond.${spec.stem}.${field.stem}`
          expect(messages[stem], stem).toBeTruthy()
          expect(messages[`${stem}.help`], stem).toBeTruthy()
          if (field.def) expect(messages[`${stem}.def`], stem).toBeTruthy()
          if (field.ph) expect(messages[`${stem}.ph`], stem).toBeTruthy()
          if (field.kind === "yn") for (const suffix of ["yes", "no"]) expect(messages[`${stem}.${suffix}`], stem).toBeTruthy()
          if (field.kind === "tri") for (const suffix of ["yes", "no", "none"]) expect(messages[`${stem}.${suffix}`], stem).toBeTruthy()
          for (const option of field.options ?? []) expect(messages[`${stem}.opt.${option}`], `${stem} ${option}`).toBeTruthy()
        }
      }
    })
  }

  it("a placeholder of the help is a real example value, never clipped by a long label", () => {
    for (const [key, value] of Object.entries(uk)) if (key.endsWith(".ph")) expect(value.length, key).toBeLessThan(60)
  })

  it("the command warning is for a set user other than nobody", () => {
    expect(customRunsWithRights("")).toBe(false)
    expect(customRunsWithRights("nobody")).toBe(false)
    expect(customRunsWithRights(" nobody ")).toBe(false)
    expect(customRunsWithRights("root")).toBe(true)
  })
})

describe("one summary line per kind", () => {
  it.each(OBSERVATION_KINDS)("%s has a summary that starts with its kind", (kind) => {
    expect(conditionSummary(emptyCondition(kind, "d1"))).toMatch(/^ed\.b\.sum\.[a-z]+/)
  })

  it("lists only what is set", () => {
    expect(conditionSummary(filled("file", { Path: "/x", Exists: false }))).toBe('ed.b.sum.file{"path":"/x"}: ed.b.sum.absent')
    expect(conditionSummary(filled("request", { Protocol: "tcp", Port: "22" }))).toBe('ed.b.sum.tcp{"host":"127.0.0.1","port":"22"}')
  })
})

describe("places where an answer is delivered", () => {
  const env = (name: string, value: string) => ({ Name: name, Value: value, Secret: false, HasValue: true, ValueGroup: "" }) as never
  it("finds variables, files and the script with their rows and the section that holds them", () => {
    const topology = { Devices: [
      node("d0", "gw"),
      node("d1", "web", { Env: [env("A", "x"), env("FLAG", "{{task.task_1}}")], Script: "echo {{task.task_1}}" }),
      node("d2", "db", { Files: [{ Path: "/f", From: "text", Content: "{{task.task_1}}", Source: null, Owner: "", Group: "", Mode: "" }] }),
    ] }
    expect(deliveryPlaces(topology, "task_1").map((place) => [place.kind, place.deviceName, place.row, place.section, place.path])).toEqual([
      ["env", "web", 1, "service", "Topology.Devices.1.Bootstrap.Env.1.Value"],
      ["script", "web", -1, "init", "Topology.Devices.1.Bootstrap.Script"],
      ["file", "db", 0, "init", "Topology.Devices.2.Bootstrap.Files.0.Content"],
    ])
    expect(deliveryPlaces(topology, "task_2")).toEqual([])
    expect(deliveryPlaces(topology, "")).toEqual([])
  })
})

describe("who a task may open after", () => {
  it("never itself and never a task that already waits for it", () => {
    const tasks = [{ Key: "a", Requires: [] }, { Key: "b", Requires: ["a"] }, { Key: "c", Requires: ["b"] }, { Key: "d", Requires: [] }]
    expect(eligibleRequires(tasks, 0)).toEqual([3])
    expect(eligibleRequires(tasks, 1)).toEqual([0, 3])
    expect(eligibleRequires(tasks, 2)).toEqual([0, 1, 3])
    expect(eligibleRequires(tasks, 3)).toEqual([0, 1, 2])
  })

  it("generates the next free task key", () => {
    expect(nextTaskKey([{ Key: "task_1" }, { Key: "task_3" }])).toBe("task_4")
    expect(nextTaskKey([])).toBe("task_1")
  })
})
