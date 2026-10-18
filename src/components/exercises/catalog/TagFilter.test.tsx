import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/catalog", () => ({ listExerciseTags: vi.fn().mockResolvedValue([]) }))

import { TagFilter } from "./TagFilter"

describe("TagFilter chips", () => {
  it("uses the catalog table tag look and keeps the remove button", () => {
    render(<TagFilter value={["crypto"]} onChange={vi.fn()} />)
    const chip = screen.getByText("crypto")
    expect(chip).toHaveClass("bg-border", "rounded-[4px]")
    expect(chip).not.toHaveClass("bg-secondary/40", "rounded-full")
    expect(screen.getByRole("button", { name: "admin.ex.filterTags.remove" })).toBeInTheDocument()
  })
})
