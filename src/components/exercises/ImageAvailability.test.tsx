import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { FormProvider, useForm, useFormContext } from "react-hook-form"

const h = vi.hoisted(() => ({ checkImages: vi.fn() }))

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/imageCheck", async (original) => ({
  ...(await original<typeof import("@/api/exercises/imageCheck")>()),
  checkImages: (...args: unknown[]) => h.checkImages(...args),
}))

import { ApiError } from "@/api/client"
import { emptyDevice, emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"
import { ExerciseIdProvider } from "./ExerciseIdContext"
import { CHECK_DEBOUNCE_MS, ImageAvailability, resetImageCheckCache } from "./ImageAvailability"

function ImageInput() {
  const { register } = useFormContext<DraftFormValues>()
  return <input aria-label="image" {...register("Variants.0.Topology.Devices.0.Image")} />
}

function Harness({ images, exerciseId = "ex-1" as string | null, enabled, all = false }: { images: string[]; exerciseId?: string | null; enabled?: boolean; all?: boolean }) {
  const draft = emptyDraft()
  draft.Variants[0].Topology.Devices = images.map((image, i) => ({ ...emptyDevice(), Name: `d${i}`, Image: image }))
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <ExerciseIdProvider value={exerciseId}><FormProvider {...form}>
    <ImageInput />
    {(all ? images : [images[0]]).map((_, i) => <ImageAvailability key={i} variantIndex={0} deviceIndex={i} enabled={enabled} />)}
  </FormProvider></ExerciseIdProvider>
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS) })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetImageCheckCache()
  h.checkImages.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe("ImageAvailability", () => {
  it("says «Образ недоступний» with the reason for an unavailable image", async () => {
    h.checkImages.mockResolvedValue([{ Image: "acme/private:1", Status: "unavailable", Reason: "needs_event_secret" }])
    render(<Harness images={["acme/private:1"]} />)
    await settle()
    expect(screen.getByText("exercises.image.unavailable")).toBeInTheDocument()
    expect(screen.getByText("exercises.image.reason.needs_event_secret")).toBeInTheDocument()
  })

  it("checks every image of the variant together, so a credential conflict shows", async () => {
    h.checkImages.mockResolvedValue([
      { Image: "ghcr.io/a/x:1", Status: "unavailable", Reason: "credential_conflict" },
      { Image: "ghcr.io/b/y:1", Status: "unavailable", Reason: "credential_conflict" },
    ])
    render(<Harness images={["ghcr.io/a/x:1", "ghcr.io/b/y:1"]} />)
    await settle()
    expect(h.checkImages).toHaveBeenCalledWith("ex-1", ["ghcr.io/a/x:1", "ghcr.io/b/y:1"])
    expect(screen.getByText("exercises.image.reason.credential_conflict")).toBeInTheDocument()
  })

  it("shows nothing for an available image", async () => {
    h.checkImages.mockResolvedValue([{ Image: "nginx:1", Status: "available" }])
    render(<Harness images={["nginx:1"]} />)
    await settle()
    expect(h.checkImages).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("exercises.image.unavailable")).not.toBeInTheDocument()
  })

  it("checks once after typing stops, with the latest image", async () => {
    h.checkImages.mockImplementation(async (_id: string, images: string[]) => images.map((Image) => ({ Image, Status: "unavailable", Reason: "not_found" })))
    render(<Harness images={["ngin"]} />)
    const input = screen.getByLabelText("image")
    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS / 2) })
    fireEvent.change(input, { target: { value: "nginx" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS / 2) })
    fireEvent.change(input, { target: { value: "nginx:9" } })
    await settle()
    expect(h.checkImages).toHaveBeenCalledTimes(1)
    expect(h.checkImages.mock.calls[0][1]).toEqual(["nginx:9"])
    expect(screen.getByText("exercises.image.reason.not_found")).toBeInTheDocument()
  })

  it("asks nothing without an image or before the exercise is saved", async () => {
    render(<Harness images={[""]} />)
    await settle()
    render(<Harness images={["nginx:1"]} exerciseId={null} />)
    await settle()
    expect(h.checkImages).not.toHaveBeenCalled()
  })

  it("a user who cannot write asks nothing", async () => {
    render(<Harness images={["acme/private:1"]} enabled={false} />)
    await settle()
    expect(h.checkImages).not.toHaveBeenCalled()
    expect(screen.queryByText("exercises.image.checkFailed")).not.toBeInTheDocument()
  })

  it("a refused check (403) says nothing", async () => {
    h.checkImages.mockRejectedValue(new ApiError(403, null, "forbidden"))
    render(<Harness images={["acme/private:1"]} />)
    await settle()
    expect(h.checkImages).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("exercises.image.checkFailed")).not.toBeInTheDocument()
  })

  it("any other failed check says so", async () => {
    h.checkImages.mockRejectedValue(new ApiError(500, null, "boom"))
    render(<Harness images={["acme/private:1"]} />)
    await settle()
    expect(screen.getByText("exercises.image.checkFailed")).toBeInTheDocument()
  })

  it("the device cards of one variant share one check", async () => {
    let answer: (value: unknown) => void = () => undefined
    h.checkImages.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    render(<Harness images={["a:1", "b:1", "c:1"]} all />)
    await settle()
    expect(h.checkImages).toHaveBeenCalledTimes(1)
    await act(async () => answer([{ Image: "b:1", Status: "unavailable", Reason: "not_found" }, { Image: "a:1", Status: "available" }, { Image: "c:1", Status: "available" }]))
    expect(screen.getAllByText("exercises.image.unavailable")).toHaveLength(1)
  })
})
