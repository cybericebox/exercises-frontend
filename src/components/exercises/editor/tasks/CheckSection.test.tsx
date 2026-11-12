import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }))
vi.mock("@/api/exercises/flagPolicy", () => ({ getFlagPolicy: () => Promise.resolve({ WarningBits: 20, RandomBits: 64, RandomHexLength: 16 }) }))

import { CheckSection } from "./CheckSection"
import { flagTask, node, renderInEditor, task } from "./harness"

const kind = (name: string) => screen.getByRole("radio", { name })
const valueInputs = () => screen.getAllByTestId("answer-value-row").map((row) => within(row).getByRole("textbox") as HTMLInputElement)

beforeEach(() => { vi.clearAllMocks() })

describe("CheckSection: kind of check", () => {
  it("switches Прапор / Текст / Стан in every variant and keeps what was typed in the other halves", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, {
      variants: [{ tasks: [flagTask("task_1", "First", ["ICE{one}"])], devices: [node("d1", "web")] }, { tasks: [flagTask("task_1", "First", ["ICE{two}"])], devices: [node("d2", "db")] }],
    })
    fireEvent.click(kind("ed.b.kind.text"))
    expect(values().Variants.map((variant) => [variant.Tasks[0].Check.Kind, variant.Tasks[0].Check.Answer.Type])).toEqual([["answer", "text"], ["answer", "text"]])
    fireEvent.click(kind("ed.b.kind.state"))
    // A state task starts with one condition on the first node device of each variant.
    expect(values().Variants.map((variant) => [variant.Tasks[0].Check.Kind, variant.Tasks[0].Check.State.Conditions.map((c) => c.DeviceID)])).toEqual([["state", ["d1"]], ["state", ["d2"]]])
    expect(screen.getByTestId("state-pane")).toBeInTheDocument()
    fireEvent.click(kind("ed.b.kind.flag"))
    expect(values().Variants[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{one}"])
    expect(values().Variants[1].Tasks[0].Check.Answer.Values).toEqual(["ICE{two}"])
  })

  it("the help of «Стан» says such tasks are for the Academy and cannot be added to an event", () => {
    renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />)
    // The mocked translator returns keys: the help is the structured one with the three kinds.
    expect(screen.getByTestId("check-section")).toHaveTextContent("ed.b.check.title")
  })

  it("is locked in read-only mode", () => {
    renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { disabled: true })
    expect(kind("ed.b.kind.state").closest("[aria-disabled=true]")).not.toBeNull()
    fireEvent.click(kind("ed.b.kind.state"))
    expect(screen.queryByTestId("state-pane")).toBeNull()
  })
})

describe("CheckSection: answer values", () => {
  it("a flag task without values says the flag is generated; «Додати значення» adds an ICE{} row and focuses it", async () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />)
    expect(screen.getByText("ed.b.answer.random")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.b.answer.add" }))
    expect(values().Variants[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{}"])
    await waitFor(() => expect(valueInputs()[0]).toHaveFocus())
  })

  it("«За зразком» turns the value into a template and back, keeping the text", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First", ["ICE{abc}"])] }] })
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.answer.modeN" + JSON.stringify({ n: 1 }) }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.b.answer.byPattern/ }))
    expect(values().Variants[0].Tasks[0].Check.Answer.Values).toEqual(["template:ICE{abc}"])
    expect(valueInputs()[0]).toHaveValue("ICE{abc}")
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.answer.modeN" + JSON.stringify({ n: 1 }) }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.b.answer.fixed/ }))
    expect(values().Variants[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{abc}"])
  })

  it("several values: each row has its own error beside it, wired with aria-invalid and aria-describedby", async () => {
    const { handles } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First", ["ICE{ok}", "not a flag", "ICE{ok}"])] }] })
    await act(async () => { await handles.form.trigger("Variants") })
    const rows = screen.getAllByTestId("answer-value-row")
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).queryByRole("alert")).toBeNull()
    const bad = within(rows[1]).getByRole("textbox")
    expect(bad).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(bad.getAttribute("aria-describedby")!)).toHaveTextContent("admin.ex.val.flagFormat")
    // The repeated value is flagged on the repeat, not on the first.
    expect(within(rows[2]).getByRole("alert")).toHaveTextContent("admin.ex.val.flagDuplicate")
  })

  it("a text task checks the value as free text and shows the text options", async () => {
    const t = task("task_1", "First")
    t.Check = { ...t.Check, Answer: { ...t.Check.Answer, Type: "text", Values: ["Answer"] } }
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [t] }] })
    expect(screen.getByRole("switch", { name: "ed.b.answer.ignoreCase" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "ed.b.answer.ignoreCase" }))
    expect(values().Variants[0].Tasks[0].Check.Answer.IgnoreCase).toBe(true)
    fireEvent.click(screen.getByRole("switch", { name: "ed.b.answer.trim" }))
    expect(values().Variants[0].Tasks[0].Check.Answer.Trim).toBe(false)
  })

  it("«Підказка в полі вводу» sits beside the values and is limited", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />)
    const input = screen.getByLabelText("ed.b.answer.inputHint")
    fireEvent.change(input, { target: { value: "ICE{…}" } })
    expect(values().Variants[0].Tasks[0].Check.Answer.InputHint).toBe("ICE{…}")
    expect(input).toHaveAttribute("maxlength", "100")
  })

  it("removes a value", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First", ["ICE{a}", "ICE{b}"])] }] })
    fireEvent.click(screen.getAllByRole("button", { name: "ed.b.answer.remove" })[0])
    expect(values().Variants[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{b}"])
  })

  it("a linked variant gets its own values and can go back to the inherited ones", () => {
    const { values } = renderInEditor(<CheckSection variantIndex={1} taskIndex={0} />, {
      variantIndex: 1,
      variants: [{ tasks: [flagTask("task_1", "First", ["ICE{base}"])] }, { linkedTo: "v1", tasks: [flagTask("task_1", "First", [])] }],
    })
    expect(screen.queryByRole("button", { name: "ed.b.answer.add" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "ed.b.answer.ownAction" }))
    expect(values().Variants[1].Tasks[0].Check.Answer.Values[0]).toMatch(/^ICE\{[0-9a-f]{16}\}$/)
    // A linked variant cannot change the kind of value: the dropdown is the base's.
    expect(screen.queryByRole("button", { name: /ed.b.answer.modeN/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "ed.b.answer.reset" }))
    expect(values().Variants[1].Tasks[0].Check.Answer.Values).toEqual([])
  })
})

