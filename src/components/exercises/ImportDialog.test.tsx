import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { Exercise } from "@/api/exercises/catalog"

const push = vi.fn()
vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/api/exercises/archive", () => ({ importExercises: vi.fn(), downloadImportExample: vi.fn() }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { downloadImportExample, importExercises } from "@/api/exercises/archive"
import { downloadBlob } from "@/lib/downloadBlob"
import { ImportDialog } from "./ImportDialog"
import { OWNERSHIP } from "@/test/exerciseFixtures"

const mockImport = vi.mocked(importExercises)
const mockExample = vi.mocked(downloadImportExample)
const mockSave = vi.mocked(downloadBlob)
const imported = (id: string, name: string): Exercise => ({
  ...OWNERSHIP,
  ID: id, Name: name, Description: "", Tags: [], DraftVersionID: null, PublishedVersionID: null, ArchivedAt: null,
  HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
})

function chooseFile() {
  fireEvent.change(screen.getByLabelText(/^admin\.exImport\.file/), {
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
    fireEvent.change(screen.getByLabelText(/^admin\.exImport\.password/), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/detail?id=e9"))
    expect(mockImport).toHaveBeenCalledWith(expect.any(File), "pw", undefined)
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

  it("keeps ambiguous archive failures global and offers conditional password guidance", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20000, Message: "zip: not a valid zip file" } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.ex.err.genericWith")
    expect(screen.getByText("admin.exImport.passwordNeeded")).toBeInTheDocument()
    expect(screen.getByLabelText(/^admin\.exImport\.password/)).not.toHaveAttribute("aria-invalid", "true")
  })

  it("places a rejected archive size at the file picker instead of the password or footer", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 21002 } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    const message = await screen.findByRole("alert")
    const file = screen.getByLabelText(/^admin\.exImport\.file/)
    expect(file).toHaveAttribute("aria-invalid", "true")
    expect(file).toHaveAttribute("aria-describedby", message.id)
    expect(file.parentElement?.parentElement).toContainElement(message)
    expect(screen.getByLabelText(/^admin\.exImport\.password/)).not.toHaveAttribute("aria-invalid", "true")
  })

  it("shows the example button and downloads on click", async () => {
    const blob = new Blob(["zip"])
    mockExample.mockResolvedValue({ blob, filename: "example-task.cybericebox.zip" })
    render(<ImportDialog onClose={vi.fn()} />)
    expect(screen.getByText("admin.exImport.exampleHint")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.example" }))
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(blob, "example-task.cybericebox.zip"))
  })

  it("keeps the button busy only while loading and the file form usable", async () => {
    let resolve: (value: { blob: Blob; filename: string }) => void = () => undefined
    mockExample.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<ImportDialog onClose={vi.fn()} />)
    const button = screen.getByRole("button", { name: "admin.exImport.example" })
    fireEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"))
    chooseFile()
    expect(screen.getByRole("button", { name: "admin.exImport.submit" })).toBeEnabled()
    expect(screen.getByLabelText(/^admin\.exImport\.password/)).toBeEnabled()
    resolve({ blob: new Blob(["zip"]), filename: "e.zip" })
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"))
  })

  it("shows the localized error on failure without marking the password", async () => {
    mockExample.mockRejectedValue(new Error("network"))
    render(<ImportDialog onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.example" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("admin.exImport.exampleError")
    expect(screen.queryByText("admin.exImport.passwordNeeded")).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^admin\.exImport\.password/)).not.toHaveAttribute("aria-invalid", "true")
  })

  it.each([20978, 20979, 20980, 20981, 20982, 20983, 20984, 20985, 20986, 20987, 20988, 20989, 20990])(
    "archive-content errors are not password hints (%i)", async (code) => {
      mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: code } }))
      render(<ImportDialog onClose={vi.fn()} />)
      chooseFile()
      fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
      const message = await screen.findByRole("alert")
      expect(screen.getByLabelText(/^admin\.exImport\.file/)).toHaveAttribute("aria-describedby", message.id)
      expect(screen.queryByText("admin.exImport.passwordNeeded")).not.toBeInTheDocument()
    })
  it("shows the file named in the error context inline", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20982, Context: { file: "web/a.png" } } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("web/a.png")
  })

  it("shows the placeholder key and task of a 20984", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20984, Context: { key: "ip", task: "Login" } } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("admin.exImport.errKeyInTask")
    expect(alert).toHaveTextContent("Login")
  })

  // A published version refused by the publish gate (presets, elevations, content): the backend names the version
  // (and the device) in "field"; it belongs to the archive, not to the password.
  it("shows a publish-gate refusal with its archive path at the file picker", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20966, Context: {
      field: "versions[1]", devices: "web: 32 blocks (500m / 2147483648)", variant: "",
    } } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    const message = await screen.findByRole("alert")
    expect(message).toHaveTextContent("versions[1]")
    expect(message).toHaveTextContent("web: 32 blocks")
    expect(screen.getByLabelText(/^admin\.exImport\.file/)).toHaveAttribute("aria-describedby", message.id)
    expect(screen.queryByText("admin.exImport.passwordNeeded")).not.toBeInTheDocument()
  })

  it("shows the plain message without a context", async () => {
    mockImport.mockRejectedValue(new ApiError(400, { Status: { Code: 20982 } }))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("alert")).not.toHaveTextContent("admin.exImport.errDetail")
  })

  it("uses the coded message when the example download is refused", async () => {
    mockExample.mockRejectedValue(new ApiError(403, { Status: { Code: 20000, Message: "no" } }))
    render(<ImportDialog onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.example" }))
    expect(await screen.findByRole("alert")).not.toHaveTextContent("admin.exImport.exampleError")
  })
})
