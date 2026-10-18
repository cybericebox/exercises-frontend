import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form"

const h = vi.hoisted(() => ({ uploadImage: vi.fn(), readImageArchive: vi.fn(), access: { access: null as null | { IsAdmin: boolean }, loading: false } }))

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/i18n/tRich", () => import("@/test/tRichMock"))
vi.mock("@/api/exercises/images", async (original) => ({
  ...(await original<typeof import("@/api/exercises/images")>()),
  uploadImage: (...args: unknown[]) => h.uploadImage(...args),
}))
vi.mock("@/lib/imageArchive", async (original) => ({
  ...(await original<typeof import("@/lib/imageArchive")>()),
  readImageArchive: (...args: unknown[]) => h.readImageArchive(...args),
}))
vi.mock("@/api/exercises/imageCheck", async (original) => ({
  ...(await original<typeof import("@/api/exercises/imageCheck")>()),
  checkImages: async () => [],
}))
vi.mock("@/components/shell/AccessContext", () => ({ useExerciseAccess: () => h.access }))

import { ApiError } from "@/api/client"
import { ImagePushError } from "@/api/exercises/images"
import { ImageArchiveError } from "@/lib/imageArchive"
import { emptyDevice, emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"
import { ExerciseIdProvider } from "./ExerciseIdContext"
import { DeviceImageField } from "./ImageUpload"
import { ImageUploadsProvider } from "./ImageUploads"
import { helpButton } from "@/test/help"

const REF = `platform:web@sha256:${"ab12cd34ef56".repeat(5)}abcd`

function ImageValue() {
  const { control } = useFormContext<DraftFormValues>()
  return <output data-testid="image">{useWatch({ control, name: "Variants.0.Topology.Devices.0.Image" })}</output>
}

function Harness({ image = "", exerciseId = "ex-1" as string | null, disabled = false }: { image?: string; exerciseId?: string | null; disabled?: boolean }) {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.Name = "web"
  device.Image = image
  draft.Variants[0].Topology.Devices = [device]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <ExerciseIdProvider value={exerciseId}><FormProvider {...form}>
    <DeviceImageField variantIndex={0} deviceIndex={0} disabled={disabled} />
    <button type="button" onClick={() => form.setValue("Variants.0.Topology.Devices.0.Image", "nginx:2")}>type a reference</button>
    <ImageValue />
  </FormProvider></ExerciseIdProvider>
}

/** A task that has no name yet: the id appears when «create» is pressed (the autosave creating the task). */
function NoNameHarness({ flush, onNeedName }: { flush: () => Promise<boolean>; onNeedName: () => void }) {
  const draft = emptyDraft()
  draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: "web" }]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const [id, setId] = useState<string | null>(null)
  return <ExerciseIdProvider value={id}><FormProvider {...form}><ImageUploadsProvider canWrite flush={flush} onNeedName={onNeedName}>
    <button type="button" onClick={() => setId("ex-9")}>create</button>
    <DeviceImageField variantIndex={0} deviceIndex={0} disabled={false} />
    <ImageValue />
  </ImageUploadsProvider></FormProvider></ExerciseIdProvider>
}

/** Two devices; the field shows the second one and follows it by its field id when the first one is removed. */
function TwoDevices() {
  const draft = emptyDraft()
  draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: "first", Image: "a:1" }, { ...emptyDevice(), Name: "second", Image: "b:1" }]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <ExerciseIdProvider value="ex-1"><FormProvider {...form}><TwoDevicesBody /></FormProvider></ExerciseIdProvider>
}

function TwoDevicesBody() {
  const { control } = useFormContext<DraftFormValues>()
  const { fields, remove } = useFieldArray({ control, name: "Variants.0.Topology.Devices" })
  const devices = useWatch({ control, name: "Variants.0.Topology.Devices" })
  const index = fields.findIndex((field) => field.Name === "second")
  return <>
    <button type="button" onClick={() => remove(0)}>remove first</button>
    <DeviceImageField key={fields[index].id} variantIndex={0} deviceIndex={index} disabled={false} />
    <output data-testid="devices">{JSON.stringify(devices.map((device) => ({ Name: device.Name, Image: device.Image })))}</output>
  </>
}

