import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BookingFormDialog, toLocalInput } from "./BookingFormDialog"
import { createBooking } from "@/api/exercises/testLabs"
import { ApiError } from "@/api/client"
import { t } from "@/i18n/t"

vi.mock("@/api/exercises/testLabs", () => ({ createBooking: vi.fn() }))
afterEach(() => vi.useRealTimers())

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
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith({ Start: next.toISOString(), DurationMinutes: 60, Size: size, LargestDevice: size }))
    expect(onBooked).toHaveBeenCalledWith({ ID: "created" })
    expect(toLocalInput(next.toISOString())).toMatch(/T18:30$/)
  })

  it("places a past start error at the date picker, with no duration error", () => {
    render(<BookingFormDialog open start="2000-01-01T10:00:00Z" size={size} largestDevice={size} active={0} onCancel={vi.fn()} onBooked={vi.fn()} />)
    const startControl = screen.getByRole("button", { name: t("exercises.book.start") })
    expect(startControl).toHaveAttribute("aria-invalid", "true")
    const error = document.getElementById("booking-start-error")!
    expect(error).toHaveTextContent(t("exercises.book.limit.past"))
    expect(startControl.parentElement).toContainElement(error)
    expect(screen.getByRole("button", { name: t("exercises.book.minutes") })).toHaveAttribute("aria-invalid", "false")
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(createBooking).not.toHaveBeenCalled()
  })

  it("offers the fixed durations, 1 h by default", () => {
    render(<BookingFormDialog open start={start.toISOString()} size={size} largestDevice={size} active={0} onCancel={vi.fn()} onBooked={vi.fn()} />)
    const control = screen.getByRole("button", { name: t("exercises.book.minutes") })
    expect(control).toHaveTextContent(t("exercises.book.duration.hours", { n: 1 }))
    fireEvent.keyDown(control, { key: "Enter" })
    const labels = screen.getAllByRole("menuitemradio").map((item) => item.textContent)
    expect(labels).toEqual([15, 30, 45].map((n) => t("exercises.book.duration.minutes", { n })).concat([1, 2, 4, 8].map((n) => t("exercises.book.duration.hours", { n }))))
  })
})

// Losing the supplied seconds or autumn fold shifts the reserved instant.
describe("known booking instant", () => {
  it("keeps the caller instant after a same-day choice and duration edit", async () => {
    vi.setSystemTime(new Date("2026-10-20T09:00:00Z"))
    const known = "2026-10-25T01:30:27.123Z"
    vi.mocked(createBooking).mockResolvedValue({ ID: "fold" } as never)
    render(<BookingFormDialog open start={known} size={size} largestDevice={size} active={0} onCancel={vi.fn()} onBooked={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.start") }))
    fireEvent.click(screen.getByRole("button", { name: "25 жовтня 2026" }))
    fireEvent.click(screen.getByRole("button", { name: t("ui.dateTime.done") }))
    fireEvent.keyDown(screen.getByRole("button", { name: t("exercises.book.minutes") }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: t("exercises.book.duration.hours", { n: 2 }) }))
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith({ Start: known, DurationMinutes: 120, Size: size, LargestDevice: size }))
    vi.useRealTimers()
  })
})

