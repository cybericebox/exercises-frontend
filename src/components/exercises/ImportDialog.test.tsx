import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { Exercise } from "@/api/exercises/catalog"

const push = vi.fn()
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/api/exercises/archive", () => ({ importExercises: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { importExercises } from "@/api/exercises/archive"
import { ImportDialog } from "./ImportDialog"

const mockImport = vi.mocked(importExercises)
const imported = (id: string, name: string): Exercise => ({
  ID: id, Name: name, Description: "", Tags: [], DraftVersionID: null, PublishedVersionID: null, ArchivedAt: null,
  HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
})

function chooseFile() {
  fireEvent.change(screen.getByLabelText("admin.exImport.file"), {
    target: { files: [new File(["zip"], "web.cybericebox.zip", { type: "application/zip" })] },
  })
}

describe("ImportDialog", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("says that import never overwrites and waits for a file", () => {
    render(<ImportDialog onClose={vi.fn()} />)
    expect(screen.getByText("admin.exImport.description")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exImport.submit" })).toBeDisabled()
  })

  it("opens the only imported exercise", async () => {
    mockImport.mockResolvedValue([imported("e9", "Web 101")])
    const onClose = vi.fn()
    const onImported = vi.fn()
    render(<ImportDialog onClose={onClose} onImported={onImported} />)
    chooseFile()
    fireEvent.change(screen.getByLabelText("admin.exImport.password"), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/detail?id=e9"))
    expect(mockImport).toHaveBeenCalledWith(expect.any(File), "pw")
    expect(onImported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("lists several imported exercises with links", async () => {
    mockImport.mockResolvedValue([imported("e1", "One"), imported("e2", "Two")])
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("link", { name: "Two" })).toHaveAttribute("href", "/detail?id=e2")
    expect(push).not.toHaveBeenCalled()
  })

  it("highlights the password when the archive cannot be opened", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20000, Message: "zip: not a valid zip file" } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exImport.passwordNeeded")
    expect(screen.getByLabelText("admin.exImport.password")).toHaveAttribute("aria-invalid", "true")
  })
})
