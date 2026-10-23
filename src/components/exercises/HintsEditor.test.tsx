import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { draftSchema, emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { HintsEditor, type DescriptionEditorConfig } from "./HintsEditor"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
// Lexical does not type in jsdom: a textarea stands in and emits a document.
vi.mock("@/components/editor/RichTextEditor", () => ({
  default: ({ ariaLabel, disabled, invalid, allowAlignment, maxContentHeight, variables, onInsertVariable, onChange }: { ariaLabel: string; disabled: boolean; invalid: boolean; allowAlignment?: boolean; maxContentHeight?: number; variables?: { name: string }[]; onInsertVariable?: unknown; onChange: (state: unknown) => void }) => (
    <textarea aria-label={ariaLabel} disabled={disabled} aria-invalid={invalid} data-alignment={String(allowAlignment)} data-max-height={maxContentHeight}
      data-variables={variables?.map((variable) => variable.name).join(",")} data-insert={String(Boolean(onInsertVariable))} onChange={(event) => onChange({
      root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: event.target.value }] }] },
    })} />
  ),
}))

function twoVariants(): DraftFormValues {
  const draft = emptyDraft()
  draft.Variants.push(emptyVariant(2))
  return draft
}

let current: UseFormReturn<DraftFormValues> | null = null
const keep = (methods: UseFormReturn<DraftFormValues>) => { current = methods }
function Harness({ disabled = false, editor }: { disabled?: boolean; editor?: DescriptionEditorConfig }) {
  const methods = useForm<DraftFormValues>({ defaultValues: twoVariants(), resolver: zodResolver(draftSchema) })
  useEffect(() => keep(methods), [methods])
  return <FormProvider {...methods}><HintsEditor variantIndex={0} taskIndex={0} disabled={disabled} editor={editor} /></FormProvider>
}
const hints = (variant: number) => current!.getValues().Variants[variant].Tasks[0].Hints

describe("HintsEditor", () => {
  it("adds, re-levels and removes hints in every variant; text stays per variant", () => {
    render(<Harness />)
    expect(screen.getByText("exercises.hints.empty")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    expect(screen.getAllByTestId("hint-row")).toHaveLength(2)
    expect(hints(1).map((hint) => hint.Level)).toEqual(["nudge", "nudge"])

    fireEvent.keyDown(screen.getAllByRole("button", { name: "exercises.hints.level" })[1], { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: "exercises.hints.level.steps" }))
    expect(hints(0)[1].Level).toBe("steps")
    expect(hints(1)[1].Level).toBe("steps")

    fireEvent.change(screen.getAllByLabelText("exercises.hints.textAria")[0], { target: { value: "Look at headers" } })
    expect(JSON.parse(hints(0)[0].Text).root.children[0].children[0].text).toBe("Look at headers")
    expect(hints(1)[0].Text).toBe("")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.down" })[0])
    expect(hints(1).map((hint) => hint.Level)).toEqual(["steps", "nudge"])
    expect(hints(0)[1].Text).toContain("Look at headers")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.remove" })[0])
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!)
    expect(hints(0)).toHaveLength(1)
    expect(hints(1)).toHaveLength(1)
  })

  it("marks the level as required; a new hint starts at the nudge level", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    const row = screen.getByTestId("hint-row")
    expect(row.querySelectorAll(".text-destructive[aria-hidden='true']")).toHaveLength(1)
    expect(screen.getByText("exercises.hints.levelShort")).toBeInTheDocument()
    expect(screen.queryByText("exercises.hints.text")).not.toBeInTheDocument()
    expect(hints(0)[0].Level).toBe("nudge")
  })

  it("passes the description editor's configuration to the hint text editor, unchanged", () => {
    const config = { maxContentHeight: 320, variables: [{ name: "ph_ip", description: "IP", example: "10.0.0.5" }], unavailableLabels: {}, onInsertVariable: vi.fn(), onEditVariable: vi.fn() }
    render(<Harness editor={config} />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    const editor = screen.getByLabelText("exercises.hints.textAria")
    expect(editor).toHaveAttribute("data-max-height", "320")
    expect(editor).toHaveAttribute("data-alignment", "undefined")
    expect(editor).toHaveAttribute("data-variables", "ph_ip")
    expect(editor).toHaveAttribute("data-insert", "true")
  })

  it("blocks publish validation on a hint without text and marks the card", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    let valid = true
    await act(async () => { valid = await current!.trigger("Variants") })
    expect(valid).toBe(false)
    expect(screen.getAllByText("exercises.hints.val.textRequired").length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText("exercises.hints.textAria")[0].getAttribute("aria-invalid")).toBe("true")
  })

  it("is read-only when disabled", () => {
    render(<Harness disabled />)
    expect(screen.queryByRole("button", { name: "exercises.hints.add" })).not.toBeInTheDocument()
  })
})

