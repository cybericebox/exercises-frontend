import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { FormProvider, useForm } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/catalog", () => ({ listExerciseTags: vi.fn().mockResolvedValue([]) }))

import { emptyDraft, type DraftFormValues, type IdentityFormValues } from "@/lib/exerciseSchemas"
import { ExerciseGeneralFields } from "./ExerciseGeneralFields"

function Harness({ disabled, showNotes, nameError }: { disabled: boolean; showNotes?: boolean; nameError?: string }) {
  const identityForm = useForm<IdentityFormValues>({ defaultValues: { Name: "Web 101", Description: "About", Tags: ["web"] } })
  const draftForm = useForm<DraftFormValues>({ defaultValues: { ...emptyDraft(), AdminNote: "Day one" } })
  if (nameError && !identityForm.formState.errors.Name) identityForm.setError("Name", { type: "custom", message: nameError })
  return <FormProvider {...draftForm}><ExerciseGeneralFields identityForm={identityForm} draftForm={draftForm} disabled={disabled} showNotes={showNotes} /></FormProvider>
}

describe("ExerciseGeneralFields", () => {
  it("renders the general fields, every one with its own «?»", () => {
    render(<Harness disabled={false} />)
    expect(screen.getByDisplayValue("Web 101")).toBeEnabled()
    expect(screen.getByLabelText("ed.a.general.description.label").tagName).toBe("TEXTAREA")
    expect(screen.getByRole("textbox", { name: "ed.a.general.note.label" })).toHaveValue("Day one")
    expect(screen.getAllByRole("button", { name: "ui.help" })).toHaveLength(4)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("attaches the required asterisk to the name label", () => {
    render(<Harness disabled={false} />)
    const label = document.querySelector('label[for="exercise-name"]')
    expect(label?.textContent).toContain("label*")
  })

  it("shows a name error beside its field and ties it with aria", () => {
    render(<Harness disabled={false} nameError="Too short" />)
    const name = screen.getByDisplayValue("Web 101")
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveAttribute("aria-describedby", "fe-Name-error")
    expect(screen.getByRole("alert")).toHaveTextContent("Too short")
  })

  it("reads natural selectable values without a duplicate Name or disabled form", () => {
    render(<Harness disabled />)
    expect(screen.queryByText("Web 101")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByText("About")).toBeInTheDocument()
    expect(screen.getByText("Day one")).toBeInTheDocument()
    expect(screen.getByText("web")).toBeInTheDocument()
  })

  it("shows every read field in the same outlined box as its edit field, never as loose text", () => {
    render(<Harness disabled />)
    for (const text of ["About", "Day one", "web"]) expect(screen.getByText(text).closest("[data-read-field]")).toHaveClass("general-read-box")
    expect(document.querySelectorAll("[data-read-field]")).toHaveLength(3)
  })

  it.each([true, false])("exposes read sections to heading navigation (private notes=%s)", (showNotes) => {
    render(<Harness disabled showNotes={showNotes} />)
    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(["ed.a.general.description.label", "ed.a.general.tags.label", ...(showNotes ? ["ed.a.general.note.label"] : [])])
    expect(screen.queryByRole("heading", { name: "ed.a.general.name.label" })).not.toBeInTheDocument()
  })

  it("keeps the ids other code focuses and the label associations", () => {
    render(<Harness disabled={false} />)
    expect(screen.getByLabelText(/ed\.a\.general\.name\.label/)).toHaveAttribute("id", "exercise-name")
    expect(screen.getByLabelText("ed.a.general.description.label")).toHaveAttribute("id", "exercise-description")
    expect(screen.getByLabelText("ed.a.general.tags.label")).toHaveAttribute("id", "exercise-tags")
    expect(screen.getByLabelText("ed.a.general.note.label")).toHaveAttribute("id", "draft-admin-note")
  })

  it("leaves out the internal notes for a reader without full access", () => {
    render(<Harness disabled showNotes={false} />)
    expect(screen.queryByRole("textbox", { name: "ed.a.general.note.label" })).not.toBeInTheDocument()
    expect(screen.queryByText("ed.a.general.note.label")).not.toBeInTheDocument()
  })
})
