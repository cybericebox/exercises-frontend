import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }))

import type { LabCapabilities } from "@/api/exercises/capabilities"
import { OBSERVATION_KINDS, OBSERVATION_WIRE_KEY, type ObservationKind } from "@/api/exercises/model"
import { emptyCheck, emptyCondition, type TaskFormValues } from "@/lib/editor/schemas/task"
import { CheckSection } from "./CheckSection"
import { StatePane } from "./StatePane"
import { KIND_SPEC } from "./conditionSpec"
import { node, renderInEditor, task } from "./harness"

function stateTask(conditions = [emptyCondition("file", "d1")]): TaskFormValues {
  const t = task("task_1", "Check")
  t.Check = { ...emptyCheck("state"), Kind: "state", State: { Mode: "once", Interval: "", Manual: false, Conditions: conditions } }
  return t
}

const devices = () => [node("d1", "web"), node("d2", "db")]
const conditions = (values: () => ReturnType<ReturnType<typeof renderInEditor>["values"]>) => values().Variants[0].Tasks[0].Check.State.Conditions
const label = (key: string) => screen.getByLabelText(key)
const openCondition = (index: number) => fireEvent.click(within(screen.getAllByRole("listitem")[index]).getByRole("button", { expanded: false }))

function renderState(conds = [emptyCondition("file", "d1")], options: { disabled?: boolean } = {}) {
  return renderInEditor(<StatePane variantIndex={0} taskIndex={0} disabled={Boolean(options.disabled)} />, { disabled: options.disabled, variants: [{ tasks: [stateTask(conds)], devices: devices() }] })
}

function chooseKind(kind: ObservationKind, n = 1) {
  fireEvent.keyDown(screen.getByRole("button", { name: `ed.b.cond.kindN{"n":${n}}` }), { key: "ArrowDown" })
  fireEvent.click(screen.getByRole("menuitemradio", { name: new RegExp(`ed\\.b\\.cond\\.kind\\.${KIND_SPEC[kind].stem}(?!\\.)`) }))
}

beforeEach(() => { vi.clearAllMocks() })

