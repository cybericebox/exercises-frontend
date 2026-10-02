import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { NormalizedVariant } from "@/api/exercises/versions"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn() }))
vi.mock("@/api/exercises/testLabs", () => ({ getRoom: vi.fn(), listBookings: vi.fn(), createBooking: vi.fn(), cancelBooking: vi.fn() }))

import { ApiError } from "@/api/client"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import { createBooking, getRoom, listBookings } from "@/api/exercises/testLabs"
import { NoRoomPanel } from "./NoRoomPanel"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"

const MIB = 1024 ** 2
const config = RESOURCES_CONFIG
const variant = { ID: "v1", Index: 0, Note: "", Tasks: [], Topology: { Devices: [{ ID: "d1", Name: "web", ResourcePreset: "micro" }] } } as unknown as NormalizedVariant
const noRoom = (context?: Record<string, string>) => new ApiError(409, { Status: { Code: 72509, Message: "x", ...(context ? { Context: context } : {}) } }, "x", undefined, 72509)
const resources = { Min: { CPUMillicores: 100, MemoryBytes: 128 * MIB, Devices: 1, Blocks: 2 }, Max: { CPUMillicores: 100, MemoryBytes: 128 * MIB, Devices: 1, Blocks: 2 }, Variants: [{ VariantID: "v1", CPUMillicores: 100, MemoryBytes: 128 * MIB, Devices: 1, Blocks: 2 }], SpreadPercent: 0, VariantsDiffer: false, Outside: [], ResourceHeavy: false }

describe("NoRoomPanel (72509)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, Resources: config })
    vi.mocked(listBookings).mockResolvedValue([])
  })

  it("shows the nearest window from the error and books it with the variant's size", async () => {
    const startAt = new Date(Math.ceil((Date.now() + 3 * 3600_000) / 60_000) * 60_000)
    const start = startAt.toISOString()
    vi.mocked(createBooking).mockResolvedValue({ ID: "b1", From: start, To: new Date(startAt.getTime() + 90 * 60_000).toISOString(), Size: { CPUMillicores: 100, MemoryBytes: 128 * MIB } })
    render(<NoRoomPanel error={noRoom({ nearest_from: start })} variant={variant} resources={resources} onRetry={vi.fn()} />)
    expect(screen.getByText(/exercises\.book\.noRoomNow/)).toBeTruthy()
    expect(getRoom).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "exercises.book.action" }))
    fireEvent.change(await screen.findByLabelText("exercises.book.minutes"), { target: { value: "90" } })
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.confirm" }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    expect(createBooking).toHaveBeenCalledWith({
      Start: start, DurationMinutes: 90,
      Size: { CPUMillicores: 100, MemoryBytes: 128 * MIB }, LargestDevice: { CPUMillicores: 16, MemoryBytes: 64 * MIB },
    })
    expect(await screen.findByText(/exercises\.book\.bookedFrom/)).toBeTruthy()
  })

  it("asks the room endpoint when the error does not carry the window", async () => {
    vi.mocked(getRoom).mockResolvedValue({ Available: false, Via: "", NearestFrom: "2099-01-01T13:00:00Z" })
    render(<NoRoomPanel error={noRoom()} variant={variant} resources={null} onRetry={vi.fn()} />)
    expect(await screen.findByRole("button", { name: "exercises.book.action" })).toBeTruthy()
    expect(getRoom).toHaveBeenCalledWith({ CPUMillicores: 16, MemoryBytes: 64 * MIB }, { CPUMillicores: 16, MemoryBytes: 64 * MIB })
  })

  it("does not send a booking that breaks the limits", async () => {
    render(<NoRoomPanel error={noRoom({ nearest_from: "2099-01-01T13:00:00Z" })} variant={variant} resources={resources} onRetry={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.book.action" }))
    // 2099 is more than 14 days ahead.
    fireEvent.click(await screen.findByRole("button", { name: "exercises.book.confirm" }))
    expect(createBooking).not.toHaveBeenCalled()
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0)
  })

  it("moves to the next window when the booking hits 72509 again", async () => {
    const soon = new Date(Date.now() + 3 * 3600_000).toISOString()
    const later = new Date(Date.now() + 5 * 3600_000).toISOString()
    vi.mocked(createBooking).mockRejectedValue(noRoom({ nearest_from: later }))
    render(<NoRoomPanel error={noRoom({ nearest_from: soon })} variant={variant} resources={resources} onRetry={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.book.action" }))
    fireEvent.click(await screen.findByRole("button", { name: "exercises.book.confirm" }))
    expect(await screen.findByText(/exercises\.book\.noRoomWindow/)).toBeTruthy()
  })
})
