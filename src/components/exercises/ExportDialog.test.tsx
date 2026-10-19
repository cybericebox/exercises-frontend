import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/archive", () => ({ createExport: vi.fn(), downloadExport: vi.fn() }))
vi.mock("@/api/exercises/chunkedDownload", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/exercises/chunkedDownload")>()), forgetDownload: vi.fn() }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { createExport, downloadExport } from "@/api/exercises/archive"
import { ApiError } from "@/api/client"
import { forgetDownload } from "@/api/exercises/chunkedDownload"
import { downloadBlob } from "@/lib/downloadBlob"
import { ExportDialog } from "./ExportDialog"

const mockCreate = vi.mocked(createExport)
const mockDownload = vi.mocked(downloadExport)
let nextFile = 0

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nextFile = 0
    mockCreate.mockImplementation(async () => ({ FileID: `file-${++nextFile}`, Name: "x.zip" }))
  })

  it("exports without secrets by default and downloads the archive", async () => {
    const blob = new Blob(["zip"])
    mockDownload.mockResolvedValue({ blob, filename: "web.cybericebox.zip" })
    const onClose = vi.fn()
    const onExported = vi.fn()
    render(<ExportDialog exerciseIds={["e1"]} onClose={onClose} onExported={onExported} />)
    expect(screen.queryByLabelText(/^admin\.exExport\.password/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, "web.cybericebox.zip"))
    expect(mockCreate).toHaveBeenCalledWith({ IDs: ["e1"], IncludeSecrets: false, Password: "" }, expect.any(Function), expect.any(AbortSignal))
    expect(onExported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("one reveal toggle shows and hides both the password and its confirmation", () => {
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.secrets" }))
    const password = screen.getByLabelText(/^admin\.exExport\.password/)
    const confirm = screen.getByLabelText(/^admin\.exExport\.confirm/)
    fireEvent.click(screen.getAllByRole("button", { name: "admin.password.show" })[0])
    expect(password).toHaveAttribute("type", "text")
    expect(confirm).toHaveAttribute("type", "text")
    expect(screen.getAllByRole("button", { name: "admin.password.hide" })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole("button", { name: "admin.password.hide" })[1])
    expect(password).toHaveAttribute("type", "password")
    expect(confirm).toHaveAttribute("type", "password")
  })

  it("requires a confirmed password when secrets are included", async () => {
    mockDownload.mockResolvedValue({ blob: new Blob(["zip"]), filename: "x.zip" })
    render(<ExportDialog exerciseIds={["e1", "e2"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.secrets" }))
    expect(screen.getByText("admin.exExport.warning")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exExport.passwordRequired")
    fireEvent.change(screen.getByLabelText(/^admin\.exExport\.password/), { target: { value: "s3cret" } })
    fireEvent.change(screen.getByLabelText(/^admin\.exExport\.confirm/), { target: { value: "other" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exExport.mismatch")
    expect(mockCreate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/^admin\.exExport\.confirm/), { target: { value: "s3cret" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ IDs: ["e1", "e2"], IncludeSecrets: true, Password: "s3cret" }, expect.any(Function), expect.any(AbortSignal)))
  })

  it("keeps the dialog open with the error when the export fails", async () => {
    mockDownload.mockRejectedValue(new Error("offline"))
    const onClose = vi.fn()
    render(<ExportDialog exerciseIds={["e1"]} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.ex.err.generic")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("names the export on its busy button and shows the download percent there", async () => {
    let finish!: (value: { blob: Blob; filename: string }) => void
    let progress: ((percent: number) => void) | undefined
    mockDownload.mockImplementation((_stored, _count, onProgress) => {
      progress = onProgress
      return new Promise((resolve) => { finish = resolve })
    })
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect(await screen.findByRole("button", { name: /admin\.exExport\.exporting/ })).toHaveAttribute("aria-busy", "true")
    act(() => progress?.(42))
    expect(await screen.findByRole("button", { name: /admin\.exExport\.progress/ })).toHaveAttribute("aria-busy", "true")
    finish({ blob: new Blob(["zip"]), filename: "x.zip" })
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
  })

  it("retries a failed download on the same stored archive", async () => {
    mockDownload.mockRejectedValueOnce(new Error("offline"))
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), filename: "x.zip" })
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockDownload.mock.calls.map((call) => call[0].FileID)).toEqual(["file-1", "file-1"])
  })

  it("drops the kept archive when the options change", async () => {
    mockDownload.mockRejectedValueOnce(new Error("offline"))
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), filename: "x.zip" })
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.secrets" }))
    fireEvent.change(screen.getByLabelText(/^admin\.exExport\.password/), { target: { value: "pw" } })
    fireEvent.change(screen.getByLabelText(/^admin\.exExport\.confirm/), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(forgetDownload).toHaveBeenCalledWith("file-1")
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it("closing the dialog clears the kept download", async () => {
    mockDownload.mockRejectedValue(new Error("offline"))
    const { unmount } = render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await screen.findByRole("alert")
    expect(forgetDownload).not.toHaveBeenCalled()
    unmount()
    expect(forgetDownload).toHaveBeenCalledWith("file-1")
  })

  it("starts a fresh export when the stored archive has expired", async () => {
    mockDownload.mockRejectedValueOnce(new ApiError(404, null))
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), filename: "x.zip" })
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await screen.findByRole("alert")
    expect(forgetDownload).toHaveBeenCalledWith("file-1")
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockDownload.mock.calls.map((call) => call[0].FileID)).toEqual(["file-1", "file-2"])
  })

  it("has the images switch off by default and says the archive becomes large", () => {
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    expect(screen.getByRole("switch", { name: "admin.exExport.images" })).not.toBeChecked()
    expect(screen.getByText("admin.exExport.imagesHint")).toBeInTheDocument()
  })

  it("asks for the images and shows the crest loader while the server prepares the archive", async () => {
    let finish: (value: { FileID: string; Name: string }) => void = () => undefined
    mockCreate.mockImplementation((_input, onStage) => {
      onStage?.("working")
      return new Promise((resolve) => { finish = resolve })
    })
    mockDownload.mockResolvedValue({ blob: new Blob(["zip"]), filename: "img.zip" })
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.images" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    expect((await screen.findAllByText("admin.exExport.working")).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
    expect(mockCreate).toHaveBeenCalledWith({ IDs: ["e1"], IncludeSecrets: false, Password: "", IncludeImages: true }, expect.any(Function), expect.any(AbortSignal))
    finish({ FileID: "f9", Name: "img.zip" })
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
  })

  it("lets the user leave while the images are prepared and stops waiting", async () => {
    let signal: AbortSignal | undefined
    mockCreate.mockImplementation((_input, onStage, abort) => {
      signal = abort
      onStage?.("working")
      return new Promise(() => undefined)
    })
    const onClose = vi.fn()
    render(<ExportDialog exerciseIds={["e1"]} onClose={onClose} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.images" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await screen.findAllByText("admin.exExport.working")
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.dialog.cancel" }))
    expect(signal?.aborted).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it("explains an export that cannot read an image from the registry", async () => {
    mockCreate.mockRejectedValue(new ApiError(409, { Status: { Code: 72830, Context: { device: "web", reason: "unreachable" } } }, undefined, undefined, 72830))
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.images" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    const alert = await screen.findByRole("alert")
    // The message carries the device and the translated reason (the test translator prints keys only).
    expect(alert).toHaveTextContent("admin.exImport.errDetail")
  })

  it("leaves the preparing stage once the archive is ready: the download cannot be cancelled", async () => {
    mockCreate.mockImplementation(async (_input, onStage) => {
      onStage?.("working")
      return { FileID: "f1", Name: "x.zip" }
    })
    mockDownload.mockReturnValue(new Promise(() => undefined))
    render(<ExportDialog exerciseIds={["e1"]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("switch", { name: "admin.exExport.images" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exExport.submit" }))
    await waitFor(() => expect(mockDownload).toHaveBeenCalled())
    expect(screen.queryAllByText("admin.exExport.working")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "admin.exPage.dialog.cancel" })).toBeDisabled()
  })
})