describe("CheckSection: «Куди передається відповідь»", () => {
  const devices = () => [
    node("d1", "web", { Env: [{ Name: "SEED", Value: "x", Secret: false, HasValue: true, ValueGroup: "" } as never, { Name: "FLAG", Value: "{{task.task_1}}", Secret: false, HasValue: true, ValueGroup: "" } as never] }),
    node("d2", "db", { Files: [{ Path: "/srv/flag.txt", From: "text", Content: "{{task.task_1}}\n", Source: null, Owner: "", Group: "", Mode: "" }], Script: "echo {{task.task_1}}" }),
  ]

  it("lists every place as a link: device and variable, file or script", () => {
    renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First")], devices: devices() }] })
    const block = screen.getByTestId("deliver-block")
    const links = within(block).getAllByRole("listitem").map((item) => within(item).getByRole("button"))
    expect(links.map((link) => link.textContent)).toEqual([
      'web · ed.b.deliver.env{"name":"FLAG"}',
      'db · ed.b.deliver.file{"path":"/srv/flag.txt"}',
      "db · ed.b.deliver.script",
    ])
  })

  it("a link opens the exact row of the device: the variable in «Сервіс», the file and the script in «Ініціалізація»", () => {
    const { handles } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First")], devices: devices() }] })
    const links = within(screen.getByTestId("deliver-block")).getAllByRole("listitem").map((item) => within(item).getByRole("button"))
    fireEvent.click(links[0])
    expect(handles.goToField).toHaveBeenLastCalledWith(["Variants", 0, "Topology", "Devices", 0, "Bootstrap", "Env", 1, "Value"])
    fireEvent.click(links[1])
    expect(handles.goToField).toHaveBeenLastCalledWith(["Variants", 0, "Topology", "Devices", 1, "Bootstrap", "Files", 0, "Content"])
    fireEvent.click(links[2])
    expect(handles.goToField).toHaveBeenLastCalledWith(["Variants", 0, "Topology", "Devices", 1, "Bootstrap", "Script"])
  })

  it("is empty: one quiet line and «Налаштувати в пристрої» with the devices", () => {
    const { handles } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First")], devices: [node("d1", "web"), node("d2", "db")] }] })
    const block = screen.getByTestId("deliver-block")
    expect(block).toHaveTextContent("ed.b.deliver.none")
    expect(block).toHaveTextContent("ed.b.answer.random".replace("answer.random", "deliver.randomNote"))
    fireEvent.keyDown(within(block).getByRole("button", { name: "ed.b.deliver.setup" }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["web", "db"])
    fireEvent.click(screen.getByRole("menuitem", { name: "db" }))
    expect(handles.api).not.toBeNull()
  })

  it("has no setup link when there is no device to set up", () => {
    renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />)
    expect(screen.queryByRole("button", { name: "ed.b.deliver.setup" })).toBeNull()
  })

  it("many values or a template with no delivery is an error beside the values", async () => {
    const { handles } = renderInEditor(<CheckSection variantIndex={0} taskIndex={0} />, { variants: [{ tasks: [flagTask("task_1", "First", ["ICE{a}", "ICE{b}"])] }] })
    await act(async () => { await handles.form.trigger("Variants") })
    expect(within(screen.getByTestId("answer-values")).getByText("ed.b.val.deliveryRequired")).toBeInTheDocument()
  })
})
