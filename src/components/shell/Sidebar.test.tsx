import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Sidebar } from "./Sidebar"
import { MobileDrawer } from "./MobileDrawer"
import { useRef, useState } from "react"

const state = vi.hoisted(() => ({ path: "/bookings/", admin: true }))
vi.mock("next/navigation", () => ({ usePathname: () => state.path }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: state.admin } }) }))
vi.mock("@/lib/useBackLink", () => ({ useBackLink: () => null }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

function Drawer() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <><button ref={trigger} onClick={() => setOpen(true)}>open</button><MobileDrawer open={open} onOpenChange={setOpen} onReturnFocus={() => trigger.current?.focus()} /></>
}

describe("catalog sidebar", () => {
  beforeEach(() => { state.path = "/bookings/"; state.admin = true })

  it("links catalog, bookings and proposals with the active section and navigation callback", () => {
    const onNavigate = vi.fn()
    render(<Sidebar onNavigate={onNavigate} />)
    expect(Array.from(screen.getByRole("navigation").querySelectorAll("a")).map((link) => link.getAttribute("href"))).toEqual(["/", "/bookings", "/proposals"])
    expect(screen.getByRole("link", { name: "exercises.book.menu" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("link", { name: "exercises.nav.catalog" }))
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it("keeps bookings available to an event author but hides admin-only proposals", () => {
    state.admin = false
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: "exercises.book.menu" })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole("link", { name: "exercises.book.menu" }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
