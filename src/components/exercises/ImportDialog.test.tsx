import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { Exercise } from "@/api/exercises/catalog"

const push = vi.fn()
vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/api/exercises/archive", () => ({ startImport: vi.fn(), downloadImportExample: vi.fn() }))
vi.mock("@/api/exercises/archiveJobs", () => ({ getImportJob: vi.fn(), listRunningImports: vi.fn().mockResolvedValue([]), JOB_POLL_MS: 5, isPassing: () => false }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { downloadImportExample, startImport } from "@/api/exercises/archive"
import { getImportJob, type ImportJobStatus } from "@/api/exercises/archiveJobs"
import { downloadBlob } from "@/lib/downloadBlob"
import { IMPORT_JOBS_KEY, resetImportJobsForTests, trackImportJob } from "@/lib/importJobs"
import { defaultImportTarget, ImportDialog } from "./ImportDialog"
import { OWNERSHIP } from "@/test/exerciseFixtures"

const mockImport = vi.mocked(startImport)
const mockExample = vi.mocked(downloadImportExample)
const mockSave = vi.mocked(downloadBlob)
const mockJob = vi.mocked(getImportJob)
const status = (patch: Partial<ImportJobStatus>): ImportJobStatus => ({
  state: "running", stage: "unpacking", imagesDone: 0, imagesTotal: 0, tasksDone: 0, tasksTotal: 0, bytesPushed: 0, bytesTotal: 0, exercises: [], ...patch,
})
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

const ev = (id: string, name: string) => ({ value: id, label: name, event: { ID: id, Name: name, Tag: id, CanWrite: true, InfrastructureAllowed: true } })
const catalog = { value: "", label: "exercises.owner.catalog", event: null }

describe("defaultImportTarget", () => {
  it("takes the requested event, else the catalog, else the only target", () => {
    expect(defaultImportTarget([catalog, ev("a", "A")], "a")).toBe("a")
    expect(defaultImportTarget([catalog, ev("a", "A")], "zzz")).toBe("")
    expect(defaultImportTarget([ev("a", "A")], null)).toBe("a")
    expect(defaultImportTarget([ev("a", "A"), ev("b", "B")], null)).toBeNull()
    expect(defaultImportTarget([], null)).toBeNull()
  })
})

describe("ImportDialog targets", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); resetImportJobsForTests() })

  it("imports a moderator's archive into their only event and says so", async () => {
    mockImport.mockResolvedValue({ kind: "done", exercises: [imported("e9", "Web 101")] })
    render(<ImportDialog onClose={vi.fn()} targets={[ev("ev1", "Winter CTF")]} />)
    expect(screen.getByText(/admin\.exImport\.targetEvent.*Winter CTF/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /admin\.exImport\.target\b/ })).not.toBeInTheDocument()
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(mockImport).toHaveBeenCalledWith(expect.any(File), "", undefined, expect.any(Function), expect.any(AbortSignal), "ev1"))
  })

  it("asks where to import when there are several targets and keeps the error beside the field", async () => {
    mockImport.mockResolvedValue({ kind: "done", exercises: [imported("e9", "Web 101")] })
    render(<ImportDialog onClose={vi.fn()} targets={[ev("ev1", "Winter CTF"), ev("ev2", "Spring Cup")]} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByText("admin.exImport.targetRequired")).toBeInTheDocument()
    expect(mockImport).not.toHaveBeenCalled()
    const field = screen.getByLabelText(/^admin\.exImport\.target/)
    expect(field).toHaveAttribute("aria-invalid", "true")
    fireEvent.keyDown(field, { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Spring Cup" }))
    expect(screen.queryByText("admin.exImport.targetRequired")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(mockImport).toHaveBeenCalledWith(expect.any(File), "", undefined, expect.any(Function), expect.any(AbortSignal), "ev2"))
  })

  it("starts an admin on the catalog, or on the event the filter names", async () => {
    mockImport.mockResolvedValue({ kind: "done", exercises: [imported("e9", "Web 101")] })
    const { unmount } = render(<ImportDialog onClose={vi.fn()} targets={[catalog, ev("ev1", "Winter CTF")]} />)
    expect(screen.getByText("admin.exImport.targetCatalog")).toBeInTheDocument()
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(mockImport).toHaveBeenLastCalledWith(expect.any(File), "", undefined, expect.any(Function), expect.any(AbortSignal), null))
    unmount()
    render(<ImportDialog onClose={vi.fn()} targets={[catalog, ev("ev1", "Winter CTF")]} initialTarget="ev1" />)
    expect(screen.getByText(/admin\.exImport\.targetEvent.*Winter CTF/)).toBeInTheDocument()
  })
})

