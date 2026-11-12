import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }))
vi.mock("@/api/exercises/flagPolicy", () => ({ getFlagPolicy: () => Promise.resolve({ WarningBits: 20, RandomBits: 64, RandomHexLength: 16 }) }))
// Lexical does not type in jsdom: a textarea stands in and emits a document.
vi.mock("@/components/editor/RichTextEditor", () => ({
  default: ({ ariaLabel, disabled, value, onChange }: { ariaLabel: string; disabled: boolean; value: unknown; onChange: (state: unknown) => void }) => (
    <textarea aria-label={ariaLabel} disabled={disabled} defaultValue={value ? "x" : ""} onChange={(event) => onChange({ root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: event.target.value }] }] } })} />
  ),
}))

import { TasksView } from "./index"
import { flagTask, node, renderInEditor, task } from "./harness"

const names = (values: { Tasks: { Name: string }[] }[]) => values.map((variant) => variant.Tasks.map((item) => item.Name))
const rail = () => screen.getByTestId("task-rail")

beforeEach(() => { vi.clearAllMocks() })

describe("TasksView: the rail", () => {
  it("shows number, name, kind of check and «після N»; never a task key", () => {
    const third = task("task_3", "Third", { Requires: ["task_1", "task_2"] })
    const { container } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First"), task("task_2", "Second"), third] }] })
    const items = within(rail()).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent("1First")
    expect(items[0]).toHaveTextContent("ed.b.kind.flag")
    expect(items[2]).toHaveTextContent('ed.b.rail.after{"list":"1, 2"}')
    expect(container.textContent).not.toMatch(/task_\d/)
  })

  it("selects a task and shows its form; the name is the task's own", () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First"), flagTask("task_2", "Second")] }] })
    expect(screen.getByLabelText("admin.exTask.name")).toHaveValue("First")
    fireEvent.click(within(rail()).getAllByRole("button", { name: /Second/ })[0])
    expect(screen.getByLabelText("admin.exTask.name")).toHaveValue("Second")
  })

  it("renaming a task renames it in every variant", () => {
    const { values } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")] }, { tasks: [flagTask("task_1", "First")] }] })
    fireEvent.change(screen.getByLabelText("admin.exTask.name"), { target: { value: "Renamed" } })
    expect(names(values().Variants)).toEqual([["Renamed"], ["Renamed"]])
  })

  it("adds a task to every variant with the same generated key and opens it", () => {
    const { values } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")] }, { tasks: [flagTask("task_1", "First")] }] })
    fireEvent.click(screen.getByRole("button", { name: "ed.b.rail.add" }))
    expect(values().Variants.map((variant) => variant.Tasks.map((item) => item.Key))).toEqual([["task_1", "task_2"], ["task_1", "task_2"]])
    expect(within(rail()).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByLabelText("admin.exTask.name")).toHaveValue("")
  })

  it("moves a task in every variant", () => {
    const { values } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First"), flagTask("task_2", "Second")] }, { tasks: [flagTask("task_1", "First"), flagTask("task_2", "Second")] }] })
    const first = within(rail()).getAllByRole("listitem")[0]
    fireEvent.keyDown(within(first).getByRole("button", { name: "ed.b.rail.actions" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: /ed.b.rail.moveDown/ }))
    expect(names(values().Variants)).toEqual([["Second", "First"], ["Second", "First"]])
  })

  it("removes a task from every variant after a confirmation that names who depends on it, and drops the dependency", () => {
    const { values } = renderInEditor(<TasksView />, { variants: [
      { tasks: [flagTask("task_1", "First"), task("task_2", "Second", { Requires: ["task_1"] })] },
      { tasks: [flagTask("task_1", "First"), task("task_2", "Second", { Requires: ["task_1"] })] },
    ] })
    const first = within(rail()).getAllByRole("listitem")[0]
    fireEvent.keyDown(within(first).getByRole("button", { name: "ed.b.rail.actions" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: /ed.b.rail.remove/ }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent('ed.b.rail.removeTitle{"name":"First"}')
    expect(dialog).toHaveTextContent("«Second»")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.b.rail.remove" }))
    expect(names(values().Variants)).toEqual([["Second"], ["Second"]])
    expect(values().Variants.map((variant) => variant.Tasks[0].Requires)).toEqual([[], []])
  })

  it("keeps the last task: no removal item for a single task", () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")] }] })
    fireEvent.keyDown(within(rail()).getByRole("button", { name: "ed.b.rail.actions" }), { key: "ArrowDown" })
    expect(screen.queryByRole("menuitem", { name: /ed.b.rail.remove/ })).toBeNull()
  })

  it("shows an empty state when the variant has no tasks", () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [] }], resolver: false })
    expect(screen.getByText("ed.b.rail.empty")).toBeInTheDocument()
    expect(document.querySelector("[data-empty-state]")).not.toBeNull()
  })
})

