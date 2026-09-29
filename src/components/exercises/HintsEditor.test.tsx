import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { HintsEditor } from "./HintsEditor"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
// Lexical does not type in jsdom: a textarea stands in and emits a document.
vi.mock("@/components/editor/RichTextEditor", () => ({
  default: ({ ariaLabel, disabled, onChange }: { ariaLabel: string; disabled: boolean; onChange: (state: unknown) => void }) => (
    <textarea aria-label={ariaLabel} disabled={disabled} onChange={(event) => onChange({
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
  const methods = useForm<DraftFormValues>({ defaultValues: twoVariants() })
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

    fireEvent.change(screen.getAllByLabelText("exercises.hints.text")[0], { target: { value: "Look at headers" } })
    expect(JSON.parse(hints(0)[0].Text).root.children[0].children[0].text).toBe("Look at headers")
    expect(hints(1)[0].Text).toBe("")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.down" })[0])
    expect(hints(1).map((hint) => hint.Level)).toEqual(["steps", "nudge"])
    expect(hints(0)[1].Text).toContain("Look at headers")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.remove" })[0])
    expect(hints(0)).toHaveLength(1)
    expect(hints(1)).toHaveLength(1)
  })

  it("is read-only when disabled", () => {
    render(<Harness disabled />)
    expect(screen.queryByRole("button", { name: "exercises.hints.add" })).not.toBeInTheDocument()
  })
})
