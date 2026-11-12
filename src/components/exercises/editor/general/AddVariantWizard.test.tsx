import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
const upload = vi.fn()
vi.mock("@/api/exercises/files", () => ({ uploadExerciseAttachment: (...args: unknown[]) => upload(...args) }))

import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues, VariantFormValues } from "@/lib/exerciseSchemas"
import type { EditorApi } from "../context"
import { AddVariantWizard } from "./AddVariantWizard"
import { EditorHarness } from "./testHarness"
import { baseVariant, linkedVariant } from "./testkit"

function setup(variants: VariantFormValues[] = [baseVariant()]) {
  const ref: { form?: UseFormReturn<DraftFormValues>; api?: EditorApi; closed: number } = { closed: 0 }
  render(<EditorHarness variants={variants} onReady={(form, api) => { ref.form = form; ref.api = api }}>
    <AddVariantWizard onClose={() => { ref.closed += 1 }} />
  </EditorHarness>)
  return ref
}

const preset = (id: string) => screen.getByRole("radio", { name: new RegExp(`ed\\.a\\.wizard\\.preset\\.${id}`) })
const press = (name: string | RegExp) => act(async () => { fireEvent.click(screen.getByRole("button", { name })) })

describe("AddVariantWizard", () => {
  it("offers the five presets with the default for a base without files and with a free answer", () => {
    setup()
    for (const id of ["files", "answers", "image", "copy", "empty"]) expect(preset(id)).toBeInTheDocument()
    expect(preset("answers")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("button", { name: "ed.a.wizard.next" })).toBeInTheDocument()
  })

  it("shows the base, count and weight under a linked preset, and «Варіант для копіювання» under the copy", () => {
    setup()
    expect(screen.getByLabelText(/ed\.a\.wizard\.count/)).toHaveValue(1)
    expect(screen.getByLabelText(/ed\.a\.wizard\.weight/)).toHaveValue(1)
    fireEvent.click(preset("copy"))
    expect(screen.getByRole("button", { name: /ed\.a\.wizard\.source/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/ed\.a\.wizard\.count/)).not.toBeInTheDocument()
    // no second step for a copy: the button creates
    expect(screen.getByRole("button", { name: "ed.a.wizard.create" })).toBeInTheDocument()
  })

  it("«Інші відповіді»: step 2 has a ticked row with a generated flag, and Create adds a linked variant", async () => {
    const ref = setup()
    await press("ed.a.wizard.next")
    const input = screen.getByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ })
    expect((input as HTMLInputElement).value).toMatch(/^ICE\{[0-9a-f]{16}\}$/)
    fireEvent.change(input, { target: { value: "ICE{fresh}" } })
    await press("ed.a.wizard.create")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants).toHaveLength(2)
    expect(variants[1].LinkedTo).toBe("a")
    expect(variants[1].Tasks[0].Check.Answer.Values).toEqual(["ICE{fresh}"])
    expect(ref.closed).toBe(1)
  })

  it("keeps the wizard open and shows the error beside a missing answer", async () => {
    const ref = setup()
    await press("ed.a.wizard.next")
    const input = screen.getByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ })
    fireEvent.change(input, { target: { value: "" } })
    await press("ed.a.wizard.create")
    expect(ref.form?.getValues("Variants")).toHaveLength(1)
    expect(ref.closed).toBe(0)
    expect(screen.getByRole("alert")).toHaveTextContent("ed.a.wizard.val.flag")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
  })

  it("refuses an answer that the base already has", async () => {
    const ref = setup()
    await press("ed.a.wizard.next")
    fireEvent.change(screen.getByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ }), { target: { value: "ICE{aaaa}" } })
    await press("ed.a.wizard.create")
    expect(screen.getByRole("alert")).toHaveTextContent("ed.a.wizard.val.taken")
    expect(ref.form?.getValues("Variants")).toHaveLength(1)
  })

  it("creates several variants with their own numbers and weights", async () => {
    const ref = setup()
    fireEvent.change(screen.getByLabelText(/ed\.a\.wizard\.count/), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText(/ed\.a\.wizard\.weight/), { target: { value: "4" } })
    await press("ed.a.wizard.next")
    expect(screen.getAllByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ })).toHaveLength(3)
    await press(/ed\.a\.wizard\.createN/)
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants).toHaveLength(4)
    expect(variants.slice(1).map((variant) => variant.Weight)).toEqual([4, 4, 4])
    expect(new Set(variants.slice(1).map((variant) => variant.Tasks[0].Check.Answer.Values[0])).size).toBe(3)
  })

  it("stays on step 1 with an error for a bad count", async () => {
    setup()
    fireEvent.change(screen.getByLabelText(/ed\.a\.wizard\.count/), { target: { value: "0" } })
    expect(screen.getByRole("alert")).toHaveTextContent("ed.a.wizard.val.count")
    await press("ed.a.wizard.next")
    expect(screen.queryByRole("textbox", { name: /newAnswer/ })).not.toBeInTheDocument()
  })

  it("says variants are not needed when every answer reaches the lab and offers to add a value", async () => {
    const a = baseVariant()
    a.Tasks.splice(1, 1)
    a.Topology.Devices[0].Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.t1}}", Secret: false, HasValue: true, ValueGroup: 0 }]
    const ref = setup([a])
    fireEvent.click(preset("answers"))
    expect(screen.getByRole("status")).toHaveTextContent("ed.a.wizard.notNeeded")
    expect(screen.getByRole("button", { name: "ed.a.wizard.create" })).toBeDisabled()
    await press("ed.a.wizard.addValue")
    expect(ref.closed).toBe(1)
  })

  it("«Інший образ»: refuses the base image and writes the own image to the variant", async () => {
    const ref = setup()
    fireEvent.click(preset("image"))
    await press("ed.a.wizard.next")
    const input = screen.getByRole("textbox", { name: /ed\.a\.wizard\.newImage/ })
    fireEvent.change(input, { target: { value: "img:1" } })
    await press("ed.a.wizard.create")
    expect(screen.getByRole("alert")).toHaveTextContent("ed.a.wizard.val.imageSame")
    fireEvent.change(input, { target: { value: "img:2" } })
    await press("ed.a.wizard.create")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants[1].ImageOverrides).toEqual([{ DeviceID: "d1", Image: "img:2" }])
  })

  it("«Інші файли та відповіді»: needs a file, uploads it and keeps it on the new variant", async () => {
    upload.mockResolvedValue({ FileID: "up1", Name: "new.zip", Size: 3 })
    const a = baseVariant()
    a.Tasks[1].Attachments = [{ FileID: "f", Name: "old.zip" }]
    const ref = setup([a])
    expect(preset("files")).toHaveAttribute("aria-checked", "true")
    await press("ed.a.wizard.next")
    await press("ed.a.wizard.create")
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(expect.arrayContaining(["ed.a.wizard.val.file", "ed.a.wizard.val.answer"]))
    fireEvent.change(screen.getByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ }), { target: { value: "another secret" } })
    const input = screen.getByLabelText(/ed\.a\.wizard\.newFiles/)
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "new.zip")] } }) })
    await waitFor(() => expect(screen.getByText("new.zip")).toBeInTheDocument())
    await press("ed.a.wizard.create")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants[1].Tasks[1].Attachments).toEqual([{ FileID: "up1", Name: "new.zip" }])
    expect(upload).toHaveBeenCalled()
  })

  it("«Копія варіанта» copies the chosen variant without a second step", async () => {
    const a = baseVariant()
    const ref = setup([a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })])
    fireEvent.click(preset("copy"))
    await press("ed.a.wizard.create")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants).toHaveLength(3)
    expect(variants.map((variant) => variant.LinkedTo)).toEqual(["", "a", ""])
    expect(ref.closed).toBe(1)
  })

  it("«Порожній варіант» appends an empty variant", async () => {
    const ref = setup()
    fireEvent.click(preset("empty"))
    await press("ed.a.wizard.create")
    const variants = ref.form?.getValues("Variants") ?? []
    expect(variants).toHaveLength(2)
    expect(variants[1].ID).toBe("")
    expect(variants[1].Tasks).toHaveLength(1)
  })

  it("without a saved base only the copy and the empty variant are possible", () => {
    const unsaved = baseVariant({ ID: "" })
    setup([unsaved])
    expect(preset("files")).toBeDisabled()
    expect(preset("answers")).toBeDisabled()
    expect(preset("copy")).toHaveAttribute("aria-checked", "true")
  })

  it("asks before closing step 2 with typed values", async () => {
    const ref = setup()
    await press("ed.a.wizard.next")
    fireEvent.change(screen.getByRole("textbox", { name: /ed\.a\.wizard\.newAnswer/ }), { target: { value: "typed by hand" } })
    await press("confirm.cancel")
    expect(ref.closed).toBe(0)
    expect(screen.getByText("ed.a.wizard.discardTitle")).toBeInTheDocument()
    await press("ed.a.wizard.discardConfirm")
    expect(ref.closed).toBe(1)
  })

  it("goes back from step 2 to step 1", async () => {
    setup()
    await press("ed.a.wizard.next")
    await press("ed.a.wizard.back")
    expect(preset("answers")).toHaveAttribute("aria-checked", "true")
  })
})