describe("TasksView: read-only and linked variants", () => {
  it("is read-only: no add, no actions, fields disabled", () => {
    renderInEditor(<TasksView />, { disabled: true, variants: [{ tasks: [flagTask("task_1", "First")] }] })
    expect(screen.queryByRole("button", { name: "ed.b.rail.add" })).toBeNull()
    expect(screen.queryByRole("button", { name: "ed.b.rail.actions" })).toBeNull()
    expect(screen.getByLabelText("admin.exTask.name")).toBeDisabled()
    expect(screen.getByLabelText("admin.exTask.description")).toBeDisabled()
  })

  it("a linked variant changes the answer values and the files only", () => {
    renderInEditor(<TasksView />, {
      variantIndex: 1,
      variants: [{ tasks: [flagTask("task_1", "First", ["ICE{base}"])] }, { linkedTo: "v1", tasks: [flagTask("task_1", "First", [])] }],
    })
    expect(screen.queryByRole("button", { name: "ed.b.rail.add" })).toBeNull()
    expect(screen.queryByRole("button", { name: "ed.b.rail.actions" })).toBeNull()
    expect(screen.getByLabelText("admin.exTask.name")).toBeDisabled()
    expect(screen.getByLabelText("admin.exTask.difficulty")).toBeDisabled()
    expect(screen.getByLabelText("admin.exTask.description")).toBeDisabled()
    // The base values are inherited until the variant gets its own; the own button works.
    expect(screen.getByText("ICE{base}")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "ed.b.answer.ownAction" })).toBeEnabled()
    // Files stay editable.
    expect(screen.getByTestId("attachments-drop-zone")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exFiles.upload" })).toBeEnabled()
    // The structure of the check is the base's.
    for (const radio of screen.getAllByRole("radio")) expect(radio.closest("[aria-disabled=true]")).not.toBeNull()
  })
})

describe("TasksView: form order and sections", () => {
  it("lists the sections in the order of the design: name, description, files, check, opens after, hints", () => {
    const { container } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First"), flagTask("task_2", "Second")] }] })
    const text = container.querySelector(".subtask-form")!
    const order = ["admin.exTask.name", "admin.exTask.description", "ed.b.files", "ed.b.check.title", "ed.b.requires.title", "exercises.hints.title"].map((needle) => text.innerHTML.indexOf(needle))
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(text.querySelectorAll("hr")).toHaveLength(4)
  })

  it("«Відкривається після» offers tasks by name, several may be chosen, and none that would make a cycle", () => {
    const { values } = renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First"), flagTask("task_2", "Second"), task("task_3", "Third", { Requires: ["task_2"] })] }] })
    fireEvent.click(within(rail()).getAllByRole("button", { name: /Second/ })[0])
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.requires.add" }), { key: "ArrowDown" })
    const items = screen.getAllByRole("menuitemcheckbox")
    // «Third» waits for «Second»: offering it would close a cycle.
    expect(items.map((item) => item.textContent)).toEqual(["1. First"])
    fireEvent.click(items[0])
    expect(values().Variants[0].Tasks[1].Requires).toEqual(["task_1"])
    expect(document.body.textContent).not.toMatch(/task_\d/)
  })
})

describe("TasksView: nothing to require", () => {
  it("disables the add menu and says nothing under the field (the reason is in the «?»)", () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")] }] })
    expect(screen.getByRole("button", { name: "ed.b.requires.add" })).toBeDisabled()
    expect(screen.queryByText(/noneEligible/)).toBeNull()
  })
})

describe("TasksView: files", () => {
  it("shows no text when there are no files and nothing in read-only", () => {
    renderInEditor(<TasksView />, { disabled: true, variants: [{ tasks: [flagTask("task_1", "First")] }] })
    expect(screen.queryByTestId("attachments-drop-zone")).toBeNull()
  })

  it("keeps the compact drop zone, with plain text", async () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")] }] })
    const zone = screen.getByRole("button", { name: "admin.exFiles.upload" })
    expect(zone).toHaveTextContent("ed.b.files.drop")
    await act(async () => { fireEvent.dragOver(screen.getByTestId("task-drop-zone"), { dataTransfer: { types: ["Files"] } }) })
    expect(screen.queryByText("admin.exFiles.none")).toBeNull()
  })
})

describe("TasksView: devices in the picker of conditions are node devices", () => {
  it("renders without devices", () => {
    renderInEditor(<TasksView />, { variants: [{ tasks: [flagTask("task_1", "First")], devices: [node("d1", "web")] }] })
    expect(screen.getByTestId("check-section")).toBeInTheDocument()
  })
})
