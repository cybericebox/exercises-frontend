import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { useRef, useState } from "react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { EditorPositionProvider, useEditorPosition } from "../EditorPosition"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import { EditorProvider, useEditor, type EditorApi, type EditorPageData } from "./context"
import { VariantMenu } from "./VariantMenu"
import { IssuesDialog } from "./IssuesDialog"
import { firstErrorPath } from "./fieldErrors"

function Probe() {
  const [tab] = useEditorPosition("tab")
  const [variant] = useEditorPosition("variant")
  return <output data-testid="pos">{`${tab}:${variant}`}</output>
}

function Harness({ onGoToField = vi.fn(), exposeApi }: { onGoToField?: (path: PropertyKey[]) => void; exposeApi?: (api: EditorApi) => void }) {
  const draft = emptyDraft()
  draft.Variants = [{ ...emptyVariant(1), ID: "a", Weight: 3 }, { ...emptyVariant(2), ID: "b", LinkedTo: "a", Weight: 1 }, { ...emptyVariant(3), ID: "c" }]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const ref = useRef<EditorApi | null>(null)
  const [position, setPosition] = useState(DEFAULT_EDITOR_POSITION)
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>
    <EditorProvider form={form} exerciseId="ex" disabled={false} infrastructureBlocked={false} showNotes={false} page={{} as EditorPageData} onGoToField={onGoToField} apiRef={ref}>
      <Api expose={exposeApi} />
      <VariantMenu />
      <IssuesSlot />
      <Probe />
    </EditorProvider>
  </EditorPositionProvider>
}

function IssuesSlot() {
  const { dialog } = useEditor()
  return dialog === "issues" ? <IssuesDialog /> : null
}

function Api({ expose }: { expose?: (api: EditorApi) => void }) {
  const api = useEditor()
  expose?.(api)
  return null
}

describe("editor shell", () => {
  it("lists variants with kind and weight and marks the current one", () => {
    render(<Harness />)
    const trigger = screen.getByRole("button", { name: /ed\.shell\.variant\.trigger/ })
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const items = screen.getAllByRole("menuitemradio")
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute("aria-checked", "true")
    expect(items[0]).toHaveTextContent('ed.shell.variant.weight{"n":3}')
    // the linked variant follows its base
    expect(items[1]).toHaveTextContent(/basedOn.*base.*1/)
    expect(screen.getByRole("menuitem", { name: /ed\.shell\.variant\.add/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /ed\.shell\.variant\.all/ })).toBeInTheDocument()
  })

  it("choosing a variant selects it and opens its subtasks; «all variants» opens the table", () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: /ed\.shell\.variant\.trigger/ }), { key: "ArrowDown" })
    fireEvent.click(screen.getAllByRole("menuitemradio")[2])
    expect(screen.getByTestId("pos")).toHaveTextContent("tasks:2")
    fireEvent.keyDown(screen.getByRole("button", { name: /ed\.shell\.variant\.trigger/ }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: /ed\.shell\.variant\.all/ }))
    expect(screen.getByTestId("pos")).toHaveTextContent("variants:")
  })

  it("shows the issues list and «Перейти» closes it and goes to the field", () => {
    const onGoToField = vi.fn()
    let api: EditorApi | undefined
    render(<Harness onGoToField={onGoToField} exposeApi={(value) => { api = value }} />)
    act(() => api?.showIssues([{ path: ["Variants", 0, "Tasks", 0, "Name"], message: "m", variant: 0, text: "Subtask 1: name" }], "publish"))
    expect(screen.getByText("ed.shell.issues.titlePublish")).toBeInTheDocument()
    expect(screen.getByText("Subtask 1: name")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.shell.issues.go" }))
    expect(onGoToField).toHaveBeenCalledWith(["Variants", 0, "Tasks", 0, "Name"])
    expect(screen.queryByText("ed.shell.issues.titlePublish")).not.toBeInTheDocument()
  })

  it("the test mode offers to run anyway", () => {
    const run = vi.fn()
    let api: EditorApi | undefined
    render(<Harness exposeApi={(value) => { api = value }} />)
    act(() => api?.showIssues([{ path: ["Variants", 0, "Tasks", 0, "Name"], message: "m", variant: 0, text: "x" }], "test", run))
    fireEvent.click(screen.getByRole("button", { name: "ed.shell.issues.runAnyway" }))
    expect(run).toHaveBeenCalled()
  })

  it("goTo sets the tab and variant", () => {
    let api: EditorApi | undefined
    render(<Harness exposeApi={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "infrastructure", variant: 1 }))
    expect(screen.getByTestId("pos")).toHaveTextContent("infrastructure:1")
  })
})

describe("firstErrorPath", () => {
  it("finds the first leaf error in field order", () => {
    expect(firstErrorPath({ Variants: [{ Tasks: [{ Name: { message: "x", type: "custom" } }] }] } as never)).toEqual(["Variants", "0", "Tasks", "0", "Name"])
    expect(firstErrorPath({} as never)).toBeNull()
  })
})
