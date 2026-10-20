import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Sidebar } from "./Sidebar"
import { MobileDrawer } from "./MobileDrawer"
import { useRef, useState } from "react"
import { listBookings } from "@/api/exercises/testLabs"

vi.mock("@/api/exercises/testLabs", () => ({ listBookings: vi.fn(() => Promise.resolve([])), getRoom: vi.fn(() => Promise.resolve(null)), cancelBooking: vi.fn(), createBooking: vi.fn() }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn(() => Promise.resolve({ Resources: { Frame: { CPUMillicores: 250, MemoryBytes: 1024 ** 3 } } })) }))

const state = vi.hoisted(() => ({ path: "/", admin: true }))
vi.mock("next/navigation", () => ({ usePathname: () => state.path }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: state.admin } }) }))
vi.mock("@/lib/useBackLink", () => ({ useBackLink: () => null }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

function Drawer() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <><header><button ref={trigger} onClick={() => setOpen(true)}>open</button></header><MobileDrawer open={open} onOpenChange={setOpen} anchor={trigger} onReturnFocus={() => trigger.current?.focus()} /></>
}

describe("catalog sidebar", () => {
  beforeEach(() => { state.path = "/"; state.admin = true })

  it("links catalog, bookings and proposals with the active section and navigation callback", () => {
    const onNavigate = vi.fn()
    render(<Sidebar onNavigate={onNavigate} />)
    expect(Array.from(screen.getByRole("navigation").querySelectorAll("a")).map((link) => link.getAttribute("href")?.replace(/(.)\/$/, "$1"))).toEqual(["/", "/guide", "/proposals"])
    expect(screen.getByRole("link", { name: "exercises.nav.catalog" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "exercises.book.menu" })).toHaveAttribute("aria-haspopup", "dialog")
    fireEvent.click(screen.getByRole("link", { name: "exercises.nav.catalog" }))
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it("marks the guide item active on /guide pages and the catalog item inactive", () => {
    state.path = "/guide/prapory/"
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: "exercises.nav.guide" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "exercises.nav.catalog" })).not.toHaveAttribute("aria-current")
  })

  it("keeps bookings available to an event author but hides admin-only proposals", () => {
    state.admin = false
    render(<Sidebar />)
    expect(screen.getByRole("button", { name: "exercises.book.menu" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "exercises.nav.proposals" })).not.toBeInTheDocument()
  })

  it("closes the phone drawer with Escape and restores focus to its trigger", async () => {
    render(<Drawer />)
    const trigger = screen.getByRole("button", { name: "open" })
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "exercises.nav.label" })
    expect(screen.getAllByRole("navigation")).toHaveLength(1)
    fireEvent.keyDown(dialog, { key: "Escape" })
    await vi.waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("closes the phone drawer when a section is chosen", async () => {
    render(<Drawer />)
    fireEvent.click(screen.getByRole("button", { name: "open" }))
    fireEvent.click(screen.getByRole("link", { name: "exercises.nav.catalog" }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
  it("opens bookings from the sidebar without navigating away or fetching them in advance", async () => {
    vi.mocked(listBookings).mockClear()
    const previous = window.location.href
    render(<Sidebar />)
    expect(listBookings).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    expect(await screen.findByRole("dialog", { name: "exercises.book.listTitle" })).toBeInTheDocument()
    expect(await screen.findByText("exercises.book.empty")).toBeInTheDocument()
    expect(window.location.href).toBe(previous)
  })

  it("closes the phone drawer before it opens the bookings, and returns focus to the menu button after Escape", async () => {
    render(<Drawer />)
    const trigger = screen.getByRole("button", { name: "open" })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "exercises.book.menu" }))
    const bookings = await screen.findByRole("dialog", { name: "exercises.book.listTitle" })
    expect(screen.queryByRole("dialog", { name: "exercises.nav.label" })).not.toBeInTheDocument()
    fireEvent.keyDown(bookings, { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the phone menu as an overlay under the header: the panel and its backdrop start at the header's bottom edge", () => {
    render(<Drawer />)
    const trigger = screen.getByRole("button", { name: "open" })
    vi.spyOn(trigger.closest("header")!, "getBoundingClientRect").mockReturnValue({ bottom: 96 } as DOMRect)
    fireEvent.click(trigger)
    const panel = screen.getByRole("dialog", { name: "exercises.nav.label" })
    expect(panel.style.top).toBe("96px")
    expect(document.querySelector("[data-drawer-backdrop]")).toHaveStyle({ top: "96px" })
  })

})
