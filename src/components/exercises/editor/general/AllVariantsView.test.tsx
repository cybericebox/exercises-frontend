import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
vi.mock("@/api/exercises/files", () => ({ uploadExerciseAttachment: vi.fn().mockResolvedValue({ FileID: "up1", Name: "new.zip", Size: 1 }) }))
vi.mock("../../VariantStatsDialog", () => ({ VariantStatsDialog: () => <div data-testid="stats" /> }))

import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { EditorApi } from "../context"
import { AllVariantsView } from "./AllVariantsView"
import { EditorHarness } from "./testHarness"
import { baseVariant, linkedVariant } from "./testkit"

function setup(opts: { disabled?: boolean; showNotes?: boolean; variants?: ReturnType<typeof baseVariant>[] } = {}) {
  const a = baseVariant()
  a.Weight = 3
  const variants = opts.variants ?? [a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] }), baseVariant({ ID: "c", Index: 3 })]
  const ref: { form?: UseFormReturn<DraftFormValues>; api?: EditorApi } = {}
  render(<EditorHarness variants={variants} disabled={opts.disabled} showNotes={opts.showNotes} onReady={(form, api) => { ref.form = form; ref.api = api }}><AllVariantsView /></EditorHarness>)
  return ref
}

const rows = () => screen.getAllByRole("listitem").filter((item) => item.hasAttribute("data-variant-row"))