/** The editor: the uploads live above the card, which the author can collapse (unmount) and open again. */
function Collapsible() {
  const draft = emptyDraft()
  draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: "web", Image: "" }]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const [open, setOpen] = useState(true)
  return <ExerciseIdProvider value="ex-1"><FormProvider {...form}><ImageUploadsProvider canWrite>
    <button type="button" onClick={() => setOpen((value) => !value)}>toggle</button>
    {open && <DeviceImageField variantIndex={0} deviceIndex={0} disabled={false} />}
    <ImageValue />
  </ImageUploadsProvider></FormProvider></ExerciseIdProvider>
}

const archive = () => new File([new Uint8Array([1, 2, 3])], "image.tar", { type: "application/x-tar" })

function drop(file: File) {
  fireEvent.drop(screen.getByTestId("image-drop-zone"), { dataTransfer: { files: [file], types: ["Files"] } })
}

beforeEach(() => {
  h.uploadImage.mockReset()
  h.readImageArchive.mockReset().mockResolvedValue({ config: {}, layers: [{}, {}, {}] })
  h.access.access = null
})
afterEach(() => { vi.useRealTimers() })

describe("DeviceImageField", () => {
  it("is one field: the reference input with an upload icon button inside, and one hint line", () => {
    render(<Harness />)
    const input = screen.getByRole("textbox")
    const upload = screen.getByRole("button", { name: "exercises.image.uploadTip" })
    expect(input.parentElement).toContainElement(upload) // one bordered control, not a second box below the input
    expect(upload).not.toHaveTextContent(/\S/) // an icon, no text label
    expect(screen.getByText("exercises.image.hint")).toBeInTheDocument()
    expect(screen.getAllByTestId("image-drop-zone")).toHaveLength(1)
    // The limit and the command live in the label's help.
    expect(helpButton(/^admin\.exTopo\.imageHelp /)).toBeInTheDocument()
    expect(screen.queryByText("exercises.image.saveFirst")).not.toBeInTheDocument()
  })

  it("the upload icon button opens the file picker; a picked archive is uploaded", async () => {
    h.uploadImage.mockResolvedValue(REF)
    render(<Harness />)
    const input = screen.getByTestId("image-file-input") as HTMLInputElement
    const click = vi.spyOn(input, "click")
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.uploadTip" }))
    expect(click).toHaveBeenCalled()
    expect(input.accept).toContain(".tar")
    expect(input.accept).toContain(".gz")
    fireEvent.change(input, { target: { files: [archive()] } })
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent(REF))
  })

  it("replaces the field content with the drop text while an archive is dragged over it", () => {
    render(<Harness />)
    const zone = screen.getByTestId("image-drop-zone")
    fireEvent.dragOver(zone, { dataTransfer: { files: [], types: ["Files"] } })
    expect(screen.getByText("exercises.image.dropHere")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    fireEvent.dragLeave(zone)
    expect(screen.queryByText("exercises.image.dropHere")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("a dropped archive is uploaded and becomes the device image", async () => {
    h.uploadImage.mockResolvedValue(REF)
    render(<Harness image="nginx:1" />)
    const file = archive()
    drop(file)
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent(REF))
    const [exerciseId, sent, name, , signal] = h.uploadImage.mock.calls[0] as [string, File, string, unknown, AbortSignal]
    expect(exerciseId).toBe("ex-1")
    expect(sent).toBe(file)
    expect(name).toBe("web")
    expect(signal).toBeInstanceOf(AbortSignal)
    // A platform image shows as a read-only chip: its name and a short digest.
    expect(screen.getByText("web")).toBeInTheDocument()
    expect(screen.getByText("sha256:ab12cd34ef56")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "exercises.image.replaceTip" })).toBeInTheDocument()
  })

  it("shows progress, then the push stage, with no generic spinner", async () => {
    let report: (percent: number, stage: string) => void = () => undefined
    let finish: (ref: string) => void = () => undefined
    h.uploadImage.mockImplementation((_id: string, _file: File, _name: string, onProgress: typeof report) => {
      report = onProgress
      return new Promise<string>((resolve) => { finish = resolve })
    })
    render(<Harness />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    act(() => report(42, "uploading"))
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-label", "exercises.image.uploading")
    expect(screen.getByText("exercises.image.percent 42")).toBeInTheDocument()
    act(() => report(99, "pushing"))
    expect(screen.getByText("exercises.image.pushing")).toBeInTheDocument()
    // The registry takes the blobs: the crest loader and the line, no bar.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(document.querySelector(".animate-spin")).toBeNull()
    expect(document.querySelector(".lucide-loader-circle, .lucide-loader")).toBeNull()
    await act(async () => finish(REF))
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("a refused upload shows the backend message and keeps the image", async () => {
    const body = { Status: { Code: 72802, Message: "x", Context: { reason: "unauthorized", token: "push" } } }
    h.uploadImage.mockRejectedValue(new ApiError(409, body, "x", undefined, 72802))
    render(<Harness image="nginx:1" />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.refused")
    expect(screen.getByRole("alert")).not.toHaveTextContent("exercises.image.reason.unauthorized")
    expect(screen.getByTestId("image")).toHaveTextContent("nginx:1")
  })

  it("a refusal at the upload start (72801) reads like the blobs refusal, for admins too", async () => {
    h.access.access = { IsAdmin: true }
    const body = { Status: { Code: 72801, Message: "x" } }
    h.uploadImage.mockRejectedValue(new ApiError(409, body, "x", undefined, 72801))
    render(<Harness />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.refusedReason exercises.image.reason.not_configured")
  })

  it("a refusal at the upload start (72801) shows the plain refusal to others", async () => {
    const body = { Status: { Code: 72801, Message: "x" } }
    h.uploadImage.mockRejectedValue(new ApiError(409, body, "x", undefined, 72801))
    render(<Harness image="nginx:1" />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.refused")
    expect(screen.getByRole("alert")).not.toHaveTextContent("not_configured")
  })

  it("an admin also sees the reason of a refusal", async () => {
    h.access.access = { IsAdmin: true }
    const body = { Status: { Code: 72802, Message: "x", Context: { reason: "rate_limited" } } }
    h.uploadImage.mockRejectedValue(new ApiError(409, body, "x", undefined, 72802))
    render(<Harness />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.refusedReason exercises.image.reason.rate_limited")
  })

  it("translates archive problems and push failures", async () => {
    h.uploadImage.mockRejectedValueOnce(new ImageArchiveError("gzip"))
    render(<Harness />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.archive.gzip")
    h.uploadImage.mockRejectedValueOnce(new ImagePushError("digest_mismatch"))
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.retryTip" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("exercises.image.push.digest_mismatch"))
    h.uploadImage.mockRejectedValueOnce(new ApiError(400, { Status: { Code: 22822 } }, "x", undefined, 22822))
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.retryTip" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("exercises.image.err.invalidConfig"))
  })

  it("«Замінити» on a platform image takes a new archive", async () => {
    h.uploadImage.mockResolvedValue(`platform:web@sha256:${"9".repeat(64)}`)
    render(<Harness image={REF} />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.replaceTip" }))
    const input = screen.getByTestId("image-file-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [archive()] } })
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent("9".repeat(64)))
  })

  it("a value typed during the upload is kept: the uploaded image is dropped with a note", async () => {
    let finish: (ref: string) => void = () => undefined
    h.uploadImage.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    render(<Harness image="nginx:1" />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    // The field shows the archive while it travels; the reference changes some other way (a paste elsewhere, an import).
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("type a reference"))
    await act(async () => finish(REF))
    expect(screen.getByTestId("image")).toHaveTextContent("nginx:2")
    expect(screen.getByText("exercises.image.changedDuringUpload")).toBeInTheDocument()
  })

  it("removing another device during the upload writes the image to the right device", async () => {
    let finish: (ref: string) => void = () => undefined
    h.uploadImage.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    render(<TwoDevices />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    expect(h.uploadImage.mock.calls[0][2]).toBe("second")
    fireEvent.click(screen.getByRole("button", { name: "remove first" }))
    await act(async () => finish(REF))
    expect(JSON.parse(screen.getByTestId("devices").textContent ?? "[]")).toEqual([{ Name: "second", Image: REF }])
  })

  it("a drop on a field that cannot upload is swallowed, not opened by the browser", () => {
    render(<Harness disabled />)
    const zone = screen.getByTestId("image-drop-zone")
    const dataTransfer = { files: [archive()], types: ["Files"], dropEffect: "copy" }
    expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(false)
    expect(dataTransfer.dropEffect).toBe("none")
    expect(fireEvent.drop(zone, { dataTransfer })).toBe(false)
    expect(h.uploadImage).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "exercises.image.uploadTip" })).not.toBeInTheDocument()
  })

  it("names the stage under the field: unpacking, the layer being compressed, then the compressed bytes against the original", async () => {
    let report: (percent: number, stage: string, detail?: object) => void = () => undefined
    h.uploadImage.mockImplementation((_id: string, _file: File, _name: string, onProgress: typeof report) => {
      report = onProgress
      return new Promise<string>(() => undefined)
    })
    render(<Harness />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    act(() => report(10, "unpacking"))
    expect(screen.getByText("exercises.image.stage.unpacking")).toBeInTheDocument()
    act(() => report(30, "compressing", { layer: 4, layers: 7 }))
    expect(screen.getByText("exercises.image.stage.compressing 4 7")).toBeInTheDocument()
    act(() => report(52, "uploading", { sent: 214 * 1024 ** 2, total: 412 * 1024 ** 2, original: 1126 * 1024 ** 2 }))
    expect(screen.getByText(/^exercises\.image\.stage\.sent exercises\.image\.size\.mib 214 exercises\.image\.size\.mib 412 exercises\.image\.size\.gib /)).toBeInTheDocument()
    expect(screen.getByText("exercises.image.percent 52")).toBeInTheDocument()
  })

  it("keeps a failed archive in the field with retry and remove icon buttons, and the message under it", async () => {
    h.uploadImage.mockRejectedValue(new ImageArchiveError("notTar"))
    render(<Harness />)
    drop(new File([new Uint8Array([1])], "dvwa.zip"))
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.archive.notTar")
    expect(screen.getByText("dvwa.zip")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.removeFile" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("collapsing the image section mid-upload keeps the upload running and the reference lands", async () => {
    let finish: (ref: string) => void = () => undefined
    let report: (percent: number, stage: string) => void = () => undefined
    h.uploadImage.mockImplementation((_id: string, _file: File, _name: string, onProgress: typeof report) => {
      report = onProgress
      return new Promise<string>((resolve) => { finish = resolve })
    })
    render(<Collapsible />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    const signal = h.uploadImage.mock.calls[0][4] as AbortSignal
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    expect(screen.queryByTestId("image-drop-zone")).not.toBeInTheDocument()
    expect(signal.aborted).toBe(false)
    act(() => report(60, "uploading"))
    // Opened again mid-upload: the card shows the running upload, not a fresh drop zone.
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60")
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    await act(async () => finish(REF))
    expect(signal.aborted).toBe(false)
    expect(screen.getByTestId("image")).toHaveTextContent(REF)
  })

  it("leaving the editor stops a running upload", async () => {
    h.uploadImage.mockImplementation(() => new Promise<string>(() => undefined))
    const { unmount } = render(<Collapsible />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    const signal = h.uploadImage.mock.calls[0][4] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it("«Скасувати» stops the upload", async () => {
    h.uploadImage.mockImplementation(() => new Promise<string>(() => undefined))
    render(<Collapsible />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    const signal = h.uploadImage.mock.calls[0][4] as AbortSignal
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.cancelUpload" }))
    expect(signal.aborted).toBe(true)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })
})

describe("an archive dropped before the task has a name", () => {
  const flush = vi.fn()
  const onNeedName = vi.fn()
  beforeEach(() => { flush.mockReset().mockResolvedValue(false); onNeedName.mockReset() })

  it("is kept and checked at once, and asks for the name; nothing is sent", async () => {
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    expect(screen.getByRole("button", { name: "exercises.image.uploadTip" })).toBeEnabled() // the field is not disabled
    const file = archive()
    drop(file)
    expect(screen.getByText("image.tar")).toBeInTheDocument()
    expect(await screen.findByText("exercises.image.checked exercises.image.layers.few 3")).toBeInTheDocument()
    expect(h.readImageArchive).toHaveBeenCalledWith(file)
    expect(screen.getByText("exercises.image.needName").closest("[role=status]")).toBeInTheDocument()
    expect(flush).toHaveBeenCalled() // a valid name would create the task now
    expect(h.uploadImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.enterName" }))
    expect(onNeedName).toHaveBeenCalledTimes(1)
  })

  it("starts by itself, with the same file, when the task gets its id", async () => {
    h.uploadImage.mockResolvedValue(REF)
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    const file = archive()
    drop(file)
    await screen.findByText("exercises.image.checked exercises.image.layers.few 3")
    fireEvent.click(screen.getByText("create"))
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent(REF))
    expect(h.uploadImage).toHaveBeenCalledTimes(1)
    expect(h.uploadImage.mock.calls[0][0]).toBe("ex-9")
    expect(h.uploadImage.mock.calls[0][1]).toBe(file)
    expect(screen.queryByText("exercises.image.needName")).not.toBeInTheDocument()
  })

  it("starts when the task appears even while the archive is still being checked", async () => {
    let finishCheck: (archive: object) => void = () => undefined
    h.readImageArchive.mockImplementation(() => new Promise((resolve) => { finishCheck = resolve }))
    h.uploadImage.mockResolvedValue(REF)
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    drop(archive())
    expect(screen.getByText("exercises.image.checking")).toBeInTheDocument()
    await waitFor(() => expect(h.readImageArchive).toHaveBeenCalled())
    fireEvent.click(screen.getByText("create"))
    expect(h.uploadImage).not.toHaveBeenCalled()
    await act(async () => finishCheck({ config: {}, layers: [{}] }))
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent(REF))
    expect(h.uploadImage).toHaveBeenCalledTimes(1)
  })

  it("shows an unusable archive at once, with the reason, and queues nothing", async () => {
    h.readImageArchive.mockRejectedValue(new ImageArchiveError("noAmd64"))
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    drop(archive())
    expect(await screen.findByRole("alert")).toHaveTextContent("exercises.image.archive.noAmd64")
    expect(screen.queryByText("exercises.image.needName")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("create"))
    expect(h.uploadImage).not.toHaveBeenCalled()
  })

  it("lets the author take the queued file back; the task appearing then sends nothing", async () => {
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    drop(archive())
    await screen.findByText("exercises.image.needName")
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.removeFile" }))
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    fireEvent.click(screen.getByText("create"))
    expect(h.uploadImage).not.toHaveBeenCalled()
  })

  it("does not read a .tar.gz at the drop: it is unpacked and checked when the upload starts", async () => {
    render(<NoNameHarness flush={flush} onNeedName={onNeedName} />)
    const gz = new File([new Uint8Array([0x1f, 0x8b, 8])], "image.tar.gz")
    drop(gz)
    expect(await screen.findByText("exercises.image.checkedGzip")).toBeInTheDocument()
    expect(h.readImageArchive).not.toHaveBeenCalled()
  })

  it("starts the upload of a task that already has its id at once, without a queue", async () => {
    h.uploadImage.mockResolvedValue(REF)
    render(<Harness />)
    drop(archive())
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalled())
    expect(h.readImageArchive).not.toHaveBeenCalled()
    expect(screen.queryByText("exercises.image.needName")).not.toBeInTheDocument()
  })
})
