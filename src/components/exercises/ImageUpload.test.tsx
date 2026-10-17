import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"

const h = vi.hoisted(() => ({ uploadImage: vi.fn(), access: { access: null as null | { IsAdmin: boolean }, loading: false } }))

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/images", async (original) => ({
  ...(await original<typeof import("@/api/exercises/images")>()),
  uploadImage: (...args: unknown[]) => h.uploadImage(...args),
}))
vi.mock("@/components/shell/AccessContext", () => ({ useExerciseAccess: () => h.access }))

import { ApiError } from "@/api/client"
import { ImagePushError } from "@/api/exercises/images"
import { ImageArchiveError } from "@/lib/imageArchive"
import { emptyDevice, emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"
import { ExerciseIdProvider } from "./ExerciseIdContext"
import { DeviceImageField } from "./ImageUpload"

const REF = `platform:web@sha256:${"ab12cd34ef56".repeat(5)}abcd`

function ImageValue() {
  const { control } = useFormContext<DraftFormValues>()
  return <output data-testid="image">{useWatch({ control, name: "Variants.0.Topology.Devices.0.Image" })}</output>
}

function Harness({ image = "", exerciseId = "ex-1" as string | null }: { image?: string; exerciseId?: string | null }) {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.Name = "web"
  device.Image = image
  draft.Variants[0].Topology.Devices = [device]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <ExerciseIdProvider value={exerciseId}><FormProvider {...form}>
    <DeviceImageField variantIndex={0} deviceIndex={0} disabled={false} />
    <ImageValue />
  </FormProvider></ExerciseIdProvider>
}

const archive = () => new File([new Uint8Array([1, 2, 3])], "image.tar", { type: "application/x-tar" })

function drop(file: File) {
  fireEvent.drop(screen.getByTestId("image-drop-zone"), { dataTransfer: { files: [file], types: ["Files"] } })
}

beforeEach(() => {
  h.uploadImage.mockReset()
  h.access.access = null
})
afterEach(() => { vi.useRealTimers() })

describe("DeviceImageField", () => {
  it("states the archive limits next to the image field", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: "exercises.image.upload" })).toBeInTheDocument()
    expect(screen.getByText("exercises.image.uploadHint 10")).toBeInTheDocument()
    expect(screen.getByText("exercises.image.command")).toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: "exercises.image.replace" })).toBeInTheDocument()
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
    expect(screen.getByText("42%")).toBeInTheDocument()
    act(() => report(99, "pushing"))
    expect(screen.getByText("exercises.image.pushing")).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole("button", { name: "admin.exFiles.retry" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("exercises.image.push.digest_mismatch"))
    h.uploadImage.mockRejectedValueOnce(new ApiError(400, { Status: { Code: 22822 } }, "x", undefined, 22822))
    fireEvent.click(screen.getByRole("button", { name: "admin.exFiles.retry" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("exercises.image.err.invalidConfig"))
  })

  it("«Замінити» on a platform image takes a new archive", async () => {
    h.uploadImage.mockResolvedValue(`platform:web@sha256:${"9".repeat(64)}`)
    render(<Harness image={REF} />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.image.replace" }))
    const input = screen.getByTestId("image-file-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [archive()] } })
    await waitFor(() => expect(screen.getByTestId("image")).toHaveTextContent("9".repeat(64)))
  })

  it("an unsaved exercise cannot upload yet", () => {
    render(<Harness exerciseId={null} />)
    expect(screen.getByRole("button", { name: "exercises.image.upload" })).toBeDisabled()
    expect(screen.getByText("exercises.image.saveFirst")).toBeInTheDocument()
  })
})
