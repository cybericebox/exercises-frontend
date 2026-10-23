import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { useForm, useWatch } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { AllVariantsTable } from "./AllVariantsTable"
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"

function draft(): DraftFormValues {
  const value = emptyDraft()
  const tasks = (flags: string[][], files = 0) => flags.map((flag, index) => ({ ...emptyTask(), ID: `t${index}`, Name: `Task ${index + 1}`, Difficulty: "easy" as const, Flag: flag,
    Attachments: index === 0 ? Array.from({ length: files }, (_, n) => ({ FileID: `f${n}`, Name: `file${n}.pcap` })) : [] }))
  value.Variants = [
    { ...emptyVariant(1), ID: "a", Note: "Base", Tasks: tasks([["ICE{a1}"], ["template:ICE{\\d}"]], 2) },
    { ...emptyVariant(2), ID: "b", LinkedTo: "a", Tasks: tasks([["ICE{b1}", "ICE{b1x}"], []]) },
  ]
  return value
}

function Harness({ onOpen = vi.fn() }: { onOpen?: (index: number) => void }) {
  const form = useForm<DraftFormValues>({ defaultValues: draft() })
  const flags = useWatch({ control: form.control, name: "Variants.1.Tasks.0.Flag" })
  return <>
    <AllVariantsTable form={form} disabled={false} onOpen={onOpen} />
    <output data-testid="flags">{JSON.stringify(flags)}</output>
  </>
}

describe("AllVariantsTable", () => {
  it("shows a column per subtask, what each variant owns, and opens a variant from its number", () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "admin.exDraft.variant", 'admin.exDraft.subtaskColumn{"n":1,"name":"Task 1"} · admin.ex.difficulty.easy', 'admin.exDraft.subtaskColumn{"n":2,"name":"Task 2"} · admin.ex.difficulty.easy',
      "admin.exDraft.tab.topology", "admin.exDraft.tab.note",
    ])
    expect(screen.getByText("admin.exTask.flag.modeTemplate")).toBeInTheDocument()
    expect(screen.getByText("+1")).toBeInTheDocument()
    expect(screen.getByLabelText('admin.exDraft.filesCount{"count":2}')).toHaveTextContent("2")
    expect(screen.getByText('admin.exDraft.infraAsIn{"n":1}')).toBeInTheDocument()
    expect(screen.getByText("admin.exDraft.infraMain")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: 'admin.exDraft.openVariant{"n":2}' }))
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it("edits the first flag in place and keeps the others", () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole("textbox", { name: 'admin.exDraft.flagCell{"n":2,"task":1}' }), { target: { value: "ICE{new}" } })
    expect(screen.getByTestId("flags")).toHaveTextContent('["ICE{new}","ICE{b1x}"]')
  })

  it("leaves an emptied only flag random", () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole("textbox", { name: 'admin.exDraft.flagCell{"n":2,"task":2}' }), { target: { value: "ICE{x}" } })
    fireEvent.change(screen.getByRole("textbox", { name: 'admin.exDraft.flagCell{"n":2,"task":2}' }), { target: { value: "" } })
    expect(screen.getByRole("textbox", { name: 'admin.exDraft.flagCell{"n":2,"task":2}' })).toHaveValue("")
  })
})
