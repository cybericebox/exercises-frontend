import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

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

  it("starts at the full title and keeps the icon guide tooltip Escape separate from closing the list", async () => {
    vi.mocked(listBookings).mockResolvedValue([])
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const title = screen.getByRole("heading", { name: "exercises.book.listTitle" })
    expect(title).toHaveFocus()
    const guide = screen.getByRole("link", { name: "admin.exGuide.infrastruktura" })
    expect(guide).toHaveAttribute("href", "/guide/infrastruktura")
    expect(guide.textContent).toBe("")
    act(() => guide.focus())
    expect(await screen.findByRole("tooltip")).toHaveTextContent("admin.exGuide.infrastruktura")
    fireEvent.keyDown(guide, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "exercises.book.listTitle" })).toBeInTheDocument()
    fireEvent.keyDown(guide, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("dismisses this guide's hover-open tooltip before the list while focus stays on the title", async () => {
    vi.mocked(listBookings).mockResolvedValue([])
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const title = screen.getByRole("heading", { name: "exercises.book.listTitle" })
    const guide = screen.getByRole("link", { name: "admin.exGuide.infrastruktura" })
    fireEvent.mouseEnter(guide.parentElement!)
    expect(await screen.findByRole("tooltip")).toBeInTheDocument()
    expect(title).toHaveFocus()
    fireEvent.keyDown(title, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "exercises.book.listTitle" })).toBeInTheDocument()
    fireEvent.keyDown(title, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it.each(["guide", "new", "form", "confirmation"])("preserves newer %s focus when the cancellation refresh finishes", async (destination) => {
    let finishRefresh!: (items: ReturnType<typeof booking>[]) => void
    vi.mocked(listBookings).mockResolvedValueOnce([booking("b1"), booking("b2")]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    vi.mocked(cancelBooking).mockResolvedValue(undefined)
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const first = (await screen.findAllByRole("button", { name: /exercises\.book\.cancelNamed/ }))[0]
    act(() => first.focus())
    fireEvent.click(first)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.cancel" }))
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(first).toHaveFocus())
    let chosen: HTMLElement
    if (destination === "guide") chosen = screen.getByRole("link", { name: "admin.exGuide.infrastruktura" })
    else if (destination === "new") chosen = screen.getByRole("button", { name: "exercises.book.new" })
    else if (destination === "form") {
      fireEvent.click(screen.getByRole("button", { name: "exercises.book.new" }))
      chosen = await screen.findByRole("button", { name: "admin.exPage.dialog.cancel" })
    } else {
      fireEvent.click(screen.getAllByRole("button", { name: /exercises\.book\.cancelNamed/ })[1])
      chosen = screen.getByRole("button", { name: "exercises.book.keep" })
    }
    act(() => chosen.focus())
    expect(chosen).toHaveFocus()
    await act(async () => finishRefresh([booking("b2")]))
    expect(chosen).toHaveFocus()
    if (destination === "form" || destination === "confirmation") expect(chosen.closest('[role="dialog"]')).toBeInTheDocument()
    else expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("shows cross-midnight end dates and explicit row actions while counting current and future windows", async () => {
    const now = Date.now()
    const current = { ...booking("current"), From: new Date(now - 3600000).toISOString(), To: new Date(now + 3600000).toISOString() }
    const overnight = { ...booking("night"), From: new Date(2099, 0, 1, 23, 30).toISOString(), To: new Date(2099, 0, 2, 7, 30).toISOString() }
    vi.mocked(listBookings).mockResolvedValue([current, overnight, booking("b3")])
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const rows = await screen.findAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("exercises.book.window.current")
    expect(rows[1]).toHaveTextContent("02.01.2099")
    expect(rows[1]).toHaveTextContent("exercises.book.window.scheduled")
    for (const row of rows) expect(within(row).getByRole("button")).toHaveTextContent("exercises.book.cancelShort")
    const add = screen.getByRole("button", { name: "exercises.book.new" })
    expect(add).toBeDisabled()
    expect(document.getElementById(add.getAttribute("aria-describedby")!)).toHaveTextContent("exercises.book.limitReached")
    expect(screen.getByText("exercises.book.used 3 3")).toBeInTheDocument()
  })

  it("omits positive or failed capacity hints but retains a dated negative hint without disabling New", async () => {
    vi.mocked(listBookings).mockResolvedValue([])
    vi.mocked(getRoom).mockResolvedValue({ Available: true, Via: "pool", NearestFrom: null })
    const first = render(<BookingsMenu open />)
    await screen.findByText("exercises.book.empty")
    expect(document.querySelector("[data-room]")).toBeNull()
    first.unmount()
    vi.mocked(getRoom).mockRejectedValue(new Error("room offline"))
    const second = render(<BookingsMenu open />)
    await screen.findByText("exercises.book.empty")
    expect(document.querySelector("[data-room]")).toBeNull()
    expect(screen.getByRole("button", { name: "exercises.book.new" })).toBeEnabled()
    second.unmount()
    vi.mocked(getRoom).mockResolvedValue({ Available: false, Via: "", NearestFrom: new Date(2099, 0, 2, 9).toISOString() })
    render(<BookingsMenu open />)
    await screen.findByText("exercises.book.empty")
    expect(document.querySelector("[data-room]")).toHaveTextContent("02.01.2099")
    expect(screen.getByRole("button", { name: "exercises.book.new" })).toBeEnabled()
  })

  it("keeps rows during the cancellation refresh then focuses the next remaining action", async () => {
    let finishRefresh!: (items: ReturnType<typeof booking>[]) => void
    vi.mocked(listBookings).mockResolvedValueOnce([booking("b1"), booking("b2")]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    vi.mocked(cancelBooking).mockResolvedValue(undefined)
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const first = (await screen.findAllByRole("button", { name: /exercises\.book\.cancelNamed/ }))[0]
    act(() => first.focus())
    fireEvent.click(first)
    expect(screen.getByRole("button", { name: "exercises.book.keep" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.cancel" }))
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.queryByLabelText("admin.loading")).not.toBeInTheDocument()
    await act(async () => finishRefresh([booking("b2")]))
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole("button", { name: /exercises\.book\.cancelNamed/ })).toHaveFocus())
    expect(screen.getByRole("dialog", { name: "exercises.book.listTitle" })).toBeInTheDocument()
  })

  it("recovers cancelled-row focus when native FocusScope moves it to the list container during removal", async () => {
    let finishRefresh!: (items: ReturnType<typeof booking>[]) => void
    vi.mocked(listBookings).mockResolvedValueOnce([booking("b1"), booking("b2")]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    vi.mocked(cancelBooking).mockResolvedValue(undefined)
    render(<BookingsMenu />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const first = (await screen.findAllByRole("button", { name: /exercises\.book\.cancelNamed/ }))[0]
    const dialog = screen.getByRole("dialog", { name: "exercises.book.listTitle" })
    act(() => first.focus())
    fireEvent.click(first)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.cancel" }))
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(first).toHaveFocus())
    // Native Radix observes removal before passive effects; jsdom/act otherwise flushes those effects first.
    const list = screen.getByRole("list")
    const remove = list.removeChild.bind(list)
    let usedFallback = false
    const scopeFallback = vi.spyOn(list, "removeChild").mockImplementation((node) => {
      const removed = remove(node)
      if (node.contains(first)) { usedFallback = true; dialog.focus() }
      return removed
    })
    try { await act(async () => finishRefresh([booking("b2")])) }
    finally { scopeFallback.mockRestore() }
    expect(usedFallback).toBe(true)
    expect(screen.getByRole("button", { name: /exercises\.book\.cancelNamed/ })).toHaveFocus()
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
