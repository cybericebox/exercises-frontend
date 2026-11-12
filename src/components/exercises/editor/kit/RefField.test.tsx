import { createRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FormProvider, useForm } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { RefField } from "./RefField"
import { emptyDraft, emptyTask, type DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyCheck } from "@/lib/editor/schemas/task"

function draft(): DraftFormValues {
  const value = emptyDraft()
  value.Variants[0].Tasks = [
    { ...emptyTask(), Key: "login", Name: "Вхід", Check: emptyCheck("answer") },
    { ...emptyTask(), Key: "scan", Name: "Скан", Check: emptyCheck("state") },
  ]
  value.Variants[0].Topology.Variables = [{ Name: "pw", Kind: "value", Text: "x" }]
  return value
}

function Host({ initial, children }: { initial: string; children: (value: string, set: (raw: string) => void) => React.ReactNode }) {
  const form = useForm<DraftFormValues>({ defaultValues: draft() })
  const [value, setValue] = useState(initial)
  return <FormProvider {...form}>{children(value, setValue)}<output data-testid="raw">{value}</output></FormProvider>
}

const raw = () => screen.getByTestId("raw").textContent

describe("RefField as the tasks package uses it (a line with a picker)", () => {
  it("shows the answer by task name, keeps the raw token, and passes the attributes and the ref to the input", () => {
    const ref = createRef<HTMLInputElement & HTMLTextAreaElement>()
    const onBlur = vi.fn()
    render(<Host initial="x{{task.login}}">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} ref={ref} name="Expected" id="fe-1" aria-label="expected" aria-invalid onBlur={onBlur} />}</Host>)
    const input = screen.getByLabelText("expected")
    expect(input).toHaveValue("x{{ed.b.ref.tagAnswer: Вхід}}")
    expect(ref.current).toBe(input)
    expect(input).toHaveAttribute("name", "Expected")
    expect(input).toHaveAttribute("id", "fe-1")
    expect(input).toHaveAttribute("aria-invalid", "true")
    fireEvent.blur(input)
    expect(onBlur).toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "y{{ed.b.ref.tagAnswer: Вхід}}" } })
    expect(raw()).toBe("y{{task.login}}")
  })

  it("inserts a picked answer at the caret by name and offers only tasks with an answer (not the excluded one)", () => {
    render(<Host initial="ab">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="expected" />}</Host>)
    const input = screen.getByLabelText("expected") as HTMLInputElement
    input.setSelectionRange(1, 1)
    fireEvent.select(input)
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.ref.insert" }), { key: "ArrowDown" })
    expect(screen.queryByText(/ed.b.refAnswer Скан/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: /ed.b.refAnswer Вхід/ }))
    expect(raw()).toBe("a{{task.login}}b")
  })

  it("has no picker when read-only or when the picker is off", () => {
    const { rerender } = render(<Host initial="">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="expected" disabled />}</Host>)
    expect(screen.queryByRole("button", { name: "ed.b.ref.insert" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("expected")).toBeDisabled()
    rerender(<Host initial="">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="expected" picker={false} />}</Host>)
    expect(screen.queryByRole("button", { name: "ed.b.ref.insert" })).not.toBeInTheDocument()
  })
})

describe("RefField behaviour on top", () => {
  it("highlights known tokens and underlines an unknown reference", () => {
    render(<Host initial="{{task.login}} {{var.pw}} {{var.gone}}">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" />}</Host>)
    expect(document.querySelector('[data-ref-token="task"]')).not.toBeNull()
    expect(document.querySelector('[data-ref-token="var"]')).toHaveTextContent("pw")
    expect(document.querySelector('[data-ref-token="unknown"]')).toHaveTextContent("gone")
  })

  it("removes a whole token with one Backspace or Delete", () => {
    render(<Host initial="x{{task.login}}y">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" />}</Host>)
    const input = screen.getByLabelText("f") as HTMLInputElement
    input.setSelectionRange(input.value.length - 1, input.value.length - 1)
    fireEvent.keyDown(input, { key: "Backspace" })
    expect(raw()).toBe("xy")
  })

  it("is a text area when multiline and keeps its lines", () => {
    render(<Host initial={"a\n{{var.pw}}"}>{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" multiline rows={3} />}</Host>)
    const area = screen.getByLabelText("f")
    expect(area.tagName).toBe("TEXTAREA")
    fireEvent.change(area, { target: { value: "a\nb\n{{ed.b.ref.tagVar: pw}}" } })
    expect(raw()).toBe("a\nb\n{{var.pw}}")
  })

  it("masks a plain value with an eye and shows a value with a reference as it is", () => {
    const { rerender } = render(<Host initial="plain">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" mask />}</Host>)
    expect(screen.getByLabelText("f")).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.showValue" }))
    expect(screen.getByLabelText("f")).toHaveAttribute("type", "text")
    rerender(<Host initial="{{var.pw}}">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" mask />}</Host>)
    expect(screen.getByLabelText("f")).toHaveAttribute("type", "text")
    expect(screen.queryByRole("button", { name: "ed.ui.showValue" })).not.toBeInTheDocument()
  })

  it("creates a variable from the picker and inserts its token", () => {
    const create = vi.fn((insert: (name: string) => void) => insert("fresh"))
    render(<Host initial="">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" onNewVariable={create} />}</Host>)
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.b.ref.insert" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: "ed.c.ref.newVariable" }))
    expect(create).toHaveBeenCalled()
    expect(raw()).toBe("{{var.fresh}}")
  })

  it("shows an expand tool next to the picker", () => {
    render(<Host initial="">{(value, set) => <RefField variantIndex={0} value={value} onValueChange={set} aria-label="f" expandTool={<button type="button">grow</button>} />}</Host>)
    expect(screen.getByRole("button", { name: "grow" })).toBeInTheDocument()
  })
})