it("puts «+ Додати підказку» in the section header, right-aligned; none below the list", () => {
 render(<Harness />)
 const add = screen.getByRole("button", { name: "exercises.hints.add" })
 expect(add.closest(".subtask-section-title")).toBeInTheDocument()
 expect(add.closest(".subtask-section-action")).toBeInTheDocument()
 expect(screen.getAllByRole("button", { name: "exercises.hints.add" })).toHaveLength(1)
 // A compact empty state.
 expect(screen.getByText("exercises.hints.empty").closest("[data-empty-state]")).toHaveClass("min-h-0")
})

it("blocks the add at 10/10 and says why in a tooltip, keeping the button focusable", () => {
 render(<Harness />)
 const add = screen.getByRole("button", { name: "exercises.hints.add" })
 for (let i = 0; i < 10; i += 1) fireEvent.click(add)
 const blocked = screen.getByRole("button", { name: "exercises.hints.add" })
 expect(hints(0)).toHaveLength(10)
 expect(blocked).toHaveAttribute("aria-disabled", "true")
 expect(blocked).not.toBeDisabled()
 fireEvent.click(blocked)
 expect(hints(0)).toHaveLength(10)
 fireEvent.mouseEnter(blocked.parentElement!)
 expect(screen.getByRole("tooltip")).toHaveTextContent("exercises.hints.limitReached")
})

describe("hint rows", () => {
  function Loaded({ disabled = false }: { disabled?: boolean }) {
    const draft = twoVariants()
    draft.Variants.forEach((variant) => { variant.Tasks[0].Hints = [{ ID: "h1", Text: "Почніть зі сканування портів.", Level: "direction" }, { ID: "h2", Text: "", Level: "nudge" }] })
    const methods = useForm<DraftFormValues>({ defaultValues: draft })
    useEffect(() => keep(methods), [methods])
    return <FormProvider {...methods}><HintsEditor variantIndex={0} taskIndex={0} disabled={disabled} /></FormProvider>
  }

  it("shows stored hints as collapsed rows with their text and level, and opens one to edit", () => {
    render(<Loaded />)
    expect(screen.queryByLabelText("exercises.hints.textAria")).not.toBeInTheDocument()
    const toggles = screen.getAllByRole("button", { expanded: false })
    expect(toggles).toHaveLength(2)
    fireEvent.click(toggles[0])
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByLabelText("exercises.hints.textAria")).toHaveLength(1)
    expect(document.getElementById(toggles[0].getAttribute("aria-controls")!)).toContainElement(screen.getByLabelText("exercises.hints.textAria"))
    // Viewing writes nothing back.
    expect(current!.getValues().Variants[0].Tasks[0].Hints[0].Text).toBe("Почніть зі сканування портів.")
    expect(current!.formState.isDirty).toBe(false)
  })

  it("collapsed: chevron on the left, then number, preview and level; expanded: the level select in the header, no preview", () => {
    render(<Loaded />)
    const [row] = screen.getAllByTestId("hint-row")
    const toggle = within(row).getByRole("button", { name: "exercises.hints.rowLabel" })
    expect(toggle.firstElementChild).toHaveClass("hint-row-chevron")
    expect(toggle.children[1]).toHaveTextContent("1.")
    expect(toggle).toHaveTextContent("Почніть зі сканування портів.")
    expect(toggle).toHaveTextContent("exercises.hints.rowLevel")
    expect(within(row).queryByRole("button", { name: "exercises.hints.level" })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).not.toHaveTextContent("Почніть зі сканування портів.")
    const level = within(row).getByRole("button", { name: "exercises.hints.level" })
    const head = row.querySelector(".hint-row-head")!
    expect(head).toContainElement(level)
    // Keyboard order: chevron, level, then the actions.
    const order = [...head.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))
    expect(order.indexOf("exercises.hints.rowLabel")).toBeLessThan(order.indexOf("exercises.hints.level"))
    expect(order.indexOf("exercises.hints.level")).toBeLessThan(order.indexOf("exercises.hints.up"))
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("a click anywhere on the header toggles; its controls keep their own clicks", () => {
    render(<Loaded />)
    const [row] = screen.getAllByTestId("hint-row")
    const toggle = within(row).getByRole("button", { name: "exercises.hints.rowLabel" })
    fireEvent.click(row.querySelector(".hint-row-head")!)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(within(row).getByRole("button", { name: "exercises.hints.level" }))
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(within(row).getByRole("button", { name: "exercises.hints.down" }))
    expect(current!.getValues().Variants[0].Tasks[0].Hints[1].ID).toBe("h1")
  })

  it("reveals the row actions on hover or focus and keeps them on touch", () => {
    render(<Loaded />)
    const actions = screen.getAllByRole("button", { name: "exercises.hints.remove" })[0].closest(".hint-row-actions")
    expect(actions).toBeInTheDocument()
    expect(screen.getAllByTestId("hint-row")[0]).toHaveClass("group")
  })
})