describe("StatePane: mode, interval and manual run", () => {
  it("shows mode, «Інтервал перевірки» and the manual switch in one row and writes them", () => {
    const { values } = renderState()
    const pane = screen.getByTestId("state-pane")
    expect(within(pane).getByText("ed.b.state.interval")).toBeInTheDocument()
    fireEvent.change(label("ed.b.state.interval"), { target: { value: "30s" } })
    fireEvent.click(screen.getByRole("switch", { name: "ed.b.state.manual" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.state.mode.aria" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.b.state.continuous/ }))
    const state = values().Variants[0].Tasks[0].Check.State
    expect([state.Interval, state.Manual, state.Mode]).toEqual(["30s", true, "continuous"])
  })

  it("puts the interval error beside the interval", async () => {
    const { handles } = renderState()
    fireEvent.change(label("ed.b.state.interval"), { target: { value: "1s" } })
    await act(async () => { await handles.form.trigger("Variants") })
    const input = label("ed.b.state.interval")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("ed.b.val.interval")
  })
})

describe("StatePane: conditions", () => {
  it("numbers the conditions, collapses all but a single one to a line, and opens by the chevron without a pencil", () => {
    renderState([emptyCondition("file", "d1"), emptyCondition("port", "d2")])
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("1")
    expect(rows[0]).toHaveTextContent("web")
    expect(rows[1]).toHaveTextContent("db")
    expect(rows[1]).toHaveTextContent("ed.b.sum.port")
    expect(screen.queryByRole("button", { name: /pencil|edit/i })).toBeNull()
    fireEvent.click(within(rows[0]).getByRole("button", { expanded: false }))
    expect(within(rows[0]).getByLabelText("ed.b.cond.file.path")).toBeInTheDocument()
    expect(within(rows[1]).queryByLabelText("ed.b.cond.port.port")).toBeNull()
  })

  it("adds a condition on the first node device and opens it; moves and removes", () => {
    const { values } = renderState()
    fireEvent.click(screen.getByRole("button", { name: "ed.b.state.addCondition" }))
    expect(conditions(values).map((c) => [c.DeviceID, c.Kind])).toEqual([["d1", "file"], ["d1", "file"]])
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getAllByLabelText("ed.b.cond.file.path")).toHaveLength(2)
    fireEvent.click(within(screen.getAllByRole("listitem")[1]).getAllByRole("button", { name: "ed.b.state.conditionRemove" })[0])
    expect(conditions(values)).toHaveLength(1)
  })

  it("a condition looks at a node device chosen by name", () => {
    const { values } = renderState()
    fireEvent.keyDown(screen.getByRole("button", { name: 'ed.b.cond.deviceN{"n":1}' }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual(["web", "db"])
    fireEvent.click(screen.getByRole("menuitemradio", { name: "db" }))
    expect(conditions(values)[0].DeviceID).toBe("d2")
  })

  it("is empty: one fixed empty state, add button", () => {
    renderInEditor(<StatePane variantIndex={0} taskIndex={0} disabled={false} />, { variants: [{ tasks: [stateTask([])], devices: devices() }], resolver: false })
    expect(document.querySelector("[data-empty-state]")).not.toBeNull()
    expect(screen.getByText("ed.b.state.conditions.empty")).toBeInTheDocument()
  })

  it("is read-only: no add, no actions; conditions can still be opened and read", () => {
    renderState([emptyCondition("file", "d1"), emptyCondition("port", "d2")], { disabled: true })
    expect(screen.queryByRole("button", { name: "ed.b.state.addCondition" })).toBeNull()
    expect(screen.queryByRole("button", { name: "ed.b.state.conditionRemove" })).toBeNull()
    openCondition(0)
    expect(screen.getByLabelText("ed.b.cond.file.path")).toBeDisabled()
  })
})

/** Which field keys each kind shows, in the schema's own words (the keys of observation_dto.go). */
const SCHEMA_FIELDS: Record<ObservationKind, string[]> = {
  file: ["Path", "Exists", "Type", "Contains", "Matches", "Checksum", "Mode", "Owner", "Group"],
  directory: ["Path", "Exists", "Mode", "Owner", "Group", "HasEntries", "LacksEntries"],
  process: ["Name", "Matches", "User", "Running"],
  port: ["Port", "Protocol", "Listening", "Address", "Process"],
  kernelParam: ["Name", "Equals", "Matches"],
  request: ["Protocol", "Host", "Port", "Method", "Path", "Status", "BodyContains", "BodyMatches"],
  permission: ["User", "Path", "Read", "Write", "Execute"],
  custom: ["Run", "Interpreter", "User", "OutputContains", "OutputMatches"],
}

describe("condition kinds: exactly the fields of the schema", () => {
  it("the spec of each kind lists the schema's fields and nothing else, all present in the form model", () => {
    expect(OBSERVATION_KINDS).toHaveLength(8)
    for (const kind of OBSERVATION_KINDS) {
      expect(KIND_SPEC[kind].fields.map((field) => field.key), kind).toEqual(SCHEMA_FIELDS[kind])
      const model = emptyCondition(kind)[OBSERVATION_WIRE_KEY[kind]] as Record<string, unknown>
      expect(Object.keys(model).sort(), kind).toEqual([...SCHEMA_FIELDS[kind]].sort())
    }
  })

  it.each(["directory", "process", "port", "kernelParam", "request", "permission"] as ObservationKind[])("%s: the kind dropdown shows its fields, one label per field", (kind) => {
    renderState()
    chooseKind(kind)
    for (const field of KIND_SPEC[kind].fields.filter((f) => !f.httpOnly)) expect(screen.getByLabelText(`ed.b.cond.${KIND_SPEC[kind].stem}.${field.stem}`), `${kind}.${field.key}`).toBeInTheDocument()
  })

  it("the kind dropdown lists eight kinds with a one-line description each", () => {
    renderState()
    fireEvent.keyDown(screen.getByRole("button", { name: 'ed.b.cond.kindN{"n":1}' }), { key: "ArrowDown" })
    const items = screen.getAllByRole("menuitemradio")
    expect(items).toHaveLength(8)
    for (const item of items) expect(item.textContent).toMatch(/ed\.b\.cond\.kind\.[a-z_]+\.sub/)
  })
})

describe("condition kinds: behaviour", () => {
  function open(kind?: ObservationKind) {
    const result = renderState()
    if (kind) chooseKind(kind)
    return result
  }

  it("file: «Відсутній» hides and drops every other expectation", () => {
    const c = emptyCondition("file", "d1")
    c.File = { ...c.File, Path: "/etc/x", Exists: true, Mode: "0640", Contains: "root" }
    const { values } = renderState([c])
    expect(screen.getByLabelText("ed.b.cond.file.mode")).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.cond.file.exists" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.b.cond.file.exists.no/ }))
    expect(conditions(values)[0].File).toMatchObject({ Exists: false, Mode: "", Contains: "" })
    expect(screen.queryByLabelText("ed.b.cond.file.mode")).toBeNull()
    expect(screen.queryByRole("group", { name: "ed.b.cond.addExpectation" })).toBeNull()
  })

  it("file: expectations are added as chips and removed with a cross", () => {
    const { values } = open()
    expect(screen.queryByLabelText("ed.b.cond.file.owner")).toBeNull()
    fireEvent.click(within(screen.getByRole("group", { name: "ed.b.cond.addExpectation" })).getByRole("button", { name: "ed.b.cond.file.owner" }))
    fireEvent.change(screen.getByLabelText("ed.b.cond.file.owner"), { target: { value: "root" } })
    expect(conditions(values)[0].File.Owner).toBe("root")
    fireEvent.click(screen.getByRole("button", { name: /ed.b.cond.dropExpectation: ed.b.cond.file.owner/ }))
    expect(conditions(values)[0].File.Owner).toBe("")
    expect(screen.queryByLabelText("ed.b.cond.file.owner")).toBeNull()
  })

  it("request: tcp hides the http-only fields and clears them", () => {
    const c = emptyCondition("request", "d1")
    c.Request = { ...c.Request, Protocol: "http", Port: "80", Path: "/health", Status: "200" }
    const { values } = renderState([c])
    for (const stem of ["method", "path", "status", "body_contains", "body_matches"]) expect(screen.getByLabelText(`ed.b.cond.request.${stem}`)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.cond.request.protocol" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: "ed.b.cond.request.protocol.opt.tcp" }))
    for (const stem of ["method", "path", "status", "body_contains", "body_matches"]) expect(screen.queryByLabelText(`ed.b.cond.request.${stem}`)).toBeNull()
    expect(conditions(values)[0].Request).toMatchObject({ Protocol: "tcp", Path: "", Status: "" })
  })

  it("permission: each action is «Не перевіряти / Дозволено / Заборонено»; at least one is required", async () => {
    const { values, handles } = open("permission")
    fireEvent.change(screen.getByLabelText("ed.b.cond.permission.user"), { target: { value: "www-data" } })
    fireEvent.change(screen.getByLabelText("ed.b.cond.permission.path"), { target: { value: "/etc/shadow" } })
    await act(async () => { await handles.form.trigger("Variants") })
    expect(screen.getByLabelText("ed.b.cond.permission.read")).toHaveAttribute("aria-invalid", "true")
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.cond.permission.read" }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual(["ed.b.cond.permission.read.none", "ed.b.cond.permission.read.yes", "ed.b.cond.permission.read.no"])
    fireEvent.click(screen.getByRole("menuitemradio", { name: "ed.b.cond.permission.read.no" }))
    expect(conditions(values)[0].Permission.Read).toBe(false)
    expect(conditions(values)[0].Permission.Write).toBeNull()
  })

  it("port: a yes-no state shows the documented default and writes only what is chosen", () => {
    const { values } = open("port")
    expect(screen.getByRole("button", { name: "ed.b.cond.port.listening" })).toHaveTextContent("ed.b.cond.port.listening.yes")
    expect(conditions(values)[0].Port.Listening).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.cond.port.listening" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: "ed.b.cond.port.listening.no" }))
    expect(conditions(values)[0].Port.Listening).toBe(false)
  })

  it("directory: names are typed as a comma-separated list and stored as a list", () => {
    const { values } = open("directory")
    const input = screen.getByLabelText("ed.b.cond.directory.has_entries")
    fireEvent.change(input, { target: { value: "config.php, uploads, " } })
    expect(conditions(values)[0].Directory.HasEntries).toEqual(["config.php", "uploads"])
    expect(input).toHaveValue("config.php, uploads, ")
  })

  it("command: the warning appears only when the user is set and is not nobody; the user placeholder is nobody", () => {
    open("custom")
    expect(screen.queryByText("ed.b.cond.custom.rightsWarning")).toBeNull()
    const user = screen.getByLabelText("ed.b.cond.custom.user")
    fireEvent.change(user, { target: { value: "nobody" } })
    expect(screen.queryByText("ed.b.cond.custom.rightsWarning")).toBeNull()
    fireEvent.change(user, { target: { value: "root" } })
    expect(screen.getByText("ed.b.cond.custom.rightsWarning")).toBeInTheDocument()
    fireEvent.change(user, { target: { value: "" } })
    expect(screen.queryByText("ed.b.cond.custom.rightsWarning")).toBeNull()
  })

  it("command: output rules are optional chips", () => {
    const { values } = open("custom")
    expect(screen.queryByLabelText("ed.b.cond.custom.output_contains")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "ed.b.cond.custom.output_contains" }))
    fireEvent.change(screen.getByLabelText("ed.b.cond.custom.output_contains"), { target: { value: "Full" } })
    expect(conditions(values)[0].Custom.OutputContains).toBe("Full")
  })

  it("switching the kind keeps what was typed in the other kinds", () => {
    const { values } = open()
    fireEvent.change(screen.getByLabelText("ed.b.cond.file.path"), { target: { value: "/etc/passwd" } })
    chooseKind("port")
    expect(conditions(values)[0].Kind).toBe("port")
    chooseKind("file")
    expect(conditions(values)[0].File.Path).toBe("/etc/passwd")
  })

  it("an invalid path is reported beside the path, not at the end of the form", async () => {
    const { handles } = open()
    fireEvent.change(screen.getByLabelText("ed.b.cond.file.path"), { target: { value: "etc/passwd" } })
    await act(async () => { await handles.form.trigger("Variants") })
    const path = screen.getByLabelText("ed.b.cond.file.path")
    expect(path).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(path.getAttribute("aria-describedby")!)).toHaveTextContent("ed.b.val.pathAbsolute")
  })

  it("a condition with an error opens by itself (a jump from the issues list lands on the control)", async () => {
    const c = emptyCondition("port", "d1")
    const { handles } = renderState([emptyCondition("file", "d1"), c])
    expect(screen.queryByLabelText("ed.b.cond.port.port")).toBeNull()
    await act(async () => { await handles.form.trigger("Variants") })
    expect(screen.getByLabelText("ed.b.cond.port.port")).toHaveAttribute("aria-invalid", "true")
  })
})

describe("expected values: the token picker", () => {
  it("offers the answers of the tasks by name and the schema variables, never keys", () => {
    const first = task("task_1", "Login")
    const state = stateTask([(() => { const c = emptyCondition("file", "d1"); c.File = { ...c.File, Path: "/x", Contains: "" }; return c })()])
    const { values } = renderInEditor(<StatePane variantIndex={0} taskIndex={1} disabled={false} />, {
      variants: [{ tasks: [first, state], devices: devices(), variables: [{ Name: "admin_pw", Kind: "value", Text: "x" }] }],
    })
    fireEvent.click(within(screen.getByRole("group", { name: "ed.b.cond.addExpectation" })).getByRole("button", { name: "ed.b.cond.file.contains" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.ui.ref.insert" }), { key: "ArrowDown" })
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent)
    expect(items).toEqual(['ed.ui.ref.answerOf{"name":"Login"}', 'ed.ui.ref.variable{"name":"admin_pw"}'])
    fireEvent.click(screen.getByRole("menuitem", { name: /answerOf/ }))
    expect(values().Variants[0].Tasks[1].Check.State.Conditions[0].File.Contains).toBe("{{task.task_1}}")
    expect(screen.getByLabelText("ed.b.cond.file.contains")).toHaveValue("{{ed.ui.ref.tagAnswer: Login}}")
  })

  it("the picker is absent for fields that take no expected value", () => {
    renderState()
    expect(screen.queryByRole("button", { name: "ed.ui.ref.insert" })).toBeNull()
  })
})

describe("what the laboratories can run", () => {
  const caps: LabCapabilities = {
    Known: true,
    Observations: { file: "all", directory: "all", process: "some", port: "none", kernel_param: "all", request: "all", permission: "all", custom: "all", "file.type": "none", "file.checksum": "all" },
    Access: { http: "all", terminal: "all", vnc: "none", rdp: "none" },
    Profiles: { container: "all", microvm: "all", vm: "all" },
    Bootstrap: "all", Checks: "all", VPNReverse: "all",
  }
  const renderWithCaps = (checks: LabCapabilities["Checks"] = "all") => renderInEditor(<StatePane variantIndex={0} taskIndex={0} disabled={false} />, { caps: { ...caps, Checks: checks }, variants: [{ tasks: [stateTask()], devices: devices() }] })

  it("a kind no laboratory runs stays in the list, switched off, with the reason; one some run only warns", () => {
    renderWithCaps()
    fireEvent.keyDown(screen.getByRole("button", { name: 'ed.b.cond.kindN{"n":1}' }), { key: "ArrowDown" })
    const port = screen.getByRole("menuitemradio", { name: /ed\.b\.cond\.kind\.port(?!\.)/ })
    expect(port).toHaveAttribute("aria-disabled", "true")
    expect(port).toHaveTextContent("ed.ui.lab.none")
    const process = screen.getByRole("menuitemradio", { name: /ed\.b\.cond\.kind\.process(?!\.)/ })
    expect(process).not.toHaveAttribute("aria-disabled", "true")
    expect(process).toHaveTextContent("ed.ui.lab.some")
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(8)
  })

  it("the file type is a chip that stays visible and cannot be added when no laboratory checks it", () => {
    const { values } = renderWithCaps()
    const chip = within(screen.getByRole("group", { name: "ed.b.cond.addExpectation" })).getByRole("button", { name: "ed.b.cond.file.type" })
    expect(chip).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(chip)
    expect(conditions(values)[0].File.Type).toBe("")
  })

  it("without laboratory support for state checks the kind «Стан» says why and does not switch", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { caps: { ...caps, Checks: "none" }, variants: [{ tasks: [task("task_1", "T")], devices: devices() }] })
    expect(screen.getByRole("status")).toHaveTextContent("ed.ui.lab.none")
    fireEvent.click(screen.getByRole("radio", { name: "ed.b.kind.state" }))
    expect(values().Variants[0].Tasks[0].Check.Kind).toBe("answer")
  })
})