describe("AllVariantsView", () => {
  it("lists every variant as a row with kind, weight and its share", () => {
    setup()
    expect(rows()).toHaveLength(3)
    expect(within(rows()[0]).getByText("ed.a.variants.main")).toBeInTheDocument()
    expect(within(rows()[1]).getByText('ed.a.variants.basedOn{"base":1}')).toBeInTheDocument()
    expect(within(rows()[2]).getByText("ed.a.variants.separate")).toBeInTheDocument()
    expect(within(rows()[0]).getByRole("spinbutton")).toHaveValue(3)
    expect(within(rows()[0]).getByText("60%")).toBeInTheDocument()
    expect(within(rows()[1]).getByText("20%")).toBeInTheDocument()
  })

  it("has the one add action in the toolbar and none when read-only", () => {
    const { api } = setup()
    expect(screen.getAllByRole("button", { name: "ed.a.variants.add" })).toHaveLength(1)
    expect(api).toBeDefined()
  })

  it("hides the add action and locks the fields in read-only mode, keeping the open action", () => {
    setup({ disabled: true })
    expect(screen.queryByRole("button", { name: "ed.a.variants.add" })).not.toBeInTheDocument()
    expect(within(rows()[0]).getByRole("spinbutton")).toBeDisabled()
    fireEvent.keyDown(within(rows()[0]).getByRole("button", { name: /ed\.a\.variants\.menuOf/ }), { key: "Enter" })
    expect(screen.getByRole("menuitem", { name: "ed.a.variants.menu.open" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "ed.a.variants.menu.delete" })).not.toBeInTheDocument()
  })

  it("writes a valid weight to the form and updates the shares; an invalid one shows its error and keeps the last valid weight", () => {
    const ref = setup()
    const input = within(rows()[0]).getByRole("spinbutton")
    fireEvent.change(input, { target: { value: "6" } })
    expect(ref.form?.getValues("Variants.0.Weight")).toBe(6)
    expect(within(rows()[0]).getByText("75%")).toBeInTheDocument()
    fireEvent.change(input, { target: { value: "0" } })
    expect(ref.form?.getValues("Variants.0.Weight")).toBe(6)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(within(rows()[0]).getByRole("alert")).toHaveTextContent("ed.a.variants.weightError")
    expect(input.getAttribute("aria-describedby")).toBe(within(rows()[0]).getByRole("alert").id)
  })

  it("expands a base row into its subtasks and devices, and a linked row into its differences", () => {
    setup()
    fireEvent.click(within(rows()[0]).getByRole("button", { name: /ed\.ui\.expand/ }))
    expect(within(rows()[0]).getByText("Login")).toBeInTheDocument()
    expect(within(rows()[0]).getByText("ICE{aaaa}")).toBeInTheDocument()
    expect(within(rows()[0]).getByText("img:1")).toBeInTheDocument()
    fireEvent.click(within(rows()[1]).getByRole("button", { name: /ed\.ui\.expand/ }))
    expect(within(rows()[1]).getByDisplayValue("ICE{bbbb}")).toBeInTheDocument()
    // the base's files and image are shown as «as in the base»
    expect(within(rows()[1]).getByText('ed.a.variants.imageAsInBase{"image":"img:1"}')).toBeInTheDocument()
  })

  it("edits the own answer of a linked variant in place and resets it", () => {
    const ref = setup()
    fireEvent.click(within(rows()[1]).getByRole("button", { name: /ed\.ui\.expand/ }))
    const field = within(rows()[1]).getByDisplayValue("ICE{bbbb}")
    fireEvent.change(field, { target: { value: "ICE{cccc}" } })
    expect(ref.form?.getValues("Variants.1.Tasks.0.Check.Answer.Values")).toEqual(["ICE{cccc}"])
    fireEvent.change(field, { target: { value: "oops" } })
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(within(rows()[1]).getByRole("alert")).toBeInTheDocument()
    fireEvent.click(within(rows()[1]).getAllByRole("button", { name: "ed.a.variants.reset" })[0])
    expect(ref.form?.getValues("Variants.1.Tasks.0.Check.Answer.Values")).toEqual([])
    expect(within(rows()[1]).getAllByRole("button", { name: "ed.a.variants.ownAnswer" })).toHaveLength(2)
  })

  it("flags an own answer that repeats the base's", () => {
    setup()
    fireEvent.click(within(rows()[1]).getByRole("button", { name: /ed\.ui\.expand/ }))
    fireEvent.change(within(rows()[1]).getByDisplayValue("ICE{bbbb}"), { target: { value: "ICE{aaaa}" } })
    expect(within(rows()[1]).getByRole("alert")).toHaveTextContent("ed.a.wizard.val.taken")
  })

  it("gives a linked variant its own image and drops it again", () => {
    const ref = setup()
    fireEvent.click(within(rows()[1]).getByRole("button", { name: /ed\.ui\.expand/ }))
    fireEvent.click(within(rows()[1]).getByRole("button", { name: "ed.a.variants.ownImage" }))
    const field = within(rows()[1]).getByRole("textbox", { name: /ed\.a\.variants\.imageOf/ })
    fireEvent.change(field, { target: { value: "img:2" } })
    expect(ref.form?.getValues("Variants.1.ImageOverrides")).toEqual([{ DeviceID: "d1", Image: "img:2" }])
    fireEvent.click(within(rows()[1]).getAllByRole("button", { name: "ed.a.variants.reset" }).at(-1) as HTMLElement)
    expect(ref.form?.getValues("Variants.1.ImageOverrides")).toEqual([])
  })

  it("edits the internal note inside the expansion for full access only", () => {
    const ref = setup()
    fireEvent.click(within(rows()[2]).getByRole("button", { name: /ed\.ui\.expand/ }))
    fireEvent.change(within(rows()[2]).getByRole("textbox", { name: /ed\.a\.variants\.note/ }), { target: { value: "check it" } })
    expect(ref.form?.getValues("Variants.2.Note")).toBe("check it")
  })

  it("leaves the note out without full access", () => {
    setup({ showNotes: false })
    fireEvent.click(within(rows()[2]).getByRole("button", { name: /ed\.ui\.expand/ }))
    expect(screen.queryByText("ed.a.variants.note")).not.toBeInTheDocument()
  })

  it("shows the «variants are not needed» strip when the answer reaches the lab", () => {
    const a = baseVariant()
    a.Topology.Devices[0].Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.t1}}", Secret: false, HasValue: true, ValueGroup: 0 }]
    setup({ variants: [a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })] })
    expect(screen.getByRole("note")).toHaveTextContent("ed.a.variants.needless")
  })

  async function pick(row: number, name: string) {
    const trigger = within(rows()[row]).getByRole("button", { name: /ed\.a\.variants\.menuOf/ })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name }))
  }

  it("duplicates from the row menu as a separate copy after the group", async () => {
    const ref = setup()
    await pick(0, "ed.a.variants.menu.duplicate")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants).toHaveLength(4)
    expect(variants.map((variant) => variant.ID)).toEqual(["a", "b", "", "c"])
    expect(variants[2].LinkedTo).toBe("")
  })

  it("detaches a linked variant after a confirmation", async () => {
    const ref = setup()
    await pick(1, "ed.a.variants.menu.detach")
    expect(ref.form?.getValues("Variants.1.LinkedTo")).toBe("a")
    fireEvent.click(screen.getByRole("button", { name: "ed.a.variants.detach" }))
    expect(ref.form?.getValues("Variants.1.LinkedTo")).toBe("")
  })

  it("offers detach only on a linked variant", async () => {
    setup()
    fireEvent.keyDown(within(rows()[0]).getByRole("button", { name: /ed\.a\.variants\.menuOf/ }), { key: "Enter" })
    await screen.findByRole("menuitem", { name: "ed.a.variants.menu.delete" })
    expect(screen.queryByRole("menuitem", { name: "ed.a.variants.menu.detach" })).not.toBeInTheDocument()
  })

  it("deletes after a danger confirmation; the variants based on a deleted base become separate", async () => {
    const ref = setup()
    await pick(0, "ed.a.variants.menu.delete")
    expect(screen.getByText('ed.a.variants.deleteBase{"n":1,"count":1}')).toBeInTheDocument()
    expect(ref.form?.getValues("Variants")).toHaveLength(3)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ed.a.variants.deleteConfirm" })) })
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants.map((variant) => variant.ID)).toEqual(["b", "c"])
    expect(variants[0].LinkedTo).toBe("")
  })

  it("says how many variants become separate when a base is deleted, and returns focus to the row menu after cancelling", async () => {
    setup()
    await pick(0, "ed.a.variants.menu.delete")
    expect(screen.getByText('ed.a.variants.deleteBase{"n":1,"count":1}')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "confirm.cancel" })) })
    await waitFor(() => expect(document.activeElement?.id).toBe("ea-menu-0"))
  })

  it("does not expand the row when a menu item is chosen", async () => {
    setup()
    await pick(1, "ed.a.variants.menu.open")
    expect(within(rows()[1]).getByRole("button", { name: /ed\.ui\.expand/ })).toHaveAttribute("aria-expanded", "false")
  })

  it("cannot delete the only variant", async () => {
    setup({ variants: [baseVariant()] })
    fireEvent.keyDown(within(rows()[0]).getByRole("button", { name: /ed\.a\.variants\.menuOf/ }), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: /ed\.a\.variants\.menu\.delete/ })).toHaveAttribute("aria-disabled", "true")
  })

  it("opens the add-variant wizard from the toolbar", () => {
    const ref = setup()
    fireEvent.click(screen.getByRole("button", { name: "ed.a.variants.add" }))
    expect(ref.api?.dialog).toBe("wizard")
  })
})
