import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { draftSchema, emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { HintsEditor } from "./HintsEditor"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
// Lexical does not type in jsdom: a textarea stands in and emits a document.
vi.mock("@/components/editor/RichTextEditor", () => ({
  default: ({ ariaLabel, disabled, invalid, allowAlignment, contentHeight, onChange }: { ariaLabel: string; disabled: boolean; invalid: boolean; allowAlignment: boolean; contentHeight?: number; onChange: (state: unknown) => void }) => (
    <textarea aria-label={ariaLabel} disabled={disabled} aria-invalid={invalid} data-alignment={String(allowAlignment)} data-content-height={contentHeight} onChange={(event) => onChange({
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
function Harness({ disabled = false }: { disabled?: boolean }) {
  const methods = useForm<DraftFormValues>({ defaultValues: twoVariants(), resolver: zodResolver(draftSchema) })
  useEffect(() => keep(methods), [methods])
  return <FormProvider {...methods}><HintsEditor variantIndex={0} taskIndex={0} disabled={disabled} /></FormProvider>
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

  it("offers no text alignment for hints", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    expect(screen.getByLabelText("exercises.hints.textAria").getAttribute("data-alignment")).toBe("false")
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

it("uses a fixed 144px hint text viewport", () => {
 render(<Harness />)
 fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
 expect(screen.getByLabelText("exercises.hints.textAria")).toHaveAttribute("data-content-height", "144")
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

  it("reveals the row actions on hover or focus and keeps them on touch", () => {
    render(<Loaded />)
    const actions = screen.getAllByRole("button", { name: "exercises.hints.remove" })[0].closest(".hint-row-actions")
    expect(actions).toBeInTheDocument()
    expect(screen.getAllByTestId("hint-row")[0]).toHaveClass("group")
  })
})
