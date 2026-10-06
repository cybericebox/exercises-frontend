import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { helpButton } from "@/test/help"
import { useForm } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/catalog", () => ({ listExerciseTags: vi.fn().mockResolvedValue([]) }))

import { emptyDraft, type DraftFormValues, type IdentityFormValues } from "@/lib/exerciseSchemas"
import { ExerciseGeneralFields } from "./ExerciseGeneralFields"

function Harness({ disabled }: { disabled: boolean }) {
  const identityForm = useForm<IdentityFormValues>({ defaultValues: { Name: "Web 101", Description: "About", Tags: ["web"] } })
  const draftForm = useForm<DraftFormValues>({ defaultValues: { ...emptyDraft(), AdminNote: "Day one" } })
  return <ExerciseGeneralFields identityForm={identityForm} draftForm={draftForm} disabled={disabled} />
}

describe("ExerciseGeneralFields", () => {
  it("renders the general fields with their help and without a flag-regeneration switch", () => {
    render(<Harness disabled={false} />)
    expect(screen.getByDisplayValue("Web 101")).toBeEnabled()
    expect(screen.getByLabelText("admin.ex.field.description").tagName).toBe("TEXTAREA")
    expect(screen.getByRole("textbox", { name: "admin.ex.create.notes" })).toHaveValue("Day one")
    expect(helpButton("admin.ex.help.name")).toBeInTheDocument()
    expect(helpButton("admin.ex.field.tagsHelp")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("disables every field in read-only mode", () => {
    render(<Harness disabled />)
    expect(screen.getByLabelText(/admin.ex.field.name/)).toBeDisabled()
    expect(screen.getByLabelText("admin.ex.field.tags")).toBeDisabled()
    expect(screen.getByLabelText("admin.ex.field.description")).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "admin.ex.create.notes" })).toBeDisabled()
  })
})