describe("ImportDialog", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); resetImportJobsForTests() })

  it("says that import never overwrites and waits for a file", () => {
    render(<ImportDialog onClose={vi.fn()} />)
    expect(screen.getByText("admin.exImport.description")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exImport.submit" })).toBeDisabled()
  })

  it("keeps the how-to closed by default and shows four steps when opened", () => {
    const { container } = render(<ImportDialog onClose={vi.fn()} />)
    const details = container.ownerDocument.querySelector("details")!
    expect(details).not.toHaveAttribute("open")
    expect(details.querySelector("summary")).toHaveTextContent("admin.exImport.howTo")
    fireEvent.click(details.querySelector("summary")!)
    details.open = true
    expect(details.querySelectorAll("ol > li")).toHaveLength(4)
    for (const n of [1, 2, 3, 4]) expect(screen.getByText(new RegExp(`admin\\.exImport\\.step${n}`))).toBeInTheDocument()
  })

  it("labels the example button with visible text", () => {
    render(<ImportDialog onClose={vi.fn()} />)
    expect(screen.getByRole("button", { name: "admin.exImport.example" })).toHaveTextContent("admin.exImport.example")
  })

  it("opens the only imported exercise", async () => {
    mockImport.mockResolvedValue({ kind: "done", exercises: [imported("e9", "Web 101")] })
    const onClose = vi.fn()
    const onImported = vi.fn()
    render(<ImportDialog onClose={onClose} onImported={onImported} />)
    chooseFile()
    fireEvent.change(screen.getByLabelText(/^admin\.exImport\.password/), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/detail?id=e9"))
    expect(mockImport).toHaveBeenCalledWith(expect.any(File), "pw", undefined, expect.any(Function), expect.any(AbortSignal), null)
    expect(onImported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("lists several imported exercises with links", async () => {
    mockImport.mockResolvedValue({ kind: "done", exercises: [imported("e1", "One"), imported("e2", "Two")] })
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
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.example" }))
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(blob, "example-task.cybericebox.zip"))
  })

  it("takes a dropped .zip and rejects other files", () => {
    render(<ImportDialog onClose={vi.fn()} />)
    const zone = screen.getByText("admin.exImport.noFile").parentElement!
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } })
    expect(screen.getByText("admin.exImport.notZip")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exImport.submit" })).toBeDisabled()
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["zip"], "web.zip", { type: "application/zip" })] } })
    expect(screen.getByText("web.zip")).toBeInTheDocument()
    expect(screen.queryByText("admin.exImport.notZip")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exImport.submit" })).toBeEnabled()
  })

  describe("whole-dialog drop", () => {
    const files = { types: ["Files"] }
    const zip = () => new File(["zip"], "web.zip", { type: "application/zip" })
    const dialog = () => screen.getByRole("dialog")
    const overlay = () => screen.queryByText("admin.exImport.dropHere")

    it("shows the overlay over the dialog on a file drag and hides it on leave", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      expect(overlay()).not.toBeInTheDocument()
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      expect(overlay()).toBeInTheDocument()
      expect(dialog()).toContainElement(overlay()!)
      fireEvent.dragLeave(dialog(), { dataTransfer: files })
      expect(overlay()).not.toBeInTheDocument()
    })

    it("dims the content beneath the overlay while dragging and restores it after", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      const content = () => screen.getByTestId("import-content")
      expect(content()).not.toHaveAttribute("data-dimmed")
      expect(content()).not.toHaveAttribute("aria-hidden")
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      expect(content()).toHaveAttribute("data-dimmed")
      expect(content()).toHaveAttribute("aria-hidden", "true")
      expect(content()).toHaveClass("invisible")
      expect(content()).not.toContainElement(overlay())
      fireEvent.dragLeave(dialog(), { dataTransfer: files })
      expect(content()).not.toHaveAttribute("data-dimmed")
      expect(content()).not.toHaveClass("invisible")
    })

    it("takes a drop outside the field like a field drop", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      fireEvent.drop(screen.getByText("admin.exImport.description"), { dataTransfer: { ...files, files: [zip()] } })
      expect(overlay()).not.toBeInTheDocument()
      expect(screen.getByText("web.zip")).toBeInTheDocument()
      fireEvent.drop(screen.getByText("admin.exImport.title"), { dataTransfer: { ...files, files: [new File(["x"], "n.txt")] } })
      expect(screen.getByText("admin.exImport.notZip")).toBeInTheDocument()
    })

    it("does not take a field drop twice", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      const zone = screen.getByText("admin.exImport.noFile").parentElement!
      fireEvent.dragEnter(zone, { dataTransfer: files })
      fireEvent.drop(zone, { dataTransfer: { ...files, files: [zip()] } })
      expect(screen.getByText("web.zip")).toBeInTheDocument()
      expect(overlay()).not.toBeInTheDocument()
    })

    it("ignores text drags", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      fireEvent.dragEnter(dialog(), { dataTransfer: { types: ["text/plain"] } })
      expect(overlay()).not.toBeInTheDocument()
    })

    it("does not flicker while moving over children", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      const child = screen.getByText("admin.exImport.title")
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      fireEvent.dragEnter(child, { dataTransfer: files })
      fireEvent.dragLeave(dialog(), { dataTransfer: files })
      expect(overlay()).toBeInTheDocument()
      fireEvent.dragLeave(child, { dataTransfer: files })
      expect(overlay()).not.toBeInTheDocument()
    })

    it("hides on Escape", () => {
      render(<ImportDialog onClose={vi.fn()} />)
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      fireEvent.keyDown(document, { key: "Escape" })
      expect(overlay()).not.toBeInTheDocument()
    })

    it("shows no overlay while an import runs", async () => {
      mockImport.mockReturnValue(new Promise(() => undefined))
      render(<ImportDialog onClose={vi.fn()} />)
      chooseFile()
      fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
      await waitFor(() => expect(mockImport).toHaveBeenCalled())
      fireEvent.dragEnter(dialog(), { dataTransfer: files })
      expect(overlay()).not.toBeInTheDocument()
    })
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

  it.each([20978, 20979, 20980, 20981, 20982, 20983, 20984, 20985, 20986, 20987, 20988, 20989, 20990, 20991])(
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

  it("says archives can carry images", () => {
    render(<ImportDialog onClose={vi.fn()} />)
    expect(screen.getByText("admin.exImport.imagesHint")).toBeInTheDocument()
  })

  describe("a queued background import", () => {
    const submit = () => {
      chooseFile()
      fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    }

    it("closes by itself once the job is queued and the import goes on without the dialog", async () => {
      mockImport.mockResolvedValue({ kind: "job", jobID: "j1" })
      mockJob.mockResolvedValue(status({ stage: "images", imagesDone: 1, imagesTotal: 2 }))
      const onClose = vi.fn()
      const onImported = vi.fn()
      const { unmount } = render(<ImportDialog onClose={onClose} onImported={onImported} />)
      submit()
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(screen.queryByRole("button", { name: "admin.exImport.background" })).not.toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem(IMPORT_JOBS_KEY) ?? "[]")).toEqual(["j1"])
      expect(push).not.toHaveBeenCalled()
      expect(onImported).not.toHaveBeenCalled()
      unmount()
      await waitFor(() => expect(mockJob.mock.calls.length).toBeGreaterThanOrEqual(2))
    })

    it("stays open while the archive goes up, with the percent on the busy button", async () => {
      mockImport.mockImplementation(async (_file, _password, onProgress, onStage) => {
        onStage?.("uploading")
        onProgress?.(40)
        return new Promise(() => undefined)
      })
      const onClose = vi.fn()
      render(<ImportDialog onClose={onClose} />)
      fireEvent.change(screen.getByLabelText(/^admin\.exImport\.file/), {
        target: { files: [Object.defineProperty(new File(["zip"], "big.zip"), "size", { value: 600 * 1024 * 1024 })] },
      })
      fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
      expect(await screen.findByText('admin.exImport.uploadingPercent {"percent":40}')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it("opened from «Подробиці» of a failed import it shows the error and takes the job off the table", async () => {
      mockJob.mockResolvedValue(status({ state: "failed", stage: "failed", error: new ApiError(409, { Status: { Code: 22829, Context: { file: "images/web.tar", reason: "gzip" } } }, undefined, undefined, 22829) }))
      trackImportJob("j8", 0)
      await waitFor(() => expect(JSON.parse(localStorage.getItem(IMPORT_JOBS_KEY) ?? "[]")).toEqual(["j8"]))
      await waitFor(() => expect(mockJob).toHaveBeenCalled())
      render(<ImportDialog jobId="j8" onClose={vi.fn()} />)
      const message = await screen.findByRole("alert")
      expect(message).toHaveTextContent("images/web.tar")
      expect(screen.getByLabelText(/^admin\.exImport\.file/)).toHaveAttribute("aria-describedby", message.id)
      await waitFor(() => expect(localStorage.getItem(IMPORT_JOBS_KEY)).toBeNull())
    })
  })

  it("names the operation on the busy button while a small archive is sent", async () => {
    mockImport.mockReturnValue(new Promise(() => undefined))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    const button = (await screen.findByText("admin.exImport.importing")).closest("button")!
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })

  it("shows the progress of a large archive upload", async () => {
    mockImport.mockImplementation(async (_file, _password, onProgress, onStage) => {
      onStage?.("uploading")
      onProgress?.(40)
      return new Promise(() => undefined)
    })
    render(<ImportDialog onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^admin\.exImport\.file/), {
      target: { files: [Object.defineProperty(new File(["zip"], "big.zip"), "size", { value: 600 * 1024 * 1024 })] },
    })
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "40")
    expect(screen.getByText('admin.exImport.uploadingPercent {"percent":40}').closest("button")).toHaveAttribute("aria-busy", "true")
  })

  it("shows an unreadable image file at the file picker with its reason", async () => {
    mockImport.mockRejectedValue(new ApiError(409, { Status: { Code: 22829, Context: { file: "images/web.tar", reason: "gzip" } } }, undefined, undefined, 22829))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    const message = await screen.findByRole("alert")
    expect(message).toHaveTextContent("images/web.tar")
    expect(message).toHaveTextContent("admin.exImport.imageReason.gzip")
    expect(screen.getByLabelText(/^admin\.exImport\.file/)).toHaveAttribute("aria-describedby", message.id)
    expect(screen.queryByText("admin.exImport.passwordNeeded")).not.toBeInTheDocument()
  })

  it.each([72801, 72802, 70993, 70994, 70995, 30992])("a job or registry refusal (%i) is shown as a plain error, not a password hint", async (code) => {
    mockImport.mockRejectedValue(new ApiError(409, { Status: { Code: code } }, undefined, undefined, code))
    render(<ImportDialog onClose={vi.fn()} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.queryByText("admin.exImport.passwordNeeded")).not.toBeInTheDocument()
  })

  it("lets an upload be stopped after a danger confirmation, and keeps it going on «continue»", async () => {
    let signal: AbortSignal | undefined
    mockImport.mockImplementation((...args: unknown[]) => { signal = args[4] as AbortSignal; return new Promise(() => undefined) })
    const onClose = vi.fn()
    render(<ImportDialog onClose={onClose} />)
    chooseFile()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.submit" }))
    await waitFor(() => expect(mockImport).toHaveBeenCalled())
    const cancel = screen.getByRole("button", { name: "admin.exPage.dialog.cancel" })
    expect(cancel).toBeEnabled()
    fireEvent.click(cancel)
    expect(await screen.findByRole("dialog", { name: "admin.exImport.stopTitle" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.stopKeep" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "admin.exImport.stopTitle" })).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(signal?.aborted).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.dialog.cancel" }))
    fireEvent.click(await screen.findByRole("button", { name: "admin.exImport.stopConfirm" }))
    expect(onClose).toHaveBeenCalled()
    expect(signal?.aborted).toBe(true)
  })
})

describe("ImportDialog guide links", () => {
  it("links to the archive page and the whole guide, and closes the dialog on the way", () => {
    const onClose = vi.fn()
    render(<ImportDialog onClose={onClose} />)
    const archive = screen.getByRole("link", { name: "admin.exImport.guideArchive" })
    expect(archive).toHaveAttribute("href", expect.stringMatching(/^\/guide\/arkhiv\/?$/))
    expect(screen.getByRole("link", { name: "admin.exImport.guideAll" })).toHaveAttribute("href", expect.stringMatching(/^\/guide\/?$/))
    fireEvent.click(archive)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
