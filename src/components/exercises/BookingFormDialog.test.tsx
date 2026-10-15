import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BookingFormDialog, toLocalInput } from "./BookingFormDialog"
import { createBooking } from "@/api/exercises/testLabs"
import { t } from "@/i18n/t"

vi.mock("@/api/exercises/testLabs", () => ({ createBooking: vi.fn() }))
const size = { CPUMillicores: 250, MemoryBytes: 1024 ** 3 }
const start = new Date(Date.now() + 2 * 86400_000)
start.setHours(13, 30, 0, 0)

describe("booking date and time", () => {
  beforeEach(() => vi.resetAllMocks())

  it("uses the platform calendar and preserves local time when sending the booking", async () => {
    const onBooked = vi.fn()
    vi.mocked(createBooking).mockResolvedValue({ ID: "created" } as never)
    const { container } = render(<BookingFormDialog open start={start.toISOString()} size={size} largestDevice={size} active={0} onCancel={vi.fn()} onBooked={onBooked} />)
    expect(container.ownerDocument.querySelector('input[type="datetime-local"]')).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.start") }))
    expect(screen.getByRole("dialog", { name: t("exercises.book.start") })).toBeInTheDocument()
    const next = new Date(start)
    next.setDate(next.getDate() + 1)
    const label = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(next).replace(/\s*р\.$/, "")
    fireEvent.click(screen.getByRole("button", { name: label }))
    fireEvent.change(screen.getByRole("textbox", { name: t("ui.dateTime.hour") }), { target: { value: "18" } })
    fireEvent.click(screen.getByRole("button", { name: t("ui.dateTime.done") }))
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    next.setHours(18)
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith({ Start: next.toISOString(), DurationMinutes: 120, Size: size, LargestDevice: size }))
    expect(onBooked).toHaveBeenCalledWith({ ID: "created" })
    expect(toLocalInput(next.toISOString())).toMatch(/T18:30$/)
  })
})