describe("booking form lifecycle and layers", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date("2026-10-20T09:00:00Z"))
  })
  const props = { open: true, start: "2026-10-25T01:30:27.123Z", size, largestDevice: size, active: 0, onCancel: vi.fn(), onBooked: vi.fn() }
  it("changes an edited wall time to the browser interpretation and keeps the preview out of invalid input", async () => {
    const local = new Date(props.start)
    // Construct the edited wall time afresh: during a fold the browser chooses its default occurrence.
    const edited = new Date(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), 31)
    render(<BookingFormDialog {...props} />)
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.start") }))
    fireEvent.change(screen.getByRole("textbox", { name: t("ui.dateTime.minute") }), { target: { value: "31" } })
    fireEvent.click(screen.getByRole("button", { name: t("ui.dateTime.done") }))
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ Start: edited.toISOString() })))
  })
  it("replaces the known instant on conflict, explains the full date, and requires a second submit", async () => {
    const nearest = "2026-10-26T07:07:19.000Z"
    vi.mocked(createBooking).mockRejectedValueOnce(new ApiError(409, { Status: { Code: 72509, Context: { nearest_from: nearest } } }, "no room", undefined, 72509)).mockResolvedValueOnce({ ID: "created" } as never)
    render(<BookingFormDialog {...props} />)
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("26")
    expect(createBooking).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    await waitFor(() => expect(createBooking).toHaveBeenLastCalledWith(expect.objectContaining({ Start: nearest })))
  })
  it("keeps Start, Duration and request error across a mounted close/reopen", async () => {
    vi.mocked(createBooking).mockRejectedValue(new Error("request failed"))
    const view = render(<BookingFormDialog {...props} />)
    fireEvent.keyDown(screen.getByRole("button", { name: t("exercises.book.minutes") }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: t("exercises.book.duration.hours", { n: 2 }) }))
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    const message = (await screen.findByRole("alert")).textContent
    view.rerender(<BookingFormDialog {...props} open={false} />)
    view.rerender(<BookingFormDialog {...props} start="2026-10-27T07:00:00Z" />)
    expect(screen.getByRole("alert")).toHaveTextContent(message!)
    expect(screen.getByRole("button", { name: t("exercises.book.minutes") })).toHaveTextContent(t("exercises.book.duration.hours", { n: 2 }))
    expect(screen.getByRole("button", { name: t("exercises.book.start") })).toHaveTextContent("25")
  })
  it("closes the picker layer first and returns focus to Start", async () => {
    const cancel = vi.fn()
    render(<BookingFormDialog {...props} onCancel={cancel} />)
    const trigger = screen.getByRole("button", { name: t("exercises.book.start") })
    fireEvent.click(trigger)
    const day = screen.getByRole("button", { name: "25 жовтня 2026" })
    await waitFor(() => expect(day).toHaveFocus())
    fireEvent.keyDown(day, { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(cancel).not.toHaveBeenCalled()
    fireEvent.keyDown(trigger, { key: "Escape" })
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  })
  it("shows one numeric date for a same-day window", () => {
    render(<BookingFormDialog {...props} start={new Date(2026, 9, 21, 14, 30).toISOString()} />)
    expect(screen.getByText("21.10.2026, 14:30 – 15:30")).toBeInTheDocument()
  })
  it("keeps both dates visible when the calendar window crosses midnight", () => {
    render(<BookingFormDialog {...props} start={new Date(2026, 9, 21, 23, 37).toISOString()} />)
    expect(screen.getByText("21.10.2026, 23:30 – 22.10.2026, 00:45")).toBeInTheDocument()
  })
  it.skipIf(!["Europe/Kyiv", "Europe/Kiev"].includes(Intl.DateTimeFormat().resolvedOptions().timeZone))("names both offsets across the autumn transition", () => {
    render(<BookingFormDialog {...props} start="2026-10-25T00:30:00Z" />)
    expect(screen.getByText("25.10.2026, 03:30 GMT+3 – 03:30 GMT+2")).toBeInTheDocument()
  })
  it("does not present a valid calendar interval while the start fails validation", () => {
    render(<BookingFormDialog {...props} start="2000-01-01T10:00:00Z" />)
    expect(screen.getByText(t("exercises.book.invalidWindow"))).toBeInTheDocument()
    expect(document.querySelector('.booking-form-range')).toHaveTextContent(t("exercises.book.invalidWindow"))
  })
  it("lets fields stay editable during POST and guards cancellation", async () => {
    vi.mocked(createBooking).mockReturnValue(new Promise(() => {}))
    const cancel = vi.fn()
    render(<BookingFormDialog {...props} onCancel={cancel} />)
    fireEvent.click(screen.getByRole("button", { name: t("exercises.book.confirm") }))
    expect(screen.getByRole("button", { name: t("exercises.book.start") })).toBeEnabled()
    expect(screen.getByRole("button", { name: t("exercises.book.minutes") })).toBeEnabled()
    expect(screen.getByRole("button", { name: t("admin.exPage.dialog.cancel") })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(cancel).not.toHaveBeenCalled()
  })
})
