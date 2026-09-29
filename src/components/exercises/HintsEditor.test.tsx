import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { HintsEditor } from "./HintsEditor"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

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
  it("adds, re-costs and removes hints in every variant; text stays per variant", () => {
    render(<Harness />)
    expect(screen.getByText("exercises.hints.empty")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.hints.add" }))
    expect(screen.getAllByTestId("hint-row")).toHaveLength(2)
    expect(hints(1)).toHaveLength(2)

    fireEvent.change(screen.getAllByLabelText("exercises.hints.cost")[1], { target: { value: "25" } })
    expect(hints(0)[1].Cost).toBe(25)
    expect(hints(1)[1].Cost).toBe(25)

    fireEvent.change(screen.getAllByLabelText("exercises.hints.text")[0], { target: { value: "Look at headers" } })
    expect(hints(0)[0].Text).toBe("Look at headers")
    expect(hints(1)[0].Text).toBe("")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.down" })[0])
    expect(hints(1).map((hint) => hint.Cost)).toEqual([25, 0])
    expect(hints(0)[1].Text).toBe("Look at headers")

    fireEvent.click(screen.getAllByRole("button", { name: "exercises.hints.remove" })[0])
    expect(hints(0)).toHaveLength(1)
    expect(hints(1)).toHaveLength(1)
  })

  it("is read-only when disabled", () => {
    render(<Harness disabled />)
    expect(screen.queryByRole("button", { name: "exercises.hints.add" })).not.toBeInTheDocument()
  })
})
