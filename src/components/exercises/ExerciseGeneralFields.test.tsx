import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { helpButton } from "@/test/help"
import { useForm } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/catalog", () => ({ listExerciseTags: vi.fn().mockResolvedValue([]) }))

import { emptyDraft, type DraftFormValues, type IdentityFormValues } from "@/lib/exerciseSchemas"
import { ExerciseGeneralFields } from "./ExerciseGeneralFields"

function Harness({ disabled, showNotes }: { disabled: boolean; showNotes?: boolean }) {
  const identityForm = useForm<IdentityFormValues>({ defaultValues: { Name: "Web 101", Description: "About", Tags: ["web"] } })
  const draftForm = useForm<DraftFormValues>({ defaultValues: { ...emptyDraft(), AdminNote: "Day one" } })
  return <ExerciseGeneralFields identityForm={identityForm} draftForm={draftForm} disabled={disabled} showNotes={showNotes} />
}

describe("ExerciseGeneralFields", () => {
  it("renders the general fields, help only where needed, and no flag-regeneration switch", () => {
    render(<Harness disabled={false} />)
    expect(screen.getByDisplayValue("Web 101")).toBeEnabled()
    expect(screen.getByLabelText("admin.ex.field.description").tagName).toBe("TEXTAREA")
    expect(screen.getByRole("textbox", { name: "admin.ex.create.notes" })).toHaveValue("Day one")
    // «?» only where the field needs explaining: the description and the internal notes.
    expect(helpButton("admin.ex.field.descriptionHelp")).toBeInTheDocument()
    expect(helpButton("admin.exDraft.adminNoteHelp")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "ui.help" })).toHaveLength(2)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
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
    const titles = screen.getAllByRole("heading", { level:2 }).map((heading) => heading.textContent)
    expect(titles).toEqual(["admin.ex.field.description", "admin.ex.field.tags", ...(showNotes ? ["admin.ex.create.notes"] : [])])
    expect(screen.queryByRole("heading", { name:"admin.ex.field.name" })).not.toBeInTheDocument()
  })

  it("retains edit field labels and associations without turning them into section headings", () => {
    render(<Harness disabled={false} />)
    expect(screen.queryByRole("heading", { level:2 })).not.toBeInTheDocument()
    expect(screen.getByLabelText("admin.ex.field.description")).toHaveAttribute("id", "exercise-description")
    expect(screen.getByLabelText("admin.ex.field.tags")).toHaveAttribute("id", "exercise-tags")
    expect(screen.getByLabelText("admin.ex.create.notes")).toHaveAttribute("id", "draft-admin-note")
    expect(helpButton("admin.ex.field.descriptionHelp")).toBeInTheDocument()
  })

  it("leaves out the internal notes for a reader without full access", () => {
    render(<Harness disabled showNotes={false} />)
    expect(screen.queryByRole("textbox", { name: "admin.ex.create.notes" })).not.toBeInTheDocument()
    expect(screen.queryByText("admin.ex.create.notes")).not.toBeInTheDocument()
  })
})
