import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn() }))
vi.mock("@/api/exercises/testLabs", () => ({ getRoom: vi.fn(), listBookings: vi.fn(), createBooking: vi.fn(), cancelBooking: vi.fn() }))

import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import { cancelBooking, getRoom, listBookings } from "@/api/exercises/testLabs"
import { BookingsMenu } from "./BookingsMenu"

const MIB = 1024 ** 2
const frame = { CPUMillicores: 250, MemoryBytes: 1024 * MIB }
const booking = (id: string) => ({ ID: id, From: "2099-01-01T13:00:00Z", To: "2099-01-01T15:00:00Z", Size: { CPUMillicores: 100, MemoryBytes: 128 * MIB } })

describe("BookingsMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, Resources: { Frame: frame } } as never)
    vi.mocked(getRoom).mockResolvedValue({ Available: false, Via: "", NearestFrom: "2099-01-01T13:00:00Z" })
  })

  it("shows the empty state and the room hint", async () => {
    vi.mocked(listBookings).mockResolvedValue([])
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    expect(await screen.findByText("exercises.book.empty")).toBeTruthy()
    expect(screen.getByText(/exercises\.book\.room\.none/)).toBeTruthy()
  })

  it.each(["button", "Escape"])("returns focus to New booking after cancelling its nested form with %s", async (method) => {
    vi.mocked(listBookings).mockResolvedValue([])
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const trigger = await screen.findByRole("button", { name: "exercises.book.new" })
    trigger.focus()
    fireEvent.click(trigger)
    const cancel = await screen.findByRole("button", { name: "admin.exPage.dialog.cancel" })
    expect(cancel).toHaveFocus()
    if (method === "button") fireEvent.click(cancel)
    else fireEvent.keyDown(cancel, { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.getByRole("dialog", { name: "exercises.book.listTitle" })).toBeInTheDocument()
  })

  it("cancels a booking only after the danger confirmation", async () => {
    vi.mocked(listBookings).mockResolvedValueOnce([booking("b1")]).mockResolvedValue([])
    vi.mocked(cancelBooking).mockResolvedValue(undefined)
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    fireEvent.click(await screen.findByRole("button", { name: /exercises\.book\.cancelNamed/ }))
    expect(cancelBooking).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.cancel" }))
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledWith("b1"))
    expect(await screen.findByText("exercises.book.empty")).toBeTruthy()
  })
})
