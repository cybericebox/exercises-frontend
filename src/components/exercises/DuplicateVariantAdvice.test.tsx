import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { useForm } from "react-hook-form"
import { emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"
import { DuplicateVariantAdvice } from "./DuplicateVariantAdvice"
function Harness() {
 const [draft] = useState(() => { const value = emptyDraft(); value.Variants.push(structuredClone(value.Variants[0])); return value })
 const form = useForm<DraftFormValues>({ defaultValues: draft })
 return <><DuplicateVariantAdvice control={form.control} /><button onClick={() => { document.querySelector('output')!.textContent = JSON.stringify(form.getValues()) }}>Inspect</button><output /></>
}
it("dismisses optional advice without changing intentional repeated variants or their flags", () => {
 render(<Harness />)
 expect(screen.getByText(/навмисно/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "Залишити як є" }))
 expect(screen.queryByText(/навмисно/)).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "Inspect" }))
 expect(JSON.parse(document.querySelector('output')!.textContent!).Variants).toHaveLength(2)
})
