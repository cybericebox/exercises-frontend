/**
 * Fixtures of the schema 1.0 editor model for tests: a task, a device and a topology as the API returns them
 * (Normalized*) and as the form holds them, each with the defaults of an empty one and the fields a test cares about.
 */
import type { NormalizedDevice, NormalizedTask, NormalizedTopology } from "@/api/exercises/versions"
import { emptyCheck, emptyTask, type TaskFormValues } from "@/lib/editor/schemas/task"
import { emptyBootstrap, emptyDevice, type DeviceFormValues } from "@/lib/editor/schemas/infra"

/** A task as the API returns it, with a fixed flag answer. */
export function normalizedTask(overrides: Partial<NormalizedTask> & { flag?: string[] } = {}): NormalizedTask {
  const { flag, ...rest } = overrides
  return {
    ID: "", Key: "", Name: "Task", Description: null, Difficulty: "easy", Requires: [],
    Check: { Answer: { Type: "flag", Values: flag ?? [] } },
    Attachments: [], Placeholders: [], Hints: [], ...rest,
  }
}

/** A node device as the API returns it. */
export function normalizedDevice(overrides: Partial<NormalizedDevice> = {}): NormalizedDevice {
  return {
    ID: "", Name: "host", Type: "node", Profile: "container", SecurityPreset: "", Image: "", ResourcePreset: "", Interfaces: [],
    Access: [], Command: [], Args: [], System: "linux", Hardware: "fast",
    Bootstrap: { Timeout: "", Env: [], Files: [], Script: "", Interpreter: "" }, ...overrides,
  }
}

export function normalizedTopology(overrides: Partial<NormalizedTopology> = {}): NormalizedTopology {
  return { Variables: [], VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null, ...overrides }
}

/** A task in the form with an answer check holding `flag`. */
export function formTask(overrides: Partial<TaskFormValues> & { flag?: string[] } = {}): TaskFormValues {
  const { flag, ...rest } = overrides
  const task = { ...emptyTask(), ...rest }
  if (flag) task.Check = { ...emptyCheck("answer"), Kind: "answer", Answer: { ...emptyCheck("answer").Answer, Values: flag } }
  return task
}

/** A node device in the form. */
export function formDevice(overrides: Partial<DeviceFormValues> = {}): DeviceFormValues {
  return { ...emptyDevice(), ...overrides, Bootstrap: { ...emptyBootstrap(), ...overrides.Bootstrap } }
}
