import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/archive", () => ({ exportExercises: vi.fn() }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { exportExercises } from "@/api/exercises/archive"
import { downloadBlob } from "@/lib/downloadBlob"
import { ExportDialog } from "./ExportDialog"

const mockExport = vi.mocked(exportExercises)

describe("ExportDialog", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("exports without secrets by default and downloads the archive", async () => {
    const blob = new Blob(["zip"])
    mockExport.mockResolvedValue({ blob, filename: "web.cybericebox.zip" })
    const onClose = vi.fn()
    const onExported = vi.fn()
    render(<ExportDialog exerciseIds={["e1"]} onClose={onClose} onExported={onExported} />)
    expect(screen.queryByLabelText("admin.exExport.password")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, "web.cybericebox.zip"))
    expect(mockExport).toHaveBeenCalledWith({ IDs: ["e1"], IncludeSecrets: false, Password: "" })
    expect(onExported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("requires a confirmed password when secrets are included", async () => {
    mockExport.mockResolvedValue({ blob: new Blob(["zip"]), filename: "x.zip" })
    render(<ExportDialog exerciseIds={["e1", "e2"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.secrets" }))
    expect(screen.getByText("admin.exExport.warning")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exExport.passwordRequired")
    fireEvent.change(screen.getByLabelText("admin.exExport.password"), { target: { value: "s3cret" } })
    fireEvent.change(screen.getByLabelText("admin.exExport.confirm"), { target: { value: "other" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exExport.mismatch")
    expect(mockExport).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("admin.exExport.confirm"), { target: { value: "s3cret" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith({ IDs: ["e1", "e2"], IncludeSecrets: true, Password: "s3cret" }))
  })

  it("keeps the dialog open with the error when the export fails", async () => {
    mockExport.mockRejectedValue(new Error("offline"))
    const onClose = vi.fn()
    render(<ExportDialog exerciseIds={["e1"]} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.ex.err.generic")
    expect(onClose).not.toHaveBeenCalled()
  })
})
